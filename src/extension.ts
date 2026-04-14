import * as vscode from 'vscode';

import { CF_LOGS_VIEW_ID, CfLogsPanelProvider } from './cfLogsPanel';
import { CacheStore } from './cacheStore';
import { CacheSyncService } from './cacheSyncService';
import { getEffectiveCredentials } from './credentialStore';
import { REGION_VIEW_ID, RegionSidebarProvider } from './sidebarProvider';

const OPEN_REGION_MENU_COMMAND = 'sapTools.selectSapBtpRegion';
const OPEN_CF_LOGS_PANEL_COMMAND = 'sapTools.openCfLogsPanel';
const OUTPUT_CHANNEL_NAME = 'SAP Tools';

export function activate(context: vscode.ExtensionContext): void {
  const outputChannel = vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME);
  const cacheStore = new CacheStore(context);
  const cacheSyncService = new CacheSyncService(cacheStore, context, outputChannel);

  const cfLogsPanel = new CfLogsPanelProvider(context);

  const regionSidebarProvider = new RegionSidebarProvider(
    context.extensionUri,
    outputChannel,
    context,
    cfLogsPanel,
    cacheSyncService,
    cacheStore
  );

  void getEffectiveCredentials(context)
    .then(async (credentials) => cacheSyncService.initialize(credentials))
    .catch(() => undefined);

  const webviewProviderRegistration = vscode.window.registerWebviewViewProvider(
    REGION_VIEW_ID,
    regionSidebarProvider,
    {
      webviewOptions: {
        retainContextWhenHidden: true,
      },
    }
  );

  const cfLogsPanelRegistration = vscode.window.registerWebviewViewProvider(
    CF_LOGS_VIEW_ID,
    cfLogsPanel,
    {
      webviewOptions: {
        retainContextWhenHidden: true,
      },
    }
  );

  const openRegionMenuCommand = vscode.commands.registerCommand(
    OPEN_REGION_MENU_COMMAND,
    async (): Promise<void> => {
      await vscode.commands.executeCommand(`${REGION_VIEW_ID}.focus`);
    }
  );

  const openCfLogsPanelCommand = vscode.commands.registerCommand(
    OPEN_CF_LOGS_PANEL_COMMAND,
    async (): Promise<void> => {
      await vscode.commands.executeCommand(`${CF_LOGS_VIEW_ID}.focus`);
    }
  );

  context.subscriptions.push(
    outputChannel,
    cacheSyncService,
    regionSidebarProvider,
    cfLogsPanel,
    webviewProviderRegistration,
    cfLogsPanelRegistration,
    openRegionMenuCommand,
    openCfLogsPanelCommand
  );
}
