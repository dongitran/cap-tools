import * as vscode from 'vscode';
import {
  HanaQueryError,
  classifyHanaSqlStatement,
  executeHanaQuery,
  normalizeSingleHanaStatement,
  sanitizeHanaErrorMessage,
  type HanaConnection,
  type HanaQueryResult,
  type HanaSqlStatementKind,
} from './hanaSqlService';
import {
  resolveHanaConnectionFromApp,
  type HanaSqlScopeSession,
} from './hanaSqlConnectionResolver';
import {
  TABLE_DISCOVERY_QUERIES,
  buildHanaSqlResultHtml,
  buildInitialHanaSqlTemplate,
  buildTestModeQueryResult,
  createTestModeTableNames,
  extractTableNames,
  filterKeywordCandidates,
  filterTableCandidates,
  sanitizeUntitledFileName,
  type RenderSqlResultOptions,
} from './hanaSqlWorkbenchSupport';
export { buildHanaSqlResultHtml, buildInitialHanaSqlTemplate } from './hanaSqlWorkbenchSupport';
export const RUN_HANA_SQL_COMMAND_ID = 'sapTools.runHanaSql';
const HANA_SQL_EDITOR_CONTEXT_KEY = 'sapTools.hanaSqlEditor';
const SQL_RESULT_VIEW_TYPE = 'sapTools.hanaSqlResult';
interface HanaSqlDocumentContext {
  readonly appId: string;
  readonly appName: string;
  readonly session: HanaSqlScopeSession | null;
  connection: HanaConnection | null;
  schema: string;
  tableNames: readonly string[];
  tableNamesPromise: Promise<void> | null;
}
export interface OpenHanaSqlFileRequest {
  readonly appId: string;
  readonly appName: string;
  readonly session: HanaSqlScopeSession | null;
}
function buildSqlKeywordCompletionItems(prefix: string): vscode.CompletionItem[] {
  return filterKeywordCandidates(prefix).map((keyword) => {
    const item = new vscode.CompletionItem(keyword, vscode.CompletionItemKind.Keyword);
    item.detail = 'SAP Tools SQL keyword';
    return item;
  });
}

function buildTableCompletionItems(
  tableNames: readonly string[],
  prefix: string
): vscode.CompletionItem[] {
  return filterTableCandidates(tableNames, prefix).map((tableName) => {
    const item = new vscode.CompletionItem(tableName, vscode.CompletionItemKind.Struct);
    item.detail = 'S/4HANA table';
    return item;
  });
}

export class HanaSqlWorkbench
  implements vscode.Disposable, vscode.CompletionItemProvider
{
  private readonly isTestMode: boolean;
  private readonly documentContexts = new Map<string, HanaSqlDocumentContext>();
  private readonly disposables: vscode.Disposable[] = [];
  private resultSequence = 0;

  constructor(private readonly outputChannel: vscode.OutputChannel) {
    this.isTestMode = process.env['SAP_TOOLS_TEST_MODE'] === '1';

    this.disposables.push(
      vscode.commands.registerCommand(RUN_HANA_SQL_COMMAND_ID, async () => {
        await this.handleRunHanaSqlCommand();
      }),
      vscode.languages.registerCompletionItemProvider(
        [
          { language: 'sql', scheme: 'untitled' },
          { language: 'sql', scheme: 'file' },
        ],
        this
      ),
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        this.updateSqlEditorContextKey(editor);
      }),
      vscode.workspace.onDidCloseTextDocument((document) => {
        this.documentContexts.delete(document.uri.toString());
        this.updateSqlEditorContextKey(vscode.window.activeTextEditor);
      })
    );

    this.updateSqlEditorContextKey(vscode.window.activeTextEditor);
  }

  dispose(): void {
    while (this.disposables.length > 0) {
      this.disposables.pop()?.dispose();
    }
  }

  async openSqlDocumentForApp(options: OpenHanaSqlFileRequest): Promise<void> {
    const fileName = sanitizeUntitledFileName(options.appName);
    const uri = vscode.Uri.parse(`untitled:saptools-${fileName}.sql`);
    let document = await vscode.workspace.openTextDocument(uri);
    if (document.languageId !== 'sql') {
      document = await vscode.languages.setTextDocumentLanguage(document, 'sql');
    }

    const editor = await vscode.window.showTextDocument(document, {
      preview: false,
      preserveFocus: false,
    });

    if (document.getText().trim().length === 0) {
      await editor.edit((editBuilder) => {
        editBuilder.insert(
          new vscode.Position(0, 0),
          buildInitialHanaSqlTemplate(options.appName)
        );
      });
    }

    const context: HanaSqlDocumentContext = {
      appId: options.appId,
      appName: options.appName,
      session: options.session,
      connection: null,
      schema: '',
      tableNames: [],
      tableNamesPromise: null,
    };
    this.documentContexts.set(document.uri.toString(), context);
    this.updateSqlEditorContextKey(vscode.window.activeTextEditor);
    void this.prefetchTableNames(document.uri.toString());
  }

  provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.ProviderResult<vscode.CompletionItem[]> {
    const context = this.documentContexts.get(document.uri.toString());
    if (context === undefined) {
      return undefined;
    }

    const wordRange = document.getWordRangeAtPosition(position, /[A-Za-z_][A-Za-z0-9_]*/);
    const prefix = wordRange === undefined ? '' : document.getText(wordRange);

    void this.prefetchTableNames(document.uri.toString());

    return [
      ...buildTableCompletionItems(context.tableNames, prefix),
      ...buildSqlKeywordCompletionItems(prefix),
    ];
  }

  private async handleRunHanaSqlCommand(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (editor === undefined) {
      void vscode.window.showWarningMessage('Open a SQL editor before running a query.');
      return;
    }

    const context = this.documentContexts.get(editor.document.uri.toString());
    if (context === undefined) {
      void vscode.window.showWarningMessage(
        'Open SQL file from SAP Tools SQL tab before running a query.'
      );
      return;
    }

    const selectedSql = editor.selection.isEmpty
      ? ''
      : editor.document.getText(editor.selection);
    const sqlInput = selectedSql.trim().length > 0
      ? selectedSql
      : editor.document.getText();

    let normalizedSql = '';
    try {
      normalizedSql = normalizeSingleHanaStatement(sqlInput);
    } catch (error) {
      const message = this.toSafeErrorMessage(error, context);
      void vscode.window.showErrorMessage(message);
      this.openResultPanel({
        appName: context.appName,
        sql: sqlInput,
        executedAt: new Date().toISOString(),
        errorMessage: message,
      });
      return;
    }

    if (normalizedSql.length === 0) {
      void vscode.window.showWarningMessage('Query is empty.');
      return;
    }

    const statementKind = classifyHanaSqlStatement(normalizedSql);
    if (statementKind === 'mutating') {
      const action = await vscode.window.showWarningMessage(
        `Run mutating SQL statement for app "${context.appName}"?`,
        {
          modal: true,
          detail: 'This statement can update S/4HANA data.',
        },
        'Run SQL'
      );
      if (action !== 'Run SQL') {
        return;
      }
    }

    try {
      const result = await this.executeSql(context, normalizedSql, statementKind);
      this.openResultPanel({
        appName: context.appName,
        sql: normalizedSql,
        executedAt: new Date().toISOString(),
        result,
      });
    } catch (error) {
      const message = this.toSafeErrorMessage(error, context);
      void vscode.window.showErrorMessage(message);
      this.openResultPanel({
        appName: context.appName,
        sql: normalizedSql,
        executedAt: new Date().toISOString(),
        errorMessage: message,
      });
    }
  }

  private async executeSql(
    context: HanaSqlDocumentContext,
    sql: string,
    statementKind: HanaSqlStatementKind
  ): Promise<HanaQueryResult> {
    if (this.isTestMode) {
      return buildTestModeQueryResult(context.appName, statementKind);
    }

    await this.ensureConnection(context);
    if (context.connection === null) {
      throw new Error('Unable to resolve HANA connection.');
    }

    return executeHanaQuery(context.connection, sql);
  }

  private async prefetchTableNames(uriKey: string): Promise<void> {
    const context = this.documentContexts.get(uriKey);
    if (context?.tableNamesPromise != null) {
      return;
    }
    if (context === undefined) {
      return;
    }

    context.tableNamesPromise = this.loadTableNames(context)
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        this.outputChannel.appendLine(`[sql] table suggestion preload failed: ${message}`);
      })
      .finally(() => {
        context.tableNamesPromise = null;
      });

    await context.tableNamesPromise;
  }

  private async loadTableNames(context: HanaSqlDocumentContext): Promise<void> {
    if (this.isTestMode) {
      context.tableNames = createTestModeTableNames(context.appName);
      return;
    }

    await this.ensureConnection(context);
    if (context.connection === null) {
      return;
    }

    for (const query of TABLE_DISCOVERY_QUERIES) {
      try {
        const result = await executeHanaQuery(context.connection, query, {
          timeoutMs: 15_000,
        });
        if (result.kind !== 'resultset') {
          continue;
        }
        context.tableNames = extractTableNames(result);
        if (context.tableNames.length > 0) {
          return;
        }
      } catch {
        // Ignore individual discovery query failures and continue with fallback query.
      }
    }
  }

  private async ensureConnection(context: HanaSqlDocumentContext): Promise<void> {
    if (context.connection !== null) {
      return;
    }

    if (context.session === null) {
      throw new Error('No active CF scope session. Confirm scope and choose app again.');
    }

    const resolved = await resolveHanaConnectionFromApp({
      appName: context.appName,
      session: context.session,
    });
    context.connection = resolved.connection;
    context.schema = resolved.schema;
  }

  private openResultPanel(options: RenderSqlResultOptions): void {
    this.resultSequence += 1;
    const panel = vscode.window.createWebviewPanel(
      SQL_RESULT_VIEW_TYPE,
      `SAP Tools SQL Result ${String(this.resultSequence)} · ${options.appName}`,
      vscode.ViewColumn.Beside,
      {
        enableScripts: false,
      }
    );
    panel.webview.html = buildHanaSqlResultHtml(options);
  }

  private toSafeErrorMessage(error: unknown, context: HanaSqlDocumentContext): string {
    const secrets: string[] = [];
    if (context.connection !== null) {
      secrets.push(context.connection.password);
    }
    if (context.session !== null) {
      secrets.push(context.session.password);
    }

    if (error instanceof HanaQueryError) {
      return sanitizeHanaErrorMessage(error.message, secrets);
    }
    if (error instanceof Error) {
      return sanitizeHanaErrorMessage(error.message, secrets);
    }
    return sanitizeHanaErrorMessage(String(error), secrets);
  }

  private updateSqlEditorContextKey(
    editor: vscode.TextEditor | undefined
  ): void {
    const enabled =
      editor !== undefined &&
      this.documentContexts.has(editor.document.uri.toString());
    void vscode.commands.executeCommand('setContext', HANA_SQL_EDITOR_CONTEXT_KEY, enabled);
  }
}
