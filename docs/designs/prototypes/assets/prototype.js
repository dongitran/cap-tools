import { DESIGN_CATALOG, REGION_GROUPS } from './design-catalog.js';

const TAB_ITEMS = [
  { id: 'logs', label: 'Logs' },
  { id: 'apps', label: 'Apps' },
  { id: 'targets', label: 'Targets' },
  { id: 'settings', label: 'Settings' },
];

const LOG_SEED = [
  {
    id: 'log-001',
    time: '11:25:18',
    level: 'INFO',
    app: 'billing-api',
    instance: '0',
    message: 'Request completed with 200 status for invoice summary endpoint.',
  },
  {
    id: 'log-002',
    time: '11:25:22',
    level: 'WARN',
    app: 'billing-api',
    instance: '1',
    message: 'Retrying connection to dependent destination service after timeout.',
  },
  {
    id: 'log-003',
    time: '11:25:30',
    level: 'ERR',
    app: 'payments-worker',
    instance: '0',
    message: 'Failed to bind queue consumer because of temporary authorization error.',
  },
  {
    id: 'log-004',
    time: '11:25:36',
    level: 'INFO',
    app: 'payments-worker',
    instance: '0',
    message: 'Queue consumer resumed and processing backlog messages.',
  },
  {
    id: 'log-005',
    time: '11:25:44',
    level: 'DEBUG',
    app: 'audit-service',
    instance: '2',
    message: 'Generated trace id for cf request flow in middleware.',
  },
  {
    id: 'log-006',
    time: '11:25:51',
    level: 'INFO',
    app: 'audit-service',
    instance: '2',
    message: 'Persisted audit event for org and space operation.',
  },
];

const appElement = document.getElementById('app');

if (!(appElement instanceof HTMLElement)) {
  throw new Error('Prototype root element not found.');
}

const designIdRaw = Number.parseInt(document.body.dataset.designId ?? '34', 10);
const activeDesign =
  DESIGN_CATALOG.find((design) => design.id === designIdRaw) ?? DESIGN_CATALOG[0];

const groupLookup = new Map(REGION_GROUPS.map((group) => [group.id, group]));
const regionLookup = new Map(
  REGION_GROUPS.flatMap((group) => group.regions.map((region) => [region.id, region]))
);
const regionGroupLookup = new Map(
  REGION_GROUPS.flatMap((group) => group.regions.map((region) => [region.id, group.id]))
);

let mode = 'selection';
let selectedGroupId = '';
let selectedRegionId = '';
let activeTabId = 'logs';
let isConnected = false;
let isLiveMode = false;
let selectedLevel = 'all';
let searchKeyword = '';
let selectedLogId = '';
let statusMessage = '';
let lastSyncLabel = 'Not synced yet';
let logsData = cloneSeedLogs();

applyDesignTokens(activeDesign);
renderPrototype();

appElement.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const areaButton = target.closest('[data-group-id]');
  if (areaButton instanceof HTMLButtonElement) {
    handleGroupSelection(areaButton.dataset.groupId ?? '');
    renderPrototype();
    return;
  }

  const regionButton = target.closest('[data-region-id]');
  if (regionButton instanceof HTMLButtonElement) {
    handleRegionSelection(regionButton.dataset.regionId ?? '');
    renderPrototype();
    return;
  }

  const actionElement = target.closest('[data-action]');
  if (!(actionElement instanceof HTMLElement)) {
    return;
  }

  if (handleAction(actionElement.dataset.action ?? '', actionElement)) {
    renderPrototype();
  }
});

appElement.addEventListener('input', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) {
    return;
  }

  if (target.dataset.role !== 'log-search') {
    return;
  }

  searchKeyword = target.value;
  renderPrototype();
});

function handleGroupSelection(nextGroupId) {
  const nextGroup = groupLookup.get(nextGroupId);
  if (nextGroup === undefined) {
    return;
  }

  selectedGroupId = nextGroupId;
  if (selectedRegionId.length === 0) {
    return;
  }

  if (regionGroupLookup.get(selectedRegionId) !== nextGroupId) {
    selectedRegionId = '';
  }
}

function handleRegionSelection(nextRegionId) {
  const nextRegion = regionLookup.get(nextRegionId);
  const nextGroupId = regionGroupLookup.get(nextRegionId) ?? '';

  if (nextRegion === undefined || nextGroupId.length === 0) {
    return;
  }

  selectedGroupId = nextGroupId;
  selectedRegionId = nextRegionId;
}

function handleAction(action, actionElement) {
  const regionActionHandled = handleRegionModeAction(action);
  if (regionActionHandled !== null) {
    return regionActionHandled;
  }

  const tabActionHandled = handleTabAction(action, actionElement.dataset.tabId ?? '');
  if (tabActionHandled !== null) {
    return tabActionHandled;
  }

  const logsActionHandled = handleLogsAction(action, actionElement);
  if (logsActionHandled !== null) {
    return logsActionHandled;
  }

  return false;
}

function handleRegionModeAction(action) {
  if (action === 'confirm-region') {
    if (selectedRegionId.length === 0) {
      return false;
    }

    mode = 'workspace';
    activeTabId = 'logs';
    statusMessage = 'Region confirmed. Connect Cloud Foundry to load logs.';
    return true;
  }

  if (action === 'change-region') {
    mode = 'selection';
    isLiveMode = false;
    statusMessage = '';
    return true;
  }

  return null;
}

function handleTabAction(action, tabId) {
  if (action !== 'switch-tab') {
    return null;
  }

  if (TAB_ITEMS.every((item) => item.id !== tabId)) {
    return false;
  }

  activeTabId = tabId;
  return true;
}

function handleLogsAction(action, actionElement) {
  const selectionActionHandled = handleLogsSelectionAction(action, actionElement);
  if (selectionActionHandled !== null) {
    return selectionActionHandled;
  }

  const controlActionHandled = handleLogsControlAction(action);
  if (controlActionHandled !== null) {
    return controlActionHandled;
  }

  return null;
}

function handleLogsSelectionAction(action, actionElement) {
  if (action === 'set-level') {
    selectedLevel = actionElement.dataset.level ?? 'all';
    selectedLogId = '';
    return true;
  }

  if (action === 'select-log') {
    selectedLogId = actionElement.dataset.logId ?? '';
    return true;
  }

  return null;
}

function handleLogsControlAction(action) {
  if (action === 'connect-cf') {
    isConnected = true;
    selectedLogId = logsData[0]?.id ?? '';
    lastSyncLabel = formatNow();
    statusMessage = 'Cloud Foundry target connected.';
    return true;
  }

  if (action === 'fetch-recent') {
    logsData = cloneSeedLogs();
    selectedLogId = logsData[0]?.id ?? '';
    lastSyncLabel = formatNow();
    statusMessage = 'Fetched latest log lines.';
    return true;
  }

  if (action === 'toggle-live') {
    isLiveMode = !isLiveMode;
    lastSyncLabel = formatNow();
    statusMessage = isLiveMode ? 'Live streaming enabled.' : 'Live streaming paused.';
    return true;
  }

  if (action === 'clear-logs') {
    logsData = [];
    selectedLogId = '';
    statusMessage = 'Log list cleared.';
    return true;
  }

  if (action === 'export-logs') {
    statusMessage = 'Export prepared as mock-log-export.txt';
    return true;
  }

  return null;
}

function applyDesignTokens(design) {
  const root = document.body;
  const themeClass = `theme-${String(design.id).padStart(2, '0')}`;

  root.className = `prototype-page pattern-${design.pattern} ${themeClass}`;
  root.style.setProperty('--page-bg', design.colors.page);
  root.style.setProperty('--frame-bg', design.colors.frame);
  root.style.setProperty('--surface-bg', design.colors.surface);
  root.style.setProperty('--border-color', design.colors.border);
  root.style.setProperty('--text-color', design.colors.text);
  root.style.setProperty('--muted-color', design.colors.muted);
  root.style.setProperty('--accent-color', design.colors.accent);
  root.style.setProperty('--accent-soft', design.colors.accentSoft);
  root.style.setProperty('--chip-text', design.colors.chipText);
  root.style.setProperty('--panel-shadow', design.shadow);
  root.style.setProperty('--title-font', design.typography.title);
  root.style.setProperty('--body-font', design.typography.body);
}

function renderPrototype() {
  const shellMarkup = mode === 'selection' ? renderSelectionScreen() : renderWorkspaceScreen();

  appElement.innerHTML = `
    <section class="prototype-shell select-style-${activeDesign.selectStyle} mode-${mode}">
      ${shellMarkup}
    </section>
  `;
}

function renderSelectionScreen() {
  const selectedGroup = groupLookup.get(selectedGroupId);
  const regionPanelMarkup =
    selectedGroup === undefined ? renderEmptyRegionPanel() : renderSelectedGroupPanel(selectedGroup);

  return `
    <header class="shell-header">
      <h1>Select SAP BTP Region</h1>
    </header>

    <div class="groups" role="list">
      <section class="group-card area-stage" aria-label="Area selector">
        <div class="group-head">
          <h2>Choose Area</h2>
          <span class="group-count">${REGION_GROUPS.length}</span>
        </div>
        <div class="area-picker" role="listbox" aria-label="SAP area groups">
          ${renderAreaPicker()}
        </div>
      </section>

      ${regionPanelMarkup}

      ${renderConfirmPanel()}
    </div>
  `;
}

function renderConfirmPanel() {
  const selectedRegion = resolveSelectedRegion();
  const summary =
    selectedRegion === undefined
      ? 'Choose one region before continuing.'
      : `${selectedRegion.name} (${selectedRegion.code.toUpperCase()}) is ready.`;

  return `
    <section class="group-card confirm-stage" aria-label="Region confirmation">
      <p class="confirm-summary">${summary}</p>
      <button
        type="button"
        class="confirm-button"
        data-action="confirm-region"
        ${selectedRegion === undefined ? 'disabled' : ''}
      >
        Confirm Region
      </button>
    </section>
  `;
}

function renderAreaPicker() {
  return REGION_GROUPS.map((group) => {
    const isActive = group.id === selectedGroupId;
    return `
      <button
        type="button"
        class="area-option${isActive ? ' is-active' : ''}"
        data-group-id="${group.id}"
        aria-pressed="${isActive}"
      >
        <span class="area-label">${group.label}</span>
        <span class="area-meta">${group.regions.length} regions</span>
      </button>
    `;
  }).join('');
}

function renderSelectedGroupPanel(group) {
  const regionOptionsMarkup = group.regions
    .map((region) => {
      const isSelected = region.id === selectedRegionId;
      return `
        <button
          type="button"
          class="region-option${isSelected ? ' is-selected' : ''}"
          data-region-id="${region.id}"
          aria-pressed="${isSelected}"
        >
          <span class="region-name">${region.name}</span>
          <span class="region-code">${region.code}</span>
        </button>
      `;
    })
    .join('');

  return `
    <section class="group-card" aria-label="Region list">
      <div class="group-head">
        <h2>${group.label} Regions</h2>
        <span class="group-count">${group.regions.length}</span>
      </div>
      <div class="region-layout ${activeDesign.layout}">
        ${regionOptionsMarkup}
      </div>
    </section>
  `;
}

function renderEmptyRegionPanel() {
  return `
    <section class="group-card empty-panel" aria-live="polite">
      <p class="empty-title">No area selected yet</p>
      <p class="empty-description">Pick an area above to reveal region options.</p>
    </section>
  `;
}

function renderWorkspaceScreen() {
  const selectedRegion = resolveSelectedRegion();
  const regionLabel =
    selectedRegion === undefined
      ? 'No region selected'
      : `${selectedRegion.name} (${selectedRegion.code.toUpperCase()})`;
  const statusClass = isConnected ? 'is-connected' : 'is-disconnected';

  return `
    <header class="shell-header workspace-header">
      <h1>Monitoring Workspace</h1>
      <div class="workspace-context">
        <span class="context-pill">Region: ${regionLabel}</span>
        <span class="context-pill">Org: demo-org</span>
        <span class="context-pill">Space: prod</span>
        <span class="connection-state ${statusClass}">${isConnected ? 'Connected' : 'Disconnected'}</span>
      </div>
      <button type="button" class="secondary-action" data-action="change-region">Change Region</button>
    </header>

    ${renderWorkspaceTabs()}

    <section class="workspace-body">
      ${renderWorkspaceTabContent()}
    </section>

    <footer class="workspace-footer">
      <span>Last sync: ${lastSyncLabel}</span>
      <span class="live-indicator${isLiveMode ? ' is-live' : ''}">Live ${isLiveMode ? 'ON' : 'OFF'}</span>
    </footer>
  `;
}

function renderWorkspaceTabs() {
  const tabsMarkup = TAB_ITEMS.map((tab) => {
    const isActive = tab.id === activeTabId;
    return `
      <button
        type="button"
        class="tab-button${isActive ? ' is-active' : ''}"
        data-action="switch-tab"
        data-tab-id="${tab.id}"
        role="tab"
        aria-selected="${isActive}"
      >
        ${tab.label}
      </button>
    `;
  }).join('');

  return `<nav class="workspace-tabs" role="tablist">${tabsMarkup}</nav>`;
}

function renderWorkspaceTabContent() {
  if (activeTabId === 'logs') {
    return renderLogsTab();
  }

  return renderPlaceholderTab(activeTabId);
}

function renderLogsTab() {
  if (!isConnected) {
    return `
      <section class="group-card logs-empty-state">
        <h2>Logs</h2>
        <p>Cloud Foundry target is not connected for this region yet.</p>
        <button type="button" class="primary-action" data-action="connect-cf">Connect Cloud Foundry</button>
      </section>
    `;
  }

  const filteredLogs = getFilteredLogs();
  const selectedLog = resolveSelectedLog(filteredLogs);
  const detailMarkup = selectedLog === undefined ? renderEmptyLogDetails() : renderLogDetails(selectedLog);

  return `
    <section class="group-card logs-panel">
      <h2>Cloud Foundry Logs</h2>
      ${renderLogsToolbar()}
      ${renderLogsFilters()}
      ${statusMessage.length > 0 ? `<p class="status-note">${escapeHtml(statusMessage)}</p>` : ''}
      ${renderLogsTable(filteredLogs, selectedLog?.id ?? '')}
      ${detailMarkup}
    </section>
  `;
}

function renderLogsToolbar() {
  const liveLabel = isLiveMode ? 'Pause Live' : 'Start Live';

  return `
    <div class="toolbar-row" role="group" aria-label="Log actions">
      <button type="button" class="small-action" data-action="fetch-recent">Fetch Recent</button>
      <button type="button" class="small-action" data-action="toggle-live">${liveLabel}</button>
      <button type="button" class="small-action" data-action="clear-logs">Clear</button>
      <button type="button" class="small-action" data-action="export-logs">Export</button>
    </div>
  `;
}

function renderLogsFilters() {
  const levels = ['all', 'ERR', 'WARN', 'INFO', 'DEBUG'];
  const levelButtons = levels
    .map((level) => {
      const isActive = level === selectedLevel;
      return `
        <button
          type="button"
          class="level-chip${isActive ? ' is-active' : ''}"
          data-action="set-level"
          data-level="${level}"
        >
          ${level}
        </button>
      `;
    })
    .join('');

  return `
    <div class="scope-row">
      <span class="scope-chip">Org: demo-org</span>
      <span class="scope-chip">Space: prod</span>
      <span class="scope-chip">App: all</span>
      <span class="scope-chip">Range: 15m</span>
    </div>
    <div class="filter-row">
      <div class="level-group" role="group" aria-label="Severity levels">${levelButtons}</div>
      <input
        type="search"
        class="log-search"
        data-role="log-search"
        value="${escapeHtml(searchKeyword)}"
        placeholder="Search by app or message"
      />
    </div>
  `;
}

function renderLogsTable(logs, activeLogId) {
  if (logs.length === 0) {
    return '<p class="logs-empty-message">No logs match current filters.</p>';
  }

  const rowsMarkup = logs
    .map((entry) => {
      const isActive = entry.id === activeLogId;
      return `
        <button
          type="button"
          class="log-row${isActive ? ' is-active' : ''}"
          data-action="select-log"
          data-log-id="${entry.id}"
        >
          <span class="cell time">${entry.time}</span>
          <span class="cell level">${entry.level}</span>
          <span class="cell app">${entry.app}/${entry.instance}</span>
          <span class="cell message">${escapeHtml(entry.message)}</span>
        </button>
      `;
    })
    .join('');

  return `<div class="logs-table" role="list">${rowsMarkup}</div>`;
}

function renderLogDetails(entry) {
  const rawLine = `${entry.time} ${entry.level} ${entry.app}/${entry.instance} ${entry.message}`;

  return `
    <section class="log-detail" aria-label="Log details">
      <h3>Selected Log</h3>
      <pre>${escapeHtml(rawLine)}</pre>
    </section>
  `;
}

function renderEmptyLogDetails() {
  return `
    <section class="log-detail" aria-label="Log details">
      <h3>Selected Log</h3>
      <p>No log line selected.</p>
    </section>
  `;
}

function renderPlaceholderTab(tabId) {
  const label = TAB_ITEMS.find((tab) => tab.id === tabId)?.label ?? 'Tab';

  return `
    <section class="group-card placeholder-tab">
      <h2>${label}</h2>
      <p>This prototype step focuses on the Logs tab. Content for ${label} comes next.</p>
    </section>
  `;
}

function getFilteredLogs() {
  const keyword = searchKeyword.trim().toLowerCase();

  return logsData.filter((entry) => {
    if (selectedLevel !== 'all' && entry.level !== selectedLevel) {
      return false;
    }

    if (keyword.length === 0) {
      return true;
    }

    const haystack = `${entry.app} ${entry.instance} ${entry.message}`.toLowerCase();
    return haystack.includes(keyword);
  });
}

function resolveSelectedRegion() {
  return regionLookup.get(selectedRegionId);
}

function resolveSelectedLog(logs) {
  if (logs.length === 0) {
    return undefined;
  }

  const selectedLog = logs.find((entry) => entry.id === selectedLogId);
  return selectedLog ?? logs[0];
}

function cloneSeedLogs() {
  return LOG_SEED.map((entry) => ({ ...entry }));
}

function formatNow() {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date());
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
