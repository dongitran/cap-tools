// cspell:words guid appname logsloaded logserror fetchlogs appsupdate
import * as vscode from 'vscode';
import { fetchRecentAppLogs } from './cfClient';

export const CF_LOGS_VIEW_ID = 'sapTools.cfLogsView';

const SCOPE_UPDATE_MESSAGE_TYPE = 'sapTools.scopeUpdate';
const APPS_UPDATE_MESSAGE_TYPE = 'sapTools.appsUpdate';
const LOGS_LOADED_MESSAGE_TYPE = 'sapTools.logsLoaded';
const LOGS_ERROR_MESSAGE_TYPE = 'sapTools.logsError';
const FETCH_LOGS_MESSAGE_TYPE = 'sapTools.fetchLogs';

/* cspell:disable */
const TEST_MODE_SAMPLE_LOGS = `Retrieving logs for app finance-uat-api in org finance-services-prod / space uat as developer@example.com...

2026-04-12T09:14:31.73+0700 [CELL/0] OUT Cell 91130a14 stopping instance 13af001e
2026-04-12T09:14:32.19+0700 [API/2] OUT Restarted app with guid 8a45de1d
2026-04-12T09:14:32.26+0700 [CELL/0] OUT Cell d436706e creating container for instance 6eb35470
2026-04-12T09:14:43.98+0700 [CELL/0] OUT Cell d436706e successfully created container for instance 6eb35470
2026-04-12T09:14:44.55+0700 [APP/PROC/WEB/0] ERR npm warn Unknown project config "always-auth".
2026-04-12T09:14:44.73+0700 [APP/PROC/WEB/0] OUT > finance-uat-api@0.0.0 start
2026-04-12T09:14:44.73+0700 [APP/PROC/WEB/0] OUT > cds-serve -p gen/srv
2026-04-12T09:14:45.25+0700 [APP/PROC/WEB/0] OUT {"level":"info","logger":"NodeCacheStrategy","timestamp":"2026-04-12T02:14:45.255Z","component_name":"finance-uat-api","organization_name":"finance-services-prod","space_name":"uat","msg":"NodeCacheStrategy initialized","type":"log"}
2026-04-12T09:14:45.25+0700 [APP/PROC/WEB/0] OUT {"level":"info","logger":"CacheService","timestamp":"2026-04-12T02:14:45.256Z","component_name":"finance-uat-api","organization_name":"finance-services-prod","space_name":"uat","msg":"CacheService initialized with strategy: NodeCacheStrategy","type":"log"}
2026-04-12T09:14:47.26+0700 [APP/PROC/WEB/0] OUT {"level":"info","logger":"cds","timestamp":"2026-04-12T02:14:47.260Z","component_name":"finance-uat-api","organization_name":"finance-services-prod","space_name":"uat","msg":"loaded model from 1 file(s)","type":"log"}
2026-04-12T09:14:47.90+0700 [APP/PROC/WEB/0] OUT {"level":"warn","logger":"cds","timestamp":"2026-04-12T02:14:47.904Z","component_name":"finance-uat-api","organization_name":"finance-services-prod","space_name":"uat","msg":"using auth strategy jwt with fallback mode","type":"log"}
2026-04-12T09:14:47.95+0700 [APP/PROC/WEB/0] OUT {"level":"info","logger":"cds","timestamp":"2026-04-12T02:14:47.953Z","component_name":"finance-uat-api","organization_name":"finance-services-prod","space_name":"uat","msg":"server listening on http://localhost:8080","type":"log"}
2026-04-12T09:14:47.95+0700 [APP/PROC/WEB/0] OUT {"level":"error","logger":"cds","timestamp":"2026-04-12T02:14:47.953Z","component_name":"finance-uat-api","organization_name":"finance-services-prod","space_name":"uat","msg":"database retry exhausted on startup","type":"log"}`;
/* cspell:enable */

/**
 * CF session context needed by the logs panel to fetch real logs via CF CLI.
 */
export interface LogSessionParams {
  readonly apiEndpoint: string;
  readonly email: string;
  readonly password: string;
  readonly orgName: string;
  readonly spaceName: string;
  readonly cfHomeDir: string;
}

interface CfAppEntry {
  readonly id: string;
  readonly name: string;
  readonly runningInstances: number;
}

interface PendingAppsUpdate {
  readonly apps: CfAppEntry[];
  readonly sessionParams: LogSessionParams | null;
}

export class CfLogsPanelProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  private webviewView: vscode.WebviewView | undefined;
  private sessionParams: LogSessionParams | null = null;
  private pendingAppsUpdate: PendingAppsUpdate | null = null;
  private pendingScope: string | null = null;
  private fetchToken = 0;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(private readonly extensionUri: vscode.Uri) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.webviewView = webviewView;

    const assetsRoot = vscode.Uri.joinPath(
      this.extensionUri,
      'docs',
      'designs',
      'prototypes',
      'assets'
    );

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [assetsRoot],
    };

    const nonce = createNonce();
    const scriptUri = vscode.Uri.joinPath(assetsRoot, 'cf-logs-panel.js');
    const cssUri = vscode.Uri.joinPath(assetsRoot, 'cf-logs-panel.css');
    webviewView.webview.html = this.buildWebviewHtml(webviewView.webview, nonce, scriptUri, cssUri);

    // Listen for messages from the webview (e.g. fetch-logs requests).
    const messageSubscription = webviewView.webview.onDidReceiveMessage(
      (message: unknown): void => {
        void this.handleWebviewMessage(message);
      }
    );
    this.disposables.push(messageSubscription);

    // Replay scope and apps that arrived before this view was initialized.
    if (this.pendingScope !== null) {
      void webviewView.webview.postMessage({
        type: SCOPE_UPDATE_MESSAGE_TYPE,
        scope: this.pendingScope,
      });
    }
    if (this.pendingAppsUpdate !== null) {
      const { apps, sessionParams } = this.pendingAppsUpdate;
      this.doUpdateApps(apps, sessionParams);
    }
  }

  /**
   * Focus the CF logs panel in the bottom VSCode panel area.
   */
  focus(): void {
    void vscode.commands.executeCommand(`${CF_LOGS_VIEW_ID}.focus`);
  }

  /**
   * Send a scope label to the panel webview so it can update its header.
   * Stored for replay when the view is opened after the scope has been set.
   * Format: "region-code → org-name → space-name"
   */
  updateScope(scopeLabel: string): void {
    this.pendingScope = scopeLabel;
    void this.webviewView?.webview.postMessage({
      type: SCOPE_UPDATE_MESSAGE_TYPE,
      scope: scopeLabel,
    });
  }

  /**
   * Notify the panel of the available apps and store the session context
   * needed for log fetching. Replays automatically when the view is opened
   * later (i.e. if the panel was closed during space selection).
   */
  updateApps(apps: CfAppEntry[], sessionParams: LogSessionParams | null): void {
    this.pendingAppsUpdate = { apps, sessionParams };
    this.doUpdateApps(apps, sessionParams);
  }

  dispose(): void {
    while (this.disposables.length > 0) {
      this.disposables.pop()?.dispose();
    }
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private doUpdateApps(apps: CfAppEntry[], sessionParams: LogSessionParams | null): void {
    this.fetchToken += 1;
    this.sessionParams = sessionParams;
    const selectedApp = apps[0]?.name ?? '';
    void this.webviewView?.webview.postMessage({
      type: APPS_UPDATE_MESSAGE_TYPE,
      apps,
      selectedApp,
    });
  }

  private async handleWebviewMessage(message: unknown): Promise<void> {
    if (!isRecord(message)) {
      return;
    }

    if (
      message['type'] === FETCH_LOGS_MESSAGE_TYPE &&
      typeof message['appName'] === 'string' &&
      message['appName'].trim().length > 0 &&
      message['appName'].trim().length <= 128 &&
      typeof message['requestId'] === 'number'
    ) {
      await this.fetchAndSendLogs(message['appName'].trim(), message['requestId']);
    }
  }

  private async fetchAndSendLogs(appName: string, requestId: number): Promise<void> {
    // Capture token at the start; if doUpdateApps increments it before we respond,
    // the scope has changed and this response must be discarded.
    const myToken = this.fetchToken;

    if (isTestMode()) {
      void this.webviewView?.webview.postMessage({
        type: LOGS_LOADED_MESSAGE_TYPE,
        appName,
        requestId,
        logText: TEST_MODE_SAMPLE_LOGS,
      });
      return;
    }

    if (this.sessionParams === null) {
      if (this.fetchToken !== myToken) {
        return;
      }
      void this.webviewView?.webview.postMessage({
        type: LOGS_ERROR_MESSAGE_TYPE,
        appName,
        requestId,
        message: 'No CF session available. Select a space in the SAP Tools sidebar first.',
      });
      return;
    }

    const params = this.sessionParams;

    try {
      const logText = await fetchRecentAppLogs({
        apiEndpoint: params.apiEndpoint,
        email: params.email,
        password: params.password,
        orgName: params.orgName,
        spaceName: params.spaceName,
        appName,
        cfHomeDir: params.cfHomeDir,
      });

      // Discard if a scope change arrived while this fetch was in flight.
      if (this.fetchToken !== myToken) {
        return;
      }

      void this.webviewView?.webview.postMessage({
        type: LOGS_LOADED_MESSAGE_TYPE,
        appName,
        requestId,
        logText,
      });
    } catch (error) {
      if (this.fetchToken !== myToken) {
        return;
      }
      const msg = error instanceof Error ? error.message : 'Failed to fetch logs.';
      void this.webviewView?.webview.postMessage({
        type: LOGS_ERROR_MESSAGE_TYPE,
        appName,
        requestId,
        message: msg,
      });
    }
  }

  private buildWebviewHtml(
    webview: vscode.Webview,
    nonce: string,
    scriptUri: vscode.Uri,
    cssUri: vscode.Uri
  ): string {
    const scriptSrc = webview.asWebviewUri(scriptUri).toString();
    const cssSrc = webview.asWebviewUri(cssUri).toString();
    const csp = [
      "default-src 'none'",
      `img-src ${webview.cspSource} data:`,
      `style-src ${webview.cspSource}`,
      `font-src ${webview.cspSource}`,
      `script-src 'nonce-${nonce}' ${webview.cspSource}`,
    ].join('; ');

    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta http-equiv="Content-Security-Policy" content="${csp}" />
    <title>CF Logs</title>
    <link rel="stylesheet" href="${cssSrc}" />
  </head>
  <body class="cf-logs-panel-page">
    <section class="cf-logs-panel" aria-label="CFLogs panel content">
      <header class="workspace-head">
        <div class="workspace-title-row">
          <h1>Monitoring Workspace</h1>
          <p id="workspace-scope" class="workspace-scope">No scope selected</p>
        </div>
      </header>

      <section class="filter-inline" aria-label="CF log filters">
        <div class="filter-item filter-item-app">
          <select id="filter-app" aria-label="Select app">
            <option value="">— no apps loaded —</option>
          </select>
        </div>
        <div class="filter-item filter-item-search">
          <input
            id="filter-search"
            type="search"
            placeholder="message, source, logger"
            aria-label="Search logs"
          />
        </div>
        <div class="filter-item filter-item-level">
          <select id="filter-level" aria-label="Filter by level">
            <option value="all">All</option>
          </select>
        </div>
      </section>

      <div class="table-shell" role="region" aria-label="Filtered logs table">
        <table class="cf-log-table" aria-describedby="table-summary">
          <thead>
            <tr>
              <th scope="col">Time</th>
              <th scope="col">Source</th>
              <th scope="col">Stream</th>
              <th scope="col">Level</th>
              <th scope="col">Logger</th>
              <th scope="col">Message</th>
            </tr>
          </thead>
          <tbody id="log-table-body"></tbody>
        </table>
      </div>

      <p id="table-summary" class="table-summary" role="status" aria-live="polite"></p>
    </section>

    <script nonce="${nonce}" type="module" src="${scriptSrc}"></script>
  </body>
</html>`;
  }
}

function isTestMode(): boolean {
  return process.env['SAP_TOOLS_TEST_MODE'] === '1';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function createNonce(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let index = 0; index < 24; index += 1) {
    const randomIndex = Math.floor(Math.random() * alphabet.length);
    nonce += alphabet[randomIndex] ?? 'A';
  }
  return nonce;
}
