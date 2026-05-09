import { beforeEach, describe, expect, test, vi } from 'vitest';

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
  connection: HanaConnection | null;
  schema: string;
  sqlDocumentUri: string;
  sqlDocumentFileUri: string;
  tableNames: readonly string[];
  tableEntries: readonly HanaTableDisplayEntry[];
  tableNamesPromise: Promise<void> | null;
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
});
