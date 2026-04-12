import * as vscode from 'vscode';

export const CF_LOGS_VIEW_ID = 'sapTools.cfLogsView';

const SCOPE_UPDATE_MESSAGE_TYPE = 'sapTools.scopeUpdate';

export class CfLogsPanelProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  private webviewView: vscode.WebviewView | undefined;
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
  }

  /**
   * Focus the CF logs panel in the bottom VSCode panel area.
   */
  focus(): void {
    void vscode.commands.executeCommand(`${CF_LOGS_VIEW_ID}.focus`);
  }

  /**
   * Send a scope label to the panel webview so it can update its header.
   * Format: "region-code -> org-name -> space-name"
   */
  updateScope(scopeLabel: string): void {
    void this.webviewView?.webview.postMessage({
      type: SCOPE_UPDATE_MESSAGE_TYPE,
      scope: scopeLabel,
    });
  }

  dispose(): void {
    while (this.disposables.length > 0) {
      this.disposables.pop()?.dispose();
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

function createNonce(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let index = 0; index < 24; index += 1) {
    const randomIndex = Math.floor(Math.random() * alphabet.length);
    nonce += alphabet[randomIndex] ?? 'A';
  }
  return nonce;
}
