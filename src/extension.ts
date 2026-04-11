import * as vscode from 'vscode';

import type { SapBtpRegion } from './regions';
import {
  REGION_VIEW_ID,
  SELECT_REGION_FROM_SIDEBAR_COMMAND,
  RegionSidebarProvider,
} from './sidebarProvider';

const OPEN_REGION_MENU_COMMAND = 'sapTools.selectSapBtpRegion';
const OUTPUT_CHANNEL_NAME = 'SAP Tools';

export function activate(context: vscode.ExtensionContext): void {
  const outputChannel = vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME);
  const regionSidebarProvider = new RegionSidebarProvider();

  const treeView = vscode.window.createTreeView(REGION_VIEW_ID, {
    treeDataProvider: regionSidebarProvider,
    showCollapseAll: true,
  });

  const selectRegionCommand = vscode.commands.registerCommand(
    SELECT_REGION_FROM_SIDEBAR_COMMAND,
    (region: SapBtpRegion): void => {
      regionSidebarProvider.setSelectedRegion(region);
      const selectionMessage = buildSelectionMessage(region);
      outputChannel.appendLine(selectionMessage);
      outputChannel.show(true);
      void vscode.window.showInformationMessage(selectionMessage);
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
    treeView,
    selectRegionCommand,
    openRegionMenuCommand
  );
}

function buildSelectionMessage(region: SapBtpRegion): string {
  const timestamp = new Date().toISOString();
  return `[${timestamp}] Selected SAP BTP region: ${region.displayName} (${region.id}) | ${region.area} | ${region.provider}`;
}
