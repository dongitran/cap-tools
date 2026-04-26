import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';
import {
  buildHanaSqlResultExportFileName,
  buildHanaSqlResultHtml,
  formatHanaSqlResultSetCsv,
  formatHanaSqlResultSetJson,
  resolveSqlResultTargetColumn,
  type HanaSqlResultExportFormat,
  type RenderSqlResultOptions,
} from './hanaSqlWorkbenchSupport';

const SQL_RESULT_VIEW_TYPE = 'sapTools.hanaSqlResult';
const SQL_RESULT_EXPORT_ACTION_MESSAGE_TYPE = 'sapTools.sqlResultExportAction';
const SQL_RESULT_EXPORT_ACTION_RESULT_MESSAGE_TYPE =
  'sapTools.sqlResultExportActionResult';

type SqlResultExportActionName = 'copyCsv' | 'copyJson' | 'exportCsv' | 'exportJson';

interface SqlResultExportAction {
  readonly name: SqlResultExportActionName;
  readonly format: HanaSqlResultExportFormat;
  readonly mode: 'copy' | 'export';
}

export interface HanaSqlResultPanelSession {
  readonly panel: vscode.WebviewPanel;
  update(options: RenderSqlResultOptions): void;
}

export class HanaSqlResultPanelManager implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  private resultSequence = 0;

  constructor(private readonly outputChannel: vscode.OutputChannel) {}

  dispose(): void {
    while (this.disposables.length > 0) {
      this.disposables.pop()?.dispose();
    }
  }

  openResultPanel(
    options: RenderSqlResultOptions,
    sourceViewColumn: number | undefined
  ): HanaSqlResultPanelSession {
    this.resultSequence += 1;
    const target = resolveResultTargetViewColumn(sourceViewColumn);
    this.log(`open result panel ${target.logLabel} for app ${sanitizeLogValue(options.appName)}`);
    const panel = vscode.window.createWebviewPanel(
      SQL_RESULT_VIEW_TYPE,
      `SAP Tools SQL Result ${String(this.resultSequence)} · ${options.appName}`,
      { preserveFocus: false, viewColumn: target.viewColumn },
      { enableScripts: true }
    );
    const nonce = createWebviewNonce();
    let currentOptions = { ...options, nonce };
    const render = (): void => {
      panel.webview.html = buildHanaSqlResultHtml(currentOptions);
    };
    const messageSubscription = panel.webview.onDidReceiveMessage((message: unknown) => {
      void this.handlePanelMessage(panel, currentOptions, message);
    });
    panel.onDidDispose(() => {
      messageSubscription.dispose();
    }, null, this.disposables);
    render();
    return {
      panel,
      update: (nextOptions: RenderSqlResultOptions): void => {
        currentOptions = { ...nextOptions, nonce };
        render();
      },
    };
  }

  private async handlePanelMessage(
    panel: vscode.WebviewPanel,
    options: RenderSqlResultOptions,
    message: unknown
  ): Promise<void> {
    if (!isRecord(message) || message['type'] !== SQL_RESULT_EXPORT_ACTION_MESSAGE_TYPE) {
      return;
    }
    const action = parseExportAction(message['action']);
    if (action === null) {
      postExportActionResult(panel, false, '', 'Unsupported result export action.');
      return;
    }
    await this.handleExportAction(panel, options, action);
  }

  private async handleExportAction(
    panel: vscode.WebviewPanel,
    options: RenderSqlResultOptions,
    action: SqlResultExportAction
  ): Promise<void> {
    if (options.result?.kind !== 'resultset') {
      postExportActionResult(panel, false, action.name, 'No result set is available to export.');
      return;
    }
    const content = formatResultSet(options.result, action.format);
    if (action.mode === 'copy') {
      await this.copyResult(panel, options.appName, action, content);
      return;
    }
    await this.exportResult(panel, options, action, content);
  }

  private async copyResult(
    panel: vscode.WebviewPanel,
    appName: string,
    action: SqlResultExportAction,
    content: string
  ): Promise<void> {
    try {
      await vscode.env.clipboard.writeText(content);
      this.log(`copied ${action.format.toUpperCase()} result for app ${sanitizeLogValue(appName)}`);
      postExportActionResult(panel, true, action.name, `${action.format.toUpperCase()} copied to clipboard.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to copy SQL result.';
      postExportActionResult(panel, false, action.name, sanitizeLogValue(message));
    }
  }

  private async exportResult(
    panel: vscode.WebviewPanel,
    options: RenderSqlResultOptions,
    action: SqlResultExportAction,
    content: string
  ): Promise<void> {
    const fileName = buildHanaSqlResultExportFileName(options.appName, options.executedAt, action.format);
    const defaultUri = buildDefaultExportUri(fileName);
    const saveOptions: vscode.SaveDialogOptions = {
      filters: { [action.format.toUpperCase()]: [action.format] },
      saveLabel: `Export ${action.format.toUpperCase()}`,
    };
    if (defaultUri !== undefined) {
      saveOptions.defaultUri = defaultUri;
    }
    try {
      const targetUri = await vscode.window.showSaveDialog(saveOptions);
      if (targetUri === undefined) {
        postExportActionResult(panel, true, action.name, 'Export cancelled.');
        return;
      }
      await vscode.workspace.fs.writeFile(targetUri, new TextEncoder().encode(content));
      this.log(`exported ${action.format.toUpperCase()} result for app ${sanitizeLogValue(options.appName)}`);
      postExportActionResult(panel, true, action.name, `${action.format.toUpperCase()} exported.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to export SQL result.';
      this.log(
        `failed to export ${action.format.toUpperCase()} result for app ${sanitizeLogValue(options.appName)}: ${sanitizeLogValue(message)}`
      );
      postExportActionResult(panel, false, action.name, 'Failed to export SQL result.');
    }
  }

  private log(message: string): void {
    this.outputChannel.appendLine(`[sql] ${message}`);
  }
}

function resolveResultTargetViewColumn(
  sourceViewColumn: number | undefined
): { readonly logLabel: string; readonly viewColumn: vscode.ViewColumn } {
  const existingColumns = vscode.window.tabGroups.all
    .map((group) => toPositiveViewColumnNumber(group.viewColumn))
    .filter((column): column is number => column !== undefined);
  const target = resolveSqlResultTargetColumn(sourceViewColumn, existingColumns);
  if (target.kind === 'existing') {
    return {
      logLabel: `in existing editor column ${String(target.viewColumn)}`,
      viewColumn: target.viewColumn as vscode.ViewColumn,
    };
  }
  return { logLabel: 'beside the SQL editor', viewColumn: vscode.ViewColumn.Beside };
}

function parseExportAction(rawAction: unknown): SqlResultExportAction | null {
  if (rawAction === 'copyCsv') return { name: rawAction, format: 'csv', mode: 'copy' };
  if (rawAction === 'copyJson') return { name: rawAction, format: 'json', mode: 'copy' };
  if (rawAction === 'exportCsv') return { name: rawAction, format: 'csv', mode: 'export' };
  if (rawAction === 'exportJson') return { name: rawAction, format: 'json', mode: 'export' };
  return null;
}

function formatResultSet(
  result: NonNullable<RenderSqlResultOptions['result']>,
  format: HanaSqlResultExportFormat
): string {
  if (result.kind !== 'resultset') {
    return '';
  }
  return format === 'csv'
    ? formatHanaSqlResultSetCsv(result)
    : formatHanaSqlResultSetJson(result);
}

function postExportActionResult(
  panel: vscode.WebviewPanel,
  success: boolean,
  action: string,
  message: string
): void {
  void panel.webview.postMessage({
    type: SQL_RESULT_EXPORT_ACTION_RESULT_MESSAGE_TYPE,
    action,
    success,
    message,
  });
}

function buildDefaultExportUri(fileName: string): vscode.Uri | undefined {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (workspaceFolder?.uri.scheme !== 'file') {
    return undefined;
  }
  return vscode.Uri.joinPath(workspaceFolder.uri, fileName);
}

function createWebviewNonce(): string {
  return randomBytes(16).toString('base64url');
}

function toPositiveViewColumnNumber(
  viewColumn: vscode.ViewColumn | undefined
): number | undefined {
  if (viewColumn === undefined) {
    return undefined;
  }
  const column: number = viewColumn;
  return column > 0 ? column : undefined;
}

function sanitizeLogValue(value: string): string {
  return value.replaceAll(/[\r\n\t]+/g, ' ').slice(0, 500);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
