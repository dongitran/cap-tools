import * as vscode from 'vscode';
import {
  HanaQueryError,
  classifyHanaSqlStatement,
  executeHanaQuery,
  normalizeSingleHanaStatement,
  sanitizeHanaErrorMessage,
  type HanaConnection,
  type HanaQueryResult,
  type HanaQueryResultSet,
  type HanaSqlStatementKind,
} from './hanaSqlService';
import {
  resolveHanaConnectionFromApp,
  type HanaSqlScopeSession,
} from './hanaSqlConnectionResolver';
export const RUN_HANA_SQL_COMMAND_ID = 'sapTools.runHanaSql';
const HANA_SQL_EDITOR_CONTEXT_KEY = 'sapTools.hanaSqlEditor';
const SQL_RESULT_VIEW_TYPE = 'sapTools.hanaSqlResult';
const SQL_RESULT_ROWS_LIMIT = 250;
const TABLE_SUGGESTION_LIMIT = 500;
const TABLE_DISCOVERY_QUERIES = [
  'SELECT TABLE_NAME FROM TABLES WHERE SCHEMA_NAME = CURRENT_SCHEMA ORDER BY TABLE_NAME',
  'SELECT TABLE_NAME FROM M_TABLES WHERE SCHEMA_NAME = CURRENT_SCHEMA ORDER BY TABLE_NAME',
] as const;
const SQL_KEYWORDS = [
  'SELECT',
  'FROM',
  'WHERE',
  'GROUP BY',
  'ORDER BY',
  'LIMIT',
  'JOIN',
  'LEFT JOIN',
  'INNER JOIN',
  'INSERT INTO',
  'UPDATE',
  'DELETE FROM',
  'CREATE TABLE',
  'ALTER TABLE',
  'DROP TABLE',
  'WITH',
  'EXPLAIN',
  'COMMIT',
  'ROLLBACK',
] as const;
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
interface RenderSqlResultOptions {
  readonly appName: string;
  readonly sql: string;
  readonly executedAt: string;
  readonly result?: HanaQueryResult;
  readonly errorMessage?: string;
}
export function buildInitialHanaSqlTemplate(appName: string): string {
  const normalizedAppName = appName.trim().length > 0 ? appName.trim() : 'selected-app';
  return [
    `-- SAP Tools SQL for ${normalizedAppName}`,
    'SELECT CURRENT_USER, CURRENT_SCHEMA FROM DUMMY;',
    '',
  ].join('\n');
}
export function buildHanaSqlResultHtml(options: RenderSqlResultOptions): string {
  if (options.result?.kind === 'resultset') {
    return buildResultSetHtml(options, options.result);
  }

  const hasStatusResult = options.result?.kind === 'status';
  const stateTitle = hasStatusResult ? 'Statement Executed' : 'Execution Error';
  const stateMessage = hasStatusResult
    ? escapeHtml(options.result.message)
    : escapeHtml(options.errorMessage ?? 'Query execution failed.');
  const stateToneClass = hasStatusResult ? 'state-success' : 'state-error';
  const escapedAppName = escapeHtml(options.appName);
  const escapedExecutedAt = escapeHtml(options.executedAt);
  const escapedSql = escapeHtml(options.sql);
  const elapsedLine = hasStatusResult
    ? `<p class="state-meta-line">Elapsed: ${String(options.result.elapsedMs)} ms</p>`
    : '';
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>SAP Tools SQL Result</title>
    <style>
      :root {
        color-scheme: dark;
        font-family: Inter, "Segoe UI", sans-serif;
      }
      body {
        margin: 0;
        min-height: 100vh;
        background: #0f141d;
        color: #e6edf3;
      }
      .state-layout {
        height: 100vh;
        display: grid;
        grid-template-rows: auto auto auto;
        gap: 10px;
        padding: 14px;
      }
      .state-card {
        border: 1px solid #273246;
        border-radius: 8px;
        background: #141c28;
        padding: 10px 12px;
      }
      .state-card h1 {
        margin: 0;
        font-size: 14px;
      }
      .state-meta-line {
        margin: 4px 0 0;
        font-size: 12px;
        color: #aab7c7;
      }
      .state-message {
        margin: 0;
        white-space: pre-wrap;
        word-break: break-word;
        font-size: 12px;
        line-height: 1.45;
      }
      .state-sql {
        margin: 0;
        white-space: pre-wrap;
        word-break: break-word;
        font-size: 12px;
        line-height: 1.45;
      }
      .state-success h1 {
        color: #83e2a5;
      }
      .state-error h1 {
        color: #ff9d9d;
      }
    </style>
  </head>
  <body>
    <main class="state-layout">
      <section class="state-card">
        <p class="state-meta-line">App: ${escapedAppName}</p>
        <p class="state-meta-line">Executed: ${escapedExecutedAt}</p>
      </section>
      <section class="state-card ${stateToneClass}">
        <h1>${stateTitle}</h1>
        <p class="state-message">${stateMessage}</p>
        ${elapsedLine}
      </section>
      <section class="state-card">
        <pre class="state-sql">${escapedSql}</pre>
      </section>
    </main>
  </body>
</html>`;
}
function buildResultSetHtml(
  options: RenderSqlResultOptions,
  result: HanaQueryResultSet
): string {
  const escapedAppName = escapeHtml(options.appName);
  const escapedExecutedAt = escapeHtml(options.executedAt);
  const rows = result.rows.slice(0, SQL_RESULT_ROWS_LIMIT);
  const truncatedNote =
    result.rows.length > SQL_RESULT_ROWS_LIMIT
      ? `Showing first ${String(SQL_RESULT_ROWS_LIMIT)} rows of ${String(result.rows.length)}.`
      : '';
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>SAP Tools SQL Result</title>
    <style>
      :root {
        color-scheme: dark;
        font-family: Inter, "Segoe UI", sans-serif;
      }
      body {
        margin: 0;
        min-height: 100vh;
        background: #0f141d;
        color: #e6edf3;
      }
      .result-layout {
        height: 100vh;
        display: grid;
        grid-template-rows: auto minmax(0, 1fr);
      }
      .result-toolbar {
        padding: 10px 12px;
        border-bottom: 1px solid #273246;
        background: #141c28;
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        align-items: center;
      }
      .result-toolbar h1 {
        margin: 0;
        font-size: 13px;
        color: #d7e6f9;
        font-weight: 600;
      }
      .result-chip {
        border: 1px solid #2b3a53;
        border-radius: 999px;
        padding: 3px 9px;
        font-size: 12px;
        color: #aab7c7;
        background: #101724;
      }
      .result-chip.note {
        border-color: #3e556f;
      }
      .result-table-wrap {
        min-height: 0;
        overflow: auto;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        table-layout: fixed;
        font-size: 12px;
      }
      th,
      td {
        border-bottom: 1px solid #273246;
        padding: 6px 8px;
        text-align: left;
        vertical-align: top;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      th {
        position: sticky;
        top: 0;
        z-index: 1;
        color: #afbdd0;
        background: #1b2638;
        font-weight: 600;
      }
      tbody tr:nth-child(even) {
        background: #121a28;
      }
      .row-number {
        width: 52px;
        color: #98a9bf;
      }
    </style>
  </head>
  <body>
    <main class="result-layout">
      <header class="result-toolbar">
        <h1>SAP Tools SQL Result</h1>
        <span class="result-chip">App: ${escapedAppName}</span>
        <span class="result-chip">Rows: ${String(result.rowCount)}</span>
        <span class="result-chip">Elapsed: ${String(result.elapsedMs)} ms</span>
        <span class="result-chip">Executed: ${escapedExecutedAt}</span>
        ${truncatedNote.length > 0 ? `<span class="result-chip note">${truncatedNote}</span>` : ''}
      </header>
      <div class="result-table-wrap">
        ${renderResultTable(result.columns, rows)}
      </div>
    </main>
  </body>
</html>`;
}
function renderResultTable(columns: readonly string[], rows: readonly string[][]): string {
  const headerCells = [
    '<th class="row-number">#</th>',
    ...columns.map((column) => `<th>${escapeHtml(column)}</th>`),
  ].join('');
  const bodyRows = rows
    .map((row, rowIndex) => {
      const rowCells = columns
        .map((_, index) => `<td>${escapeHtml(row[index] ?? '')}</td>`)
        .join('');
      return `<tr><td class="row-number">${String(rowIndex + 1)}</td>${rowCells}</tr>`;
    })
    .join('');

  return `
    <table>
      <thead>
        <tr>${headerCells}</tr>
      </thead>
      <tbody>
        ${bodyRows}
      </tbody>
    </table>
  `;
}
function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function sanitizeUntitledFileName(appName: string): string {
  const normalized = appName.trim().toLowerCase().replaceAll(/[^a-z0-9._-]+/g, '-');
  if (normalized.length > 0) {
    return normalized;
  }
  return 'hana-query';
}
function buildSqlKeywordCompletionItems(prefix: string): vscode.CompletionItem[] {
  const normalizedPrefix = prefix.trim().toUpperCase();
  const candidates =
    normalizedPrefix.length === 0
      ? SQL_KEYWORDS
      : SQL_KEYWORDS.filter((keyword) => keyword.startsWith(normalizedPrefix));
  return candidates.map((keyword) => {
    const item = new vscode.CompletionItem(keyword, vscode.CompletionItemKind.Keyword);
    item.detail = 'SAP Tools SQL keyword';
    return item;
  });
}
function buildTableCompletionItems(
  tableNames: readonly string[],
  prefix: string
): vscode.CompletionItem[] {
  const normalizedPrefix = prefix.trim().toUpperCase();
  const candidates =
    normalizedPrefix.length === 0
      ? tableNames
      : tableNames.filter((tableName) => tableName.toUpperCase().startsWith(normalizedPrefix));
  return candidates.slice(0, TABLE_SUGGESTION_LIMIT).map((tableName) => {
    const item = new vscode.CompletionItem(tableName, vscode.CompletionItemKind.Struct);
    item.detail = 'S/4HANA table';
    return item;
  });
}
function buildTestModeQueryResult(
  appName: string,
  statementKind: HanaSqlStatementKind
): HanaQueryResult {
  if (statementKind === 'readonly') {
    return {
      kind: 'resultset',
      columns: ['APP_NAME', 'CURRENT_SCHEMA'],
      rows: [[appName, 'TEST_SCHEMA']],
      rowCount: 1,
      elapsedMs: 5,
    };
  }

  return {
    kind: 'status',
    message: 'Statement executed in SAP Tools test mode.',
    elapsedMs: 3,
  };
}
function createTestModeTableNames(appName: string): readonly string[] {
  const appPrefix = appName.trim().toUpperCase().replaceAll(/[^A-Z0-9]+/g, '_');
  const normalizedPrefix = appPrefix.length > 0 ? appPrefix : 'APP';
  return [
    `${normalizedPrefix}_ORDERS`,
    `${normalizedPrefix}_ITEMS`,
    `${normalizedPrefix}_AUDIT`,
    'DUMMY',
    'M_TABLES',
  ];
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
        const result = await executeHanaQuery(context.connection, query, { timeoutMs: 15_000 });
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

function extractTableNames(result: HanaQueryResultSet): readonly string[] {
  const names = new Set<string>();
  for (const row of result.rows) {
    const value = row[0]?.trim() ?? '';
    if (value.length > 0) {
      names.add(value);
    }
  }

  return [...names];
}
