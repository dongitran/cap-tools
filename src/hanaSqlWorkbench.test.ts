import { beforeEach, describe, expect, test, vi } from 'vitest';

import type { HanaSqlScopeSession } from './hanaSqlConnectionResolver';
import type { HanaConnection } from './hanaSqlService';
import type { HanaTableDisplayEntry } from './hanaSqlWorkbenchSupport';

const {
  executeCommandMock,
  onDidChangeActiveTextEditorMock,
  onDidCloseTextDocumentMock,
  registerCommandMock,
  registerCompletionItemProviderMock,
} = vi.hoisted(() => ({
  executeCommandMock: vi.fn(),
  onDidChangeActiveTextEditorMock: vi.fn(() => ({ dispose: vi.fn() })),
  onDidCloseTextDocumentMock: vi.fn(() => ({ dispose: vi.fn() })),
  registerCommandMock: vi.fn(() => ({ dispose: vi.fn() })),
  registerCompletionItemProviderMock: vi.fn(() => ({ dispose: vi.fn() })),
}));

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
  },
  window: {
    activeTextEditor: undefined,
    onDidChangeActiveTextEditor: onDidChangeActiveTextEditorMock,
    showErrorMessage: vi.fn(),
    showWarningMessage: vi.fn(),
    visibleTextEditors: [],
  },
  workspace: {
    onDidCloseTextDocument: onDidCloseTextDocumentMock,
  },
}));

import { HanaSqlWorkbench } from './hanaSqlWorkbench';

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
}

function createWorkbench(): HanaSqlWorkbench {
  const outputChannel = {
    appendLine: vi.fn(),
  };
  return new HanaSqlWorkbench(outputChannel);
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
