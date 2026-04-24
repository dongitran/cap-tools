import type {
  HanaQueryErrorKind,
  HanaQueryResult,
  HanaQueryResultSet,
  HanaSqlStatementKind,
} from './hanaSqlService';

export const SAP_HANA_CLIENT_DOWNLOAD_URL =
  'https://tools.hana.ondemand.com/#hanatools';

export const SQL_RESULT_ROWS_LIMIT = 250;
export const TABLE_SUGGESTION_LIMIT = 500;

export const TABLE_DISCOVERY_QUERIES: readonly string[] = [
  'SELECT TABLE_NAME FROM TABLES WHERE SCHEMA_NAME = CURRENT_SCHEMA ORDER BY TABLE_NAME',
  'SELECT TABLE_NAME FROM M_TABLES WHERE SCHEMA_NAME = CURRENT_SCHEMA ORDER BY TABLE_NAME',
] as const;

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
  readonly errorKind?: HanaQueryErrorKind;
  readonly searchedPaths?: readonly string[];
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
  return [
    `${normalizedPrefix}_ORDERS`,
    `${normalizedPrefix}_ITEMS`,
    `${normalizedPrefix}_AUDIT`,
    'DUMMY',
    'M_TABLES',
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

export function buildHanaSqlResultHtml(options: RenderSqlResultOptions): string {
  if (options.result?.kind === 'resultset') {
    return buildResultSetHtml(options, options.result);
  }

  if (options.errorKind === 'hdbsql-missing') {
    return buildHdbsqlMissingHtml(options);
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

function buildHdbsqlMissingHtml(options: RenderSqlResultOptions): string {
  const escapedAppName = escapeHtml(options.appName);
  const escapedExecutedAt = escapeHtml(options.executedAt);
  const escapedSql = escapeHtml(options.sql);
  const rawMessage =
    options.errorMessage ??
    'hdbsql CLI not found. Install the SAP HANA Client and ensure hdbsql is on PATH.';
  const escapedMessage = escapeHtml(rawMessage);
  const searchedItems =
    options.searchedPaths !== undefined && options.searchedPaths.length > 0
      ? options.searchedPaths
          .map((path) => `<li><code>${escapeHtml(path)}</code></li>`)
          .join('')
      : '';
  const searchedSection =
    searchedItems.length > 0
      ? `<section class="state-card">
        <h2>Paths we checked</h2>
        <ul class="state-path-list">${searchedItems}</ul>
        <p class="state-meta-line">
          If your HANA Client lives elsewhere, set
          <code>sapTools.hanaSqlClientPath</code> in VS Code settings to the absolute path of the
          <code>hdbsql</code> binary.
        </p>
      </section>`
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
        min-height: 100vh;
        display: grid;
        grid-template-rows: auto auto auto auto auto;
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
        margin: 0 0 4px;
        font-size: 14px;
      }
      .state-card h2 {
        margin: 0 0 6px;
        font-size: 12px;
        color: #d7e6f9;
      }
      .state-meta-line {
        margin: 4px 0 0;
        font-size: 12px;
        color: #aab7c7;
      }
      .state-message {
        margin: 0 0 6px;
        font-size: 12px;
        line-height: 1.45;
        color: #ff9d9d;
      }
      .state-install ol {
        margin: 4px 0 0;
        padding-left: 18px;
        font-size: 12px;
        line-height: 1.55;
      }
      .state-install li + li {
        margin-top: 4px;
      }
      .state-install code,
      .state-path-list code {
        background: #101724;
        border: 1px solid #23324a;
        border-radius: 4px;
        padding: 1px 5px;
        font-size: 11px;
      }
      .state-path-list {
        margin: 4px 0 0;
        padding-left: 18px;
        font-size: 12px;
        line-height: 1.5;
      }
      .state-sql {
        margin: 0;
        white-space: pre-wrap;
        word-break: break-word;
        font-size: 12px;
        line-height: 1.45;
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
      <section class="state-card state-error">
        <h1>SAP HANA Client Not Found</h1>
        <p class="state-message">${escapedMessage}</p>
        <p class="state-meta-line">
          SAP Tools runs HANA queries through the <code>hdbsql</code> CLI that ships with the SAP
          HANA Client. Install it, then rerun your SQL.
        </p>
      </section>
      <section class="state-card state-install">
        <h2>Install the SAP HANA Client</h2>
        <ol>
          <li>
            Download the SAP HANA Client for your platform from
            <a href="${SAP_HANA_CLIENT_DOWNLOAD_URL}">${SAP_HANA_CLIENT_DOWNLOAD_URL}</a>.
          </li>
          <li>
            Run the installer. Default install paths:
            <ul class="state-path-list">
              <li>macOS: <code>/Applications/sap/hdbclient/hdbsql</code></li>
              <li>Linux: <code>/usr/sap/hdbclient/hdbsql</code></li>
              <li>Windows: <code>C:\\Program Files\\sap\\hdbclient\\hdbsql.exe</code></li>
            </ul>
          </li>
          <li>
            Either add the <code>hdbclient</code> folder to your <code>PATH</code>, or set the VS
            Code setting <code>sapTools.hanaSqlClientPath</code> to the absolute path of the
            <code>hdbsql</code> binary.
          </li>
          <li>Reload the SAP Tools SQL workbench and re-run your query.</li>
        </ol>
      </section>
      ${searchedSection}
      <section class="state-card">
        <pre class="state-sql">${escapedSql}</pre>
      </section>
    </main>
  </body>
</html>`;
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
