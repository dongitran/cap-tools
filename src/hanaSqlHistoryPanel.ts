/**
 * SQL Backup History Panel — a VSCode WebviewPanel that shows past mutation
 * backups with a two-pane layout:
 *   Left: scrollable list of backup entries (newest-first)
 *   Right: SQL statement + data table for the selected entry
 *
 * The panel is self-contained (all CSS/JS inline) and adapts to VSCode dark/light themes
 * via CSS variables.
 */

import * as vscode from 'vscode';
import { randomBytes } from 'node:crypto';
import type { HanaSqlBackupStore, HanaSqlBackupEntry } from './hanaSqlBackupStore';

const HISTORY_PANEL_VIEW_TYPE = 'sapTools.hanaSqlHistory';

type HistoryPanelMessage =
  | { readonly type: 'loadEntries' }
  | { readonly type: 'loadDetail'; readonly id: string }
  | { readonly type: 'copyData'; readonly id: string };

interface EntryDetail {
  readonly sql: string;
  readonly csv: string;
  readonly columns: string[];
  readonly rows: string[][];
}

export class HanaSqlHistoryPanelManager implements vscode.Disposable {
  private panel: vscode.WebviewPanel | null = null;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(private readonly outputChannel: vscode.OutputChannel) {}

  dispose(): void {
    this.panel?.dispose();
    this.panel = null;
    while (this.disposables.length > 0) {
      this.disposables.pop()?.dispose();
    }
  }

  async openOrReveal(backupStore: HanaSqlBackupStore): Promise<void> {
    if (this.panel !== null) {
      this.panel.reveal(vscode.ViewColumn.One);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      HISTORY_PANEL_VIEW_TYPE,
      'SQL Backup History',
      { viewColumn: vscode.ViewColumn.One, preserveFocus: false },
      { enableScripts: true, retainContextWhenHidden: true }
    );

    this.panel = panel;
    panel.webview.html = buildHistoryPanelHtml(createWebviewNonce());

    const panelDisposables: vscode.Disposable[] = [];

    panelDisposables.push(
      panel.webview.onDidReceiveMessage(async (raw: unknown) => {
        const msg = raw as HistoryPanelMessage;
        await this.handlePanelMessage(msg, panel, backupStore);
      })
    );

    panelDisposables.push(
      panel.onDidDispose(() => {
        this.panel = null;
        for (const d of panelDisposables) d.dispose();
      })
    );

    // Initial load
    const entries = await backupStore.listBackups(200);
    void panel.webview.postMessage({ type: 'entriesLoaded', entries: entries.map(serializeEntry) });
  }

  private async handlePanelMessage(
    msg: HistoryPanelMessage,
    panel: vscode.WebviewPanel,
    backupStore: HanaSqlBackupStore
  ): Promise<void> {
    if (msg.type === 'loadEntries') {
      const entries = await backupStore.listBackups(200);
      void panel.webview.postMessage({ type: 'entriesLoaded', entries: entries.map(serializeEntry) });
      return;
    }

    if (msg.type === 'loadDetail') {
      const entries = await backupStore.listBackups(200);
      const entry = entries.find((e) => e.id === msg.id);
      if (entry === undefined) {
        void panel.webview.postMessage({ type: 'detailError', id: msg.id, message: 'Backup entry not found.' });
        return;
      }
      const [sql, csv] = await Promise.all([
        backupStore.readBackupSql(entry),
        backupStore.readBackupCsv(entry),
      ]);
      const { columns, rows } = parseCsvForDisplay(csv ?? '');
      const detail: EntryDetail = { sql: sql ?? '', csv: csv ?? '', columns, rows };
      void panel.webview.postMessage({ type: 'detailLoaded', id: msg.id, detail });
      return;
    }

    const entries = await backupStore.listBackups(200);
    const entry = entries.find((e) => e.id === msg.id);
    if (entry !== undefined) {
      const csv = await backupStore.readBackupCsv(entry);
      if (csv !== null) {
        await vscode.env.clipboard.writeText(csv);
        this.outputChannel.appendLine(`[sql-history] copied backup CSV to clipboard: ${entry.id}`);
        void panel.webview.postMessage({ type: 'copyDone', id: msg.id });
      }
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function serializeEntry(entry: HanaSqlBackupEntry): Record<string, unknown> {
  return {
    id: entry.id,
    timestamp: entry.timestamp,
    timestampLabel: entry.timestampLabel,
    region: entry.region,
    org: entry.org,
    space: entry.space,
    appName: entry.appName,
    statementType: entry.statementType,
    tableName: entry.tableName,
    rowCount: entry.rowCount,
  };
}

function createWebviewNonce(): string {
  return randomBytes(16).toString('base64url');
}

/**
 * Parse a CSV string into columns + rows for table display.
 * Handles RFC 4180 quoting. Limited to first 500 rows for safety.
 */
function parseCsvForDisplay(csv: string): { columns: string[]; rows: string[][] } {
  const lines = csv.split('\n').filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { columns: [], rows: [] };
  const columns = parseCsvLine(lines[0] ?? '');
  const rows = lines.slice(1, 501).map((line) => parseCsvLine(line));
  return { columns, rows };
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let i = 0;
  while (i <= line.length) {
    if (i === line.length) { cells.push(''); break; }
    if (line[i] === '"') {
      let cell = '';
      i += 1;
      while (i < line.length) {
        if (line[i] === '"' && line[i + 1] === '"') { cell += '"'; i += 2; continue; }
        if (line[i] === '"') { i += 1; break; }
        cell += line[i] ?? ''; i += 1;
      }
      cells.push(cell);
      if (line[i] === ',') i += 1;
    } else {
      const comma = line.indexOf(',', i);
      if (comma < 0) { cells.push(line.slice(i)); break; }
      cells.push(line.slice(i, comma));
      i = comma + 1;
    }
  }
  return cells;
}

// ── HTML Builder ──────────────────────────────────────────────────────────────

function buildHistoryPanelHtml(nonce: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>SQL Backup History</title>
  <style nonce="${nonce}">${buildHistoryPanelCss()}</style>
</head>
<body>
  <div id="app" class="app-layout">
    <aside class="sidebar" id="sidebar" role="navigation" aria-label="Backup entries">
      <header class="sidebar-header">
        <h1 class="sidebar-title">
          <span class="sidebar-icon" aria-hidden="true">🕐</span>
          SQL Backup History
        </h1>
        <button class="refresh-btn" id="refresh-btn" type="button" title="Refresh list" aria-label="Refresh backup list">↻</button>
      </header>
      <div class="entry-list" id="entry-list" role="listbox" aria-label="Backup entries">
        <div class="loading-msg" id="loading-msg">Loading…</div>
      </div>
    </aside>
    <main class="detail-pane" id="detail-pane" aria-live="polite">
      <div class="empty-detail" id="empty-detail">
        <div class="empty-icon" aria-hidden="true">📋</div>
        <p>Select a backup entry from the left panel to view details.</p>
      </div>
    </main>
  </div>
  <script nonce="${nonce}">${buildHistoryPanelJs()}</script>
</body>
</html>`;
}

function buildHistoryPanelCss(): string {
  return `
    :root {
      color-scheme: light dark;
      --bg: var(--vscode-editor-background, #1e1e1e);
      --fg: var(--vscode-editor-foreground, #cccccc);
      --border: var(--vscode-panel-border, #3c3c3c);
      --muted: var(--vscode-descriptionForeground, #8b949e);
      --surface: var(--vscode-editor-inactiveSelectionBackground, rgba(128,128,128,0.1));
      --surface-hover: var(--vscode-list-hoverBackground, rgba(128,128,128,0.16));
      --selected: var(--vscode-list-activeSelectionBackground, #0e639c);
      --selected-fg: var(--vscode-list-activeSelectionForeground, #ffffff);
      --accent: var(--vscode-button-background, #0e639c);
      --accent-fg: var(--vscode-button-foreground, #ffffff);
      --success: var(--vscode-testing-iconPassed, #2ea043);
      --error: var(--vscode-testing-iconFailed, #f85149);
      --warn: var(--vscode-editorWarning-foreground, #cca700);
      --font: var(--vscode-font-family, "Segoe WPC", "Segoe UI", sans-serif);
      --mono: var(--vscode-editor-font-family, "Cascadia Code", Menlo, Consolas, monospace);
      --font-size: var(--vscode-font-size, 13px);
      --radius: 6px;
    }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: var(--bg); color: var(--fg); font-family: var(--font); font-size: var(--font-size); height: 100vh; overflow: hidden; }

    /* ── Layout ─────────────────────────────────────────────────────── */
    .app-layout { display: grid; grid-template-columns: 280px 1fr; height: 100vh; }

    /* ── Sidebar ─────────────────────────────────────────────────────── */
    .sidebar { display: flex; flex-direction: column; border-right: 1px solid var(--border); background: var(--surface); overflow: hidden; }
    .sidebar-header { display: flex; align-items: center; gap: 6px; padding: 10px 12px; border-bottom: 1px solid var(--border); min-height: 44px; flex-shrink: 0; }
    .sidebar-title { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); flex: 1; display: flex; align-items: center; gap: 6px; }
    .sidebar-icon { font-size: 14px; }
    .refresh-btn { background: none; border: none; color: var(--muted); cursor: pointer; padding: 4px 6px; border-radius: var(--radius); font-size: 16px; line-height: 1; transition: color 0.15s, background 0.15s; }
    .refresh-btn:hover { color: var(--fg); background: var(--surface-hover); }

    .entry-list { flex: 1; overflow-y: auto; padding: 4px 0; }
    .loading-msg { padding: 16px 12px; color: var(--muted); font-size: 12px; }
    .empty-list-msg { padding: 16px 12px; color: var(--muted); font-size: 12px; }

    .entry-item { display: flex; flex-direction: column; gap: 2px; padding: 8px 12px; cursor: pointer; border-left: 3px solid transparent; transition: background 0.1s, border-color 0.1s; }
    .entry-item:hover { background: var(--surface-hover); }
    .entry-item.is-selected { background: var(--selected); color: var(--selected-fg); border-left-color: var(--accent); }
    .entry-item.is-selected .entry-meta, .entry-item.is-selected .entry-ts { color: var(--selected-fg); opacity: 0.85; }
    .entry-top { display: flex; align-items: center; gap: 6px; }
    .entry-badge { font-size: 10px; font-weight: 700; padding: 1px 5px; border-radius: 3px; text-transform: uppercase; letter-spacing: 0.05em; flex-shrink: 0; }
    .badge-update { background: rgba(14, 99, 156, 0.25); color: #4db8ff; }
    .badge-delete { background: rgba(248, 81, 73, 0.18); color: #f85149; }
    .badge-merge  { background: rgba(46, 160, 67, 0.18); color: #2ea043; }
    .entry-table { font-size: 12px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
    .entry-meta { font-size: 11px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .entry-ts { font-size: 11px; color: var(--muted); }
    .entry-divider { height: 1px; background: var(--border); margin: 2px 0; opacity: 0.5; }

    /* ── Detail pane ─────────────────────────────────────────────────── */
    .detail-pane { display: flex; flex-direction: column; overflow: hidden; }
    .empty-detail { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 12px; color: var(--muted); }
    .empty-icon { font-size: 48px; opacity: 0.5; }

    .detail-layout { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
    .detail-header { padding: 12px 16px; border-bottom: 1px solid var(--border); display: flex; align-items: flex-start; gap: 12px; flex-shrink: 0; }
    .detail-title-block { flex: 1; min-width: 0; }
    .detail-title { font-size: 14px; font-weight: 700; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .detail-chips { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 5px; }
    .chip { font-size: 11px; padding: 2px 7px; border-radius: 10px; background: var(--surface); border: 1px solid var(--border); color: var(--muted); }
    .copy-btn { padding: 6px 12px; border-radius: var(--radius); background: var(--accent); color: var(--accent-fg); border: none; cursor: pointer; font-size: 12px; font-weight: 600; white-space: nowrap; transition: opacity 0.15s; flex-shrink: 0; }
    .copy-btn:hover { opacity: 0.88; }
    .copy-btn.is-copied { background: var(--success); }

    .detail-body { flex: 1; overflow-y: auto; padding: 12px 16px; display: flex; flex-direction: column; gap: 14px; }

    .section-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; color: var(--muted); margin-bottom: 6px; }
    .sql-block { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 10px 12px; font-family: var(--mono); font-size: 12px; white-space: pre-wrap; word-break: break-all; max-height: 200px; overflow-y: auto; line-height: 1.5; }

    /* ── Data table ─────────────────────────────────────────────────── */
    .table-wrap { overflow: auto; border: 1px solid var(--border); border-radius: var(--radius); max-height: calc(100vh - 340px); }
    .data-table { border-collapse: collapse; width: 100%; font-size: 12px; }
    .data-table th, .data-table td { padding: 5px 9px; border-bottom: 1px solid var(--border); white-space: nowrap; text-align: left; }
    .data-table th { background: var(--surface); font-weight: 700; position: sticky; top: 0; z-index: 1; color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; }
    .data-table td.row-num { color: var(--muted); user-select: none; }
    .data-table tr:hover td { background: var(--surface-hover); }
    .data-table tr:last-child td { border-bottom: none; }
    .no-data-msg { color: var(--muted); font-size: 12px; padding: 12px 0; }
    .row-count-label { font-size: 11px; color: var(--muted); margin-top: 4px; }
  `;
}

function buildHistoryPanelJs(): string {
  return `
    (function() {
      const vscode = acquireVsCodeApi();
      let entries = [];
      let selectedId = null;
      let copyTimeout = null;

      const entryList = document.getElementById('entry-list');
      const detailPane = document.getElementById('detail-pane');
      const refreshBtn = document.getElementById('refresh-btn');

      refreshBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'loadEntries' });
        entryList.innerHTML = '<div class="loading-msg">Loading…</div>';
      });

      window.addEventListener('message', (event) => {
        const msg = event.data;
        if (msg.type === 'entriesLoaded') {
          entries = msg.entries;
          renderEntryList();
        } else if (msg.type === 'detailLoaded') {
          renderDetail(msg.id, msg.detail);
        } else if (msg.type === 'detailError') {
          renderDetailError(msg.message);
        } else if (msg.type === 'copyDone') {
          onCopyDone();
        }
      });

      function renderEntryList() {
        if (entries.length === 0) {
          entryList.innerHTML = '<p class="empty-list">No backups found yet.<br/>Backups are created automatically when you run UPDATE, DELETE, or MERGE statements with a WHERE clause.</p>';
          return;
        }
        entryList.innerHTML = entries.map((entry, i) => {
          const badgeClass = 'badge-' + entry.statementType.toLowerCase();
          const isSelected = entry.id === selectedId;
          const divider = i > 0 ? '<div class="entry-divider"></div>' : '';
          return divider + '<div class="entry-item' + (isSelected ? ' is-selected' : '') + '" role="option" aria-selected="' + isSelected + '" data-id="' + escapeAttr(entry.id) + '" tabindex="0">' +
            '<div class="entry-top">' +
              '<span class="entry-badge ' + badgeClass + '">' + escapeHtml(entry.statementType) + '</span>' +
              '<span class="entry-table">' + escapeHtml(entry.tableName) + '</span>' +
            '</div>' +
            '<div class="entry-meta">' + escapeHtml(entry.appName) + ' · ' + escapeHtml(entry.region) + '</div>' +
            '<div class="entry-ts">' + escapeHtml(entry.timestampLabel) + '</div>' +
          '</div>';
        }).join('');

        entryList.querySelectorAll('.entry-item').forEach((el) => {
          el.addEventListener('click', () => selectEntry(el.dataset.id));
          el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') selectEntry(el.dataset.id); });
        });
      }

      function selectEntry(id) {
        if (!id) return;
        selectedId = id;
        renderEntryList();
        detailPane.innerHTML = '<div style="padding:16px;color:var(--muted);font-size:12px;">Loading…</div>';
        vscode.postMessage({ type: 'loadDetail', id });
      }

      function renderDetail(id, detail) {
        const entry = entries.find((e) => e.id === id);
        if (!entry) return;

        const badgeClass = 'badge-' + entry.statementType.toLowerCase();
        const rowLabel = detail.rows.length === 500 ? '500+ rows (showing first 500)' : detail.rows.length + ' row' + (detail.rows.length !== 1 ? 's' : '');

        const tableHtml = detail.columns.length > 0
          ? '<div class="table-wrap"><table class="data-table"><thead><tr>' +
              '<th class="row-num">#</th>' +
              detail.columns.map((c) => '<th>' + escapeHtml(c) + '</th>').join('') +
            '</tr></thead><tbody>' +
              detail.rows.map((row, i) =>
                '<tr><td class="row-num">' + (i + 1) + '</td>' +
                detail.columns.map((_, ci) => '<td>' + escapeHtml(row[ci] ?? '') + '</td>').join('') +
                '</tr>'
              ).join('') +
            '</tbody></table></div>' +
            '<div class="row-count-label">' + escapeHtml(rowLabel) + '</div>'
          : '<p class="no-data-msg">No rows were captured in this backup.</p>';

        detailPane.innerHTML =
          '<div class="detail-layout">' +
            '<div class="detail-header">' +
              '<div class="detail-title-block">' +
                '<div class="detail-title">' +
                  '<span class="entry-badge ' + badgeClass + '">' + escapeHtml(entry.statementType) + '</span>' +
                  escapeHtml(entry.tableName) +
                '</div>' +
                '<div class="detail-chips">' +
                  '<span class="chip">' + escapeHtml(entry.timestampLabel) + '</span>' +
                  '<span class="chip">' + escapeHtml(entry.region) + '</span>' +
                  '<span class="chip">' + escapeHtml(entry.appName) + '</span>' +
                '</div>' +
              '</div>' +
              '<button class="copy-btn" id="copy-btn" type="button">Copy CSV</button>' +
            '</div>' +
            '<div class="detail-body">' +
              '<div><div class="section-label">SQL Statement</div><pre class="sql-block">' + escapeHtml(detail.sql || 'Not available') + '</pre></div>' +
              '<div><div class="section-label">Backed-up Data</div>' + tableHtml + '</div>' +
            '</div>' +
          '</div>';

        const copyBtn = document.getElementById('copy-btn');
        if (copyBtn) {
          copyBtn.addEventListener('click', () => {
            vscode.postMessage({ type: 'copyData', id });
          });
        }
      }

      function renderDetailError(message) {
        detailPane.innerHTML = '<div style="padding:16px;"><p style="color:var(--error);">' + escapeHtml(message) + '</p></div>';
      }

      function onCopyDone() {
        const btn = document.getElementById('copy-btn');
        if (!btn) return;
        btn.textContent = 'Copied!';
        btn.classList.add('is-copied');
        if (copyTimeout) clearTimeout(copyTimeout);
        copyTimeout = setTimeout(() => {
          btn.textContent = 'Copy CSV';
          btn.classList.remove('is-copied');
        }, 2000);
      }

      function escapeHtml(str) {
        return String(str)
          .replaceAll('&', '&amp;')
          .replaceAll('<', '&lt;')
          .replaceAll('>', '&gt;')
          .replaceAll('"', '&quot;');
      }

      function escapeAttr(str) {
        return String(str).replaceAll('"', '&quot;');
      }

      // Trigger initial load
      vscode.postMessage({ type: 'loadEntries' });
    })();
  `;
}
