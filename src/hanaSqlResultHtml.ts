import type { HanaQueryResult, HanaQueryResultSet } from './hanaSqlService';

export const SQL_RESULT_ROWS_LIMIT = 250;

export interface RenderSqlResultOptions {
  readonly appName: string;
  readonly tableName?: string;
  readonly sql: string;
  readonly executedAt: string;
  readonly isLoading?: boolean;
  readonly nonce?: string;
  readonly result?: HanaQueryResult;
  readonly errorMessage?: string;
}

const SHARED_THEME_STYLE = `
      :root {
        color-scheme: light dark;
        font-family: var(--vscode-font-family, "Segoe WPC", "Segoe UI", sans-serif);
        --saptools-bg: var(--vscode-editor-background, #1e1e1e);
        --saptools-fg: var(--vscode-editor-foreground, #cccccc);
        --saptools-border: var(--vscode-panel-border, var(--vscode-editorWidget-border, #3c3c3c));
        --saptools-muted: var(
          --vscode-descriptionForeground,
          var(--vscode-editorLineNumber-foreground, #8b949e)
        );
        --saptools-surface: var(--vscode-editor-inactiveSelectionBackground, rgba(128, 128, 128, 0.12));
        --saptools-surface-strong: var(--vscode-editor-selectionBackground, rgba(128, 128, 128, 0.18));
      }
      body {
        margin: 0;
        min-height: 100vh;
        background: var(--saptools-bg);
        color: var(--saptools-fg);
      }
`;

const STATE_RESULT_STYLE = `${SHARED_THEME_STYLE}
      :root {
        --saptools-success: var(--vscode-testing-iconPassed, #2ea043);
        --saptools-error: var(--vscode-testing-iconFailed, #f85149);
      }
      .state-layout {
        display: grid;
        grid-template-rows: auto auto auto;
        gap: 6px;
        padding: 6px;
      }
      .state-card {
        border: 1px solid var(--saptools-border);
        border-radius: 6px;
        background: var(--saptools-surface);
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
        color: var(--saptools-muted);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .state-message,
      .state-sql {
        margin: 0;
        white-space: pre-wrap;
        word-break: break-word;
        font-size: 12px;
        line-height: 1.45;
      }
      .state-success h1 { color: var(--saptools-success); }
      .state-error h1 { color: var(--saptools-error); }
`;

const LOADING_RESULT_STYLE = `${SHARED_THEME_STYLE}
      :root {
        --saptools-accent: var(--vscode-progressBar-background, var(--vscode-focusBorder, #0078d4));
      }
      .result-loading-layout {
        min-height: 100vh;
        display: grid;
        grid-template-rows: auto minmax(0, 1fr) auto;
      }
      .result-loading-toolbar,
      .result-loading-sql {
        padding: 6px;
        border-bottom: 1px solid var(--saptools-border);
        background: var(--saptools-surface);
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }
      .result-loading-chip {
        border: 1px solid var(--saptools-border);
        border-radius: 999px;
        padding: 2px 8px;
        font-size: 12px;
      }
      .result-loading-state {
        display: grid;
        place-items: center;
        place-content: center;
        gap: 14px;
        min-height: 0;
        color: var(--saptools-muted);
        font-size: 13px;
        font-weight: 600;
      }
      .result-loading-spinner {
        width: 42px;
        height: 42px;
        border: 4px solid color-mix(in oklab, var(--saptools-border) 70%, transparent);
        border-top-color: var(--saptools-accent);
        border-radius: 999px;
        animation: saptools-result-spin 780ms linear infinite;
      }
      .result-loading-sql {
        border-top: 1px solid var(--saptools-border);
        border-bottom: 0;
        color: var(--saptools-muted);
        font-size: 12px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      @keyframes saptools-result-spin { to { transform: rotate(360deg); } }
      @media (prefers-reduced-motion: reduce) {
        .result-loading-spinner { animation: none; }
      }
`;

const RESULT_SET_STYLE = `${SHARED_THEME_STYLE}
      .result-layout { height: 100vh; display: grid; grid-template-rows: auto minmax(0, 1fr); }
      :root {
        --saptools-row-hover: var(--vscode-list-hoverBackground, var(--saptools-surface-strong));
      }
      .result-toolbar {
        padding: 6px;
        border-bottom: 1px solid var(--saptools-border);
        background: var(--saptools-surface);
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        align-items: center;
      }
      .result-toolbar-spacer { flex: 1 1 auto; }
      .result-chip {
        border: 1px solid var(--saptools-border);
        border-radius: 999px;
        padding: 2px 8px;
        font-size: 12px;
        color: var(--saptools-fg);
        background: var(--saptools-surface-strong);
      }
      .result-chip.note { color: var(--saptools-muted); }
      .result-export-menu { position: relative; flex: 0 0 auto; margin-left: auto; }
      .result-export-trigger,
      .result-export-list button { font: inherit; }
      .result-export-trigger {
        border: 1px solid var(--saptools-border);
        border-radius: 6px;
        padding: 3px 9px;
        color: var(--saptools-fg);
        background: var(--saptools-surface-strong);
        cursor: pointer;
      }
      .result-export-trigger:hover { border-color: var(--vscode-focusBorder, var(--saptools-border)); }
      .result-export-list {
        position: absolute;
        z-index: 4;
        top: calc(100% + 5px);
        right: 0;
        display: grid;
        min-width: 132px;
        padding: 5px;
        border: 1px solid var(--saptools-border);
        border-radius: 6px;
        background: var(--saptools-bg);
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.22);
      }
      .result-export-list[hidden] { display: none; }
      .result-export-list button {
        border: 0;
        border-radius: 4px;
        padding: 6px 8px;
        color: var(--saptools-fg);
        background: transparent;
        text-align: left;
        cursor: pointer;
      }
      .result-export-list button:hover { background: var(--saptools-surface-strong); }
      .result-table-wrap { min-height: 0; overflow: auto; }
      table { width: max-content; min-width: 100%; border-collapse: collapse; table-layout: auto; font-size: 12px; }
      tbody tr { transition: background-color 120ms ease; }
      tbody tr:hover td { background: var(--saptools-row-hover); }
      th,
      td {
        border-bottom: 1px solid var(--saptools-border);
        padding: 6px 8px;
        text-align: left;
        vertical-align: top;
        white-space: pre;
        overflow: visible;
        text-overflow: clip;
      }
      th {
        position: sticky;
        top: 0;
        z-index: 1;
        color: var(--saptools-fg);
        background: var(--saptools-bg);
        font-weight: 600;
      }
      tbody tr:nth-child(even) { background: var(--saptools-surface); }
      .row-number { width: 52px; color: var(--saptools-muted); }
      .result-context-menu {
        position: fixed;
        z-index: 5;
        display: grid;
        min-width: 148px;
        padding: 5px;
        border: 1px solid var(--saptools-border);
        border-radius: 6px;
        background: var(--saptools-bg);
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.22);
      }
      .result-context-menu[hidden] { display: none; }
      .result-context-menu button {
        border: 0;
        border-radius: 4px;
        padding: 6px 8px;
        color: var(--saptools-fg);
        background: transparent;
        text-align: left;
        cursor: pointer;
        font: inherit;
      }
      .result-context-menu button:hover { background: var(--saptools-surface-strong); }
`;

const RESULT_ACTION_SCRIPT = `
(() => {
  const vscode = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null;
  const trigger = document.querySelector('[data-role="result-export-trigger"]');
  const list = document.querySelector('[data-role="result-export-list"]');
  const contextMenu = document.querySelector('[data-role="sql-result-context-menu"]');
  if (
    !(trigger instanceof HTMLButtonElement) ||
    !(list instanceof HTMLElement) ||
    !(contextMenu instanceof HTMLElement)
  ) return;
  let selectedContext = null;
  const setMenuOpen = (isOpen) => {
    list.hidden = !isOpen;
    trigger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  };
  const closeContextMenu = () => {
    selectedContext = null;
    contextMenu.hidden = true;
    contextMenu.removeAttribute('data-row-index');
    contextMenu.removeAttribute('data-column-index');
  };
  const readIndex = (value) => {
    const parsed = Number.parseInt(value ?? '', 10);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
  };
  const positionContextMenu = (event) => {
    contextMenu.hidden = false;
    const left = Math.min(event.clientX, Math.max(8, window.innerWidth - contextMenu.offsetWidth - 8));
    const top = Math.min(event.clientY, Math.max(8, window.innerHeight - contextMenu.offsetHeight - 8));
    contextMenu.style.left = String(Math.max(8, left)) + 'px';
    contextMenu.style.top = String(Math.max(8, top)) + 'px';
  };
  document.addEventListener('contextmenu', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const cell = target.closest('[data-role="sql-result-cell"]');
    if (!(cell instanceof HTMLElement)) {
      closeContextMenu();
      return;
    }
    const rowIndex = readIndex(cell.dataset.rowIndex);
    const columnIndex = readIndex(cell.dataset.columnIndex);
    if (rowIndex === null || columnIndex === null) return;
    event.preventDefault();
    setMenuOpen(false);
    selectedContext = { rowIndex, columnIndex };
    contextMenu.dataset.rowIndex = String(rowIndex);
    contextMenu.dataset.columnIndex = String(columnIndex);
    positionContextMenu(event);
  });
  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target === trigger || trigger.contains(target)) {
      closeContextMenu();
      setMenuOpen(list.hidden);
      return;
    }
    const actionButton = target.closest('[data-action]');
    if (actionButton instanceof HTMLButtonElement) {
      const action = actionButton.dataset.action ?? '';
      if (action === 'copyRowObject' || action === 'copyCellValue') {
        if (selectedContext !== null) {
          vscode?.postMessage({ type: 'sapTools.sqlResultExportAction', action, ...selectedContext });
        }
        closeContextMenu();
        setMenuOpen(false);
        return;
      }
      setMenuOpen(false);
      closeContextMenu();
      vscode?.postMessage({ type: 'sapTools.sqlResultExportAction', action });
      return;
    }
    setMenuOpen(false);
    closeContextMenu();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    setMenuOpen(false);
    closeContextMenu();
  });
})();
`;

export function buildHanaSqlResultHtml(options: RenderSqlResultOptions): string {
  if (options.isLoading === true) {
    return buildLoadingResultHtml(options);
  }
  if (options.result?.kind === 'resultset') {
    return buildResultSetHtml(options, options.result);
  }
  return buildStateResultHtml(options);
}

function buildStateResultHtml(options: RenderSqlResultOptions): string {
  const hasStatusResult = options.result?.kind === 'status';
  const tableName = resolveSqlResultTableName(options);
  const stateTitle = hasStatusResult ? 'Statement Executed' : 'Execution Error';
  const stateMessage = hasStatusResult
    ? escapeHtml(options.result.message)
    : escapeHtml(options.errorMessage ?? 'Query execution failed.');
  const elapsedLine = hasStatusResult
    ? `<p class="state-meta-line">Elapsed: ${String(options.result.elapsedMs)} ms</p>`
    : '';
  const stateToneClass = hasStatusResult ? 'state-success' : 'state-error';

  return wrapResultDocument(options.nonce, STATE_RESULT_STYLE, `
    <main class="state-layout">
      <section class="state-card state-meta">
        <p class="state-meta-line">Table: ${escapeHtml(tableName)}</p>
      </section>
      <section class="state-card ${stateToneClass}">
        <h1>${stateTitle}</h1>
        <p class="state-message">${stateMessage}</p>
        ${elapsedLine}
      </section>
      <section class="state-card">
        <pre class="state-sql">${escapeHtml(options.sql)}</pre>
      </section>
    </main>
  `);
}

function buildLoadingResultHtml(options: RenderSqlResultOptions): string {
  const tableName = resolveSqlResultTableName(options);
  return wrapResultDocument(options.nonce, LOADING_RESULT_STYLE, `
    <main class="result-loading-layout" aria-busy="true">
      <header class="result-loading-toolbar">
        <span class="result-loading-chip">Table: ${escapeHtml(tableName)}</span>
        <span class="result-loading-chip">Started: ${escapeHtml(options.executedAt)}</span>
      </header>
      <section class="result-loading-state" role="status" aria-live="polite">
        <span class="result-loading-spinner" aria-hidden="true"></span>
        <span>Running SQL query…</span>
      </section>
      <footer class="result-loading-sql">${escapeHtml(options.sql)}</footer>
    </main>
  `);
}

function buildResultSetHtml(
  options: RenderSqlResultOptions,
  result: HanaQueryResultSet
): string {
  const rows = result.rows.slice(0, SQL_RESULT_ROWS_LIMIT);
  return wrapResultDocument(
    options.nonce,
    RESULT_SET_STYLE,
    `
    <main class="result-layout">
      ${renderResultToolbar(options, result)}
      <div class="result-table-wrap">
        ${renderResultTable(result.columns, rows)}
      </div>
      ${renderResultContextMenu()}
    </main>
    ${buildResultActionScript(options.nonce)}
  `
  );
}

function renderResultToolbar(
  options: RenderSqlResultOptions,
  result: HanaQueryResultSet
): string {
  const tableName = resolveSqlResultTableName(options);
  const truncatedNote = result.rows.length > SQL_RESULT_ROWS_LIMIT
    ? `Showing first ${String(SQL_RESULT_ROWS_LIMIT)} rows of ${String(result.rows.length)}.`
    : '';
  const note = truncatedNote.length > 0
    ? `<span class="result-chip note">${truncatedNote}</span>`
    : '';

  return `<header class="result-toolbar">
        <span class="result-chip">Table: ${escapeHtml(tableName)}</span>
        <span class="result-chip">Rows: ${String(result.rowCount)}</span>
        <span class="result-chip">Elapsed: ${String(result.elapsedMs)} ms</span>
        ${note}
        <span class="result-toolbar-spacer" aria-hidden="true"></span>
        ${renderResultExportMenu()}
      </header>`;
}

function resolveSqlResultTableName(options: RenderSqlResultOptions): string {
  const tableName = options.tableName?.trim() ?? '';
  return tableName.length > 0 ? tableName : 'SQL statement';
}

function renderResultExportMenu(): string {
  return `<div class="result-export-menu" data-role="result-export-menu">
          <button type="button" class="result-export-trigger" data-role="result-export-trigger" aria-haspopup="menu" aria-expanded="false">Export result</button>
          <div class="result-export-list" data-role="result-export-list" role="menu" hidden>
            <button type="button" role="menuitem" data-action="copyCsv">Copy CSV</button>
            <button type="button" role="menuitem" data-action="copyJson">Copy JSON</button>
            <button type="button" role="menuitem" data-action="exportCsv">Export CSV</button>
            <button type="button" role="menuitem" data-action="exportJson">Export JSON</button>
          </div>
        </div>`;
}

function wrapResultDocument(nonce: string | undefined, style: string, body: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    ${buildWebviewCspMeta(nonce)}
    <title>SAP Tools SQL Result</title>
    <style${buildNonceAttribute(nonce)}>${style}
    </style>
  </head>
  <body>${body}
  </body>
</html>`;
}

function buildWebviewCspMeta(nonce: string | undefined): string {
  if (nonce === undefined || nonce.length === 0) {
    return '';
  }
  const escapedNonce = escapeHtml(nonce);
  return `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${escapedNonce}'; script-src 'nonce-${escapedNonce}';" />`;
}

function buildNonceAttribute(nonce: string | undefined): string {
  if (nonce === undefined || nonce.length === 0) {
    return '';
  }
  return ` nonce="${escapeHtml(nonce)}"`;
}

function buildResultActionScript(nonce: string | undefined): string {
  if (nonce === undefined || nonce.length === 0) {
    return '';
  }
  return `<script nonce="${escapeHtml(nonce)}">${RESULT_ACTION_SCRIPT}</script>`;
}

function renderResultTable(columns: readonly string[], rows: readonly string[][]): string {
  const headerCells = [
    '<th class="row-number">#</th>',
    ...columns.map((column) => `<th>${escapeHtml(column)}</th>`),
  ].join('');
  const bodyRows = rows.map(renderResultRow(columns)).join('');

  return `
    <table>
      <thead><tr>${headerCells}</tr></thead>
      <tbody>${bodyRows}</tbody>
    </table>
  `;
}

function renderResultRow(columns: readonly string[]): (row: readonly string[], index: number) => string {
  return (row, rowIndex) => {
    const rowCells = columns
      .map((_, index) => {
        return `<td data-role="sql-result-cell" data-row-index="${String(rowIndex)}" data-column-index="${String(index)}">${escapeHtml(row[index] ?? '')}</td>`;
      })
      .join('');
    return `<tr data-role="sql-result-row" data-row-index="${String(rowIndex)}"><td class="row-number">${String(rowIndex + 1)}</td>${rowCells}</tr>`;
  };
}

function renderResultContextMenu(): string {
  return `<div class="result-context-menu" data-role="sql-result-context-menu" role="menu" hidden>
        <button type="button" role="menuitem" data-action="copyRowObject">Copy row object</button>
        <button type="button" role="menuitem" data-action="copyCellValue">Copy cell value</button>
      </div>`;
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
