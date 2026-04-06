import * as vscode from 'vscode';
import { cfApps, cfEnv, cfSpaces, cfTarget } from '../../core/cfClient.js';
import { logger } from '../../core/logger.js';
import type { CacheManager } from '../../core/cacheManager.js';
import type { CredentialOutputMode, CredentialResult, SqlToolsConnection } from '../../types/index.js';
import type { MainPanel } from '../../webview/mainPanel.js';
import { parseVcapFromEnvOutput, extractHanaCredentials } from './vcapParser.js';
import { toSqlToolsConnection, writeSqlToolsConnections } from './sqlToolsWriter.js';

export class CredentialPanelController {
  constructor(
    private readonly panel: MainPanel,
    private readonly cache: CacheManager,
  ) {}

  async loadSpaces(orgName: string, regionId: string): Promise<void> {
    const cached = this.cache.getSpaces(regionId, orgName);
    if (cached) {
      this.panel.updateSpaces(cached);
      return;
    }
    try {
      const spaces = await cfSpaces(orgName);
      this.cache.setSpaces(regionId, orgName, spaces);
      this.panel.updateSpaces(spaces);
    } catch (err) {
      logger.error('Failed to load spaces', err);
      this.panel.showError('Failed to load spaces.');
    }
  }

  async loadSpaceApps(orgName: string, spaceName: string, regionId: string): Promise<void> {
    const cached = this.cache.getApps(regionId, orgName, spaceName);
    if (cached) {
      this.panel.updateSpaceApps(spaceName, cached);
      return;
    }
    try {
      await cfTarget(orgName, spaceName);
      const apps = await cfApps();
      this.cache.setApps(regionId, orgName, apps, spaceName);
      this.panel.updateSpaceApps(spaceName, apps);
    } catch (err) {
      logger.error('Failed to load space apps', err);
      this.panel.showError('Failed to load apps for space.');
    }
  }

  async extractCredentials(opts: {
    orgName: string;
    spaceName: string;
    appNames: string[];
    output: CredentialOutputMode;
  }): Promise<void> {
    this.panel.clearCredResults();

    await cfTarget(opts.orgName, opts.spaceName);

    const connections: SqlToolsConnection[] = [];

    for (const appName of opts.appNames) {
      let result: CredentialResult;
      try {
        const envOutput = await cfEnv(appName);
        const vcap = parseVcapFromEnvOutput(envOutput);
        const creds = extractHanaCredentials(vcap);

        if (!creds) {
          result = { appName, ok: false, error: 'No HANA binding' };
        } else {
          const connection = toSqlToolsConnection(appName, creds);
          connections.push(connection);
          result = { appName, ok: true, connection };
        }
      } catch (err) {
        logger.error(`Failed to extract creds for ${appName}`, err);
        result = { appName, ok: false, error: err instanceof Error ? err.message : String(err) };
      }
      this.panel.appendCredResult(result);
    }

    if (connections.length === 0) {
      void vscode.window.showWarningMessage('No HANA credentials found in selected apps.');
      return;
    }

    await this.deliverCredentials(connections, opts.output);
  }

  private async deliverCredentials(
    connections: SqlToolsConnection[],
    mode: CredentialOutputMode,
  ): Promise<void> {
    const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

    switch (mode) {
      case 'sqltools': {
        if (workspacePath === undefined) {
          void vscode.window.showErrorMessage('Open a workspace folder first.');
          return;
        }
        const sqlToolsEnabled = vscode.workspace
          .getConfiguration('sapTools')
          .get<boolean>('sqlToolsIntegration', true);
        if (sqlToolsEnabled) {
          writeSqlToolsConnections(workspacePath, connections);
          void vscode.window.showInformationMessage(
            `✅ Written ${connections.length} HANA connection(s) to .vscode/settings.json`,
          );
        }
        break;
      }

      case 'json': {
        const json = JSON.stringify(connections, null, 2);
        const uri = await vscode.window.showSaveDialog({
          defaultUri: vscode.Uri.file(`${workspacePath ?? process.cwd()}/hana-credentials.json`),
          filters: { JSON: ['json'] },
        });
        if (uri) {
          await vscode.workspace.fs.writeFile(uri, Buffer.from(json, 'utf-8'));
          void vscode.window.showInformationMessage(`✅ Saved to ${uri.fsPath}`);
        }
        break;
      }

      case 'clipboard': {
        const json = JSON.stringify(connections, null, 2);
        await vscode.env.clipboard.writeText(json);
        void vscode.window.showInformationMessage(
          `✅ Copied ${connections.length} credential(s) to clipboard`,
        );
        break;
      }
    }
  }
}
