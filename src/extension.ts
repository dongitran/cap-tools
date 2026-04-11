import * as vscode from 'vscode';

import { REGION_VIEW_ID, RegionSidebarProvider } from './sidebarProvider';

const OPEN_REGION_MENU_COMMAND = 'sapTools.selectSapBtpRegion';
const OUTPUT_CHANNEL_NAME = 'SAP Tools';

export function activate(context: vscode.ExtensionContext): void {
  const outputChannel = vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME);
  const regionSidebarProvider = new RegionSidebarProvider(
    context.extensionUri,
    outputChannel
  );
  const webviewProviderRegistration = vscode.window.registerWebviewViewProvider(
    REGION_VIEW_ID,
    regionSidebarProvider,
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

  context.subscriptions.push(
    outputChannel,
    regionSidebarProvider,
    webviewProviderRegistration,
    openRegionMenuCommand
  );
}
