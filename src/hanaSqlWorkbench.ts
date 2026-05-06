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
import { HANA_SQL_DEFAULT_SELECT_LIMIT, applyDefaultHanaSelectLimit } from './hanaSqlLimitGuard';
import { resolveHanaConnectionFromApp, type HanaSqlScopeSession } from './hanaSqlConnectionResolver';
import { buildHanaSqlDocumentFileUri } from './hanaSqlDocumentUri';
import {
  buildInitialHanaSqlTemplate,
  buildQuickTableSelectSql,
  buildTableDiscoveryQueries,
  buildTestModeQueryResult,
  buildRawHanaTableDisplayEntries,
  createTestModeTableNames,
  extractTableNames,
  filterTableEntryCandidates,
  filterKeywordCandidates,
  formatHanaTableDisplayEntries,
  resolveHanaDisplayTableReferences,
  resolveHanaSqlTargetTableName,
  sanitizeUntitledFileName,
  type HanaTableDisplayEntry,
} from './hanaSqlWorkbenchSupport';
import { HanaSqlResultPanelManager, type HanaSqlResultPanelSession } from './hanaSqlResultPanel';
export { buildHanaSqlResultHtml, buildInitialHanaSqlTemplate } from './hanaSqlWorkbenchSupport';
export const RUN_HANA_SQL_COMMAND_ID = 'sapTools.runHanaSql';
const HANA_SQL_EDITOR_CONTEXT_KEY = 'sapTools.hanaSqlEditor';
interface HanaSqlAppContext {
  readonly appId: string;
  readonly appName: string;
  session: HanaSqlScopeSession | null;
  connection: HanaConnection | null;
  schema: string;
  sqlDocumentUri: string;
  sqlDocumentFileUri: string;
  tableNames: readonly string[];
  tableEntries: readonly HanaTableDisplayEntry[];
  tableNamesPromise: Promise<void> | null;
}
export interface OpenHanaSqlFileRequest {
  readonly appId: string;
  readonly appName: string;
  readonly session: HanaSqlScopeSession | null;
}
export interface RunQuickTableSelectRequest {
  readonly appId: string;
  readonly appName: string;
  readonly session: HanaSqlScopeSession | null;
  readonly tableName: string;
}
function buildSqlKeywordCompletionItems(prefix: string): vscode.CompletionItem[] {
  return filterKeywordCandidates(prefix).map((keyword) => {
    const item = new vscode.CompletionItem(keyword, vscode.CompletionItemKind.Keyword);
    item.detail = 'SAP Tools SQL keyword';
    return item;
  });
}

function buildTableCompletionItems(
  tableEntries: readonly HanaTableDisplayEntry[],
  prefix: string
): vscode.CompletionItem[] {
  return filterTableEntryCandidates(tableEntries, prefix).map((tableEntry) => {
    const item = new vscode.CompletionItem(
      tableEntry.displayName,
      vscode.CompletionItemKind.Struct
    );
    item.detail = 'S/4HANA table';
    item.insertText = tableEntry.displayName;
    return item;
  });
}

function resolveCompletionTableEntries(
  context: HanaSqlAppContext
): readonly HanaTableDisplayEntry[] {
  if (context.tableEntries.length > 0) {
    return context.tableEntries;
  }
  return buildRawHanaTableDisplayEntries(context.tableNames);
}

export class HanaSqlWorkbench
  implements vscode.Disposable, vscode.CompletionItemProvider
{
  private readonly isTestMode: boolean;
  private readonly appContextsByAppId = new Map<string, HanaSqlAppContext>();
  private readonly appIdByDocumentUri = new Map<string, string>();
  private readonly disposables: vscode.Disposable[] = [];
  private readonly resultPanelManager: HanaSqlResultPanelManager;

  constructor(private readonly outputChannel: vscode.OutputChannel) {
    this.isTestMode = process.env['SAP_TOOLS_TEST_MODE'] === '1';
    this.resultPanelManager = new HanaSqlResultPanelManager(outputChannel);

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
        this.appIdByDocumentUri.delete(document.uri.toString());
        this.updateSqlEditorContextKey(vscode.window.activeTextEditor);
      })
    );

    this.updateSqlEditorContextKey(vscode.window.activeTextEditor);
  }

  dispose(): void {
    this.resultPanelManager.dispose();
    while (this.disposables.length > 0) {
      this.disposables.pop()?.dispose();
    }
  }

  async openSqlDocumentForApp(options: OpenHanaSqlFileRequest): Promise<void> {
    this.logSql(`open editor for app ${sanitizeSqlLogValue(options.appName)}`);
    const fileName = sanitizeUntitledFileName(options.appName);
    const fileUri = buildHanaSqlDocumentFileUri(fileName);
    const uri = fileUri.with({ scheme: 'untitled' });
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

    const context = this.ensureAppContext(options);
    context.sqlDocumentUri = document.uri.toString();
    context.sqlDocumentFileUri = fileUri.toString();
    this.appIdByDocumentUri.set(document.uri.toString(), context.appId);
    this.appIdByDocumentUri.set(fileUri.toString(), context.appId);
    this.updateSqlEditorContextKey(vscode.window.activeTextEditor);
    this.logSql(`editor ready for app ${sanitizeSqlLogValue(context.appName)}`);
    void this.prefetchTableNames(context.appId);
  }

  async loadTableNamesForApp(options: OpenHanaSqlFileRequest): Promise<readonly string[]> {
    const context = this.ensureAppContext(options);
    await this.prefetchTableNames(context.appId);
    return context.tableNames;
  }

  async loadTableEntriesForApp(
    options: OpenHanaSqlFileRequest
  ): Promise<readonly HanaTableDisplayEntry[]> {
    const context = this.ensureAppContext(options);
    await this.prefetchTableNames(context.appId);
    if (context.tableNames.length > 0 && context.tableEntries.length === 0) {
      context.tableEntries = await this.formatTableEntries(context.tableNames);
    }
    return context.tableEntries;
  }

  async runQuickTableSelectForApp(
    options: RunQuickTableSelectRequest
  ): Promise<void> {
    const context = this.ensureAppContext({
      appId: options.appId,
      appName: options.appName,
      session: options.session,
    });

    const statementKind: HanaSqlStatementKind = 'readonly';
    let sql = '';
    const resultPanel = this.openLoadingResultPanel(
      context.appName,
      options.tableName,
      options.tableName,
      this.resolveSqlSourceViewColumn(context)
    );

    try {
      if (!this.isTestMode) {
        await this.ensureConnection(context);
      }
      sql = buildQuickTableSelectSql(context.schema, options.tableName);
      this.updateLoadingResultPanel(resultPanel, context.appName, options.tableName, sql);
      this.logSql(
        `run quick SELECT for app ${sanitizeSqlLogValue(context.appName)} table ${sanitizeSqlLogValue(options.tableName)}: ${sanitizeSqlLogValue(sql)}`
      );
      await delayE2eQuickSelectIfConfigured();
      const result = await this.executeSqlForContext(context, sql, statementKind);
      this.logSql(
        `quick SELECT completed for app ${sanitizeSqlLogValue(context.appName)} table ${sanitizeSqlLogValue(options.tableName)} result ${result.kind}`
      );
      resultPanel.update({
        appName: context.appName,
        tableName: options.tableName,
        sql,
        executedAt: new Date().toISOString(),
        result,
      });
    } catch (error) {
      const message = this.toSafeErrorMessage(error, context);
      this.logSql(
        `quick SELECT failed for app ${sanitizeSqlLogValue(context.appName)}: ${sanitizeSqlLogValue(message)}`
      );
      void vscode.window.showErrorMessage(message);
      resultPanel.update({
        appName: context.appName,
        tableName: options.tableName,
        sql: sql.length > 0 ? sql : options.tableName,
        executedAt: new Date().toISOString(),
        errorMessage: message,
      });
    }
  }

  provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.ProviderResult<vscode.CompletionItem[]> {
    const appId = this.appIdByDocumentUri.get(document.uri.toString());
    if (appId === undefined) {
      return undefined;
    }
    const context = this.appContextsByAppId.get(appId);
    if (context === undefined) {
      return undefined;
    }

    const wordRange = document.getWordRangeAtPosition(position, /[A-Za-z_][A-Za-z0-9_]*/);
    const prefix = wordRange === undefined ? '' : document.getText(wordRange);

    void this.prefetchTableNames(context.appId);

    return [
      ...buildTableCompletionItems(resolveCompletionTableEntries(context), prefix),
      ...buildSqlKeywordCompletionItems(prefix),
    ];
  }

  private ensureAppContext(options: OpenHanaSqlFileRequest): HanaSqlAppContext {
    const existing = this.appContextsByAppId.get(options.appId);
    if (existing !== undefined) {
      if (options.session !== null) {
        existing.session = options.session;
      }
      return existing;
    }

    const created: HanaSqlAppContext = {
      appId: options.appId,
      appName: options.appName,
      session: options.session,
      connection: null,
      schema: '',
      sqlDocumentUri: '',
      sqlDocumentFileUri: '',
      tableNames: [],
      tableEntries: [],
      tableNamesPromise: null,
    };
    this.appContextsByAppId.set(options.appId, created);
    return created;
  }

  private async handleRunHanaSqlCommand(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (editor === undefined) {
      void vscode.window.showWarningMessage('Open a SQL editor before running a query.');
      return;
    }

    const appId = this.appIdByDocumentUri.get(editor.document.uri.toString());
    const context = appId === undefined ? undefined : this.appContextsByAppId.get(appId);
    if (context === undefined) {
      void vscode.window.showWarningMessage(
        'Open SQL file from SAP Tools SQL tab before running a query.'
      );
      return;
    }

    const selectedSql = editor.selection.isEmpty ? '' : editor.document.getText(editor.selection);
    const sqlInput = selectedSql.trim().length > 0 ? selectedSql : editor.document.getText();

    let normalizedSql = '';
    try {
      normalizedSql = normalizeSingleHanaStatement(sqlInput);
    } catch (error) {
      const message = this.toSafeErrorMessage(error, context);
      void vscode.window.showErrorMessage(message);
      this.resultPanelManager.openResultPanel(
        {
          appName: context.appName,
          tableName: resolveSqlResultTableName(sqlInput),
          sql: sqlInput,
          executedAt: new Date().toISOString(),
          errorMessage: message,
        },
        toPositiveViewColumnNumber(editor.viewColumn)
      );
      return;
    }

    if (normalizedSql.length === 0) {
      void vscode.window.showWarningMessage('Query is empty.');
      return;
    }

    const statementKind = classifyHanaSqlStatement(normalizedSql);
    const guardedSql = statementKind === 'readonly'
      ? applyDefaultHanaSelectLimit(normalizedSql)
      : { sql: normalizedSql, applied: false, limit: HANA_SQL_DEFAULT_SELECT_LIMIT };
    let executionSql = guardedSql.sql;

    if (guardedSql.applied) {
      this.logSql(
        `applied default LIMIT ${String(guardedSql.limit)} for app ${sanitizeSqlLogValue(context.appName)}`
      );
    }

    let tableName = resolveSqlResultTableName(executionSql);
    const resultPanel = this.openLoadingResultPanel(
      context.appName,
      tableName,
      executionSql,
      toPositiveViewColumnNumber(editor.viewColumn)
    );

    try {
      await this.prefetchTableNames(context.appId);
      const resolution = resolveHanaDisplayTableReferences(
        executionSql,
        resolveCompletionTableEntries(context),
        context.schema
      );
      executionSql = resolution.sql;
      tableName = resolveSqlResultTableName(executionSql);
      if (resolution.replacements.length > 0) {
        const preview = resolution.replacements.slice(0, 4).map((replacement) => {
          return `${sanitizeSqlLogValue(replacement.displayName)} -> ${sanitizeSqlLogValue(replacement.identifier)}`;
        });
        const suffix = resolution.replacements.length > preview.length
          ? `, +${String(resolution.replacements.length - preview.length)} more`
          : '';
        this.logSql(
          `resolved ${String(resolution.replacements.length)} table display reference(s) for app ${sanitizeSqlLogValue(context.appName)}: ${preview.join(', ')}${suffix}`
        );
      }
      this.updateLoadingResultPanel(resultPanel, context.appName, tableName, executionSql);
      this.logSql(
        `run ${statementKind} statement for app ${sanitizeSqlLogValue(context.appName)} table ${sanitizeSqlLogValue(tableName)}: ${sanitizeSqlCommandLogValue(executionSql)}`
      );
      const result = await this.executeSqlForContext(context, executionSql, statementKind);
      this.logSql(
        `statement completed for app ${sanitizeSqlLogValue(context.appName)} table ${sanitizeSqlLogValue(tableName)} result ${result.kind}`
      );
      resultPanel.update({
        appName: context.appName,
        tableName,
        sql: executionSql,
        executedAt: new Date().toISOString(),
        result,
      });
    } catch (error) {
      const message = this.toSafeErrorMessage(error, context);
      this.logSql(
        `statement failed for app ${sanitizeSqlLogValue(context.appName)}: ${sanitizeSqlLogValue(message)}`
      );
      void vscode.window.showErrorMessage(message);
      resultPanel.update({
        appName: context.appName,
        tableName,
        sql: executionSql,
        executedAt: new Date().toISOString(),
        errorMessage: message,
      });
    }
  }

  private async executeSqlForContext(
    context: HanaSqlAppContext,
    sql: string,
    statementKind: HanaSqlStatementKind
  ): Promise<HanaQueryResult> {
    if (this.isTestMode) {
      return buildTestModeQueryResult(context.appName, statementKind, sql);
    }

    await this.ensureConnection(context);
    if (context.connection === null) {
      throw new Error('Unable to resolve HANA connection.');
    }

    return executeHanaQuery(context.connection, sql, { statementKind });
  }

  private async prefetchTableNames(appId: string): Promise<void> {
    const context = this.appContextsByAppId.get(appId);
    if (context === undefined) {
      return;
    }
    if (context.tableNamesPromise != null) {
      await context.tableNamesPromise;
      return;
    }

    context.tableNamesPromise = this.loadTableNames(context)
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        this.logSql(`table suggestion preload failed: ${sanitizeSqlLogValue(message)}`);
      })
      .finally(() => {
        context.tableNamesPromise = null;
      });

    await context.tableNamesPromise;
  }

  private async loadTableNames(context: HanaSqlAppContext): Promise<void> {
    if (this.isTestMode) {
      await delayTestModeTableLoadIfConfigured();
      context.schema = 'TEST_SCHEMA';
      context.tableNames = createTestModeTableNames(context.appName);
      context.tableEntries = await this.formatTableEntries(context.tableNames);
      this.logSql(
        `loaded ${String(context.tableNames.length)} test tables for app ${sanitizeSqlLogValue(context.appName)}`
      );
      return;
    }

    await this.ensureConnection(context);
    if (context.connection === null) {
      return;
    }

    const queries = buildTableDiscoveryQueries(context.schema);
    let hadSuccessfulDiscoveryQuery = false;
    let lastErrorMessage = '';
    for (const [index, query] of queries.entries()) {
      this.logSql(
        `run table discovery query ${String(index + 1)} for app ${sanitizeSqlLogValue(context.appName)}: ${sanitizeSqlLogValue(query)}`
      );
      try {
        const result = await executeHanaQuery(context.connection, query, {
          timeoutMs: 15_000,
        });
        if (result.kind !== 'resultset') {
          continue;
        }
        hadSuccessfulDiscoveryQuery = true;
        context.tableNames = extractTableNames(result);
        context.tableEntries = await this.formatTableEntries(context.tableNames);
        if (context.tableNames.length > 0) {
          this.logSql(
            `loaded ${String(context.tableNames.length)} tables for app ${sanitizeSqlLogValue(context.appName)}`
          );
          return;
        }
      } catch (error) {
        const message = this.toSafeErrorMessage(error, context);
        lastErrorMessage = message;
        this.logSql(
          `table discovery query ${String(index + 1)} failed for app ${sanitizeSqlLogValue(context.appName)}: ${sanitizeSqlLogValue(message)}`
        );
      }
    }
    if (!hadSuccessfulDiscoveryQuery && lastErrorMessage.length > 0) {
      throw new Error(`Failed to discover tables: ${lastErrorMessage}`);
    }
    this.logSql(`no tables found for app ${sanitizeSqlLogValue(context.appName)}`);
    context.tableEntries = [];
  }

  private async formatTableEntries(
    tableNames: readonly string[]
  ): Promise<readonly HanaTableDisplayEntry[]> {
    try {
      return await formatHanaTableDisplayEntries(tableNames);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logSql(`table display name formatter failed: ${sanitizeSqlLogValue(message)}`);
      return buildRawHanaTableDisplayEntries(tableNames);
    }
  }

  private async ensureConnection(context: HanaSqlAppContext): Promise<void> {
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
    this.logSql(
      `resolved HANA connection for app ${sanitizeSqlLogValue(context.appName)} schema ${sanitizeSqlLogValue(context.schema)}`
    );
  }

  private resolveSqlSourceViewColumn(
    context: HanaSqlAppContext
  ): number | undefined {
    if (context.sqlDocumentUri.length > 0) {
      const visibleSqlEditor = vscode.window.visibleTextEditors.find((editor) => {
        const uri = editor.document.uri.toString();
        return uri === context.sqlDocumentUri || uri === context.sqlDocumentFileUri;
      });
      const visibleColumn = toPositiveViewColumnNumber(visibleSqlEditor?.viewColumn);
      if (visibleColumn !== undefined) {
        return visibleColumn;
      }
    }
    return toPositiveViewColumnNumber(vscode.window.activeTextEditor?.viewColumn);
  }

  private openLoadingResultPanel(
    appName: string,
    tableName: string,
    sql: string,
    sourceViewColumn: number | undefined
  ): HanaSqlResultPanelSession {
    this.logSql(`show loading result panel for app ${sanitizeSqlLogValue(appName)}`);
    return this.resultPanelManager.openResultPanel(
      { appName, tableName, sql, executedAt: new Date().toISOString(), isLoading: true },
      sourceViewColumn
    );
  }

  private updateLoadingResultPanel(
    resultPanel: HanaSqlResultPanelSession,
    appName: string,
    tableName: string,
    sql: string
  ): void {
    resultPanel.update({
      appName,
      tableName,
      sql,
      executedAt: new Date().toISOString(),
      isLoading: true,
    });
  }

  private toSafeErrorMessage(error: unknown, context: HanaSqlAppContext): string {
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
      this.appIdByDocumentUri.has(editor.document.uri.toString());
    void vscode.commands.executeCommand('setContext', HANA_SQL_EDITOR_CONTEXT_KEY, enabled);
  }

  private logSql(message: string): void {
    this.outputChannel.appendLine(`[sql] ${message}`);
  }
}

function sanitizeSqlLogValue(value: string): string {
  return value.replaceAll(/[\r\n\t]+/g, ' ').slice(0, 500);
}

function sanitizeSqlCommandLogValue(value: string): string {
  return sanitizeSqlLogValue(redactSqlStringLiteralsForLog(value));
}

function resolveSqlResultTableName(sql: string): string {
  return resolveHanaSqlTargetTableName(sql) ?? 'SQL statement';
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

function redactSqlStringLiteralsForLog(value: string): string {
  let redacted = '';
  let index = 0;
  while (index < value.length) {
    if (value[index] !== "'") {
      redacted += value[index] ?? '';
      index += 1;
      continue;
    }
    redacted += "'[literal]'";
    index = skipSqlStringLiteralForLog(value, index);
  }
  return redacted;
}

function skipSqlStringLiteralForLog(value: string, start: number): number {
  for (let index = start + 1; index < value.length; index += 1) {
    if (value[index] !== "'") continue;
    if (value[index + 1] === "'") {
      index += 1;
      continue;
    }
    return index + 1;
  }
  return value.length;
}

async function delayTestModeTableLoadIfConfigured(): Promise<void> {
  await delayE2eMsFromEnv('SAP_TOOLS_E2E_TESTMODE_TABLES_DELAY_MS');
}

async function delayE2eQuickSelectIfConfigured(): Promise<void> {
  await delayE2eMsFromEnv('SAP_TOOLS_E2E_QUICK_SELECT_DELAY_MS');
}

async function delayE2eMsFromEnv(envName: string): Promise<void> {
  const delayMs = resolveE2eDelayMs(envName);
  if (delayMs === 0) {
    return;
  }
  await new Promise<void>((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

function resolveE2eDelayMs(envName: string): number {
  if (process.env['SAP_TOOLS_E2E'] !== '1') {
    return 0;
  }

  const rawDelay = process.env[envName] ?? '';
  const parsedDelay = Number.parseInt(rawDelay, 10);
  if (!Number.isFinite(parsedDelay) || parsedDelay <= 0) {
    return 0;
  }

  return Math.min(parsedDelay, 30_000);
}
