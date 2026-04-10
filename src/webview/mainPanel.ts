import * as vscode from 'vscode';
import { logger } from '../core/logger.js';
import { getSharedStyles } from './shared/styles.js';
import { getMainScript } from './mainScript.js';
import {
  renderConnectingScreen,
  renderCredentialsTab,
  renderDashboardShell,
  renderDebugTab,
  renderFolderScreen,
  renderLogsTab,
  renderOrgScreen,
  renderRegionScreen,
  renderSettingsTab,
} from './mainRenderers.js';
import type {
  CfApp,
  CfOrg,
  CfSpace,
  CredentialResult,
  DebugSession,
  LogEntry,
  LogSessionStatus,
  MainTab,
  SyncProgress,
  VcapServices,
  WebviewMessage,
} from '../types/index.js';
import { getOrCustomRegion } from '../core/regionList.js';

type ScreenState =
  | { id: 'region' }
  | { id: 'connecting'; regionLabel: string }
  | { id: 'selectOrg'; orgs: CfOrg[] }
  | { id: 'selectFolder'; orgName: string; mappedPath?: string }
  | { id: 'dashboard'; tab: MainTab };

export class MainPanel implements vscode.WebviewViewProvider {
  static readonly viewId = 'sapTools.mainPanel';

  private view: vscode.WebviewView | undefined;
  private screen: ScreenState = { id: 'region' };

  // Dashboard state
  private orgName = '';
  private regionId = '';
  private apps: CfApp[] = [];
  private appsError: string | undefined;
  private spaces: CfSpace[] = [];
  private selectedSpace = '';
  private spaceApps: CfApp[] = [];
  private activeSessions: DebugSession[] = [];
  private credResults: CredentialResult[] = [];
  private syncProgress: SyncProgress = { status: 'idle', done: 0, total: 0 };
  private groupFolderPath = '';
  private cacheStats: { regions: number; orgs: number; apps: number } | undefined;
  private lastSyncedAt: number | undefined;

  // ── Logs tab state ───────────────────────────────────────────────────────
  private static readonly LOG_BUFFER_MAX = 2000;
  private logBuffer: LogEntry[] = [];
  private logStatus: LogSessionStatus = 'IDLE';
  private logError: string | undefined;
  private logSelectedApp: string | undefined;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly onMessage: (msg: WebviewMessage) => void,
  ) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };

    webviewView.onDidDispose(() => {
      this.view = undefined;
    });

    webviewView.webview.onDidReceiveMessage((msg: WebviewMessage) => {
      this.onMessage(msg);
    });

    this.render();
  }

  // ─── Screen Transitions ──────────────────────────────────────────────────

  showRegion(): void {
    this.screen = { id: 'region' };
    this.render();
  }

  showConnecting(regionId: string, customEndpoint?: string): void {
    const region = getOrCustomRegion(regionId, customEndpoint);
    this.screen = { id: 'connecting', regionLabel: region.label };
    this.render();
  }

  showOrgSelect(orgs: CfOrg[]): void {
    this.screen = { id: 'selectOrg', orgs };
    this.render();
  }

  showFolderSelect(orgName: string, mappedPath?: string): void {
    this.orgName = orgName;
    this.groupFolderPath = mappedPath ?? '';
    this.screen = mappedPath !== undefined
      ? { id: 'selectFolder', orgName, mappedPath }
      : { id: 'selectFolder', orgName };
    this.render();
  }

  showDashboard(orgName: string, tab: MainTab = 'debug', regionId?: string): void {
    this.orgName = orgName;
    if (regionId !== undefined) {this.regionId = regionId;}
    this.screen = { id: 'dashboard', tab };
    this.render();
  }

  setRegionId(regionId: string): void {
    this.regionId = regionId;
  }

  // ─── Dashboard State Updates ─────────────────────────────────────────────

  updateApps(apps: CfApp[]): void {
    this.apps = apps;
    this.appsError = undefined;
    if (this.screen.id === 'dashboard') {this.render();}
  }

  showAppsError(message: string): void {
    this.appsError = message;
    if (this.screen.id === 'dashboard') {this.render();}
  }

  updateSpaces(spaces: CfSpace[]): void {
    this.spaces = spaces;
    if (this.screen.id === 'dashboard' && this.screen.tab === 'credentials') {this.render();}
  }

  updateSpaceApps(spaceName: string, apps: CfApp[]): void {
    this.selectedSpace = spaceName;
    this.spaceApps = apps;
    if (this.screen.id === 'dashboard' && this.screen.tab === 'credentials') {this.render();}
  }

  updateFolderPath(path: string): void {
    this.groupFolderPath = path;
    if (this.screen.id === 'selectFolder') {
      this.screen = { ...this.screen, mappedPath: path };
      this.render();
    }
  }

  updateDebugSession(session: DebugSession): void {
    const idx = this.activeSessions.findIndex(s => s.appName === session.appName);
    if (session.status === 'EXITED') {
      if (idx >= 0) {this.activeSessions.splice(idx, 1);}
    } else if (idx >= 0) {
      this.activeSessions[idx] = session;
    } else {
      this.activeSessions.push(session);
    }
    // Only re-render on debug tab — avoids disrupting the live logs stream
    if (this.screen.id === 'dashboard' && this.screen.tab === 'debug') {this.render();}
  }

  updateSyncProgress(progress: SyncProgress, stats?: { regions: number; orgs: number; apps: number }): void {
    this.syncProgress = progress;
    if (stats !== undefined) {this.cacheStats = stats;}
    if (progress.status === 'done') {this.lastSyncedAt = Date.now();}
    if (this.screen.id === 'dashboard' && this.screen.tab === 'settings') {this.render();}
  }

  appendCredResult(result: CredentialResult): void {
    const idx = this.credResults.findIndex(r => r.appName === result.appName);
    if (idx >= 0) {this.credResults[idx] = result;}
    else {this.credResults.push(result);}
    if (this.screen.id === 'dashboard' && this.screen.tab === 'credentials') {this.render();}
  }

  clearCredResults(): void {
    this.credResults = [];
  }

  updateAppEnv(appName: string, vcap: VcapServices, envVars: Record<string, string>): void {
    // Document opening is handled in extension.ts via vscode.workspace.openTextDocument
    logger.info(`App env received for ${appName}: ${Object.keys(vcap).length} VCAP services, ${Object.keys(envVars).length} user vars`);
  }

  // ── Logs Methods ──────────────────────────────────────────────────────────

  /**
   * Streams a single log entry to the webview via postMessage (no full re-render).
   * Also buffers it so that a future full render restores all entries.
   */
  pushLogEntry(entry: LogEntry): void {
    // Ring-buffer: evict oldest when at capacity
    if (this.logBuffer.length >= MainPanel.LOG_BUFFER_MAX) {
      this.logBuffer.shift();
    }
    this.logBuffer.push(entry);

    // Send directly to webview without triggering a full re-render
    this.view?.webview.postMessage({ type: 'logEntry', payload: entry });
  }

  updateLogStatus(status: LogSessionStatus, error?: string): void {
    this.logStatus = status;
    if (error !== undefined) {
      this.logError = error;
    } else {
      // exactOptionalPropertyTypes — clear error only when explicitly absent
      this.logError = undefined;
    }

    const payload: { status: LogSessionStatus; error?: string } = { status };
    if (error !== undefined) { payload.error = error; }

    // Push status update via postMessage so the logs tab UI stays reactive
    this.view?.webview.postMessage({ type: 'logStatus', payload });
  }

  setLogSelectedApp(appName: string): void {
    this.logSelectedApp = appName;
  }

  clearLogBuffer(): void {
    this.logBuffer = [];
    this.logStatus = 'IDLE';
    this.logError = undefined;
  }

  showTab(tab: MainTab): void {
    if (this.screen.id === 'dashboard') {
      this.screen = { ...this.screen, tab };
      this.render();
    }
  }

  showError(message: string): void {
    if (!this.view) {return;}
    void vscode.window.showErrorMessage(`SAP Tools: ${message}`);
  }

  // ─── Rendering ───────────────────────────────────────────────────────────

  private render(): void {
    if (!this.view) {return;}
    this.view.webview.html = this.buildHtml();
  }

  private buildHtml(): string {
    const nonce = generateNonce();
    const body = this.buildBody();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; img-src data:; font-src 'self';">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style nonce="${nonce}">${getSharedStyles()}</style>
</head>
<body>
  ${body}
  <script nonce="${nonce}">${getMainScript()}</script>
</body>
</html>`;
  }

  private buildBody(): string {
    switch (this.screen.id) {
      case 'region':
        return `<div class="screen active">${renderRegionScreen()}</div>`;

      case 'connecting':
        return `<div class="screen active">${renderConnectingScreen(this.screen.regionLabel)}</div>`;

      case 'selectOrg':
        return `<div class="screen active">${renderOrgScreen(this.screen.orgs)}</div>`;

      case 'selectFolder':
        return `<div class="screen active">${renderFolderScreen(this.screen.orgName, this.screen.mappedPath)}</div>`;

      case 'dashboard': {
        const shell = renderDashboardShell({
          activeTab: this.screen.tab,
          orgName: this.orgName,
          activeSessionCount: this.activeSessions.length,
          ...(this.regionId.length > 0 ? { regionId: this.regionId } : {}),
          ...(this.lastSyncedAt !== undefined ? { lastSyncedAt: this.lastSyncedAt } : {}),
        });
        const tabContent = this.buildTabContent(this.screen.tab);
        return shell.replace('<div id="tabContent"></div>', `<div id="tabContent">${tabContent}</div>`);
      }
    }
  }

  private buildTabContent(tab: MainTab): string {
    switch (tab) {
      case 'debug':
        return renderDebugTab({
          orgName: this.orgName,
          apps: this.apps,
          activeSessions: this.activeSessions,
          ...(this.appsError !== undefined ? { appsError: this.appsError } : {}),
        });

      case 'credentials':
        return renderCredentialsTab({
          orgName: this.orgName,
          spaces: this.spaces,
          selectedSpace: this.selectedSpace,
          apps: this.spaceApps,
          results: this.credResults,
        });

      case 'logs':
        return renderLogsTab({
          apps: this.apps,
          logEntries: this.logBuffer,
          logStatus: this.logStatus,
          ...(this.logSelectedApp !== undefined ? { selectedApp: this.logSelectedApp } : {}),
          ...(this.logError !== undefined ? { logError: this.logError } : {}),
        });

      case 'settings': {
        const cfg = vscode.workspace.getConfiguration('sapTools');
        return renderSettingsTab({
          autoSync: cfg.get<boolean>('autoSync', true),
          syncInterval: cfg.get<number>('cacheSyncInterval', 240),
          sqlToolsIntegration: cfg.get<boolean>('sqlToolsIntegration', true),
          syncProgress: this.syncProgress,
          defaultRegion: cfg.get<string>('defaultRegion', 'ap11'),
          ...(this.cacheStats !== undefined ? { cacheStats: this.cacheStats } : {}),
          ...(this.lastSyncedAt !== undefined ? { lastSyncedAt: this.lastSyncedAt } : {}),
        });
      }
    }
  }

  getGroupFolderPath(): string {
    return this.groupFolderPath;
  }

  /** Returns buffered log entries as plain text (CF log format). */
  getLogExportText(): string {
    if (this.logBuffer.length === 0) { return '# No log entries captured yet.\n'; }
    const header = `# CF Logs — ${this.logSelectedApp ?? 'unknown'} — ${new Date().toISOString()}\n\n`;
    const lines = this.logBuffer
      .map(e => `${e.timestamp} [${e.source}] ${e.stream} ${e.message}`)
      .join('\n');
    return header + lines;
  }

  dispose(): void {
    // nothing to dispose; view is managed by VSCode
  }
}

function generateNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}
