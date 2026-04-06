import * as vscode from 'vscode';
import type { CacheManager } from '../../core/cacheManager.js';
import { cfApps, cfTarget, isAuthError } from '../../core/cfClient.js';
import { logger } from '../../core/logger.js';
import type { ProcessManager } from '../../core/processManager.js';
import type { ExtensionConfig } from '../../types/index.js';
import type { MainPanel } from '../../webview/mainPanel.js';
import { findLocalFolder, allocatePort } from './appMapper.js';
import { getUsedPorts, mergeLaunchConfig } from './launchConfigurator.js';

export class DebugPanelController {
  constructor(
    private readonly panel: MainPanel,
    private readonly processManager: ProcessManager,
    private readonly cache: CacheManager,
    private readonly config: ExtensionConfig,
  ) {}

  async loadApps(orgName: string, regionId: string): Promise<void> {
    const cached = this.cache.getApps(regionId, orgName);
    if (cached) {
      this.panel.updateApps(cached);
      return;
    }

    try {
      await cfTarget(orgName);
      const apps = await cfApps();
      this.cache.setApps(regionId, orgName, apps);
      this.panel.updateApps(apps);
    } catch (err) {
      logger.error('Failed to load apps for debug', err);
      const msg = err instanceof Error ? err.message : String(err);
      this.panel.showAppsError(isAuthError(err) ? `Session expired — ${msg}` : msg);
    }
  }

  startDebugSessions(appNames: string[], orgName: string): void {
    const mapping = this.config.orgMappings.find(m => m.cfOrg === orgName);
    if (!mapping) {
      void vscode.window.showErrorMessage(
        `No local folder mapped for org "${orgName}". Use the folder picker in Debug tab.`,
      );
      return;
    }

    const workspaceFolders = vscode.workspace.workspaceFolders;
    const workspacePath = workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();

    const usedPorts = getUsedPorts(workspacePath);
    const basePort = vscode.workspace
      .getConfiguration('sapTools')
      .get<number>('debugBasePort', 9229);
    const explorerDepth = vscode.workspace
      .getConfiguration('sapTools')
      .get<number>('explorerDepth', 6);

    for (const appName of appNames) {
      const localFolder = findLocalFolder(appName, mapping.groupFolderPath, explorerDepth);
      if (localFolder === undefined) {
        logger.warn(`No local folder found for app "${appName}" under ${mapping.groupFolderPath}`);
        void vscode.window.showWarningMessage(
          `Could not find local folder for "${appName}". Skipping.`,
        );
        continue;
      }

      const port = allocatePort(basePort, usedPorts);

      // Write launch config before spawning process
      const configName = mergeLaunchConfig(workspacePath, {
        appName,
        port,
        localFolderPath: localFolder,
      });

      // Listen for ATTACHING/ERROR/EXITED to attach debugger or cleanup
      const unsubscribe = this.processManager.onSessionUpdate(async session => {
        if (session.appName !== appName) {return;}

        // Always unsubscribe on terminal states to prevent memory leak
        if (session.status === 'ATTACHING') {
          unsubscribe();
          try {
            const folder = workspaceFolders?.[0];
            await vscode.debug.startDebugging(folder, configName);
            this.processManager.notifyAttached(appName);
          } catch (err) {
            logger.error(`Failed to attach debugger to ${appName}`, err);
            this.processManager.stopDebug(appName);
          }
        } else if (session.status === 'ERROR' || session.status === 'EXITED') {
          unsubscribe();
        }
      });

      void this.processManager.startDebug(appName, port);
    }
  }

  stopDebugSession(appName: string): void {
    this.processManager.stopDebug(appName);
  }

  stopAllSessions(): void {
    this.processManager.stopAll();
  }
}
