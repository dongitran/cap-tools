import type { CfApp, CfOrg, LogEntry, LogSessionStatus, SyncProgress } from '../types/index.js';
import { CF_REGIONS } from '../core/regionList.js';

// ─── XSS Helpers ─────────────────────────────────────────────────────────────

function esc(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ─── Region Groups ────────────────────────────────────────────────────────────

const REGION_GROUPS: Array<{ label: string; ids: string[] }> = [
  { label: 'Europe',         ids: ['eu10','eu11','eu20','eu30'] },
  { label: 'North America',  ids: ['us10','us20','us21','us30','ca10'] },
  { label: 'Asia Pacific',   ids: ['ap11','ap12','ap20','ap21','in30','jp10','jp20'] },
  { label: 'South America',  ids: ['br10'] },
];

// ─── Setup Screens ────────────────────────────────────────────────────────────

export function renderRegionScreen(selectedId?: string): string {
  const allRegions = [...CF_REGIONS, { id: 'custom', label: 'Custom endpoint…', apiEndpoint: '' }];
  const sel = selectedId ?? 'ap11';

  const groups = REGION_GROUPS.map(group => {
    const cards = allRegions
      .filter(r => group.ids.includes(r.id))
      .map(r => {
        const isSelected = r.id === sel;
        return `
          <label class="radio-card ${isSelected ? 'selected' : ''}" data-region="${r.id}">
            <input type="radio" name="region" value="${r.id}" ${isSelected ? 'checked' : ''}>
            <span>${r.label}</span>
          </label>`;
      })
      .join('');
    if (cards.length === 0) {return '';}
    return `<div class="region-group">
      <div class="region-group-label">${group.label}</div>
      <div class="radio-grid">${cards}</div>
    </div>`;
  }).join('');

  // Custom endpoint card
  const isCustom = sel === 'custom';
  const customCard = `
    <div class="region-group">
      <div class="region-group-label">Other</div>
      <div class="radio-grid">
        <label class="radio-card ${isCustom ? 'selected' : ''}" data-region="custom" style="grid-column:1/-1">
          <input type="radio" name="region" value="custom" ${isCustom ? 'checked' : ''}>
          <span>Custom endpoint…</span>
        </label>
      </div>
    </div>`;

  return `
    <div class="prereq-card">
      <div class="prereq-title">Before connecting, ensure:</div>
      <div class="prereq-item">
        <span class="prereq-dot"></span>
        <span><code>SAP_EMAIL</code> &amp; <code>SAP_PASSWORD</code> set in shell profile
          (<code>~/.zshrc</code> or <code>~/.bashrc</code>)</span>
      </div>
      <div class="prereq-item">
        <span class="prereq-dot"></span>
        <span>CF CLI installed — <code>cf --version</code> should work in terminal</span>
      </div>
    </div>

    <div class="section-title" style="margin-top:12px">Select SAP BTP Region</div>
    ${groups}
    ${customCard}
    <div class="custom-endpoint ${isCustom ? '' : 'hidden'}" id="customEndpointWrap">
      <input type="text" id="customEndpoint" placeholder="https://api.cf.example.hana.ondemand.com" />
    </div>
    <div style="margin-top:12px">
      <button class="btn btn-primary btn-full" id="btnLogin">
        Connect →
      </button>
    </div>`;
}

export function renderConnectingScreen(regionLabel: string): string {
  return `
    <div class="spinner-wrap">
      <div class="spinner"></div>
      <div style="font-weight:500">Connecting to ${esc(regionLabel)}</div>
      <div style="font-size:11px;opacity:0.6">Authenticating via CF CLI…</div>
    </div>`;
}

export function renderOrgScreen(orgs: CfOrg[]): string {
  if (orgs.length === 0) {
    return `
      <div class="section-title">Select Organization</div>
      <div class="empty-state">
        <div class="empty-state-icon">🏢</div>
        <div>No organizations found.</div>
        <div style="margin-top:4px;opacity:0.7">Check your CF login credentials.</div>
      </div>`;
  }

  const items = orgs
    .map(org => `
      <label class="list-item" data-org="${esc(org.name)}">
        <input type="radio" name="org" value="${esc(org.name)}">
        <span style="flex:1">${esc(org.name)}</span>
      </label>`)
    .join('');

  return `
    <div class="section-header">
      <div class="section-title">Select Organization</div>
      <span style="font-size:11px;color:var(--vscode-descriptionForeground)">${orgs.length} org${orgs.length !== 1 ? 's' : ''}</span>
    </div>
    <div class="search-box">
      <input type="text" id="orgSearch" placeholder="Filter orgs…" autofocus>
    </div>
    <div id="orgList">${items}</div>`;
}

export function renderFolderScreen(orgName: string, mappedPath?: string): string {
  const hasMapped = mappedPath !== undefined;

  return `
    <div class="step-indicator">
      <div class="step-dot done">✓</div>
      <span>Logged in</span>
      <span style="opacity:0.4">›</span>
      <div class="step-dot done">✓</div>
      <span>Org selected</span>
      <span style="opacity:0.4">›</span>
      <div class="step-dot">3</div>
      <span>Map folder</span>
    </div>

    <div class="section-title" style="margin-top:0">Map Local Source Folder</div>
    <div style="margin-bottom:10px;font-size:12px">
      Org: <strong>${esc(orgName)}</strong>
    </div>

    <div class="banner banner-info" style="font-size:11px">
      Select the root folder that contains your local CAP project subfolders:
      <div class="code-sample">~/repos/
  my-app-dev/        ← CF app: my-app-dev
  my-app-staging/    ← CF app: my-app-staging</div>
    </div>

    ${hasMapped
      ? `<div class="banner banner-success" style="word-break:break-all">📂 ${esc(mappedPath)}</div>`
      : ''}

    <button class="btn btn-secondary btn-full" id="btnBrowse" style="margin-bottom:8px">
      📁 Browse for folder…
    </button>
    ${hasMapped
      ? `<button class="btn btn-primary btn-full" id="btnConfirmFolder">
           Continue to Debug →
         </button>`
      : ''}
    <button class="btn btn-ghost btn-full" id="btnSkipFolder" style="margin-top:6px;font-size:11px;opacity:0.7">
      Skip for now
    </button>`;
}

// ─── Dashboard (tabbed) ───────────────────────────────────────────────────────

export function renderDashboardShell(opts: {
  activeTab: 'debug' | 'credentials' | 'logs' | 'settings';
  orgName: string;
  activeSessionCount: number;
  regionId?: string;
  lastSyncedAt?: number;
}): string {
  const tabs: Array<{ id: 'debug' | 'credentials' | 'logs' | 'settings'; label: string }> = [
    { id: 'debug', label: '🐛 Debug' },
    { id: 'credentials', label: '🔑 Creds' },
    { id: 'logs', label: '📋 Logs' },
    { id: 'settings', label: '⚙ Settings' },
  ];

  const tabBtns = tabs
    .map(t => {
      const badge = (t.id === 'debug' && opts.activeSessionCount > 0)
        ? `<span class="tab-badge">${opts.activeSessionCount}</span>`
        : '';
      return `<button class="tab-btn ${t.id === opts.activeTab ? 'active' : ''}" data-tab="${t.id}">${t.label}${badge}</button>`;
    })
    .join('');

  const lastSynced = opts.lastSyncedAt !== undefined
    ? (() => {
        const ago = Math.floor((Date.now() - opts.lastSyncedAt) / 1000);
        if (ago < 60) {return `${ago}s ago`;}
        if (ago < 3600) {return `${Math.floor(ago / 60)}m ago`;}
        return `${Math.floor(ago / 3600)}h ago`;
      })()
    : 'never';

  const contextBar = `
    <div class="context-bar">
      <span class="context-region" title="CF Region">${esc(opts.regionId ?? '—')}</span>
      <span class="context-sep">›</span>
      <span class="context-org" title="${esc(opts.orgName)}">${esc(opts.orgName)}</span>
      <span class="context-sync" title="Last synced">⟳ ${esc(lastSynced)}</span>
    </div>`;

  // Embed org context as data attribute so client-side JS can read it
  return `
    <div class="tab-bar" id="tabBar" data-org-ctx="${esc(opts.orgName)}">${tabBtns}</div>
    ${contextBar}
    <div id="tabContent"></div>`;
}

// ─── Debug Tab ────────────────────────────────────────────────────────────────

export function renderDebugTab(opts: {
  orgName: string;
  apps: Array<{ name: string; state: string }>;
  activeSessions: Array<{ appName: string; status: string; port: number; appUrl?: string; error?: string }>;
  appsError?: string;
}): string {
  const started = opts.apps.filter(a => a.state === 'STARTED');
  const stopped = opts.apps.filter(a => a.state === 'STOPPED');

  const appRow = (app: { name: string; state: string }): string => {
    const isStarted = app.state === 'STARTED';
    const isDebugging = opts.activeSessions.some(s => s.appName === app.name);
    return `
      <label class="list-item ${isDebugging ? 'selected disabled' : ''}" data-app="${esc(app.name)}">
        <input type="checkbox" name="app" value="${esc(app.name)}" ${isDebugging ? 'checked disabled' : ''}>
        <span class="dot dot-${isStarted ? 'started' : 'stopped'}"></span>
        <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(app.name)}</span>
        ${isDebugging ? '<span style="font-size:10px;opacity:0.5">debugging</span>' : ''}
      </label>`;
  };

  const sessionCard = (s: { appName: string; status: string; port: number; appUrl?: string; error?: string }): string => {
    const badge = `<span class="status-badge badge-${esc(s.status.toLowerCase())}">${esc(s.status)}</span>`;
    const stopBtn = `<button class="btn btn-ghost stop-debug-btn" data-app="${esc(s.appName)}" style="padding:2px 6px;font-size:10px;flex-shrink:0" title="Stop session">■</button>`;
    const urlBtn = s.appUrl !== undefined
      ? `<a href="${esc(s.appUrl)}" class="btn btn-ghost" style="padding:2px 6px;font-size:10px;flex-shrink:0" title="Open app URL">🔗</a>`
      : '';
    const envBtn = `<button class="btn-icon view-env-btn" data-app="${esc(s.appName)}" title="View app environment" style="font-size:11px">📋</button>`;
    const errorRow = (s.status === 'ERROR' && s.error !== undefined)
      ? `<div class="session-error-row">⚠ ${esc(s.error)}</div>`
      : '';
    return `
      <div class="session-card">
        <div class="session-card-row">
          <span class="app-name">${esc(s.appName)}</span>
          ${badge}
          <span class="port-badge">:${s.port}</span>
          ${envBtn}${urlBtn}${stopBtn}
        </div>
        ${errorRow}
      </div>`;
  };

  const hasApps = opts.apps.length > 0;
  const hasSessions = opts.activeSessions.length > 0;
  const hasError = opts.appsError !== undefined;

  const appListHtml = hasError ? `
    <div class="section-header">
      <div class="section-title">Apps</div>
      <button class="btn-icon" id="btnRefreshApps" title="Refresh apps">↺</button>
    </div>
    <div class="banner banner-error" style="margin-top:8px">
      <div style="font-weight:600;margin-bottom:4px">Failed to load apps</div>
      <div style="font-size:11px;opacity:0.85">${esc(opts.appsError ?? '')}</div>
      <div style="margin-top:8px;display:flex;gap:8px">
        <button class="btn btn-secondary" style="font-size:11px;padding:4px 10px" id="btnRetryLoadApps">↺ Retry</button>
        <button class="btn btn-ghost" style="font-size:11px;padding:4px 10px" id="btnReLogin">Re-login →</button>
      </div>
    </div>
  ` : hasApps ? `
    <div class="section-header">
      <div class="section-title">Apps</div>
      <button class="btn-icon" id="btnRefreshApps" title="Refresh apps">↺</button>
    </div>
    <div class="search-box">
      <input type="text" id="appSearch" placeholder="Search apps…">
    </div>
    ${started.length > 0 ? `
      <div class="quick-bar">
        <span class="quick-bar-label">${started.length} running</span>
        <button class="btn-icon" id="btnSelectAll" title="Select all running">Select all</button>
        <button class="btn-icon" id="btnClearAll" title="Clear selection">Clear</button>
      </div>
    ` : ''}
    <div id="appList">
      ${started.length > 0 ? `<div class="app-group-header">▶ Running (${started.length})</div>${started.map(appRow).join('')}` : ''}
      ${stopped.length > 0 ? `<div class="app-group-header" style="opacity:0.5">■ Stopped (${stopped.length})</div>${stopped.map(appRow).join('')}` : ''}
    </div>
    <div style="margin-top:10px">
      <button class="btn btn-primary btn-full" id="btnStartDebug">▶ Start Debug</button>
    </div>
  ` : `
    <div class="section-header">
      <div class="section-title">Apps</div>
      <button class="btn-icon" id="btnRefreshApps" title="Refresh apps">↺</button>
    </div>
    <div class="empty-state">
      <div class="empty-state-icon">📭</div>
      <div>No apps found</div>
      <div style="margin-top:4px;opacity:0.7">Check your CF target or try refreshing.</div>
      <button class="btn btn-secondary" style="margin-top:10px;font-size:11px" id="btnRetryLoadApps">↺ Retry</button>
    </div>
  `;

  return `
    <div class="screen active" id="debugScreen">
      <div class="breadcrumb">
        <button class="breadcrumb-btn" id="btnChangeOrg">◀</button>
        <span class="breadcrumb-org" title="${esc(opts.orgName)}">${esc(opts.orgName)}</span>
      </div>

      ${hasSessions ? `
        <div class="section-title">Active Sessions</div>
        <div id="sessionList">${opts.activeSessions.map(sessionCard).join('')}</div>
        ${opts.activeSessions.length > 1
          ? '<button class="btn btn-danger btn-full" style="margin-bottom:12px" id="btnStopAll">■ Stop All Sessions</button>'
          : ''}
        <div class="divider"></div>
      ` : ''}

      ${appListHtml}
    </div>`;
}

// ─── Credentials Tab ──────────────────────────────────────────────────────────

export function renderCredentialsTab(opts: {
  orgName: string;
  spaces: Array<{ name: string }>;
  selectedSpace?: string;
  apps: Array<{ name: string; state: string }>;
  results?: Array<{ appName: string; ok: boolean; error?: string }>;
}): string {
  const spaceOptions = opts.spaces
    .map(s => `<option value="${esc(s.name)}" ${s.name === opts.selectedSpace ? 'selected' : ''}>${esc(s.name)}</option>`)
    .join('');

  const appRows = opts.apps
    .map(a => `
      <label class="list-item" data-app="${esc(a.name)}">
        <input type="checkbox" name="credApp" value="${esc(a.name)}">
        <span class="dot dot-${a.state === 'STARTED' ? 'started' : 'stopped'}"></span>
        <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(a.name)}</span>
      </label>`)
    .join('');

  const resultRows = (opts.results ?? [])
    .map(r => `
      <div class="result-row">
        <span class="result-icon">${r.ok ? '✅' : '❌'}</span>
        <span class="result-app" title="${esc(r.appName)}">${esc(r.appName)}</span>
        <span class="result-status">${r.ok ? 'Extracted' : esc(r.error ?? 'No HANA binding')}</span>
        ${r.ok ? `<button class="btn-icon copy-cred-btn" data-app="${esc(r.appName)}" title="Copy connection JSON">⎘</button>` : ''}
      </div>`)
    .join('');

  const hasResults = opts.results !== undefined && opts.results.length > 0;
  const successCount = hasResults ? (opts.results ?? []).filter(r => r.ok).length : 0;

  return `
    <div class="screen active" id="credsScreen">
      <div class="section-title" style="margin-top:0">Space</div>
      <select id="spaceSelect">
        <option value="">— select space —</option>
        ${spaceOptions}
      </select>

      ${opts.apps.length > 0 ? `
        <div class="section-header">
          <div class="section-title">Select Apps</div>
          <div style="display:flex;gap:6px">
            <button class="btn-icon" id="btnCredSelectAll">All</button>
            <button class="btn-icon" id="btnCredClear">None</button>
          </div>
        </div>
        <div class="search-box">
          <input type="text" id="credSearch" placeholder="Search apps…">
        </div>
        <div id="credAppList">${appRows}</div>
      ` : opts.selectedSpace !== undefined && opts.selectedSpace.length > 0 ? `
        <div class="empty-state" style="padding:16px 0">
          <div class="empty-state-icon">📦</div>
          <div>No apps in this space</div>
        </div>
      ` : ''}

      <div class="section-title">Output Format</div>
      <div style="display:flex;flex-direction:column;gap:4px">
        <label class="list-item">
          <input type="radio" name="credOutput" value="sqltools" checked>
          <span style="flex:1">SQLTools (.vscode/settings.json)</span>
          <span style="font-size:10px;opacity:0.5">recommended</span>
        </label>
        <label class="list-item">
          <input type="radio" name="credOutput" value="json">
          <span>Save as JSON file</span>
        </label>
        <label class="list-item">
          <input type="radio" name="credOutput" value="clipboard">
          <span>Copy to clipboard</span>
        </label>
      </div>

      <button class="btn btn-primary btn-full" style="margin-top:12px" id="btnExtract">
        🔑 Extract Credentials
      </button>

      ${hasResults ? `
        <div class="divider"></div>
        <div class="section-header">
          <div class="section-title">Results</div>
          <span style="font-size:11px;color:${successCount > 0 ? '#3fb950' : 'var(--vscode-descriptionForeground)'}">
            ${successCount}/${(opts.results ?? []).length} ok
          </span>
        </div>
        <div>${resultRows}</div>
      ` : ''}
    </div>`;
}

// ─── Logs Tab ─────────────────────────────────────────────────────────────────

/** Embed arbitrary data as JSON in HTML safely (escapes </> to prevent XSS). */
function safeJson(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

function formatLogTime(ts: string): string {
  const m = /T(\d{2}:\d{2}:\d{2})/.exec(ts);
  return m ? m[1] : ts.slice(0, 8);
}

function renderLogEntryHtml(entry: LogEntry): string {
  const ts = formatLogTime(entry.timestamp);
  const levelCls = entry.level !== undefined ? `lvl-${entry.level}` : '';
  const srcCls = `src-${entry.sourceType.toLowerCase()}`;
  const streamCls = entry.stream === 'ERR' ? 'log-err' : '';
  const msg = entry.message.trim();
  const hasJson = entry.jsonData !== undefined;

  let jsonHtml = '';
  if (entry.jsonData !== undefined) {
    const rows = Object.entries(entry.jsonData)
      .slice(0, 40)
      .map(([k, v]) => {
        const val = typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v);
        return `<tr><td class="json-k">${esc(k)}</td><td class="json-v">${esc(val)}</td></tr>`;
      })
      .join('');
    jsonHtml = `<div class="log-json-body hidden"><table class="log-json-tbl">${rows}</table></div>`;
  }

  const expandBtn = hasJson
    ? `<button class="log-expand" title="Expand JSON">▶</button>`
    : `<span class="log-no-expand"></span>`;

  const displayMsg = msg.length > 400 ? `${esc(msg.slice(0, 400))}<span class="log-msg-truncated">…</span>` : esc(msg);
  const searchText = esc(`${entry.sourceType} ${entry.level ?? ''} ${msg}`.toLowerCase());

  return `<div class="log-entry ${levelCls} ${srcCls} ${streamCls}${hasJson ? ' has-json' : ''}" data-src="${entry.sourceType}" data-lvl="${entry.level ?? ''}" data-txt="${searchText}">
    <div class="log-row">${expandBtn}<span class="log-ts">${esc(ts)}</span><span class="log-src-badge src-badge-${entry.sourceType.toLowerCase()}">${esc(entry.sourceType)}</span><span class="log-msg">${displayMsg}</span></div>
    ${jsonHtml}
  </div>`;
}

export function renderLogsTab(opts: {
  apps: CfApp[];
  selectedApp?: string;
  logEntries: LogEntry[];
  logStatus: LogSessionStatus;
  logError?: string;
}): string {
  const appOptions = opts.apps
    .filter(a => a.state === 'STARTED')
    .map(a => `<option value="${esc(a.name)}"${a.name === opts.selectedApp ? ' selected' : ''}>${esc(a.name)}</option>`)
    .join('');

  const stoppedOptions = opts.apps
    .filter(a => a.state === 'STOPPED')
    .map(a => `<option value="${esc(a.name)}"${a.name === opts.selectedApp ? ' selected' : ''} class="log-app-stopped">${esc(a.name)} (stopped)</option>`)
    .join('');

  const isStreaming = opts.logStatus === 'STREAMING' || opts.logStatus === 'CONNECTING';
  const statusMeta = (() => {
    if (opts.logStatus === 'CONNECTING') {
      return `<span class="log-status-pill pill-connecting"><span class="log-live-dot"></span>Connecting…</span>`;
    }
    if (opts.logStatus === 'STREAMING') {
      return `<span class="log-status-pill pill-live"><span class="log-live-dot"></span>Live</span>`;
    }
    if (opts.logStatus === 'ERROR') {
      return `<span class="log-status-pill pill-error">✕ Error</span>`;
    }
    if (opts.logStatus === 'STOPPED') {
      return `<span class="log-status-pill pill-stopped">■ Stopped</span>`;
    }
    return `<span class="log-status-pill pill-idle">○ Idle</span>`;
  })();

  const errorBanner = (opts.logStatus === 'ERROR' && opts.logError !== undefined)
    ? `<div class="banner banner-error" style="margin:6px 0;font-size:11px">⚠ ${esc(opts.logError)}</div>`
    : '';

  const emptyState = opts.apps.length === 0
    ? `<div class="empty-state" style="padding:20px 0"><div class="empty-state-icon">📋</div><div>No apps loaded</div><div style="margin-top:4px;opacity:0.7;font-size:11px">Switch to Debug tab to load apps first.</div></div>`
    : '';

  const entriesHtml = opts.logEntries.map(renderLogEntryHtml).join('');

  const initMeta = safeJson({
    selectedApp: opts.selectedApp ?? '',
    status: opts.logStatus,
    ...(opts.logError !== undefined ? { error: opts.logError } : {}),
  });

  return `
    <div class="screen active" id="logsScreen">
      <!-- Toolbar: App selector + action buttons -->
      <div class="logs-toolbar">
        <select id="logAppSelect" ${isStreaming ? 'disabled' : ''}>
          <option value="">— select app —</option>
          ${appOptions}
          ${stoppedOptions}
        </select>
        <div class="logs-btn-group">
          <button id="btnLiveLogs" class="btn btn-primary logs-action-btn${isStreaming ? ' hidden' : ''}" title="Stream live logs">▶ Live</button>
          <button id="btnRecentLogs" class="btn btn-secondary logs-action-btn${isStreaming ? ' hidden' : ''}" title="Load recent logs">📄 Recent</button>
          <button id="btnStopLogs" class="btn btn-danger logs-action-btn${isStreaming ? '' : ' hidden'}" title="Stop streaming">■ Stop</button>
        </div>
      </div>

      ${errorBanner}
      ${emptyState}

      <!-- Filter bar -->
      <div class="logs-filter-bar">
        <div class="logs-filter-row">
          <div class="search-box logs-search" style="flex:1;margin-bottom:0">
            <input type="text" id="logSearchInput" placeholder="Filter logs…">
          </div>
          <select id="logSrcFilter" title="Filter by source" class="logs-filter-select">
            <option value="">All sources</option>
            <option value="APP">APP</option>
            <option value="RTR">RTR</option>
            <option value="API">API</option>
            <option value="CELL">CELL</option>
            <option value="SSH">SSH</option>
            <option value="STG">STG</option>
            <option value="LGR">LGR</option>
          </select>
          <select id="logLvlFilter" title="Filter by level" class="logs-filter-select">
            <option value="">All levels</option>
            <option value="fatal">Fatal</option>
            <option value="error">Error</option>
            <option value="warn">Warn</option>
            <option value="info">Info</option>
            <option value="debug">Debug</option>
          </select>
        </div>
        <div class="logs-meta-bar">
          <label class="logs-autoscroll-label" title="Auto-scroll to newest entries">
            <input type="checkbox" id="logAutoScroll" checked>
            <span>Auto-scroll</span>
          </label>
          <span id="logStatusMeta">${statusMeta}</span>
          <span id="logCountBadge" class="log-count-badge">0 entries</span>
          <button class="btn-icon" id="btnClearLogs" title="Clear all logs">🗑</button>
          <button class="btn-icon" id="btnExportLogs" title="Export logs as text">💾</button>
        </div>
      </div>

      <!-- Log stream container -->
      <div id="logContainer" class="log-container">
        ${entriesHtml}
      </div>
    </div>
    <script id="__logMeta" type="application/json">${initMeta}</script>`;
}

// ─── Settings Tab ─────────────────────────────────────────────────────────────

export function renderSettingsTab(opts: {
  autoSync: boolean;
  syncInterval: number;
  sqlToolsIntegration: boolean;
  syncProgress: SyncProgress;
  defaultRegion: string;
  cacheStats?: { regions: number; orgs: number; apps: number };
  lastSyncedAt?: number;
}): string {
  const syncStatus = (() => {
    const p = opts.syncProgress;
    if (p.status === 'running') {
      return `<span style="color:#fbbe00">⟳ Syncing… ${p.done}/${p.total} orgs</span>`;
    }
    if (p.status === 'done') {return `<span style="color:#3fb950">✓ Synced</span>`;}
    if (p.status === 'error') {return `<span style="color:#f85149">✕ ${esc(p.error ?? 'Error')}</span>`;}
    return `<span style="opacity:0.5">—</span>`;
  })();

  const lastSynced = opts.lastSyncedAt !== undefined
    ? (() => {
        const agoSec = Math.floor((Date.now() - opts.lastSyncedAt) / 1000);
        if (agoSec < 60) {return `${agoSec}s ago`;}
        if (agoSec < 3600) {return `${Math.floor(agoSec / 60)}m ago`;}
        return `${Math.floor(agoSec / 3600)}h ago`;
      })()
    : undefined;

  const regionOptions = CF_REGIONS.map(r =>
    `<option value="${r.id}" ${r.id === opts.defaultRegion ? 'selected' : ''}>${r.label}</option>`,
  ).join('');

  const stats = opts.cacheStats;

  return `
    <div class="screen active" id="settingsScreen">
      <div class="section-title" style="margin-top:0">Cache</div>

      ${stats !== undefined ? `
        <div class="stats-row">
          <span class="stat-chip">🌐 ${stats.regions} region${stats.regions !== 1 ? 's' : ''}</span>
          <span class="stat-chip">🏢 ${stats.orgs} org${stats.orgs !== 1 ? 's' : ''}</span>
          <span class="stat-chip">📦 ${stats.apps} app${stats.apps !== 1 ? 's' : ''}</span>
        </div>
      ` : ''}

      <div class="toggle-row" style="padding-top:0">
        <div class="sync-meta">
          <span>Status: ${syncStatus}</span>
          ${lastSynced !== undefined ? `<span style="opacity:0.5">· ${esc(lastSynced)}</span>` : ''}
        </div>
        <button class="btn btn-secondary" id="btnSyncNow" style="font-size:11px;padding:4px 10px">
          ↺ Sync Now
        </button>
      </div>

      <div class="toggle-row">
        <div>
          <div class="toggle-label">Auto-sync on startup</div>
          <div class="toggle-sub">Fetch all CF apps when extension loads</div>
        </div>
        <label class="toggle">
          <input type="checkbox" id="toggleAutoSync" ${opts.autoSync ? 'checked' : ''}>
          <span class="toggle-track"></span>
        </label>
      </div>

      <div class="toggle-row">
        <div>
          <div class="toggle-label">Sync interval</div>
          <div class="toggle-sub">Minutes between background syncs</div>
        </div>
        <div class="stepper">
          <button class="stepper-btn" data-delta="-30">−</button>
          <input type="number" id="syncInterval" value="${opts.syncInterval}" min="30" max="1440"
            style="width:58px;text-align:center">
          <button class="stepper-btn" data-delta="30">+</button>
        </div>
      </div>

      <div class="divider"></div>
      <div class="section-title">Integration</div>

      <div class="toggle-row">
        <div>
          <div class="toggle-label">SQLTools integration</div>
          <div class="toggle-sub">Auto-write HANA connections to .vscode/settings.json</div>
        </div>
        <label class="toggle">
          <input type="checkbox" id="toggleSqlTools" ${opts.sqlToolsIntegration ? 'checked' : ''}>
          <span class="toggle-track"></span>
        </label>
      </div>

      <div class="section-title">Default Region</div>
      <select id="defaultRegionSelect">${regionOptions}</select>

      <div class="divider"></div>
      <div class="section-title">Danger Zone</div>
      <button class="btn btn-danger btn-full" id="btnReset">
        🗑 Reset All Configuration
      </button>
      <p style="font-size:11px;opacity:0.5;margin-top:6px;text-align:center">
        Clears login, org mappings, and all cached app data.
      </p>
    </div>`;
}
