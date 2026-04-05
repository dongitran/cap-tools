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
  MainTab,
  SyncProgress,
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
  static readonly viewId = 'sapDevSuite.mainPanel';

  private view: vscode.WebviewView | undefined;
  private screen: ScreenState = { id: 'region' };

  // Dashboard state
  private orgName = '';
  private apps: CfApp[] = [];
  private spaces: CfSpace[] = [];
  private selectedSpace = '';
  private spaceApps: CfApp[] = [];
  private activeSessions: DebugSession[] = [];
  private credResults: CredentialResult[] = [];
  private syncProgress: SyncProgress = { status: 'idle', done: 0, total: 0 };
  private groupFolderPath = '';

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

  showDashboard(orgName: string, tab: MainTab = 'debug'): void {
    this.orgName = orgName;
    this.screen = { id: 'dashboard', tab };
    this.render();
  }

  // ─── Dashboard State Updates ─────────────────────────────────────────────

  updateApps(apps: CfApp[]): void {
    this.apps = apps;
    if (this.screen.id === 'dashboard') {this.render();}
  }

  updateSpaces(spaces: CfSpace[]): void {
    this.spaces = spaces;
    if (this.screen.id === 'dashboard') {this.render();}
  }

  updateSpaceApps(spaceName: string, apps: CfApp[]): void {
    this.selectedSpace = spaceName;
    this.spaceApps = apps;
    if (this.screen.id === 'dashboard') {this.render();}
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
    if (this.screen.id === 'dashboard') {this.render();}
  }

  updateSyncProgress(progress: SyncProgress): void {
    this.syncProgress = progress;
    if (this.screen.id === 'dashboard' && this.screen.tab === 'settings') {this.render();}
  }

  appendCredResult(result: CredentialResult): void {
    const idx = this.credResults.findIndex(r => r.appName === result.appName);
    if (idx >= 0) {this.credResults[idx] = result;}
    else {this.credResults.push(result);}
    if (this.screen.id === 'dashboard') {this.render();}
  }

  clearCredResults(): void {
    this.credResults = [];
  }

  updateAppEnv(appName: string, vcap: Record<string, unknown>, envVars: Record<string, string>): void {
    // Opens app env as JSON in editor — forwarded to extension host via message
    // (actual document opening is done in extension.ts via vscode.workspace.openTextDocument)
    logger.info(`App env received for ${appName}: ${Object.keys(vcap).length} VCAP services, ${Object.keys(envVars).length} user vars`);
  }

  showTab(tab: MainTab): void {
    if (this.screen.id === 'dashboard') {
      this.screen = { ...this.screen, tab };
      this.render();
    }
  }

  showError(message: string): void {
    if (!this.view) {return;}
    void vscode.window.showErrorMessage(`SAP Dev Suite: ${message}`);
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
        const shell = renderDashboardShell(this.screen.tab);
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
        });

      case 'credentials':
        return renderCredentialsTab({
          orgName: this.orgName,
          spaces: this.spaces,
          selectedSpace: this.selectedSpace,
          apps: this.spaceApps,
          results: this.credResults,
        });

      case 'settings':
        return renderSettingsTab({
          autoSync: vscode.workspace.getConfiguration('sapDevSuite').get('autoSync', true),
          syncInterval: vscode.workspace.getConfiguration('sapDevSuite').get('cacheSyncInterval', 240),
          sqlToolsIntegration: vscode.workspace.getConfiguration('sapDevSuite').get('sqlToolsIntegration', true),
          syncProgress: this.syncProgress,
          defaultRegion: vscode.workspace.getConfiguration('sapDevSuite').get('defaultRegion', 'ap11'),
        });
    }
  }

  getGroupFolderPath(): string {
    return this.groupFolderPath;
  }

  dispose(): void {
    // nothing to dispose; view is managed by VSCode
  }
}

function generateNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}
