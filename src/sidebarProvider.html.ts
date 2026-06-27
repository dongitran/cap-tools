import * as vscode from 'vscode';
import { buildCsp } from './sidebarProvider.helpers';

const PROTOTYPE_DESIGN_ID = '34';

export function buildMainHtml(
  webview: vscode.Webview,
  nonce: string,
  assetsRoot: vscode.Uri
): string {
  const scriptSrc = webview
    .asWebviewUri(vscode.Uri.joinPath(assetsRoot, 'prototype.js'))
    .toString();
  const cssSrc = webview
    .asWebviewUri(vscode.Uri.joinPath(assetsRoot, 'prototype.css'))
    .toString();
  const themeCssSrc = webview
    .asWebviewUri(vscode.Uri.joinPath(assetsRoot, 'themes', 'design.css'))
    .toString();

  const csp = buildCsp(webview, nonce);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <title>SAP Tools</title>
  <link rel="stylesheet" href="${cssSrc}" />
  <link rel="stylesheet" href="${themeCssSrc}" />
</head>
<body class="prototype-page saptools-extension" data-design-id="${PROTOTYPE_DESIGN_ID}">
  <main id="app"></main>
  <script nonce="${nonce}" type="module" src="${scriptSrc}"></script>
</body>
</html>`;
}

export function buildLoginGateHtml(
  webview: vscode.Webview,
  nonce: string,
  assetsRoot: vscode.Uri
): string {
  const scriptSrc = webview
    .asWebviewUri(vscode.Uri.joinPath(assetsRoot, 'login-gate.js'))
    .toString();
  const cssSrc = webview
    .asWebviewUri(vscode.Uri.joinPath(assetsRoot, 'login-gate.css'))
    .toString();
  const csp = buildCsp(webview, nonce);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <title>SAP Tools Login</title>
  <link rel="stylesheet" href="${cssSrc}" />
</head>
<body class="login-gate-page saptools-extension">
  <main class="login-shell">
    <header class="layout-head">
      <div class="layout-title-row">
        <h1>SAP Tools Login</h1>
        <span class="layout-chip">Secure</span>
      </div>
      <p class="layout-subline">Connect your SAP account to open region workspace.</p>
    </header>

    <section class="login-card" aria-label="SAP credential setup">
      <form id="login-gate-form" class="login-form" novalidate>
        <div class="field-row">
          <label for="sap-email">SAP Email</label>
          <input
            id="sap-email"
            name="sap-email"
            type="email"
            autocomplete="email"
            placeholder="developer@company.com"
            required
          />
        </div>

        <div class="field-row">
          <label for="sap-password">SAP Password</label>
          <input
            id="sap-password"
            name="sap-password"
            type="password"
            autocomplete="current-password"
            placeholder="Enter SAP password"
            required
          />
        </div>

        <p id="form-status" class="form-status" role="status" aria-live="polite"></p>

        <button id="submit-login-gate" type="submit">Save and Continue</button>
      </form>
    </section>
  </main>

  <script nonce="${nonce}" type="module" src="${scriptSrc}"></script>
</body>
</html>`;
}
