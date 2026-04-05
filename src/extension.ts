import * as vscode from 'vscode';
import { logger } from './core/logger.js';
import { CacheManager } from './core/cacheManager.js';
import { ProcessManager } from './core/processManager.js';
import { readShellCredentials, clearCachedCredentials } from './core/shellEnv.js';
import { cfSetApi, cfAuth, cfOrgs, cfApps, cfEnv, cfTarget } from './core/cfClient.js';
import { getOrCustomRegion } from './core/regionList.js';
import { MainPanel } from './webview/mainPanel.js';
import { CfTreeProvider } from './features/explorer/cfTreeProvider.js';
import { CfAppNode } from './features/explorer/nodes.js';
import { DebugPanelController } from './features/debug/debugPanel.js';
import { CredentialPanelController } from './features/credentials/credentialPanel.js';
import { parseVcapFromEnvOutput } from './features/credentials/vcapParser.js';
import type {
  ExtensionConfig,
  MainTab,
  OrgFolderMapping,
  SettingsPayload,
  SyncProgress,
  WebviewMessage,
} from './types/index.js';

const CONFIG_KEY = 'sapDevSuite.config';

// ─── Extension State ──────────────────────────────────────────────────────────

let cache: CacheManager;
let processManager: ProcessManager;
let mainPanel: MainPanel;
let treeProvider: CfTreeProvider;
let debugController: DebugPanelController;
let credController: CredentialPanelController;
let syncTimer: ReturnType<typeof setInterval> | undefined;

let config: ExtensionConfig = { orgMappings: [] };
let currentRegionId = 'ap11';

function loadConfig(state: vscode.Memento): void {
  const saved = state.get<ExtensionConfig>(CONFIG_KEY);
  if (saved) config = saved;
}

function saveConfig(state: vscode.Memento): void {
  void state.update(CONFIG_KEY, config);
}

// ─── Activate ─────────────────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext): void {
  logger.init();
  logger.info('SAP Dev Suite activating');

  cache = new CacheManager(context.globalState);
  processManager = new ProcessManager();
  loadConfig(context.globalState);

  // ── Main Webview Panel ───────────────────────────────────────────────────

  mainPanel = new MainPanel(context.extensionUri, msg => handleWebviewMessage(msg, context));

  treeProvider = new CfTreeProvider(cache);

  const webviewReg = vscode.window.registerWebviewViewProvider(MainPanel.viewId, mainPanel, {
    webviewOptions: { retainContextWhenHidden: true },
  });

  const treeReg = vscode.window.createTreeView('sapDevSuite.cfExplorer', {
    treeDataProvider: treeProvider,
    showCollapseAll: true,
  });

  // ── Commands ─────────────────────────────────────────────────────────────

  const cmds: [string, (...args: unknown[]) => unknown][] = [
    ['sapDevSuite.resetConfig', () => resetConfig(context)],
    ['sapDevSuite.syncCache', () => triggerSync()],
    ['sapDevSuite.refreshExplorer', () => treeProvider.refresh()],
    ['sapDevSuite.stopAllSessions', () => processManager.stopAll()],

    ['sapDevSuite.copyAppName', (node: unknown) => {
      if (node instanceof CfAppNode) {
        void vscode.env.clipboard.writeText(node.appName);
        void vscode.window.showInformationMessage(`Copied: ${node.appName}`);
      }
    }],
    ['sapDevSuite.openAppUrl', (node: unknown) => {
      if (node instanceof CfAppNode && node.appUrls[0]) {
        void vscode.env.openExternal(vscode.Uri.parse(`https://${node.appUrls[0]}`));
      }
    }],
    ['sapDevSuite.debugApp', async (node: unknown) => {
      if (!(node instanceof CfAppNode)) return;
      await debugController.startDebugSessions([node.appName], node.orgName);
    }],
    ['sapDevSuite.extractAppCreds', async (node: unknown) => {
      if (!(node instanceof CfAppNode)) return;
      mainPanel.showDashboard(node.orgName, 'credentials');
    }],
    ['sapDevSuite.viewAppEnv', async (node: unknown) => {
      if (!(node instanceof CfAppNode)) return;
      try {
        await cfTarget(node.orgName, node.spaceName);
        const envOutput = await cfEnv(node.appName);
        const vcap = parseVcapFromEnvOutput(envOutput);
        const doc = await vscode.workspace.openTextDocument({
          content: JSON.stringify(vcap, null, 2),
          language: 'json',
        });
        await vscode.window.showTextDocument(doc);
      } catch (err) {
        logger.error('Failed to show app env', err);
      }
    }],
  ];

  for (const [cmd, handler] of cmds) {
    context.subscriptions.push(vscode.commands.registerCommand(cmd, handler));
  }

  // ── Process session updates → webview ────────────────────────────────────

  processManager.onSessionUpdate(session => {
    mainPanel.updateDebugSession(session);
  });

  // ── Auto-sync on startup ─────────────────────────────────────────────────

  const autoSync = vscode.workspace.getConfiguration('sapDevSuite').get('autoSync', true);
  if (autoSync && config.login) {
    setTimeout(() => triggerSync(), 5_000);
  }

  scheduleSync();

  context.subscriptions.push(
    webviewReg,
    treeReg,
    { dispose: () => processManager.dispose() },
    { dispose: () => syncTimer && clearInterval(syncTimer) },
    { dispose: () => logger.dispose() },
  );

  logger.info('SAP Dev Suite activated');
}

// ─── Webview Message Handler ──────────────────────────────────────────────────

async function handleWebviewMessage(msg: WebviewMessage, context: vscode.ExtensionContext): Promise<void> {
  switch (msg.type) {
    case 'ready':
      // Send initial state to webview
      if (config.login && config.selectedOrg) {
        mainPanel.showDashboard(config.selectedOrg, 'debug');
        await loadDashboardData();
      } else if (config.login) {
        await handleLogin(config.login.regionId, context);
      } else {
        mainPanel.showRegion();
      }
      break;

    case 'login':
      currentRegionId = msg.payload.regionId;
      await handleLogin(msg.payload.regionId, context, msg.payload.customEndpoint);
      break;

    case 'selectOrg':
      await handleSelectOrg(msg.payload.orgName, context);
      break;

    case 'browseFolder': {
      const uris = await vscode.window.showOpenDialog({
        canSelectFolders: true,
        canSelectFiles: false,
        canSelectMany: false,
        openLabel: 'Select Group Folder',
      });
      if (uris?.[0]) {
        const folderPath = uris[0].fsPath;
        mainPanel.updateFolderPath(folderPath);
        updateOrgMapping(config.selectedOrg ?? '', folderPath, context);
      }
      break;
    }

    case 'loadApps':
      await loadAppsForOrg(msg.payload.orgName);
      break;

    case 'loadSpaces':
      await credController.loadSpaces(msg.payload.orgName, currentRegionId);
      break;

    case 'loadSpaceApps':
      await credController.loadSpaceApps(msg.payload.orgName, msg.payload.spaceName, currentRegionId);
      break;

    case 'startDebug':
      await debugController.startDebugSessions(msg.payload.appNames, msg.payload.orgName);
      break;

    case 'stopDebug':
      await debugController.stopDebugSession(msg.payload.appName);
      break;

    case 'stopAllDebug':
      await debugController.stopAllSessions();
      break;

    case 'extractCreds':
      await credController.extractCredentials(msg.payload);
      break;

    case 'triggerSync':
      await triggerSync();
      break;

    case 'updateSettings':
      await applySettings(msg.payload, context);
      break;

    case 'resetConfig':
      await resetConfig(context);
      break;

    case 'changeTab':
      await handleTabChange(msg.payload.tab, context);
      break;

    case 'getAppEnv':
      // handled via command
      break;
  }
}

// ─── Login Flow ───────────────────────────────────────────────────────────────

async function handleLogin(
  regionId: string,
  context: vscode.ExtensionContext,
  customEndpoint?: string,
): Promise<void> {
  const region = getOrCustomRegion(regionId, customEndpoint);
  mainPanel.showConnecting(regionId, customEndpoint);

  const creds = readShellCredentials();
  if (!creds.email || !creds.password) {
    mainPanel.showRegion();
    void vscode.window.showErrorMessage(
      'SAP Dev Suite: SAP_EMAIL or SAP_PASSWORD not found in shell environment.',
    );
    return;
  }

  try {
    await cfSetApi(region.apiEndpoint);
    await cfAuth(creds.email, creds.password);

    const orgs = await cfOrgs();

    config.login = { apiEndpoint: region.apiEndpoint, regionId, email: creds.email };
    currentRegionId = regionId;
    saveConfig(context.globalState);

    // Check if org already mapped
    if (config.selectedOrg) {
      mainPanel.showDashboard(config.selectedOrg, 'debug');
      await loadDashboardData();
      return;
    }

    mainPanel.showOrgSelect(orgs);
    cache.setOrgs(regionId, orgs);
    treeProvider.setRegion(regionId);
  } catch (err) {
    logger.error('Login failed', err);
    mainPanel.showRegion();
    void vscode.window.showErrorMessage(
      `SAP Dev Suite: Login failed — ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

// ─── Org Selection ────────────────────────────────────────────────────────────

async function handleSelectOrg(orgName: string, context: vscode.ExtensionContext): Promise<void> {
  config.selectedOrg = orgName;
  saveConfig(context.globalState);

  const existingMapping = config.orgMappings.find(m => m.cfOrg === orgName);
  if (existingMapping) {
    mainPanel.showDashboard(orgName, 'debug');
    await loadDashboardData();
  } else {
    mainPanel.showFolderSelect(orgName);
  }
}

// ─── Dashboard Data Loading ───────────────────────────────────────────────────

async function loadDashboardData(): Promise<void> {
  const orgName = config.selectedOrg;
  if (!orgName) return;

  debugController = new DebugPanelController(mainPanel, processManager, cache, config);
  credController = new CredentialPanelController(mainPanel, cache);

  await debugController.loadApps(orgName, currentRegionId);
  await credController.loadSpaces(orgName, currentRegionId);
}

async function loadAppsForOrg(orgName: string): Promise<void> {
  try {
    await cfTarget(orgName);
    const apps = await cfApps();
    cache.setApps(currentRegionId, orgName, apps);
    mainPanel.updateApps(apps);
  } catch (err) {
    logger.error('Failed to refresh apps', err);
  }
}

// ─── Tab Changes ──────────────────────────────────────────────────────────────

async function handleTabChange(tab: MainTab, _context: vscode.ExtensionContext): Promise<void> {
  mainPanel.showTab(tab);
  if (tab === 'credentials' && config.selectedOrg) {
    await credController?.loadSpaces(config.selectedOrg, currentRegionId);
  }
}

// ─── Folder Mapping ───────────────────────────────────────────────────────────

function updateOrgMapping(orgName: string, folderPath: string, context: vscode.ExtensionContext): void {
  const idx = config.orgMappings.findIndex(m => m.cfOrg === orgName);
  const mapping: OrgFolderMapping = { cfOrg: orgName, groupFolderPath: folderPath };
  if (idx >= 0) config.orgMappings[idx] = mapping;
  else config.orgMappings.push(mapping);
  saveConfig(context.globalState);
}

// ─── Background Cache Sync ────────────────────────────────────────────────────

async function triggerSync(): Promise<void> {
  if (!config.login) return;

  const progress: SyncProgress = { status: 'running', done: 0, total: 0 };
  cache.setSyncProgress(progress);
  mainPanel.updateSyncProgress(progress);

  logger.info('Starting CF cache sync');

  try {
    const orgs = await cfOrgs();
    const total = orgs.length;
    let done = 0;

    for (const org of orgs) {
      try {
        await cfTarget(org.name);
        const apps = await cfApps();
        cache.setApps(currentRegionId, org.name, apps);
        done++;
        const p: SyncProgress = { status: 'running', done, total, currentOrg: org.name };
        cache.setSyncProgress(p);
        mainPanel.updateSyncProgress(p);
      } catch {
        done++;
      }
    }

    const done2: SyncProgress = { status: 'done', done, total };
    cache.setSyncProgress(done2);
    mainPanel.updateSyncProgress(done2);
    treeProvider.refresh();
    logger.info(`Cache sync complete: ${done}/${total} orgs`);
  } catch (err) {
    const errProgress: SyncProgress = {
      status: 'error',
      done: 0,
      total: 0,
      error: err instanceof Error ? err.message : String(err),
    };
    cache.setSyncProgress(errProgress);
    mainPanel.updateSyncProgress(errProgress);
    logger.error('Cache sync failed', err);
  }
}

function scheduleSync(): void {
  if (syncTimer) clearInterval(syncTimer);
  const intervalMin = vscode.workspace
    .getConfiguration('sapDevSuite')
    .get<number>('cacheSyncInterval', 240);
  const intervalMs = intervalMin * 60 * 1000;
  syncTimer = setInterval(() => {
    const autoSync = vscode.workspace.getConfiguration('sapDevSuite').get('autoSync', true);
    if (autoSync && config.login) {
      void triggerSync();
    }
  }, intervalMs);
}

// ─── Settings ─────────────────────────────────────────────────────────────────

// Map SettingsPayload keys → VSCode config keys (payload uses camelCase short forms)
const SETTINGS_KEY_MAP: Record<string, string> = {
  syncInterval: 'cacheSyncInterval',
};

async function applySettings(payload: Partial<SettingsPayload>, _context: vscode.ExtensionContext): Promise<void> {
  const cfg = vscode.workspace.getConfiguration('sapDevSuite');
  for (const [key, value] of Object.entries(payload)) {
    const configKey = SETTINGS_KEY_MAP[key] ?? key;
    await cfg.update(configKey, value, vscode.ConfigurationTarget.Global);
  }
  if (payload.syncInterval !== undefined || payload.autoSync !== undefined) {
    scheduleSync();
  }
}

// ─── Reset ────────────────────────────────────────────────────────────────────

async function resetConfig(context: vscode.ExtensionContext): Promise<void> {
  await processManager.stopAll();
  config = { orgMappings: [] };
  saveConfig(context.globalState);
  cache.clear();
  clearCachedCredentials();
  currentRegionId = 'ap11';
  await vscode.commands.executeCommand('setContext', 'sapDevSuite.loggedIn', false);
  mainPanel.showRegion();
  treeProvider.refresh();
  logger.info('Configuration reset');
}

// ─── Deactivate ───────────────────────────────────────────────────────────────

export function deactivate(): void {
  processManager?.dispose();
  if (syncTimer) clearInterval(syncTimer);
  logger.info('SAP Dev Suite deactivated');
}
