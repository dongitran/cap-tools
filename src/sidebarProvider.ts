import * as vscode from 'vscode';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import {
  fetchCfLoginInfo,
  cfLogin,
  fetchOrgs,
  fetchSpaces,
  getCfApiEndpoint,
  fetchStartedAppsViaCfCli,
} from './cfClient';
import type { CfSession } from './cfClient';
import type { CfLogsPanelProvider } from './cfLogsPanel';
import { getEffectiveCredentials, storeCredentials } from './credentialStore';

export const REGION_VIEW_ID = 'sapTools.regionView';

const PROTOTYPE_DESIGN_ID = '34';

// ── Inbound message types (webview → extension) ────────────────────────────

const MSG_LOGIN_SUBMIT = 'sapTools.loginSubmit';
const MSG_REGION_SELECTED = 'sapTools.regionSelected';
const MSG_ORG_SELECTED = 'sapTools.orgSelected';
const MSG_SPACE_SELECTED = 'sapTools.spaceSelected';
const MSG_OPEN_CF_LOGS_PANEL = 'sapTools.openCfLogsPanel';

// ── Outbound message types (extension → webview) ───────────────────────────

const MSG_LOGIN_RESULT = 'sapTools.loginResult';
const MSG_ORGS_LOADED = 'sapTools.orgsLoaded';
const MSG_ORGS_ERROR = 'sapTools.orgsError';
const MSG_SPACES_LOADED = 'sapTools.spacesLoaded';
const MSG_SPACES_ERROR = 'sapTools.spacesError';
const MSG_APPS_LOADED = 'sapTools.appsLoaded';
const MSG_APPS_ERROR = 'sapTools.appsError';

// ── Payload interfaces ─────────────────────────────────────────────────────

interface RegionSelectionPayload {
  readonly id: string;
  readonly name: string;
  readonly code: string;
  readonly area: string;
}

interface OrgSelectionPayload {
  readonly guid: string;
  readonly name: string;
}

interface SpaceSelectionPayload {
  readonly spaceName: string;
  readonly orgGuid: string;
  readonly orgName: string;
}

// ── Provider ───────────────────────────────────────────────────────────────

export class RegionSidebarProvider
  implements vscode.WebviewViewProvider, vscode.Disposable
{
  private webviewView: vscode.WebviewView | undefined;
  private cfSession: CfSession | null = null;
  private selectedRegionCode = '';
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly outputChannel: vscode.OutputChannel,
    private readonly context: vscode.ExtensionContext,
    private readonly cfLogsPanel: CfLogsPanelProvider
  ) {}

  async resolveWebviewView(webviewView: vscode.WebviewView): Promise<void> {
    this.webviewView = webviewView;
    this.cfSession = null;

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

    const credentials = await getEffectiveCredentials(this.context);
    const nonce = createNonce();

    webviewView.webview.html =
      credentials !== null
        ? this.buildMainHtml(webviewView.webview, nonce, assetsRoot)
        : this.buildLoginGateHtml(webviewView.webview, nonce, assetsRoot);

    const messageSubscription = webviewView.webview.onDidReceiveMessage(
      (message: unknown): void => {
        void this.handleWebviewMessage(message);
      }
    );
    this.disposables.push(messageSubscription);
  }

  dispose(): void {
    while (this.disposables.length > 0) {
      this.disposables.pop()?.dispose();
    }
  }

  // ── Message dispatcher ──────────────────────────────────────────────────

  private async handleWebviewMessage(message: unknown): Promise<void> {
    if (!isRecord(message)) {
      return;
    }

    const type = message['type'];

    if (type === MSG_LOGIN_SUBMIT && isLoginSubmitMessage(message)) {
      await this.handleLoginSubmit(
        message['email'] as string,
        message['password'] as string
      );
      return;
    }

    if (type === MSG_REGION_SELECTED && isRegionSelectedMessage(message)) {
      const region = message['region'] as RegionSelectionPayload;
      this.logRegionSelection(region);
      await this.handleRegionSelected(region);
      return;
    }

    if (type === MSG_ORG_SELECTED && isOrgSelectedMessage(message)) {
      const org = message['org'] as OrgSelectionPayload;
      await this.handleOrgSelected(org);
      return;
    }

    if (type === MSG_SPACE_SELECTED && isSpaceSelectedMessage(message)) {
      const spacePayload = message['scope'] as SpaceSelectionPayload;
      await this.handleSpaceSelected(spacePayload);
      return;
    }

    if (type === MSG_OPEN_CF_LOGS_PANEL) {
      this.cfLogsPanel.focus();
      return;
    }
  }

  // ── Login submit ────────────────────────────────────────────────────────

  private async handleLoginSubmit(email: string, password: string): Promise<void> {
    try {
      await storeCredentials(this.context, { email, password });
      this.reloadToMainView();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to save credentials.';
      this.postMessage({ type: MSG_LOGIN_RESULT, success: false, error: errorMessage });
    }
  }

  private reloadToMainView(): void {
    if (this.webviewView === undefined) {
      return;
    }
    const assetsRoot = vscode.Uri.joinPath(
      this.extensionUri,
      'docs',
      'designs',
      'prototypes',
      'assets'
    );
    const nonce = createNonce();
    this.webviewView.webview.html = this.buildMainHtml(
      this.webviewView.webview,
      nonce,
      assetsRoot
    );
  }

  // ── Region selected → fetch orgs ────────────────────────────────────────

  private async handleRegionSelected(region: RegionSelectionPayload): Promise<void> {
    this.selectedRegionCode = region.code;

    if (isTestMode()) {
      this.postMessage({ type: MSG_ORGS_LOADED, orgs: MOCK_ORGS });
      return;
    }

    const credentials = await getEffectiveCredentials(this.context);
    if (credentials === null) {
      this.postMessage({
        type: MSG_ORGS_ERROR,
        message: 'No credentials found. Please re-open SAP Tools and log in.',
      });
      return;
    }

    const apiEndpoint = getCfApiEndpoint(region.code);

    try {
      const loginInfo = await fetchCfLoginInfo(apiEndpoint);
      const token = await cfLogin(
        loginInfo.authorizationEndpoint,
        credentials.email,
        credentials.password
      );
      this.cfSession = { token, apiEndpoint };

      const orgs = await fetchOrgs(this.cfSession);
      this.postMessage({ type: MSG_ORGS_LOADED, orgs });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to connect to Cloud Foundry.';
      this.postMessage({ type: MSG_ORGS_ERROR, message: errorMessage });
    }
  }

  // ── Org selected → fetch spaces ─────────────────────────────────────────

  private async handleOrgSelected(org: { guid: string; name: string }): Promise<void> {
    if (isTestMode()) {
      const mockOrg = MOCK_ORGS.find((o) => o.guid === org.guid);
      const spaces = MOCK_SPACES[mockOrg?.name ?? ''] ?? MOCK_SPACES['core-platform-prod'] ?? [];
      this.cfLogsPanel.updateScope(
        buildScopeLabel(this.selectedRegionCode, org.name, 'select-space')
      );
      this.postMessage({ type: MSG_SPACES_LOADED, spaces });
      return;
    }

    if (this.cfSession === null) {
      this.postMessage({
        type: MSG_SPACES_ERROR,
        message: 'CF session expired. Please select a region again.',
      });
      return;
    }

    try {
      const spaces = await fetchSpaces(this.cfSession, org.guid);
      const scopeLabel = buildScopeLabel(this.selectedRegionCode, org.name, 'select-space');
      this.cfLogsPanel.updateScope(scopeLabel);
      this.postMessage({ type: MSG_SPACES_LOADED, spaces });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to fetch spaces.';
      this.postMessage({ type: MSG_SPACES_ERROR, message: errorMessage });
    }
  }

  // ── Space selected → fetch apps ────────────────────────────────────────

  private async handleSpaceSelected(payload: SpaceSelectionPayload): Promise<void> {
    if (isTestMode()) {
      const apps = resolveMockApps(payload.spaceName).map((name) => ({
        id: name,
        name,
        runningInstances: 1,
      }));
      this.postMessage({ type: MSG_APPS_LOADED, apps });
      this.cfLogsPanel.updateScope(
        buildScopeLabel(this.selectedRegionCode, payload.orgName, payload.spaceName)
      );
      return;
    }

    if (this.cfSession === null) {
      this.postMessage({
        type: MSG_APPS_ERROR,
        message: 'CF session expired. Please select a region again.',
      });
      return;
    }

    const credentials = await getEffectiveCredentials(this.context);
    if (credentials === null) {
      this.postMessage({
        type: MSG_APPS_ERROR,
        message: 'No credentials found. Please re-open SAP Tools and log in.',
      });
      return;
    }

    try {
      const cfHomeDir = await ensureCfHomeDir(this.context);
      const runningApps = await fetchStartedAppsViaCfCli({
        apiEndpoint: this.cfSession.apiEndpoint,
        email: credentials.email,
        password: credentials.password,
        orgName: payload.orgName,
        spaceName: payload.spaceName,
        cfHomeDir,
      });

      const apps = runningApps.map((app) => ({
        id: app.name,
        name: app.name,
        runningInstances: app.runningInstances,
      }));

      this.postMessage({ type: MSG_APPS_LOADED, apps });
      this.cfLogsPanel.updateScope(
        buildScopeLabel(this.selectedRegionCode, payload.orgName, payload.spaceName)
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to fetch apps from CF CLI.';
      this.postMessage({ type: MSG_APPS_ERROR, message: errorMessage });
    }
  }

  // ── Region logging ──────────────────────────────────────────────────────

  private logRegionSelection(region: RegionSelectionPayload): void {
    const timestamp = new Date().toISOString();
    const formattedMessage = [
      `[${timestamp}] Selected SAP BTP region:`,
      `${sanitizeForLog(region.name)} (${sanitizeForLog(region.code)})`,
      `| ${sanitizeForLog(region.area)}`,
      `| ${sanitizeForLog(region.id)}`,
    ].join(' ');

    this.outputChannel.appendLine(formattedMessage);
    this.outputChannel.show(true);

    if (process.env['SAP_TOOLS_E2E'] === '1') {
      void vscode.window.showInformationMessage(formattedMessage);
    }
  }

  // ── postMessage helper ──────────────────────────────────────────────────

  private postMessage(message: Record<string, unknown>): void {
    void this.webviewView?.webview.postMessage(message);
  }

  // ── HTML builders ───────────────────────────────────────────────────────

  private buildMainHtml(
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
      .asWebviewUri(vscode.Uri.joinPath(assetsRoot, 'themes', 'design-34.css'))
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

  private buildLoginGateHtml(
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
}

// ── Test-mode mock data ──────────────────────────────────────────────────────

const MOCK_ORGS = [
  { guid: 'org-core-prod', name: 'core-platform-prod' },
  { guid: 'org-finance-prod', name: 'finance-services-prod' },
  { guid: 'org-retail-prod', name: 'retail-experience-prod' },
  { guid: 'org-data-prod', name: 'data-foundation-prod' },
] as const;

const MOCK_SPACES: Record<string, readonly { name: string }[]> = {
  'core-platform-prod': [{ name: 'prod' }, { name: 'staging' }, { name: 'integration' }],
  'finance-services-prod': [{ name: 'prod' }, { name: 'uat' }, { name: 'sandbox' }],
  'retail-experience-prod': [{ name: 'prod' }, { name: 'campaigns' }, { name: 'performance' }],
  'data-foundation-prod': [{ name: 'prod' }, { name: 'etl' }, { name: 'observability' }],
};

const MOCK_APPS_BY_SPACE: Record<string, readonly string[]> = {
  prod: ['billing-api', 'payments-worker', 'audit-service', 'destination-adapter'],
  staging: ['billing-api-staging', 'payments-worker-staging', 'audit-service-staging'],
  integration: ['billing-api-int', 'payments-worker-int', 'events-int-consumer'],
  uat: ['finance-uat-api', 'finance-uat-worker', 'finance-uat-audit'],
  sandbox: ['sandbox-api', 'sandbox-worker', 'sandbox-observer'],
  campaigns: ['campaign-engine', 'campaign-events', 'campaign-content'],
  performance: ['perf-api', 'perf-worker', 'perf-load-probe'],
  etl: ['etl-scheduler', 'etl-transformer', 'etl-writer'],
  observability: ['metrics-collector', 'traces-forwarder', 'alerts-dispatcher'],
};

function isTestMode(): boolean {
  return process.env['SAP_TOOLS_TEST_MODE'] === '1';
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildCsp(webview: vscode.Webview, nonce: string): string {
  return [
    "default-src 'none'",
    `img-src ${webview.cspSource} data:`,
    `style-src ${webview.cspSource}`,
    `font-src ${webview.cspSource}`,
    `script-src 'nonce-${nonce}' ${webview.cspSource}`,
  ].join('; ');
}

function buildScopeLabel(regionCode: string, orgName: string, spaceName: string): string {
  const normalizedRegionCode = regionCode.trim().length > 0 ? regionCode.trim() : 'no-region';
  const normalizedOrgName = orgName.trim().length > 0 ? orgName.trim() : 'no-org';
  const normalizedSpaceName = spaceName.trim().length > 0 ? spaceName.trim() : 'no-space';
  return `${normalizedRegionCode} \u2192 ${normalizedOrgName} \u2192 ${normalizedSpaceName}`;
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

function sanitizeForLog(value: string): string {
  return value.replaceAll(/\s+/g, ' ').trim();
}

// ── Type guards ──────────────────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isNonEmptyString(value: unknown, maxLength: number): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= maxLength;
}

function isLoginSubmitMessage(value: Record<string, unknown>): boolean {
  return (
    isNonEmptyString(value['email'], 256) && isNonEmptyString(value['password'], 256)
  );
}

function isRegionSelectedMessage(value: Record<string, unknown>): boolean {
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

function isOrgSelectedMessage(value: Record<string, unknown>): boolean {
  const org = value['org'];
  if (!isRecord(org)) {
    return false;
  }
  return isNonEmptyString(org['guid'], 128) && isNonEmptyString(org['name'], 128);
}

function isSpaceSelectedMessage(value: Record<string, unknown>): boolean {
  const scope = value['scope'];
  if (!isRecord(scope)) {
    return false;
  }

  return (
    isNonEmptyString(scope['spaceName'], 128) &&
    isNonEmptyString(scope['orgGuid'], 128) &&
    isNonEmptyString(scope['orgName'], 128)
  );
}

async function ensureCfHomeDir(context: vscode.ExtensionContext): Promise<string> {
  const cfHomeDir = join(context.globalStorageUri.fsPath, 'cf-home');
  await mkdir(cfHomeDir, { recursive: true });
  return cfHomeDir;
}

function resolveMockApps(spaceName: string): string[] {
  const key = spaceName.trim().toLowerCase();
  const apps = MOCK_APPS_BY_SPACE[key];
  if (apps !== undefined) {
    return [...apps];
  }

  const fallbackPrefix = key.length > 0 ? key : 'space';
  return [
    `${fallbackPrefix}-api`,
    `${fallbackPrefix}-worker`,
    `${fallbackPrefix}-jobs`,
  ];
}
