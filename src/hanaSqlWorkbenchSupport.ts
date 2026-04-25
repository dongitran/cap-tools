import type {
  HanaQueryResult,
  HanaQueryResultSet,
  HanaSqlStatementKind,
} from './hanaSqlService';
export {
  buildRawHanaTableDisplayEntries,
  formatHanaTableDisplayEntries,
  formatHanaTableDisplayName,
  type HanaTableDisplayEntry,
} from './hanaTableDisplayNameFormatter';

export const SQL_RESULT_ROWS_LIMIT = 250;
export const TABLE_SUGGESTION_LIMIT = 500;
export const QUICK_SELECT_ROW_LIMIT = 10;

export const SQL_KEYWORDS: readonly string[] = [
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

export interface RenderSqlResultOptions {
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

export function sanitizeUntitledFileName(appName: string): string {
  const normalized = appName.trim().toLowerCase().replaceAll(/[^a-z0-9._-]+/g, '-');
  if (normalized.length > 0) {
    return normalized;
  }
  return 'hana-query';
}

export function buildTestModeQueryResult(
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

export function createTestModeTableNames(appName: string): readonly string[] {
  const appPrefix = appName.trim().toUpperCase().replaceAll(/[^A-Z0-9]+/g, '_');
  const normalizedPrefix = appPrefix.length > 0 ? appPrefix : 'APP';
  const baseTables = [
    `${normalizedPrefix}_ORDERS`,
    `${normalizedPrefix}_ITEMS`,
    `${normalizedPrefix}_AUDIT`,
    `${normalizedPrefix}_SAP_CAP_CDS_INVOICE_RECONCILIATION_DRAFTADMINISTRATIVEDATA`,
    `${normalizedPrefix}_COM_SAP_S4HANA_FINANCE_GENERAL_LEDGER_ACCOUNTING_DOCUMENT_ITEM`,
    `${normalizedPrefix}_VERY_LONG_NAMESPACE_WITH_DEEPLY_NESTED_SERVICE_PROJECTION_FOR_PAYMENT_ALLOCATION_HISTORY`,
    `${normalizedPrefix}_I_BUSINESSPARTNERBANK_0001_TO_SUPPLIERINVOICEPAYMENTBLOCKREASON`,
    'CORE_ADDRESSSECTIONINPUTMAPPING',
    'DUMMY',
    'M_TABLES',
  ];
  const generatedTables = Array.from({ length: 94 }, (_, index) => {
    return `${normalizedPrefix}_ENTITY_${String(index + 1).padStart(3, '0')}`;
  });

  return [...baseTables, ...generatedTables];
}

function quoteHanaStringLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

export function buildTableDiscoveryQueries(schema: string): readonly string[] {
  const normalizedSchema = schema.trim();
  const schemaExpression =
    normalizedSchema.length > 0
      ? quoteHanaStringLiteral(normalizedSchema)
      : 'CURRENT_SCHEMA';

  return [
    `SELECT TABLE_NAME FROM SYS.TABLES WHERE SCHEMA_NAME = ${schemaExpression} ORDER BY TABLE_NAME`,
    `SELECT TABLE_NAME FROM SYS.M_TABLES WHERE SCHEMA_NAME = ${schemaExpression} ORDER BY TABLE_NAME`,
  ];
}

export function extractTableNames(result: HanaQueryResultSet): readonly string[] {
  const names = new Set<string>();
  for (const row of result.rows) {
    const value = row[0]?.trim() ?? '';
    if (value.length > 0) {
      names.add(value);
    }
  }
  return [...names];
}

export function filterKeywordCandidates(prefix: string): readonly string[] {
  const normalizedPrefix = prefix.trim().toUpperCase();
  if (normalizedPrefix.length === 0) {
    return SQL_KEYWORDS;
  }
  return SQL_KEYWORDS.filter((keyword) => keyword.startsWith(normalizedPrefix));
}

export function filterTableCandidates(
  tableNames: readonly string[],
  prefix: string
): readonly string[] {
  const normalizedPrefix = prefix.trim().toUpperCase();
  const matches =
    normalizedPrefix.length === 0
      ? tableNames
      : tableNames.filter((tableName) => tableName.toUpperCase().startsWith(normalizedPrefix));
  return matches.slice(0, TABLE_SUGGESTION_LIMIT);
}

export function quoteHanaIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

export function buildQuickTableSelectSql(schema: string, tableName: string): string {
  const trimmedTable = tableName.trim();
  if (trimmedTable.length === 0) {
    throw new Error('Table name is required to build a SELECT statement.');
  }
  const tableId = quoteHanaIdentifier(trimmedTable);
  const trimmedSchema = schema.trim();
  if (trimmedSchema.length === 0) {
    return `SELECT * FROM ${tableId} LIMIT ${String(QUICK_SELECT_ROW_LIMIT)}`;
  }
  const schemaId = quoteHanaIdentifier(trimmedSchema);
  return `SELECT * FROM ${schemaId}.${tableId} LIMIT ${String(QUICK_SELECT_ROW_LIMIT)}`;
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
        display: grid;
        grid-template-rows: auto auto auto;
        gap: 6px;
        padding: 6px;
      }
      .state-card {
        border: 1px solid #273246;
        border-radius: 6px;
        background: #141c28;
        padding: 6px 8px;
      }
      .state-card.state-meta {
        padding: 4px 8px;
      }
      .state-card h1 {
        margin: 0;
        font-size: 13px;
      }
      .state-meta-line {
        margin: 0;
        font-size: 12px;
        line-height: 18px;
        color: #aab7c7;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
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
      <section class="state-card state-meta">
        <p class="state-meta-line">App: ${escapedAppName} · Executed: ${escapedExecutedAt}</p>
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
        padding: 6px;
        border-bottom: 1px solid #273246;
        background: #141c28;
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
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
        padding: 2px 8px;
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

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
