import * as vscode from 'vscode';
import type { CacheManager } from '../../core/cacheManager.js';
import { cfApps, cfTarget } from '../../core/cfClient.js';
import { logger } from '../../core/logger.js';
import type { ProcessManager } from '../../core/processManager.js';
import type { CfApp, ExtensionConfig, OrgFolderMapping } from '../../types/index.js';
import type { MainPanel } from '../../webview/mainPanel.js';
import { findLocalFolder } from './appMapper.js';
import {
  allocatePort,
  findLocalFolder as _findLocalFolder,
} from './appMapper.js';
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
      this.panel.showError('Failed to load apps. Check CF login.');
    }
  }

  async startDebugSessions(appNames: string[], orgName: string): Promise<void> {
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
      .getConfiguration('sapDevSuite')
      .get<number>('debugBasePort', 9229);
    const explorerDepth = vscode.workspace
      .getConfiguration('sapDevSuite')
      .get<number>('explorerDepth', 6);

    for (const appName of appNames) {
      const localFolder = findLocalFolder(appName, mapping.groupFolderPath, explorerDepth);
      if (!localFolder) {
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

      // Start the tunnel process
      void this.processManager.startDebug(appName, port).then(() => {
        // Attach debugger once tunnel is ready (processManager emits ATTACHING status)
      });

      // Listen for ATTACHING status then attach debugger
      const unsubscribe = this.processManager.onSessionUpdate(async session => {
        if (session.appName !== appName || session.status !== 'ATTACHING') return;
        unsubscribe();
        try {
          const folder = workspaceFolders?.[0];
          const started = await vscode.debug.startDebugging(folder, configName);
          if (started) {
            this.processManager.notifyAttached(appName);
          } else {
            this.processManager.notifyAttached(appName); // still mark as attached on failure
          }
        } catch (err) {
          logger.error(`Failed to attach debugger to ${appName}`, err);
        }
      });
    }
  }

  async stopDebugSession(appName: string): Promise<void> {
    await this.processManager.stopDebug(appName);
  }

  async stopAllSessions(): Promise<void> {
    await this.processManager.stopAll();
  }
}
