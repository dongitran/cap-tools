import { beforeEach, describe, expect, test, vi } from 'vitest';

import type { HanaSqlScopeSession } from './hanaSqlConnectionResolver';
import type { HanaSqlBackupStore } from './hanaSqlBackupStore';
import type {
  HanaConnection,
  HanaQueryResult,
  HanaSqlStatementKind,
} from './hanaSqlService';
import type {
  HanaTableDisplayEntry,
  RenderSqlResultOptions,
} from './hanaSqlWorkbenchSupport';

const {
  executeCommandMock,
  executeHanaQueryBatchMock,
  onDidChangeActiveTextEditorMock,
  onDidCloseTextDocumentMock,
  openTextDocumentMock,
  registerCommandMock,
  registerCompletionItemProviderMock,
  resolveHanaConnectionFromAppMock,
  setTextDocumentLanguageMock,
  showHanaSqlShortcutNotificationMock,
  showTextDocumentMock,
  showWarningMessageMock,
} = vi.hoisted(() => ({
  executeCommandMock: vi.fn(),
  executeHanaQueryBatchMock: vi.fn(),
  showWarningMessageMock: vi.fn(),
  onDidChangeActiveTextEditorMock: vi.fn(() => ({ dispose: vi.fn() })),
  onDidCloseTextDocumentMock: vi.fn(() => ({ dispose: vi.fn() })),
  openTextDocumentMock: vi.fn(),
  registerCommandMock: vi.fn(() => ({ dispose: vi.fn() })),
  registerCompletionItemProviderMock: vi.fn(() => ({ dispose: vi.fn() })),
  resolveHanaConnectionFromAppMock: vi.fn(async (options) => ({
    connection: {
      host: `resolved-${options.session.spaceName}-host`,
      port: 30015,
      user: 'resolved-user',
      password: 'resolved-password',
    },
    schema: `resolved-${options.session.spaceName}-schema`,
  })),
  setTextDocumentLanguageMock: vi.fn(),
  showHanaSqlShortcutNotificationMock: vi.fn(),
  showTextDocumentMock: vi.fn(),
}));

vi.mock('./hanaSqlConnectionResolver', () => ({
  resolveHanaConnectionFromApp: resolveHanaConnectionFromAppMock,
}));

vi.mock('./hanaSqlShortcutNotification', () => ({
  showHanaSqlShortcutNotification: showHanaSqlShortcutNotificationMock,
}));

vi.mock('./hanaSqlService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./hanaSqlService')>();
  return { ...actual, executeHanaQueryBatch: executeHanaQueryBatchMock };
});

function createMockUri(scheme: string, fsPath: string) {
  return {
    fsPath,
    scheme,
    toString: () => `${scheme}:${fsPath}`,
    with: (change: { scheme?: string }) => createMockUri(change.scheme ?? scheme, fsPath),
  };
}

vi.mock('vscode', () => ({
  commands: {
    executeCommand: executeCommandMock,
    registerCommand: registerCommandMock,
  },
  CompletionItem: class MockCompletionItem {
    detail = '';
    insertText = '';

    constructor(
      readonly label: string,
      readonly kind: number
    ) {}
  },
  CompletionItemKind: {
    Keyword: 1,
    Struct: 2,
  },
  languages: {
    registerCompletionItemProvider: registerCompletionItemProviderMock,
    setTextDocumentLanguage: setTextDocumentLanguageMock,
  },
  Uri: {
    file: (fsPath: string) => createMockUri('file', fsPath),
    joinPath: (base: { fsPath: string; scheme: string }, child: string) =>
      createMockUri(base.scheme, `${base.fsPath}/${child}`),
  },
  window: {
    activeTextEditor: undefined,
    onDidChangeActiveTextEditor: onDidChangeActiveTextEditorMock,
    showErrorMessage: vi.fn(),
    showTextDocument: showTextDocumentMock,
    showWarningMessage: showWarningMessageMock,
    visibleTextEditors: [],
  },
  workspace: {
    onDidCloseTextDocument: onDidCloseTextDocumentMock,
    openTextDocument: openTextDocumentMock,
    workspaceFolders: [],
  },
}));

import { HANA_SQL_BACKUP_ROW_LIMIT, HanaSqlWorkbench } from './hanaSqlWorkbench';

interface HanaSqlAppContextForTest {
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
  cacheVersion: number;
}

interface HanaSqlWorkbenchTestAccess {
  readonly appContextsByAppId: Map<string, HanaSqlAppContextForTest>;
  readonly appIdByDocumentUri: Map<string, string>;
  invalidateAllAppContexts(): void;
  registerActiveSessionProvider(provider: () => HanaSqlScopeSession | null): void;
  ensureConnection(context: HanaSqlAppContextForTest): Promise<void>;
  ensureAppContext(options: { appId: string; appName: string; session: HanaSqlScopeSession | null }): HanaSqlAppContextForTest;
  prepareStatement(
    context: HanaSqlAppContextForTest,
    rawSql: string,
    tableEntries: readonly HanaTableDisplayEntry[]
  ): {
    readonly executionSql: string;
    readonly statementKind: string;
    readonly tableName: string;
  };
}

interface HanaSqlWorkbenchQuickSelectTestAccess extends HanaSqlWorkbenchTestAccess {
  openLoadingResultPanel(
    appName: string,
    tableName: string,
    sql: string,
    sourceViewColumn: number | undefined
  ): { update(options: RenderSqlResultOptions): void };
  updateLoadingResultPanel(
    resultPanel: { update(options: RenderSqlResultOptions): void },
    appName: string,
    tableName: string,
    sql: string
  ): void;
  executeSqlForContext(
    context: HanaSqlAppContextForTest,
    sql: string,
    statementKind: string
  ): Promise<HanaQueryResult>;
}

interface PreparedStatementForTest {
  readonly executionSql: string;
  readonly statementKind: HanaSqlStatementKind;
  readonly tableName: string;
}

interface HanaSqlWorkbenchBackupTestAccess extends HanaSqlWorkbenchTestAccess {
  backupMutatingStatements(
    context: HanaSqlAppContextForTest,
    prepared: readonly PreparedStatementForTest[]
  ): Promise<void>;
  withTunnelFallback(
    context: HanaSqlAppContextForTest,
    run: (connection: HanaConnection) => Promise<unknown>
  ): Promise<unknown>;
}

function createWorkbench(): HanaSqlWorkbench {
  const outputChannel = {
    appendLine: vi.fn(),
  };
  return new HanaSqlWorkbench(outputChannel);
}

function createBackupTestHarness(): {
  readonly access: HanaSqlWorkbenchBackupTestAccess;
  readonly context: HanaSqlAppContextForTest;
  readonly saveBackup: ReturnType<typeof vi.fn>;
} {
  // saveBackup resolves to the created entry; `null` is its documented failure
  // signal, so the default here must be a successful write.
  const saveBackup = vi.fn(async (): Promise<{ id: string }> => ({ id: 'backup-1' }));
  const workbench = new HanaSqlWorkbench(
    { appendLine: vi.fn() } as unknown as ConstructorParameters<typeof HanaSqlWorkbench>[0],
    null,
    { saveBackup } as unknown as HanaSqlBackupStore
  );
  const access = workbench as unknown as HanaSqlWorkbenchBackupTestAccess;
  const context = access.ensureAppContext({
    appId: 'finance-uat-api',
    appName: 'finance-uat-api',
    session: createScopeSession(),
  });
  context.connection = {
    host: 'hana.example.test',
    port: 30015,
    user: 'test-user',
    password: 'test-password',
  };
  context.schema = 'TEST_SCHEMA';
  return { access, context, saveBackup };
}

function createScopeSession(overrides: Partial<HanaSqlScopeSession> = {}): HanaSqlScopeSession {
  return {
    apiEndpoint: 'https://api.cf.us10.hana.ondemand.com',
    email: 'developer@example.com',
    password: 'top-secret',
    orgName: 'finance-services-prod',
    spaceName: 'uat',
    cfHomeDir: '/tmp/sap-tools-cf-home',
    ...overrides,
  };
}

describe('HanaSqlWorkbench shortcut notification', () => {
  beforeEach(() => {
    const uri = createMockUri('untitled', '/tmp/saptools-finance-uat-api.sql');
    const document = {
      getText: vi.fn(() => 'SELECT CURRENT_USER FROM DUMMY;'),
      languageId: 'sql',
      uri,
    };
    openTextDocumentMock.mockReset();
    openTextDocumentMock.mockResolvedValue(document);
    setTextDocumentLanguageMock.mockReset();
    setTextDocumentLanguageMock.mockResolvedValue(document);
    showTextDocumentMock.mockReset();
    showTextDocumentMock.mockResolvedValue({ edit: vi.fn() });
    showHanaSqlShortcutNotificationMock.mockReset();
  });

  test('shows the shortcut notification after opening the app SQL file', async () => {
    const workbench = createWorkbench();

    await workbench.openSqlDocumentForApp({
      appId: 'finance-uat-api',
      appName: 'finance-uat-api',
      session: null,
    });

    expect(showHanaSqlShortcutNotificationMock).toHaveBeenCalledWith();
  });

  test('does not show the shortcut notification when the SQL file fails to open', async () => {
    const workbench = createWorkbench();
    openTextDocumentMock.mockRejectedValueOnce(new Error('Open failed'));

    await expect(
      workbench.openSqlDocumentForApp({
        appId: 'finance-uat-api',
        appName: 'finance-uat-api',
        session: null,
      })
    ).rejects.toThrow('Open failed');
    expect(showHanaSqlShortcutNotificationMock).not.toHaveBeenCalled();
  });
});

describe('HanaSqlWorkbench mutation backups', () => {
  function mutating(executionSql: string): PreparedStatementForTest {
    return { executionSql, statementKind: 'mutating', tableName: 'Orders' };
  }

  function resultset(rows: string[][], columns = ['ID', 'NOTE']): HanaQueryResult {
    return { kind: 'resultset', columns, rows, rowCount: rows.length, elapsedMs: 4 };
  }

  /** Let withTunnelFallback actually invoke the batch so the SQL sent is observable. */
  function passThroughTunnel(access: HanaSqlWorkbenchBackupTestAccess): void {
    access.withTunnelFallback = vi.fn(
      async (
        _context: HanaSqlAppContextForTest,
        run: (connection: HanaConnection) => Promise<unknown>
      ) => run({ host: 'h', port: 443, user: 'u', password: 'p' })
    );
  }

  function batchInputs(): { sql: string; statementKind: string }[] {
    const call = executeHanaQueryBatchMock.mock.calls[0] as
      | [unknown, { sql: string; statementKind: string }[], unknown]
      | undefined;
    return call?.[1] ?? [];
  }

  interface FakeOutcome {
    sql: string;
    statementKind: string;
    status: string;
    result?: HanaQueryResult;
    errorMessage?: string;
  }

  /**
   * Behave like the real executeHanaQueryBatch: fire onStatementComplete for each
   * outcome, and honour discardResultsAfterCallback by stripping `result` from
   * the returned summary. Without that the production code's "consume inside the
   * callback" contract would not be exercised at all.
   */
  function mockBatch(outcomes: FakeOutcome[]): void {
    executeHanaQueryBatchMock.mockImplementation(
      async (
        _connection: unknown,
        _inputs: unknown,
        options: {
          onStatementComplete?: (index: number, outcome: FakeOutcome) => void;
          discardResultsAfterCallback?: boolean;
        }
      ) => {
        outcomes.forEach((outcome, index) => options.onStatementComplete?.(index, outcome));
        const retained = options.discardResultsAfterCallback === true
          ? outcomes.map((outcome) => { const copy = { ...outcome }; delete copy.result; return copy; })
          : outcomes;
        return {
          outcomes: retained,
          usedTransaction: false,
          committed: false,
          rolledBack: false,
          elapsedMs: 1,
        };
      }
    );
  }

  beforeEach(() => {
    executeHanaQueryBatchMock.mockReset();
    showWarningMessageMock.mockReset();
  });

  test('saves the pre-mutation resultset as CSV for a filtered update', async () => {
    const { access, context, saveBackup } = createBackupTestHarness();
    passThroughTunnel(access);
    mockBatch([
        { sql: 'a', statementKind: 'readonly', status: 'success', result: resultset([['7', 'ready, now']]) },
      ]);

    await access.backupMutatingStatements(context, [
      mutating('UPDATE "Orders" SET "Status" = \'DONE\' WHERE "Id" = 7'),
    ]);

    expect(saveBackup).toHaveBeenCalledWith(expect.objectContaining({
      session: context.session,
      appName: 'finance-uat-api',
      statementType: 'UPDATE',
      tableName: '"Orders"',
      originalSql: 'UPDATE "Orders" SET "Status" = \'DONE\' WHERE "Id" = 7',
      csvContent: 'ID,NOTE\n7,"ready, now"',
      rowCount: 1,
      timestamp: expect.any(Date),
    }));
    expect(showWarningMessageMock).not.toHaveBeenCalled();
  });

  test('runs every backup of a batch over a single connection', async () => {
    const { access, context, saveBackup } = createBackupTestHarness();
    passThroughTunnel(access);
    mockBatch([
        { sql: 'a', statementKind: 'readonly', status: 'success', result: resultset([['1', 'a']]) },
        { sql: 'b', statementKind: 'readonly', status: 'success', result: resultset([['2', 'b']]) },
      ]);

    await access.backupMutatingStatements(context, [
      mutating('DELETE FROM "Orders" WHERE "Id" = 1'),
      mutating('DELETE FROM "Orders" WHERE "Id" = 2'),
    ]);

    expect(access.withTunnelFallback).toHaveBeenCalledTimes(1);
    expect(executeHanaQueryBatchMock).toHaveBeenCalledTimes(1);
    expect(batchInputs()).toHaveLength(2);
    expect(saveBackup).toHaveBeenCalledTimes(2);
  });

  test('asks the driver to keep going after a failed backup', async () => {
    const { access, context } = createBackupTestHarness();
    passThroughTunnel(access);
    mockBatch([]);

    await access.backupMutatingStatements(context, [mutating('DELETE FROM "Orders" WHERE "Id" = 1')]);

    const options = executeHanaQueryBatchMock.mock.calls[0]?.[2] as { continueOnError?: boolean };
    expect(options.continueOnError).toBe(true);
  });

  test('caps each backup query so a broad predicate cannot pull the whole table', async () => {
    const { access, context } = createBackupTestHarness();
    passThroughTunnel(access);
    mockBatch([]);

    await access.backupMutatingStatements(context, [
      mutating('UPDATE "Orders" SET "Flag" = 1 WHERE "Status" = \'OPEN\''),
    ]);

    // Exactly cap+1: the extra row is what distinguishes "the table happened to
    // hold exactly the cap" from "we truncated", so the margin is load-bearing.
    expect(batchInputs()[0]?.sql).toMatch(
      new RegExp(`LIMIT ${String(HANA_SQL_BACKUP_ROW_LIMIT + 1)}$`)
    );
    expect(batchInputs()[0]?.statementKind).toBe('readonly');
  });

  test('treats exactly the cap as a complete backup, not a truncated one', async () => {
    const { access, context, saveBackup } = createBackupTestHarness();
    passThroughTunnel(access);
    const exactRows = Array.from({ length: HANA_SQL_BACKUP_ROW_LIMIT }, (_, i) => [String(i), 'x']);
    mockBatch([
      { sql: 'a', statementKind: 'readonly', status: 'success', result: resultset(exactRows) },
    ]);

    await access.backupMutatingStatements(context, [
      mutating('UPDATE "Orders" SET "Flag" = 1 WHERE "Status" = \'OPEN\''),
    ]);

    expect(saveBackup).toHaveBeenCalledWith(
      expect.objectContaining({ rowCount: HANA_SQL_BACKUP_ROW_LIMIT })
    );
    expect(showWarningMessageMock).not.toHaveBeenCalled();
  });

  test('asks the batch to drop each result once it has been written to disk', async () => {
    const { access, context } = createBackupTestHarness();
    passThroughTunnel(access);
    mockBatch([]);

    await access.backupMutatingStatements(context, [mutating('DELETE FROM "Orders" WHERE "Id" = 1')]);

    // Without this the batch retains every backup's rows at once, which is
    // N x the row cap resident in the extension host.
    const options = executeHanaQueryBatchMock.mock.calls[0]?.[2] as {
      discardResultsAfterCallback?: boolean;
      onStatementComplete?: unknown;
    };
    expect(options.discardResultsAfterCallback).toBe(true);
    expect(typeof options.onStatementComplete).toBe('function');
  });

  test('re-raises a connectivity failure so the tunnel fallback still runs', async () => {
    const { access, context } = createBackupTestHarness();
    // Capture what escapes the callback — that IS the contract. Merely counting
    // invocations passes whether or not the re-raise exists.
    let threw: unknown = null;
    access.withTunnelFallback = vi.fn(
      async (
        _context: HanaSqlAppContextForTest,
        run: (connection: HanaConnection) => Promise<unknown>
      ) => {
        try {
          return await run({ host: 'h', port: 443, user: 'u', password: 'p' });
        } catch (error) {
          threw = error;
          return undefined;
        }
      }
    );
    mockBatch([
      {
        sql: 'a',
        statementKind: 'readonly',
        status: 'error',
        errorMessage: 'Client network socket disconnected before secure TLS connection was established',
      },
    ]);

    await access.backupMutatingStatements(context, [mutating('DELETE FROM "Orders" WHERE "Id" = 1')]);

    // continueOnError would otherwise report this as a plain per-statement error
    // and withTunnelFallback would never see a connectivity problem.
    expect(threw).toBeInstanceOf(Error);
    expect(String(threw)).toContain('socket disconnected');
    // The stub swallows it, so no warning here — the warning path when
    // withTunnelFallback itself rethrows is covered by the batch-failure test.
  });

  test('does not re-raise a plain SQL error as a connectivity failure', async () => {
    const { access, context, saveBackup } = createBackupTestHarness();
    passThroughTunnel(access);
    mockBatch([
      { sql: 'a', statementKind: 'readonly', status: 'error', errorMessage: 'invalid column name: SO.ID' },
    ]);

    await access.backupMutatingStatements(context, [mutating('DELETE FROM "Orders" WHERE "Id" = 1')]);

    expect(saveBackup).not.toHaveBeenCalled();
    expect(String(showWarningMessageMock.mock.calls[0]?.[0])).toContain('invalid column name');
    expect(String(showWarningMessageMock.mock.calls[0]?.[0])).not.toContain('no backup captured');
  });

  test('still backs up the other statements when one backup fails', async () => {
    const { access, context, saveBackup } = createBackupTestHarness();
    passThroughTunnel(access);
    mockBatch([
        { sql: 'a', statementKind: 'readonly', status: 'error', errorMessage: 'invalid column name' },
        { sql: 'b', statementKind: 'readonly', status: 'success', result: resultset([['2', 'b']]) },
      ]);

    await access.backupMutatingStatements(context, [
      mutating('DELETE FROM "Orders" WHERE "Id" = 1'),
      mutating('DELETE FROM "Orders" WHERE "Id" = 2'),
    ]);

    expect(saveBackup).toHaveBeenCalledTimes(1);
    expect(showWarningMessageMock).toHaveBeenCalledTimes(1);
    expect(String(showWarningMessageMock.mock.calls[0]?.[0])).toContain('invalid column name');
  });

  test('tells the user when the whole backup batch could not run', async () => {
    const { access, context, saveBackup } = createBackupTestHarness();
    access.withTunnelFallback = vi.fn(async () => {
      throw new Error('Backup query failed');
    });

    await expect(
      access.backupMutatingStatements(context, [mutating('DELETE FROM "Orders" WHERE "Id" = 7')])
    ).resolves.toBeUndefined();

    expect(saveBackup).not.toHaveBeenCalled();
    expect(String(showWarningMessageMock.mock.calls[0]?.[0])).toContain('Backup query failed');
  });

  test('marks a backup that hit the row cap as incomplete', async () => {
    const { access, context, saveBackup } = createBackupTestHarness();
    passThroughTunnel(access);
    const overflowRows = Array.from({ length: HANA_SQL_BACKUP_ROW_LIMIT + 1 }, (_, index) => [
      String(index),
      'x',
    ]);
    mockBatch([
        { sql: 'a', statementKind: 'readonly', status: 'success', result: resultset(overflowRows) },
      ]);

    await access.backupMutatingStatements(context, [
      mutating('UPDATE "Orders" SET "Flag" = 1 WHERE "Status" = \'OPEN\''),
    ]);

    expect(saveBackup).toHaveBeenCalledWith(
      expect.objectContaining({ rowCount: HANA_SQL_BACKUP_ROW_LIMIT })
    );
    expect(String(showWarningMessageMock.mock.calls[0]?.[0])).toContain('first');
  });

  test('skips pre-mutation queries when an update has no where clause', async () => {
    const { access, context, saveBackup } = createBackupTestHarness();
    access.withTunnelFallback = vi.fn();

    await access.backupMutatingStatements(context, [
      mutating('UPDATE "Orders" SET "Status" = \'DONE\''),
    ]);

    expect(access.withTunnelFallback).not.toHaveBeenCalled();
    expect(executeHanaQueryBatchMock).not.toHaveBeenCalled();
    expect(saveBackup).not.toHaveBeenCalled();
  });

  test('ignores readonly statements entirely', async () => {
    const { access, context } = createBackupTestHarness();
    access.withTunnelFallback = vi.fn();

    await access.backupMutatingStatements(context, [
      { executionSql: 'SELECT * FROM "Orders"', statementKind: 'readonly', tableName: 'Orders' },
    ]);

    expect(access.withTunnelFallback).not.toHaveBeenCalled();
  });

  test('reports a backup the store refused to write', async () => {
    const { access, context, saveBackup } = createBackupTestHarness();
    passThroughTunnel(access);
    saveBackup.mockResolvedValue(null as unknown as { id: string });
    mockBatch([
        { sql: 'a', statementKind: 'readonly', status: 'success', result: resultset([['7', 'x']]) },
      ]);

    await access.backupMutatingStatements(context, [
      mutating('DELETE FROM "Orders" WHERE "Id" = 7'),
    ]);

    expect(String(showWarningMessageMock.mock.calls[0]?.[0])).toContain('could not be written');
  });
});

describe('HanaSqlWorkbench scope cache invalidation', () => {
  beforeEach(() => {
    process.env['SAP_TOOLS_TEST_MODE'] = '1';
    process.env['SAP_TOOLS_E2E'] = '1';
    delete process.env['SAP_TOOLS_E2E_TESTMODE_TABLES_DELAY_MS'];
    executeCommandMock.mockClear();
    onDidChangeActiveTextEditorMock.mockClear();
    onDidCloseTextDocumentMock.mockClear();
    registerCommandMock.mockClear();
    registerCompletionItemProviderMock.mockClear();
  });

  test('clears cached HANA credentials and tables while preserving document mappings', async () => {
    const workbench = createWorkbench();
    const access = workbench as unknown as HanaSqlWorkbenchTestAccess;

    await workbench.loadTableEntriesForApp({
      appId: 'finance-uat-api',
      appName: 'finance-uat-api',
      session: null,
    });
    const context = access.appContextsByAppId.get('finance-uat-api');
    expect(context).toBeDefined();
    if (context === undefined) {
      throw new Error('Expected test app context.');
    }

    context.connection = {
      host: 'old-host',
      port: 30015,
      user: 'old-user',
      password: 'old-password',
    };
    context.sqlDocumentUri = 'untitled:saptools-finance-uat-api.sql';
    access.appIdByDocumentUri.set(context.sqlDocumentUri, context.appId);
    expect(context.tableNames.length).toBeGreaterThan(0);
    expect(context.tableEntries.length).toBeGreaterThan(0);

    access.invalidateAllAppContexts();

    expect(context.connection).toBeNull();
    expect(context.schema).toBe('');
    expect(context.tableNames).toEqual([]);
    expect(context.tableEntries).toEqual([]);
    expect(context.tableNamesPromise).toBeNull();
    expect(access.appIdByDocumentUri.get(context.sqlDocumentUri)).toBe('finance-uat-api');
  });

  test('discards table metadata loaded by a stale in-flight preload', async () => {
    process.env['SAP_TOOLS_E2E_TESTMODE_TABLES_DELAY_MS'] = '25';
    const workbench = createWorkbench();
    const access = workbench as unknown as HanaSqlWorkbenchTestAccess;

    const staleLoad = workbench.loadTableEntriesForApp({
      appId: 'finance-uat-api',
      appName: 'finance-uat-api',
      session: null,
    });
    const context = access.appContextsByAppId.get('finance-uat-api');
    expect(context).toBeDefined();
    if (context === undefined) {
      throw new Error('Expected test app context.');
    }

    access.invalidateAllAppContexts();
    const staleEntries = await staleLoad;

    expect(staleEntries).toEqual([]);
    expect(context.tableNames).toEqual([]);
    expect(context.tableEntries).toEqual([]);

    const freshEntries = await workbench.loadTableEntriesForApp({
      appId: 'finance-uat-api',
      appName: 'finance-uat-api',
      session: null,
    });

    expect(freshEntries.length).toBeGreaterThan(0);
    expect(context.tableNames.length).toBeGreaterThan(0);
    expect(context.tableEntries.length).toBeGreaterThan(0);
  });

  test('loads fresh table metadata for a caller waiting through invalidation', async () => {
    process.env['SAP_TOOLS_E2E_TESTMODE_TABLES_DELAY_MS'] = '25';
    const workbench = createWorkbench();
    const access = workbench as unknown as HanaSqlWorkbenchTestAccess;

    const staleLoad = workbench.loadTableNamesForApp({
      appId: 'finance-uat-api',
      appName: 'finance-uat-api',
      session: null,
    });
    const context = access.appContextsByAppId.get('finance-uat-api');
    expect(context).toBeDefined();
    if (context === undefined) {
      throw new Error('Expected test app context.');
    }
    expect(context.tableNamesPromise).not.toBeNull();

    const waitingLoad = workbench.loadTableNamesForApp({
      appId: 'finance-uat-api',
      appName: 'finance-uat-api',
      session: null,
    });
    access.invalidateAllAppContexts();

    await staleLoad;
    const tableNames = await waitingLoad;

    expect(tableNames.length).toBeGreaterThan(0);
    expect(context.tableNames.length).toBeGreaterThan(0);
    expect(context.cacheVersion).toBeGreaterThan(0);
  });

  test('clears cached HANA connection when the same app is opened in a different scope', async () => {
    const workbench = createWorkbench();
    const access = workbench as unknown as HanaSqlWorkbenchTestAccess;
    const firstSession = createScopeSession();
    const nextSession = createScopeSession({ spaceName: 'prod' });

    await workbench.loadTableEntriesForApp({
      appId: 'finance-api',
      appName: 'finance-api',
      session: firstSession,
    });
    const context = access.appContextsByAppId.get('finance-api');
    expect(context).toBeDefined();
    if (context === undefined) {
      throw new Error('Expected test app context.');
    }

    context.connection = {
      host: 'old-host',
      port: 30015,
      user: 'old-user',
      password: 'old-password',
    };
    context.schema = 'OLD_SCHEMA';

    await workbench.loadTableEntriesForApp({
      appId: 'finance-api',
      appName: 'finance-api',
      session: nextSession,
    });

    expect(context.session).toEqual(nextSession);
    expect(context.connection).toBeNull();
    expect(context.cacheVersion).toBeGreaterThan(0);
  });

  test('starts a fresh table load when app scope changes during an in-flight preload', async () => {
    process.env['SAP_TOOLS_E2E_TESTMODE_TABLES_DELAY_MS'] = '25';
    const workbench = createWorkbench();
    const access = workbench as unknown as HanaSqlWorkbenchTestAccess;
    const firstSession = createScopeSession();
    const nextSession = createScopeSession({ orgName: 'finance-services-prod-copy' });

    const staleLoad = workbench.loadTableNamesForApp({
      appId: 'finance-api',
      appName: 'finance-api',
      session: firstSession,
    });
    const context = access.appContextsByAppId.get('finance-api');
    expect(context).toBeDefined();
    if (context === undefined) {
      throw new Error('Expected test app context.');
    }
    expect(context.tableNamesPromise).not.toBeNull();

    const freshLoad = workbench.loadTableNamesForApp({
      appId: 'finance-api',
      appName: 'finance-api',
      session: nextSession,
    });

    await staleLoad;
    const tableNames = await freshLoad;

    expect(context.session).toEqual(nextSession);
    expect(context.cacheVersion).toBeGreaterThan(0);
    expect(tableNames.length).toBeGreaterThan(0);
    expect(context.tableNames.length).toBeGreaterThan(0);
  });
});

describe('HanaSqlWorkbench table list persistent cache', () => {
  beforeEach(() => {
    delete process.env['SAP_TOOLS_TEST_MODE'];
    delete process.env['SAP_TOOLS_E2E'];
    delete process.env['SAP_TOOLS_E2E_TESTMODE_TABLES_DELAY_MS'];
    executeCommandMock.mockClear();
    onDidChangeActiveTextEditorMock.mockClear();
    onDidCloseTextDocumentMock.mockClear();
    registerCommandMock.mockClear();
    registerCompletionItemProviderMock.mockClear();
  });

  function createMockCacheStore(initialEntry: {
    schema: string;
    tableNames: readonly string[];
    displayEntries: readonly { name: string; displayName: string }[];
    updatedAt: string;
  } | null) {
    return {
      getHanaTableList: vi.fn(async () => initialEntry),
      setHanaTableList: vi.fn(async (_key: string, entry: unknown) => entry),
      deleteHanaTableList: vi.fn(async () => undefined),
      getHanaTunnelJumpApp: vi.fn(async () => undefined),
      setHanaTunnelJumpApp: vi.fn(async () => undefined),
    };
  }

  test('serves cached table entries without running HANA discovery when an entry is present for the scope', async () => {
    const cachedEntry = {
      schema: 'PERSISTED_SCHEMA',
      tableNames: ['ORDERS', 'CUSTOMERS'],
      displayEntries: [
        { name: 'ORDERS', displayName: 'Orders' },
        { name: 'CUSTOMERS', displayName: 'Customers' },
      ],
      updatedAt: '2026-05-21T10:00:00.000Z',
    };
    const cacheStore = createMockCacheStore(cachedEntry);
    const workbench = new HanaSqlWorkbench(
      { appendLine: vi.fn() } as unknown as Parameters<typeof HanaSqlWorkbench['prototype']['constructor']>[0],
      cacheStore
    );

    const entries = await workbench.loadTableEntriesForApp({
      appId: 'finance-uat-api',
      appName: 'finance-uat-api',
      session: createScopeSession(),
    });

    expect(entries).toEqual([
      { name: 'ORDERS', displayName: 'Orders' },
      { name: 'CUSTOMERS', displayName: 'Customers' },
    ]);
    expect(cacheStore.getHanaTableList).toHaveBeenCalledTimes(1);
    expect(cacheStore.setHanaTableList).not.toHaveBeenCalled();
    const expectedScopeKey =
      'developer@example.com::https://api.cf.us10.hana.ondemand.com::finance-services-prod::uat::finance-uat-api';
    expect(cacheStore.getHanaTableList).toHaveBeenCalledWith(expectedScopeKey);
  });

  test('skips the cache lookup when the session is missing (no scope key buildable)', async () => {
    const cacheStore = createMockCacheStore(null);
    const workbench = new HanaSqlWorkbench(
      { appendLine: vi.fn() } as unknown as Parameters<typeof HanaSqlWorkbench['prototype']['constructor']>[0],
      cacheStore
    );

    try {
      await workbench.loadTableEntriesForApp({
        appId: 'finance-uat-api',
        appName: 'finance-uat-api',
        session: null,
      });
    } catch {
      /* ensureConnection rejects without a session; we only care about cache behavior */
    }

    expect(cacheStore.getHanaTableList).not.toHaveBeenCalled();
  });

  test('refreshTableEntriesForApp resets the in-memory cache and forces a fresh load', async () => {
    process.env['SAP_TOOLS_TEST_MODE'] = '1';
    const cacheStore = createMockCacheStore(null);
    const workbench = new HanaSqlWorkbench(
      { appendLine: vi.fn() } as unknown as Parameters<typeof HanaSqlWorkbench['prototype']['constructor']>[0],
      cacheStore
    );
    const access = workbench as unknown as HanaSqlWorkbenchTestAccess;

    const firstEntries = await workbench.loadTableEntriesForApp({
      appId: 'finance-uat-api',
      appName: 'finance-uat-api',
      session: createScopeSession(),
    });
    expect(firstEntries.length).toBeGreaterThan(0);
    const context = access.appContextsByAppId.get('finance-uat-api');
    const cacheVersionBefore = context?.cacheVersion ?? 0;

    const refreshedEntries = await workbench.refreshTableEntriesForApp({
      appId: 'finance-uat-api',
      appName: 'finance-uat-api',
      session: createScopeSession(),
    });
    expect(refreshedEntries.length).toBeGreaterThan(0);
    expect(context?.cacheVersion).toBeGreaterThan(cacheVersionBefore);
  });
});

describe('HanaSqlWorkbench SQL result table display names', () => {
  beforeEach(() => {
    process.env['SAP_TOOLS_TEST_MODE'] = '1';
    process.env['SAP_TOOLS_E2E'] = '1';
    executeCommandMock.mockClear();
    onDidChangeActiveTextEditorMock.mockClear();
    onDidCloseTextDocumentMock.mockClear();
    registerCommandMock.mockClear();
    registerCompletionItemProviderMock.mockClear();
  });

  function createPreparedStatementContext(): HanaSqlAppContextForTest {
    return {
      appId: 'finance-uat-api',
      appName: 'finance-uat-api',
      session: null,
      connection: null,
      schema: 'TEST_SCHEMA',
      sqlDocumentUri: '',
      sqlDocumentFileUri: '',
      tableNames: ['DEMO_PURCHASEORDERITEMMAPPING'],
      tableEntries: [
        {
          displayName: 'Demo_PurchaseOrderItemMapping',
          name: 'DEMO_PURCHASEORDERITEMMAPPING',
        },
      ],
      tableNamesPromise: null,
      cacheVersion: 0,
    };
  }

  test('uses the sidebar readable table name for rewritten display-name references', () => {
    const workbench = createWorkbench();
    const access = workbench as unknown as HanaSqlWorkbenchTestAccess;
    const context = createPreparedStatementContext();

    const prepared = access.prepareStatement(
      context,
      'SELECT * FROM Demo_PurchaseOrderItemMapping LIMIT 100',
      context.tableEntries
    );

    expect(prepared.executionSql).toBe(
      'SELECT * FROM "TEST_SCHEMA"."DEMO_PURCHASEORDERITEMMAPPING" LIMIT 100'
    );
    expect(prepared.tableName).toBe('Demo_PurchaseOrderItemMapping');
  });

  test('uses the sidebar readable table name for already quoted raw references', () => {
    const workbench = createWorkbench();
    const access = workbench as unknown as HanaSqlWorkbenchTestAccess;
    const context = createPreparedStatementContext();

    const prepared = access.prepareStatement(
      context,
      'SELECT * FROM "TEST_SCHEMA"."DEMO_PURCHASEORDERITEMMAPPING" LIMIT 100',
      context.tableEntries
    );

    expect(prepared.executionSql).toBe(
      'SELECT * FROM "TEST_SCHEMA"."DEMO_PURCHASEORDERITEMMAPPING" LIMIT 100'
    );
    expect(prepared.tableName).toBe('Demo_PurchaseOrderItemMapping');
  });

  test('uses the sidebar readable table name for quick table selects', async () => {
    const workbench = createWorkbench();
    const access = workbench as unknown as HanaSqlWorkbenchQuickSelectTestAccess;
    const updates: RenderSqlResultOptions[] = [];
    const resultPanel = { update: (options: RenderSqlResultOptions): void => updates.push(options) };
    const recordLoadingUpdate = (
      appName: string,
      tableName: string,
      sql: string,
      executedAt: string
    ): void => {
      updates.push({ appName, tableName, sql, executedAt, isLoading: true });
    };

    access.openLoadingResultPanel = vi.fn(
      (appName: string, tableName: string, sql: string) => {
        recordLoadingUpdate(appName, tableName, sql, 'open');
        return resultPanel;
      }
    );
    access.updateLoadingResultPanel = vi.fn(
      (
        panel: { update(options: RenderSqlResultOptions): void },
        appName: string,
        tableName: string,
        sql: string
      ) => {
        void panel;
        recordLoadingUpdate(appName, tableName, sql, 'loading');
      }
    );
    access.executeSqlForContext = vi.fn(async () => ({
      kind: 'resultset',
      columns: ['ID'],
      rows: [['1']],
      rowCount: 1,
      elapsedMs: 4,
    }));

    await workbench.loadTableEntriesForApp({ appId: 'finance-uat-api', appName: 'finance-uat-api', session: null });
    await workbench.runQuickTableSelectForApp({
      appId: 'finance-uat-api',
      appName: 'finance-uat-api',
      session: null,
      tableName: 'DEMO_APP',
    });

    expect(updates.map((update) => update.tableName)).toEqual(['Demo_App', 'Demo_App', 'Demo_App']);
    expect(updates.at(-1)?.sql).toBe('SELECT * FROM "TEST_SCHEMA"."DEMO_APP" LIMIT 100');
  });

  test('automatically uses the active session from provider and invalidates stale connection when session changes', async () => {
    process.env['SAP_TOOLS_TEST_MODE'] = '';
    
    try {
      const workbench = createWorkbench();
      const access = workbench as unknown as HanaSqlWorkbenchTestAccess;

      let activeSession: HanaSqlScopeSession | null = createScopeSession({
        spaceName: 'spaceA',
      });

      access.registerActiveSessionProvider(() => activeSession);

      const context = access.ensureAppContext({
        appId: 'finance-uat-api',
        appName: 'finance-uat-api',
        session: activeSession,
      });

      await access.ensureConnection(context);
      expect(context.connection).toBeDefined();
      expect(context.connection?.host).toBe('resolved-spaceA-host');
      expect(context.session?.spaceName).toBe('spaceA');

      activeSession = createScopeSession({
        spaceName: 'spaceB',
      });

      await access.ensureConnection(context);
      expect(context.connection).toBeDefined();
      expect(context.connection?.host).toBe('resolved-spaceB-host');
      expect(context.session?.spaceName).toBe('spaceB');
    } finally {
      process.env['SAP_TOOLS_TEST_MODE'] = '1';
    }
  });

  test('invalidates connection and throws error when active session provider returns null', async () => {
    process.env['SAP_TOOLS_TEST_MODE'] = '';
    
    try {
      const workbench = createWorkbench();
      const access = workbench as unknown as HanaSqlWorkbenchTestAccess;

      let activeSession: HanaSqlScopeSession | null = createScopeSession({
        spaceName: 'spaceA',
      });

      access.registerActiveSessionProvider(() => activeSession);

      const context = access.ensureAppContext({
        appId: 'finance-uat-api',
        appName: 'finance-uat-api',
        session: activeSession,
      });

      await access.ensureConnection(context);
      expect(context.connection).toBeDefined();
      expect(context.connection?.host).toBe('resolved-spaceA-host');

      // Now set activeSession to null
      activeSession = null;

      await expect(access.ensureConnection(context)).rejects.toThrow(
        'No active CF scope session. Confirm scope and choose app again.'
      );

      // Verify connection is now null
      expect(context.connection).toBeNull();
      expect(context.schema).toBe('');
    } finally {
      process.env['SAP_TOOLS_TEST_MODE'] = '1';
    }
  });


  test('invalidateAllAppContexts resets the context session to null', async () => {
    const workbench = createWorkbench();
    const access = workbench as unknown as HanaSqlWorkbenchTestAccess;

    const context = access.ensureAppContext({
      appId: 'finance-uat-api',
      appName: 'finance-uat-api',
      session: createScopeSession(),
    });
    expect(context.session).not.toBeNull();

    access.invalidateAllAppContexts();
    expect(context.session).toBeNull();
  });
});

