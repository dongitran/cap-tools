import * as vscode from 'vscode';

export const REGION_VIEW_ID = 'sapTools.regionView';

const REGION_SELECTED_MESSAGE_TYPE = 'sapTools.regionSelected';
const PROTOTYPE_DESIGN_ID = '34';

interface RegionSelectionPayload {
  readonly id: string;
  readonly name: string;
  readonly code: string;
  readonly area: string;
}

interface RegionSelectedMessage {
  readonly type: typeof REGION_SELECTED_MESSAGE_TYPE;
  readonly region: RegionSelectionPayload;
}

export class RegionSidebarProvider
  implements vscode.WebviewViewProvider, vscode.Disposable
{
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly outputChannel: vscode.OutputChannel
  ) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    const assetsRoot = vscode.Uri.joinPath(
      this.extensionUri,
      'docs',
      'designs',
      'prototypes',
      'assets'
    );
    const prototypeScriptUri = vscode.Uri.joinPath(assetsRoot, 'prototype.js');
    const prototypeCssUri = vscode.Uri.joinPath(assetsRoot, 'prototype.css');
    const themeCssUri = vscode.Uri.joinPath(assetsRoot, 'themes', 'design-34.css');
    const nonce = createNonce();

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [assetsRoot],
    };

    webviewView.webview.html = this.buildWebviewHtml(
      webviewView.webview,
      nonce,
      prototypeScriptUri,
      prototypeCssUri,
      themeCssUri
    );

    const messageSubscription = webviewView.webview.onDidReceiveMessage(
      (message: unknown): void => {
        this.handleWebviewMessage(message);
      }
    );
    this.disposables.push(messageSubscription);
  }

  dispose(): void {
    while (this.disposables.length > 0) {
      this.disposables.pop()?.dispose();
    }
  }

  private buildWebviewHtml(
    webview: vscode.Webview,
    nonce: string,
    prototypeScriptUri: vscode.Uri,
    prototypeCssUri: vscode.Uri,
    themeCssUri: vscode.Uri
  ): string {
    const scriptSrc = webview.asWebviewUri(prototypeScriptUri).toString();
    const prototypeCssSrc = webview.asWebviewUri(prototypeCssUri).toString();
    const themeCssSrc = webview.asWebviewUri(themeCssUri).toString();
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
    <title>SAP Tools Prototype 34</title>
    <link rel="stylesheet" href="${prototypeCssSrc}" />
    <link rel="stylesheet" href="${themeCssSrc}" />
  </head>
  <body class="prototype-page" data-design-id="${PROTOTYPE_DESIGN_ID}">
    <main id="app"></main>
    <script nonce="${nonce}" type="module" src="${scriptSrc}"></script>
  </body>
</html>`;
  }

  private handleWebviewMessage(message: unknown): void {
    if (!isRegionSelectedMessage(message)) {
      return;
    }

    const selectedRegion = message.region;
    const timestamp = new Date().toISOString();
    const formattedMessage = [
      `[${timestamp}] Selected SAP BTP region:`,
      `${sanitizeForLog(selectedRegion.name)} (${sanitizeForLog(selectedRegion.code)})`,
      `| ${sanitizeForLog(selectedRegion.area)}`,
      `| ${sanitizeForLog(selectedRegion.id)}`,
    ].join(' ');

    this.outputChannel.appendLine(formattedMessage);
    this.outputChannel.show(true);
    if (process.env['SAP_TOOLS_E2E'] === '1') {
      void vscode.window.showInformationMessage(formattedMessage);
    }
  }
}

function createNonce(): string {
  const alphabet =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';

  for (let index = 0; index < 24; index += 1) {
    const randomIndex = Math.floor(Math.random() * alphabet.length);
    nonce += alphabet[randomIndex] ?? 'A';
  }

  return nonce;
}

function sanitizeForLog(value: string): string {
  return value.replaceAll(/\s+/g, ' ').trim();
}

function isRegionSelectedMessage(value: unknown): value is RegionSelectedMessage {
  if (!isRecord(value)) {
    return false;
  }

  if (value['type'] !== REGION_SELECTED_MESSAGE_TYPE) {
    return false;
  }

  const region = value['region'];
  if (!isRecord(region)) {
    return false;
  }

  return (
    isNonEmptyString(region['id'], 64) &&
    isNonEmptyString(region['name'], 96) &&
    isNonEmptyString(region['code'], 32) &&
    isNonEmptyString(region['area'], 64)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isNonEmptyString(value: unknown, maxLength: number): value is string {
  if (typeof value !== 'string') {
    return false;
  }

  const normalizedValue = value.trim();
  return normalizedValue.length > 0 && normalizedValue.length <= maxLength;
}
