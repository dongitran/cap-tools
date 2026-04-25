import { describe, expect, test } from 'vitest';

import type { HanaQueryResultSet } from './hanaSqlService';
import {
  QUICK_SELECT_ROW_LIMIT,
  SQL_KEYWORDS,
  TABLE_SUGGESTION_LIMIT,
  buildTableDiscoveryQueries,
  buildHanaSqlResultHtml,
  buildInitialHanaSqlTemplate,
  buildQuickTableSelectSql,
  buildTestModeQueryResult,
  createTestModeTableNames,
  escapeHtml,
  extractTableNames,
  filterKeywordCandidates,
  filterTableCandidates,
  formatHanaTableDisplayEntries,
  formatHanaTableDisplayName,
  quoteHanaIdentifier,
  sanitizeUntitledFileName,
} from './hanaSqlWorkbenchSupport';

describe('buildInitialHanaSqlTemplate', () => {
  test('includes the trimmed app name in the header comment', () => {
    const template = buildInitialHanaSqlTemplate('  finance-uat-api  ');
    expect(template).toContain('-- SAP Tools SQL for finance-uat-api');
    expect(template).toContain('SELECT CURRENT_USER, CURRENT_SCHEMA FROM DUMMY;');
    expect(template.endsWith('\n')).toBe(true);
  });

  test('falls back to placeholder label when the app name is blank', () => {
    const template = buildInitialHanaSqlTemplate('   ');
    expect(template).toContain('-- SAP Tools SQL for selected-app');
  });
});

describe('sanitizeUntitledFileName', () => {
  test('lowercases and replaces unsafe characters with a hyphen', () => {
    expect(sanitizeUntitledFileName('Finance UAT API!')).toBe('finance-uat-api-');
  });

  test('preserves dots, dashes, and underscores', () => {
    expect(sanitizeUntitledFileName('Finance.API_v2-01')).toBe('finance.api_v2-01');
  });

  test('falls back to hana-query when input is blank', () => {
    expect(sanitizeUntitledFileName('   ')).toBe('hana-query');
    expect(sanitizeUntitledFileName('')).toBe('hana-query');
  });

  test('collapses runs of unsafe characters into a single hyphen', () => {
    expect(sanitizeUntitledFileName('!!!')).toBe('-');
    expect(sanitizeUntitledFileName('a!!!b')).toBe('a-b');
  });
});

describe('filterKeywordCandidates', () => {
  test('returns every keyword when the prefix is empty', () => {
    const candidates = filterKeywordCandidates('');
    expect(candidates).toEqual(SQL_KEYWORDS);
  });

  test('filters keywords by case-insensitive prefix match', () => {
    const candidates = filterKeywordCandidates('se');
    expect([...candidates]).toEqual(['SELECT']);
  });

  test('returns an empty list when no keyword matches the prefix', () => {
    const candidates = filterKeywordCandidates('zzz');
    expect(candidates).toEqual([]);
  });
});

describe('filterTableCandidates', () => {
  const tables = ['ORDERS', 'ORDER_ITEMS', 'AUDIT', 'CUSTOMERS'];

  test('returns every table when the prefix is empty', () => {
    expect(filterTableCandidates(tables, '')).toEqual(tables);
  });

  test('filters tables by case-insensitive prefix match', () => {
    expect(filterTableCandidates(tables, 'ord')).toEqual(['ORDERS', 'ORDER_ITEMS']);
  });

  test('respects the TABLE_SUGGESTION_LIMIT when the table list is large', () => {
    const many = Array.from({ length: TABLE_SUGGESTION_LIMIT + 25 }, (_, index) => {
      return `T_${String(index).padStart(4, '0')}`;
    });
    expect(filterTableCandidates(many, '')).toHaveLength(TABLE_SUGGESTION_LIMIT);
  });
});

describe('buildTestModeQueryResult', () => {
  test('returns a resultset preview for readonly statements', () => {
    const result = buildTestModeQueryResult('finance-uat-api', 'readonly');
    expect(result.kind).toBe('resultset');
    if (result.kind !== 'resultset') return;
    expect(result.columns).toEqual(['APP_NAME', 'CURRENT_SCHEMA']);
    expect(result.rows).toEqual([['finance-uat-api', 'TEST_SCHEMA']]);
  });

  test('returns a status payload for mutating statements', () => {
    const result = buildTestModeQueryResult('finance-uat-api', 'mutating');
    expect(result.kind).toBe('status');
    if (result.kind !== 'status') return;
    expect(result.message).toContain('test mode');
  });
});

describe('createTestModeTableNames', () => {
  test('emits per-app synthetic tables, long table names, and known system tables', () => {
    const tables = createTestModeTableNames('finance-uat-api');
    expect(tables).toContain('FINANCE_UAT_API_ORDERS');
    expect(tables).toContain('FINANCE_UAT_API_ITEMS');
    expect(tables).toContain(
      'FINANCE_UAT_API_COM_SAP_S4HANA_FINANCE_GENERAL_LEDGER_ACCOUNTING_DOCUMENT_ITEM'
    );
    expect(tables).toContain(
      'FINANCE_UAT_API_I_BUSINESSPARTNERBANK_0001_TO_SUPPLIERINVOICEPAYMENTBLOCKREASON'
    );
    expect(tables).toContain('DEMO_PURCHASEORDERITEMMAPPING');
    expect(tables).toContain('DEMO_BUSINESSAPP_TEST');
    expect(tables).toContain('DUMMY');
    expect(tables).toContain('M_TABLES');
    expect(tables).toHaveLength(105);
  });

  test('uses the APP fallback prefix when app name is blank', () => {
    const tables = createTestModeTableNames('   ');
    expect(tables[0]).toBe('APP_ORDERS');
  });
});

describe('extractTableNames', () => {
  test('deduplicates and drops blank values', () => {
    const rs: HanaQueryResultSet = {
      kind: 'resultset',
      columns: ['TABLE_NAME'],
      rows: [['ORDERS'], ['ORDERS'], ['  '], ['AUDIT  ']],
      rowCount: 4,
      elapsedMs: 0,
    };
    expect(extractTableNames(rs)).toEqual(['ORDERS', 'AUDIT']);
  });
});

describe('escapeHtml', () => {
  test('escapes tag and quote characters', () => {
    expect(escapeHtml(`<img src="x" onerror='y'>`)).toBe(
      '&lt;img src=&quot;x&quot; onerror=&#39;y&#39;&gt;'
    );
  });

  test('escapes ampersand first so downstream entities are not double encoded', () => {
    expect(escapeHtml('a & <b>')).toBe('a &amp; &lt;b&gt;');
  });
});

describe('buildHanaSqlResultHtml', () => {
  test('renders a result table with row numbers for a resultset', () => {
    const html = buildHanaSqlResultHtml({
      appName: 'finance-uat-api',
      sql: 'SELECT ID FROM ORDERS',
      executedAt: '2026-04-25T00:00:00Z',
      result: {
        kind: 'resultset',
        columns: ['ID', 'STATUS'],
        rows: [
          ['1', 'OPEN'],
          ['2', 'PAID'],
        ],
        rowCount: 2,
        elapsedMs: 12,
      },
    });

    expect(html).not.toContain('<h1>SAP Tools SQL Result</h1>');
    expect(html).toContain('App: finance-uat-api');
    expect(html).toContain('Rows: 2');
    expect(html).toContain('Elapsed: 12 ms');
    expect(html).toContain('<th>ID</th>');
    expect(html).toContain('<th>STATUS</th>');
    expect(html).toContain('<td>OPEN</td>');
    expect(html).toContain('table-layout: auto;');
    expect(html).toContain('width: max-content;');
    expect(html).toContain('min-width: 100%;');
    expect(html).not.toContain('Showing first');
  });

  test('announces truncation when rows exceed the display cap', () => {
    const rows = Array.from({ length: 260 }, (_, index) => [String(index)]);
    const html = buildHanaSqlResultHtml({
      appName: 'finance-uat-api',
      sql: 'SELECT ID FROM ORDERS',
      executedAt: '2026-04-25T00:00:00Z',
      result: {
        kind: 'resultset',
        columns: ['ID'],
        rows,
        rowCount: rows.length,
        elapsedMs: 42,
      },
    });

    expect(html).toContain('Showing first 250 rows of 260');
  });

  test('keeps very long cell content renderable without ellipsis clipping', () => {
    const longValue = 'X'.repeat(10000);
    const html = buildHanaSqlResultHtml({
      appName: 'finance-uat-api',
      sql: 'SELECT LONG_VALUE FROM SAMPLE_TABLE',
      executedAt: '2026-04-25T00:00:00Z',
      result: {
        kind: 'resultset',
        columns: ['LONG_VALUE'],
        rows: [[longValue]],
        rowCount: 1,
        elapsedMs: 2,
      },
    });

    expect(html).toContain(`<td>${longValue}</td>`);
    expect(html).toContain('white-space: pre;');
    expect(html).toContain('overflow: visible;');
    expect(html).toContain('text-overflow: clip;');
    expect(html).not.toContain('text-overflow: ellipsis;');
  });

  test('renders a success card for status results', () => {
    const html = buildHanaSqlResultHtml({
      appName: 'finance-uat-api',
      sql: 'UPDATE ORDERS SET STATUS = \'OPEN\'',
      executedAt: '2026-04-25T00:00:00Z',
      result: {
        kind: 'status',
        message: '1 row affected',
        elapsedMs: 7,
      },
    });

    expect(html).toContain('Statement Executed');
    expect(html).toContain('state-success');
    expect(html).toContain('1 row affected');
    expect(html).toContain('Elapsed: 7 ms');
  });

  test('renders an error card with the supplied message when no result is present', () => {
    const html = buildHanaSqlResultHtml({
      appName: 'finance-uat-api',
      sql: 'SELECT broken',
      executedAt: '2026-04-25T00:00:00Z',
      errorMessage: 'syntax error near "broken"',
    });

    expect(html).toContain('Execution Error');
    expect(html).toContain('state-error');
    expect(html).toContain('syntax error near &quot;broken&quot;');
  });

  test('escapes app name, SQL, and error message to prevent HTML injection', () => {
    const html = buildHanaSqlResultHtml({
      appName: '<script>alert(1)</script>',
      sql: '<script>alert(2)</script>',
      executedAt: '<evil>',
      errorMessage: '<script>alert(3)</script>',
    });

    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).not.toContain('<script>alert(2)</script>');
    expect(html).not.toContain('<script>alert(3)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&lt;script&gt;alert(2)&lt;/script&gt;');
    expect(html).toContain('&lt;script&gt;alert(3)&lt;/script&gt;');
  });
});

describe('buildHanaSqlResultHtml result meta layout', () => {
  test('renders the App and Executed metadata as a single line for status results', () => {
    const html = buildHanaSqlResultHtml({
      appName: 'finance-uat-api',
      sql: 'UPDATE T SET X = 1',
      executedAt: '2026-04-25T01:23:45.000Z',
      result: { kind: 'status', message: '1 row affected', elapsedMs: 4 },
    });

    expect(html).toContain(
      '<p class="state-meta-line">App: finance-uat-api · Executed: 2026-04-25T01:23:45.000Z</p>'
    );
    expect(html).not.toContain('<p class="state-meta-line">App: finance-uat-api</p>');
    expect(html).not.toContain('<p class="state-meta-line">Executed: 2026-04-25T01:23:45.000Z</p>');
  });

  test('renders the App and Executed metadata as a single line for error results', () => {
    const html = buildHanaSqlResultHtml({
      appName: 'finance-uat-api',
      sql: 'SELECT broken',
      executedAt: '2026-04-25T02:00:00.000Z',
      errorMessage: 'syntax error',
    });

    expect(html).toContain(
      '<p class="state-meta-line">App: finance-uat-api · Executed: 2026-04-25T02:00:00.000Z</p>'
    );
  });

  test('uses compact padding to keep the result panel tight', () => {
    const html = buildHanaSqlResultHtml({
      appName: 'finance-uat-api',
      sql: 'SELECT 1 FROM DUMMY',
      executedAt: '2026-04-25T00:00:00Z',
      result: { kind: 'status', message: 'ok', elapsedMs: 1 },
    });

    expect(html).toContain('padding: 6px;');
    expect(html).not.toContain('padding: 14px;');
  });

  test('uses VS Code theme variables instead of fixed dark-only colors', () => {
    const html = buildHanaSqlResultHtml({
      appName: 'finance-uat-api',
      sql: 'SELECT 1 FROM DUMMY',
      executedAt: '2026-04-25T00:00:00Z',
      result: { kind: 'status', message: 'ok', elapsedMs: 1 },
    });

    expect(html).toContain('--vscode-editor-background');
    expect(html).toContain('--vscode-editor-foreground');
    expect(html).toContain('--vscode-panel-border');
    expect(html).not.toContain('background: #0f141d;');
    expect(html).not.toContain('color-scheme: dark;');
  });
});

describe('buildHanaSqlResultHtml (no install card)', () => {
  test('does not surface the legacy SAP HANA Client install card for connection errors', () => {
    const html = buildHanaSqlResultHtml({
      appName: 'finance-uat-api',
      sql: 'SELECT 1 FROM DUMMY',
      executedAt: '2026-04-25T00:00:00Z',
      errorMessage: 'connect ECONNREFUSED 1.2.3.4:443',
    });

    expect(html).not.toContain('SAP HANA Client Not Found');
    expect(html).not.toContain('Install the SAP HANA Client');
    expect(html).not.toContain('hdbsql');
    expect(html).not.toContain('hdbclient');
    expect(html).not.toContain('hanaSqlClientPath');
    expect(html).toContain('Execution Error');
    expect(html).toContain('connect ECONNREFUSED');
  });
});

describe('formatHanaTableDisplayName', () => {
  test('formats compact uppercase English table segments into readable PascalCase', async () => {
    await expect(formatHanaTableDisplayName('DEMO_PURCHASEORDERITEMMAPPING')).resolves.toBe(
      'Demo_PurchaseOrderItemMapping'
    );
  });

  test('formats common uppercase product segments without treating every letter as an acronym', async () => {
    await expect(formatHanaTableDisplayName('DEMO_BUSINESSAPP_TEST')).resolves.toBe(
      'Demo_BusinessApp_Test'
    );
  });

  test('keeps SAP acronyms and numeric segments readable', async () => {
    await expect(
      formatHanaTableDisplayName(
        'FINANCE_UAT_API_I_BUSINESSPARTNERBANK_0001_TO_SUPPLIERINVOICEPAYMENTBLOCKREASON'
      )
    ).resolves.toBe(
      'Finance_UAT_API_I_BusinessPartnerBank_0001_To_SupplierInvoicePaymentBlockReason'
    );
  });

  test('does not split common SAP acronyms into mixed-case words', async () => {
    await expect(
      formatHanaTableDisplayName(
        'SAP_CAP_CDS_INVOICE_RECONCILIATION_DRAFTADMINISTRATIVEDATA'
      )
    ).resolves.toBe('SAP_CAP_CDS_Invoice_Reconciliation_DraftAdministrativeData');
  });

  test('formats display entries while preserving the raw executable table name', async () => {
    const entries = await formatHanaTableDisplayEntries([
      'DEMO_PURCHASEORDERITEMMAPPING',
      'DUMMY',
    ]);

    expect(entries).toEqual([
      {
        displayName: 'Demo_PurchaseOrderItemMapping',
        name: 'DEMO_PURCHASEORDERITEMMAPPING',
      },
      { displayName: 'Dummy', name: 'DUMMY' },
    ]);
  });

  test('keeps unknown alphanumeric segments safe instead of blocking formatting', async () => {
    await expect(formatHanaTableDisplayName('XYZ123ABC')).resolves.toBe('XYZ123ABC');
  });
});

describe('quoteHanaIdentifier', () => {
  test('wraps simple identifiers in double quotes', () => {
    expect(quoteHanaIdentifier('ORDERS')).toBe('"ORDERS"');
  });

  test('escapes embedded double quotes by doubling them', () => {
    expect(quoteHanaIdentifier('WEIRD"NAME')).toBe('"WEIRD""NAME"');
  });
});

describe('buildQuickTableSelectSql', () => {
  test('builds a schema-qualified SELECT with a row limit', () => {
    expect(buildQuickTableSelectSql('TEST_SCHEMA', 'ORDERS')).toBe(
      `SELECT * FROM "TEST_SCHEMA"."ORDERS" LIMIT ${String(QUICK_SELECT_ROW_LIMIT)}`
    );
  });

  test('falls back to the unqualified table name when the schema is blank', () => {
    expect(buildQuickTableSelectSql('   ', 'ORDERS')).toBe(
      `SELECT * FROM "ORDERS" LIMIT ${String(QUICK_SELECT_ROW_LIMIT)}`
    );
  });

  test('escapes injection attempts inside the table identifier', () => {
    const sql = buildQuickTableSelectSql('SCHEMA', 'BAD"; DROP TABLE');
    expect(sql).toContain('"SCHEMA"."BAD""; DROP TABLE"');
    expect(sql.endsWith(`LIMIT ${String(QUICK_SELECT_ROW_LIMIT)}`)).toBe(true);
  });

  test('throws when the table name is empty', () => {
    expect(() => buildQuickTableSelectSql('SCHEMA', '   ')).toThrow(/required/i);
  });
});

describe('buildTableDiscoveryQueries', () => {
  test('queries the resolved binding schema before falling back to M_TABLES', () => {
    const queries = buildTableDiscoveryQueries('FINANCE_SCHEMA');

    expect(queries[0]).toBe(
      "SELECT TABLE_NAME FROM SYS.TABLES WHERE SCHEMA_NAME = 'FINANCE_SCHEMA' ORDER BY TABLE_NAME"
    );
    expect(queries[1]).toBe(
      "SELECT TABLE_NAME FROM SYS.M_TABLES WHERE SCHEMA_NAME = 'FINANCE_SCHEMA' ORDER BY TABLE_NAME"
    );
    for (const query of queries) {
      expect(query).not.toContain('CURRENT_SCHEMA');
    }
  });

  test('escapes quotes in schema names as SQL string literals', () => {
    const queries = buildTableDiscoveryQueries("FINANCE'SCHEMA");

    expect(queries[0]).toContain("SCHEMA_NAME = 'FINANCE''SCHEMA'");
    expect(queries[1]).toContain("SCHEMA_NAME = 'FINANCE''SCHEMA'");
    expect(queries[0]).not.toContain("SCHEMA_NAME = 'FINANCE'SCHEMA'");
  });

  test('falls back to CURRENT_SCHEMA only when no binding schema is available', () => {
    const queries = buildTableDiscoveryQueries('   ');

    expect(queries[0]).toBe(
      'SELECT TABLE_NAME FROM SYS.TABLES WHERE SCHEMA_NAME = CURRENT_SCHEMA ORDER BY TABLE_NAME'
    );
    expect(queries[1]).toBe(
      'SELECT TABLE_NAME FROM SYS.M_TABLES WHERE SCHEMA_NAME = CURRENT_SCHEMA ORDER BY TABLE_NAME'
    );
  });
});
