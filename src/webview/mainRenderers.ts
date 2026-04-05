import type { CfOrg, SyncProgress } from '../types/index.js';
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

// ─── Setup Screens ────────────────────────────────────────────────────────────

export function renderRegionScreen(selectedId?: string): string {
  const regions = [...CF_REGIONS, { id: 'custom', label: 'Custom endpoint...', apiEndpoint: '' }];

  const cards = regions
    .map(r => {
      const sel = r.id === (selectedId ?? 'ap11') ? 'selected' : '';
      return `
        <label class="radio-card ${sel}" data-region="${r.id}">
          <input type="radio" name="region" value="${r.id}" ${sel ? 'checked' : ''}>
          <span>${r.label}</span>
        </label>`;
    })
    .join('');

  return `
    <div class="section-title">Select Region</div>
    <div class="radio-grid" id="regionGrid">${cards}</div>
    <div class="custom-endpoint hidden" id="customEndpointWrap">
      <input type="text" id="customEndpoint" placeholder="https://api.cf.example.hana.ondemand.com" />
    </div>
    <div style="margin-top:12px">
      <button class="btn btn-primary btn-full" id="btnLogin">
        Connect
      </button>
    </div>
    <div class="banner banner-info" style="margin-top:12px;font-size:11px">
      Reads <code>SAP_EMAIL</code> and <code>SAP_PASSWORD</code> from your shell environment.
    </div>`;
}

export function renderConnectingScreen(regionLabel: string): string {
  return `
    <div class="spinner-wrap">
      <div class="spinner"></div>
      <div>Connecting to ${esc(regionLabel)}…</div>
      <div style="font-size:11px;opacity:0.6">Reading credentials from shell environment</div>
    </div>`;
}

export function renderOrgScreen(orgs: CfOrg[]): string {
  const items = orgs
    .map(org => `
      <label class="list-item" data-org="${esc(org.name)}">
        <input type="radio" name="org" value="${esc(org.name)}">
        <span>${esc(org.name)}</span>
      </label>`)
    .join('');

  return `
    <div class="section-title">Select Organization</div>
    <div class="search-box">
      <input type="text" id="orgSearch" placeholder="Filter orgs…" oninput="filterOrgs(this.value)">
    </div>
    <div id="orgList">${items}</div>`;
}

export function renderFolderScreen(orgName: string, mappedPath?: string): string {
  const hint = mappedPath !== undefined
    ? `<div class="banner banner-success">📂 ${mappedPath}</div>`
    : `<div class="banner banner-info" style="font-size:11px">
         Select the root folder containing your local CAP project folders.<br>
         Example: <code>~/repos/</code> containing <code>my-svc-a/</code>, <code>my-svc-b/</code>
       </div>`;

  return `
    <div class="section-title">Map Local Folder</div>
    <div style="margin-bottom:10px;font-size:12px">
      Org: <strong>${esc(orgName)}</strong>
    </div>
    ${hint}
    <button class="btn btn-secondary btn-full" id="btnBrowse" style="margin-bottom:8px">
      📁 Browse…
    </button>
    ${mappedPath !== undefined
      ? `<button class="btn btn-primary btn-full" id="btnConfirmFolder">
           Continue →
         </button>`
      : ''}`;
}

// ─── Dashboard (tabbed) ───────────────────────────────────────────────────────

export function renderDashboardShell(activeTab: 'debug' | 'credentials' | 'settings'): string {
  const tabs: Array<{ id: 'debug' | 'credentials' | 'settings'; label: string }> = [
    { id: 'debug', label: '🐛 Debug' },
    { id: 'credentials', label: '🔑 Creds' },
    { id: 'settings', label: '⚙ Settings' },
  ];

  const tabBtns = tabs
    .map(t => `<button class="tab-btn ${t.id === activeTab ? 'active' : ''}" data-tab="${t.id}">${t.label}</button>`)
    .join('');

  return `
    <div class="tab-bar" id="tabBar">${tabBtns}</div>
    <div id="tabContent"></div>`;
}

// ─── Debug Tab ────────────────────────────────────────────────────────────────

export function renderDebugTab(opts: {
  orgName: string;
  apps: Array<{ name: string; state: string }>;
  activeSessions: Array<{ appName: string; status: string; port: number; appUrl?: string; error?: string }>;
}): string {
  const started = opts.apps.filter(a => a.state === 'STARTED');
  const stopped = opts.apps.filter(a => a.state === 'STOPPED');

  const appRow = (app: { name: string; state: string }): string => {
    const isStarted = app.state === 'STARTED';
    const isDebugging = opts.activeSessions.some(s => s.appName === app.name);
    return `
      <label class="list-item ${isDebugging ? 'selected' : ''}" data-app="${esc(app.name)}">
        <input type="checkbox" name="app" value="${esc(app.name)}" ${isDebugging ? 'checked disabled' : ''}>
        <span class="dot dot-${isStarted ? 'started' : 'stopped'}"></span>
        <span style="flex:1">${esc(app.name)}</span>
        ${isDebugging ? '<span style="font-size:10px;opacity:0.6">active</span>' : ''}
      </label>`;
  };

  const sessionCard = (s: { appName: string; status: string; port: number; appUrl?: string; error?: string }): string => {
    const badge = `<span class="status-badge badge-${esc(s.status.toLowerCase())}">${esc(s.status)}</span>`;
    // Use data attribute + event delegation instead of inline onclick to avoid XSS
    const stopBtn = `<button class="btn btn-ghost stop-debug-btn" data-app="${esc(s.appName)}" style="padding:2px 6px;font-size:10px">■ Stop</button>`;
    const urlBtn = s.appUrl !== undefined
      ? `<a href="${esc(s.appUrl)}" class="btn btn-ghost" style="padding:2px 6px;font-size:10px">🔗</a>`
      : '';
    return `
      <div class="session-card">
        <span class="app-name">${esc(s.appName)}</span>
        ${badge}
        <span style="font-size:10px;opacity:0.5">:${s.port}</span>
        ${urlBtn}${stopBtn}
      </div>`;
  };

  const hasApps = opts.apps.length > 0;
  const hasSessions = opts.activeSessions.length > 0;

  return `
    <div class="screen active" id="debugScreen">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <button class="btn btn-ghost" style="padding:2px 6px;font-size:11px" id="btnChangeOrg">◀ ${esc(opts.orgName)}</button>
        <button class="btn btn-ghost" style="padding:2px 6px;font-size:11px" id="btnRefreshApps">↺ Refresh</button>
      </div>

      ${hasSessions ? `
        <div class="section-title">Active Sessions</div>
        <div id="sessionList">${opts.activeSessions.map(sessionCard).join('')}</div>
        ${opts.activeSessions.length > 1
          ? '<button class="btn btn-danger btn-full" style="margin-bottom:12px" id="btnStopAll">■ Stop All</button>'
          : ''}
        <div class="divider"></div>
      ` : ''}

      ${hasApps ? `
        <div class="section-title">Apps</div>
        <div class="search-box">
          <input type="text" id="appSearch" placeholder="Search apps…" oninput="filterApps(this.value)">
        </div>

        <div id="appList">
          ${started.length > 0 ? `<div class="app-group-header">Started (${started.length})</div>${started.map(appRow).join('')}` : ''}
          ${stopped.length > 0 ? `<div class="app-group-header" style="opacity:0.6">Stopped (${stopped.length})</div>${stopped.map(appRow).join('')}` : ''}
        </div>

        <div style="margin-top:10px">
          <button class="btn btn-primary btn-full" id="btnStartDebug">▶ Start Debug Sessions</button>
        </div>
      ` : `
        <div class="banner banner-info">No apps found in this org. Try refreshing.</div>
      `}
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
        <span>${esc(a.name)}</span>
      </label>`)
    .join('');

  const resultRows = (opts.results ?? [])
    .map(r => `
      <div class="result-row">
        <span class="result-icon">${r.ok ? '✅' : '❌'}</span>
        <span class="result-app">${esc(r.appName)}</span>
        <span class="result-status">${r.ok ? 'Extracted' : esc(r.error ?? 'No HANA binding')}</span>
      </div>`)
    .join('');

  return `
    <div class="screen active" id="credsScreen">
      <div class="section-title">Space</div>
      <select id="spaceSelect" onchange="onSpaceChange(this.value)">
        <option value="">— select space —</option>
        ${spaceOptions}
      </select>

      ${opts.apps.length > 0 ? `
        <div class="section-title">Select Apps</div>
        <div class="search-box">
          <input type="text" id="credSearch" placeholder="Search apps…" oninput="filterCredApps(this.value)">
        </div>
        <div id="credAppList">${appRows}</div>
      ` : ''}

      <div class="section-title">Output</div>
      <div style="display:flex;flex-direction:column;gap:4px">
        <label class="list-item">
          <input type="radio" name="credOutput" value="sqltools" checked>
          <span>Write to SQLTools (.vscode/settings.json)</span>
        </label>
        <label class="list-item">
          <input type="radio" name="credOutput" value="json">
          <span>Download as JSON</span>
        </label>
        <label class="list-item">
          <input type="radio" name="credOutput" value="clipboard">
          <span>Copy to Clipboard</span>
        </label>
      </div>

      <button class="btn btn-primary btn-full" style="margin-top:12px" id="btnExtract">
        🔑 Extract Credentials
      </button>

      ${opts.results && opts.results.length > 0 ? `
        <div class="divider"></div>
        <div class="section-title">Results</div>
        <div>${resultRows}</div>
      ` : ''}
    </div>`;
}

// ─── Settings Tab ─────────────────────────────────────────────────────────────

export function renderSettingsTab(opts: {
  autoSync: boolean;
  syncInterval: number;
  sqlToolsIntegration: boolean;
  syncProgress: SyncProgress;
  defaultRegion: string;
}): string {
  const syncStatus = (() => {
    const p = opts.syncProgress;
    if (p.status === 'running') {
      return `<span style="color:#fbbe00">⟳ Syncing… ${p.done}/${p.total}</span>`;
    }
    if (p.status === 'done') {return `<span style="color:#3fb950">✓ Up to date</span>`;}
    if (p.status === 'error') {return `<span style="color:#f85149">✕ ${p.error ?? 'Error'}</span>`;}
    return `<span style="opacity:0.5">Idle</span>`;
  })();

  const regionOptions = CF_REGIONS.map(r =>
    `<option value="${r.id}" ${r.id === opts.defaultRegion ? 'selected' : ''}>${r.label}</option>`,
  ).join('');

  return `
    <div class="screen active" id="settingsScreen">
      <div class="section-title">Cache Sync</div>

      <div class="toggle-row">
        <div>
          <div class="toggle-label">Auto-sync on startup</div>
          <div class="toggle-sub">Scans all regions for CF apps</div>
        </div>
        <label class="toggle">
          <input type="checkbox" id="toggleAutoSync" ${opts.autoSync ? 'checked' : ''} onchange="updateSetting('autoSync', this.checked)">
          <span class="toggle-track"></span>
        </label>
      </div>

      <div class="toggle-row">
        <div>
          <div class="toggle-label">Sync interval</div>
          <div class="toggle-sub">Minutes between background syncs</div>
        </div>
        <input type="number" id="syncInterval" value="${opts.syncInterval}" min="30" max="1440"
          style="width:70px;text-align:center"
          onchange="updateSetting('syncInterval', +this.value)">
      </div>

      <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0">
        <span style="font-size:12px">Status: ${syncStatus}</span>
        <button class="btn btn-secondary" id="btnSyncNow" style="font-size:11px;padding:4px 10px">Sync Now</button>
      </div>

      <div class="divider"></div>
      <div class="section-title">Integration</div>

      <div class="toggle-row">
        <div>
          <div class="toggle-label">SQLTools integration</div>
          <div class="toggle-sub">Auto-write HANA creds to settings.json</div>
        </div>
        <label class="toggle">
          <input type="checkbox" id="toggleSqlTools" ${opts.sqlToolsIntegration ? 'checked' : ''} onchange="updateSetting('sqlToolsIntegration', this.checked)">
          <span class="toggle-track"></span>
        </label>
      </div>

      <div class="section-title">Default Region</div>
      <select onchange="updateSetting('defaultRegion', this.value)">${regionOptions}</select>

      <div class="divider"></div>
      <div class="section-title">Danger Zone</div>
      <button class="btn btn-danger btn-full" id="btnReset">
        🗑 Reset All Configuration
      </button>
      <p style="font-size:11px;opacity:0.5;margin-top:6px;text-align:center">
        Clears login state, org mappings, and cache.
      </p>
    </div>`;
}
