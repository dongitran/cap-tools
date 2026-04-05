import * as vscode from 'vscode';
import { logger } from './core/logger.js';
import { CacheManager } from './core/cacheManager.js';
import { ProcessManager } from './core/processManager.js';
import { readShellCredentials, clearCachedCredentials } from './core/shellEnv.js';
import { cfSetApi, cfAuth, cfOrgs, cfApps, cfEnv, cfTarget, parseEnvVars, isAuthError } from './core/cfClient.js';
import { getOrCustomRegion } from './core/regionList.js';
import { MainPanel } from './webview/mainPanel.js';
import { CfTreeProvider } from './features/explorer/cfTreeProvider.js';
import { CfAppNode } from './features/explorer/nodes.js';
import { DebugPanelController } from './features/debug/debugPanel.js';
import { CredentialPanelController } from './features/credentials/credentialPanel.js';
import { parseVcapFromEnvOutput } from './features/credentials/vcapParser.js';
import { cleanupLaunchConfigs } from './features/debug/launchConfigurator.js';
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
let debugController: DebugPanelController | undefined;
let credController: CredentialPanelController | undefined;
let syncTimer: ReturnType<typeof setInterval> | undefined;

let config: ExtensionConfig = { orgMappings: [] };
let currentRegionId = 'ap11';
let statusBar: vscode.StatusBarItem;
let extensionContext: vscode.ExtensionContext;

function loadConfig(state: vscode.Memento): void {
  const saved = state.get<ExtensionConfig>(CONFIG_KEY);
  if (saved) {config = saved;}
}

function saveConfig(state: vscode.Memento): void {
  void state.update(CONFIG_KEY, config);
}

// ─── Activate ─────────────────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext): void {
  logger.init();
  logger.info('SAP Dev Suite activating');

  extensionContext = context;
  cache = new CacheManager(context.globalState);
  processManager = new ProcessManager();
  loadConfig(context.globalState);

  // ── Status Bar ───────────────────────────────────────────────────────────

  statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBar.command = 'workbench.view.extension.sapDevSuite';
  context.subscriptions.push(statusBar);
  refreshStatusBar();

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

  const cmds: Array<[string, (...args: unknown[]) => unknown]> = [
    ['sapDevSuite.resetConfig', () => resetConfig(context)],
    ['sapDevSuite.syncCache', () => triggerSync()],
    ['sapDevSuite.refreshExplorer', () => treeProvider.refresh()],
    ['sapDevSuite.stopAllSessions', () => { processManager.stopAll(); }],

    ['sapDevSuite.copyAppName', (node: unknown) => {
      if (node instanceof CfAppNode) {
        void vscode.env.clipboard.writeText(node.appName);
        void vscode.window.showInformationMessage(`Copied: ${node.appName}`);
      }
    }],
    ['sapDevSuite.openAppUrl', (node: unknown) => {
      if (node instanceof CfAppNode && node.appUrls.length > 0) {
        void vscode.env.openExternal(vscode.Uri.parse(`https://${node.appUrls[0]}`));
      }
    }],
    ['sapDevSuite.debugApp', (node: unknown) => {
      if (!(node instanceof CfAppNode)) {return;}
      if (debugController === undefined) {
        void vscode.window.showErrorMessage('SAP Dev Suite: Please login and select an org first.');
        return;
      }
      debugController.startDebugSessions([node.appName], node.orgName);
    }],
    ['sapDevSuite.extractAppCreds', (node: unknown) => {
      if (!(node instanceof CfAppNode)) {return;}
      mainPanel.showDashboard(node.orgName, 'credentials');
    }],
    ['sapDevSuite.viewAppEnv', async (node: unknown) => {
      if (!(node instanceof CfAppNode)) {return;}
      await openAppEnvDocument(node.appName, node.orgName, node.spaceName);
    }],
    ['sapDevSuite.cleanupLaunchConfigs', () => {
      const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (ws === undefined) {
        void vscode.window.showWarningMessage('SAP Dev Suite: Open a workspace folder first.');
        return;
      }
      cleanupLaunchConfigs(ws);
      void vscode.window.showInformationMessage('SAP Dev Suite: Removed all SAP debug configurations from launch.json.');
    }],
  ];

  for (const [cmd, handler] of cmds) {
    context.subscriptions.push(vscode.commands.registerCommand(cmd, handler));
  }

  // ── Process session updates → webview + status bar ───────────────────────

  processManager.onSessionUpdate(session => {
    mainPanel.updateDebugSession(session);
    refreshStatusBar();
  });

  // ── Auto-sync on startup ─────────────────────────────────────────────────

  const autoSync = vscode.workspace.getConfiguration('sapDevSuite').get<boolean>('autoSync', true);
  if (autoSync && config.login !== undefined) {
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

// ─── Status Bar ───────────────────────────────────────────────────────────────

function refreshStatusBar(): void {
  const sessions = processManager.getActiveSessions();
  if (config.login === undefined) {
    statusBar.text = '$(cloud) SAP: Not connected';
    statusBar.tooltip = 'SAP Dev Suite: Click to connect';
    statusBar.backgroundColor = undefined;
  } else {
    const orgLabel = config.selectedOrg ?? config.login.regionId;
    if (sessions.length > 0) {
      statusBar.text = `$(debug) SAP: ${orgLabel} | ${sessions.length} debugging`;
      statusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
      statusBar.tooltip = `SAP Dev Suite: ${sessions.join(', ')} debugging`;
    } else {
      statusBar.text = `$(cloud) SAP: ${orgLabel}`;
      statusBar.tooltip = `SAP Dev Suite: Connected to ${config.login.regionId}`;
      statusBar.backgroundColor = undefined;
    }
  }
  statusBar.show();
}

// ─── App Environment Viewer ───────────────────────────────────────────────────

async function openAppEnvDocument(appName: string, orgName: string, spaceName?: string): Promise<void> {
  try {
    if (spaceName !== undefined) {
      await cfTarget(orgName, spaceName);
    } else {
      await cfTarget(orgName);
    }
    const envOutput = await cfEnv(appName);
    const vcap = parseVcapFromEnvOutput(envOutput);
    const envVars = parseEnvVars(envOutput);
    const content = JSON.stringify({ vcap_services: vcap, user_provided: envVars }, null, 2);
    const doc = await vscode.workspace.openTextDocument({ content, language: 'json' });
    await vscode.window.showTextDocument(doc, { preview: true });
  } catch (err) {
    logger.error(`Failed to get app env for ${appName}`, err);
    void vscode.window.showErrorMessage(
      `SAP Dev Suite: Failed to fetch env for "${appName}" — ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

// ─── Webview Message Handler ──────────────────────────────────────────────────

async function handleWebviewMessage(msg: WebviewMessage, context: vscode.ExtensionContext): Promise<void> {
  switch (msg.type) {
    case 'ready':
      // Send initial state to webview
      if (config.login !== undefined && config.selectedOrg !== undefined) {
        mainPanel.showDashboard(config.selectedOrg, 'debug');
        await loadDashboardData();
      } else if (config.login !== undefined) {
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
      if (credController) {await credController.loadSpaces(msg.payload.orgName, currentRegionId);}
      break;

    case 'loadSpaceApps':
      if (credController) {await credController.loadSpaceApps(msg.payload.orgName, msg.payload.spaceName, currentRegionId);}
      break;

    case 'backToOrgSelect': {
      // Go back to org selection using cached orgs or re-fetch
      const cachedOrgs = cache.getOrgs(currentRegionId);
      if (cachedOrgs !== undefined && cachedOrgs.length > 0) {
        config = { ...config };
        delete config.selectedOrg;
        saveConfig(context.globalState);
        mainPanel.showOrgSelect(cachedOrgs);
      } else {
        await handleLogin(currentRegionId, context);
      }
      break;
    }

    case 'startDebug':
      // Use server-side config.selectedOrg — don't rely on webview sending orgName
      if (debugController !== undefined && config.selectedOrg !== undefined) {
        debugController.startDebugSessions(msg.payload.appNames, config.selectedOrg);
      }
      break;

    case 'stopDebug':
      if (debugController !== undefined) {debugController.stopDebugSession(msg.payload.appName);}
      else {processManager.stopDebug(msg.payload.appName);}
      break;

    case 'stopAllDebug':
      processManager.stopAll();
      break;

    case 'extractCreds':
      if (credController !== undefined && config.selectedOrg !== undefined) {
        await credController.extractCredentials({
          orgName: config.selectedOrg,
          spaceName: msg.payload.spaceName,
          appNames: msg.payload.appNames,
          output: msg.payload.output,
        });
      }
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

    case 'getAppEnv': {
      await openAppEnvDocument(msg.payload.appName, msg.payload.orgName);
      break;
    }
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
  if (creds.email === undefined || creds.password === undefined) {
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
    refreshStatusBar();

    // Check if org already mapped
    if (config.selectedOrg !== undefined) {
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
  refreshStatusBar();
}

// ─── Dashboard Data Loading ───────────────────────────────────────────────────

async function loadDashboardData(): Promise<void> {
  const orgName = config.selectedOrg;
  if (orgName === undefined) {return;}

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
  if (tab === 'credentials' && config.selectedOrg !== undefined) {
    await credController?.loadSpaces(config.selectedOrg, currentRegionId);
  }
}

// ─── Folder Mapping ───────────────────────────────────────────────────────────

function updateOrgMapping(orgName: string, folderPath: string, context: vscode.ExtensionContext): void {
  const idx = config.orgMappings.findIndex(m => m.cfOrg === orgName);
  const mapping: OrgFolderMapping = { cfOrg: orgName, groupFolderPath: folderPath };
  if (idx >= 0) {config.orgMappings[idx] = mapping;}
  else {config.orgMappings.push(mapping);}
  saveConfig(context.globalState);
}

// ─── Background Cache Sync ────────────────────────────────────────────────────

async function triggerSync(): Promise<void> {
  if (!config.login) {return;}

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
      } catch (err) {
        logger.warn(`Sync skipped org "${org.name}"`, err);
        done++;
      }
    }

    const done2: SyncProgress = { status: 'done', done, total };
    cache.setSyncProgress(done2);
    mainPanel.updateSyncProgress(done2, cache.getStats());
    treeProvider.refresh();
    logger.info(`Cache sync complete: ${done}/${total} orgs`);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const errProgress: SyncProgress = { status: 'error', done: 0, total: 0, error: errMsg };
    cache.setSyncProgress(errProgress);
    mainPanel.updateSyncProgress(errProgress);
    logger.error('Cache sync failed', err);

    // Notify user if their CF session expired
    if (isAuthError(err)) {
      void vscode.window.showWarningMessage(
        'SAP Dev Suite: CF session expired — re-login to resume syncing.',
        'Re-Login',
      ).then(action => {
        if (action === 'Re-Login') {
          void handleLogin(currentRegionId, extensionContext);
        }
      });
    }
  }
}

function scheduleSync(): void {
  if (syncTimer) {clearInterval(syncTimer);}
  const intervalMin = vscode.workspace
    .getConfiguration('sapDevSuite')
    .get<number>('cacheSyncInterval', 240);
  const intervalMs = intervalMin * 60 * 1000;
  syncTimer = setInterval(() => {
    const autoSync = vscode.workspace.getConfiguration('sapDevSuite').get<boolean>('autoSync', true);
    if (autoSync && config.login !== undefined) {
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
  processManager.stopAll();
  config = { orgMappings: [] };
  saveConfig(context.globalState);
  cache.clear();
  clearCachedCredentials();
  currentRegionId = 'ap11';
  await vscode.commands.executeCommand('setContext', 'sapDevSuite.loggedIn', false);
  mainPanel.showRegion();
  treeProvider.refresh();
  refreshStatusBar();
  logger.info('Configuration reset');
}

// ─── Deactivate ───────────────────────────────────────────────────────────────

export function deactivate(): void {
  processManager.dispose();
  if (syncTimer) {clearInterval(syncTimer);}
  logger.info('SAP Dev Suite deactivated');
}
