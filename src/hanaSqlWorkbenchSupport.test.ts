import { describe, expect, test } from 'vitest';

import type { HanaQueryResultSet } from './hanaSqlService';
import {
  SQL_KEYWORDS,
  TABLE_DISCOVERY_QUERIES,
  TABLE_SUGGESTION_LIMIT,
  buildHanaSqlResultHtml,
  buildInitialHanaSqlTemplate,
  buildTestModeQueryResult,
  createTestModeTableNames,
  escapeHtml,
  extractTableNames,
  filterKeywordCandidates,
  filterTableCandidates,
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
  test('emits per-app synthetic tables alongside known system tables', () => {
    const tables = createTestModeTableNames('finance-uat-api');
    expect(tables).toContain('FINANCE_UAT_API_ORDERS');
    expect(tables).toContain('FINANCE_UAT_API_ITEMS');
    expect(tables).toContain('DUMMY');
    expect(tables).toContain('M_TABLES');
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

    expect(html).toContain('SAP Tools SQL Result');
    expect(html).toContain('App: finance-uat-api');
    expect(html).toContain('Rows: 2');
    expect(html).toContain('Elapsed: 12 ms');
    expect(html).toContain('<th>ID</th>');
    expect(html).toContain('<th>STATUS</th>');
    expect(html).toContain('<td>OPEN</td>');
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

describe('TABLE_DISCOVERY_QUERIES', () => {
  test('queries the schema TABLES view first and falls back to M_TABLES', () => {
    expect(TABLE_DISCOVERY_QUERIES[0]).toContain('FROM TABLES');
    expect(TABLE_DISCOVERY_QUERIES[1]).toContain('FROM M_TABLES');
    for (const query of TABLE_DISCOVERY_QUERIES) {
      expect(query).toContain('SCHEMA_NAME = CURRENT_SCHEMA');
      expect(query).toContain('ORDER BY TABLE_NAME');
    }
  });
});
