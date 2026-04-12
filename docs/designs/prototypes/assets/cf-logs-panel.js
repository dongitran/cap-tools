// cspell:words appname logsloaded logserror fetchlogs appsupdate guid
const vscodeApi = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null;

const CF_LINE_PATTERN = /^\s*(?<timestamp>\d{4}-\d{2}-\d{2}T[^\s]+)\s+\[(?<source>[^\]]+)]\s+(?<stream>OUT|ERR)\s?(?<body>.*)$/;
const LOG_LEVEL_ORDER = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'];

/* cspell:disable */
const PROTOTYPE_SAMPLE_LOG = String.raw`Retrieving logs for app finance-config-admin in org finance-platform / space app as developer@example.com...

2026-04-12T09:14:31.73+0700 [CELL/0] OUT Cell 91130a14 stopping instance 13af001e
2026-04-12T09:14:32.19+0700 [API/2] OUT Restarted app with guid 8a45de1d
2026-04-12T09:14:32.26+0700 [CELL/0] OUT Cell d436706e creating container for instance 6eb35470
2026-04-12T09:14:43.98+0700 [CELL/0] OUT Cell d436706e successfully created container for instance 6eb35470
2026-04-12T09:14:44.55+0700 [APP/PROC/WEB/0] ERR npm warn Unknown project config "always-auth".
2026-04-12T09:14:44.55+0700 [APP/PROC/WEB/0] ERR npm warn Unknown project config "scripts-prepend-node-path".
2026-04-12T09:14:44.73+0700 [APP/PROC/WEB/0] OUT > finance-config-admin@0.0.0 start
2026-04-12T09:14:44.73+0700 [APP/PROC/WEB/0] OUT > cds-serve -p gen/srv
2026-04-12T09:14:45.25+0700 [APP/PROC/WEB/0] OUT {"level":"info","logger":"NodeCacheStrategy","timestamp":"2026-04-12T02:14:45.255Z","component_name":"finance-config-admin","organization_name":"finance-platform","space_name":"app","msg":"NodeCacheStrategy initialized","type":"log"}
2026-04-12T09:14:45.25+0700 [APP/PROC/WEB/0] OUT {"level":"info","logger":"CacheService","timestamp":"2026-04-12T02:14:45.256Z","component_name":"finance-config-admin","organization_name":"finance-platform","space_name":"app","msg":"CacheService initialized with strategy: NodeCacheStrategy","type":"log"}
2026-04-12T09:14:47.26+0700 [APP/PROC/WEB/0] OUT {"level":"info","logger":"cds","timestamp":"2026-04-12T02:14:47.260Z","component_name":"finance-config-admin","organization_name":"finance-platform","space_name":"app","msg":"loaded model from 1 file(s):\\n ","type":"log"}
2026-04-12T09:14:47.26+0700 [APP/PROC/WEB/0] OUT gen/srv/srv/csn.json
2026-04-12T09:14:47.90+0700 [APP/PROC/WEB/0] OUT {"level":"warn","logger":"cds","timestamp":"2026-04-12T02:14:47.904Z","component_name":"finance-config-admin","organization_name":"finance-platform","space_name":"app","msg":"using auth strategy jwt with fallback mode","type":"log"}
2026-04-12T09:14:47.95+0700 [APP/PROC/WEB/0] OUT Server is listening at http://localhost:8080
2026-04-12T09:14:47.95+0700 [APP/PROC/WEB/0] OUT {"level":"info","logger":"cds","timestamp":"2026-04-12T02:14:47.953Z","component_name":"finance-config-admin","organization_name":"finance-platform","space_name":"app","msg":"server listening on { url: 'http://localhost:8080' }","type":"log"}
2026-04-12T09:14:47.95+0700 [APP/PROC/WEB/0] OUT {"level":"error","logger":"cds","timestamp":"2026-04-12T02:14:47.953Z","component_name":"finance-config-admin","organization_name":"finance-platform","space_name":"app","msg":"database retry exhausted on startup","type":"log"}`;
/* cspell:enable */

const elements = getRequiredElements();

// Module-level mutable state.
let allRows = [];
let filteredRows = [];
let selectedRowId = null;
let pendingRequestId = 0;
let emptyStateMessage = 'Select a CF space in the SAP Tools sidebar to load logs.';

if (vscodeApi === null) {
  // Browser prototype mode: render sample data and populate app selector.
  allRows = parseCfRecentLog(PROTOTYPE_SAMPLE_LOG);
  elements.workspaceScope.textContent = 'za-10 \u2192 data-foundation-prod \u2192 observability';
  rebuildAppSelect([{ name: 'finance-config-admin', runningInstances: 1 }], 'finance-config-admin');
}

hydrateDynamicFilterOptions(allRows);
applyFiltersAndRender();
bindFilterEvents();
bindExtensionMessages();

// ── DOM helpers ──────────────────────────────────────────────────────────────

function getRequiredElements() {
  const tableBody = document.getElementById('log-table-body');
  const tableSummary = document.getElementById('table-summary');
  const workspaceScope = document.getElementById('workspace-scope');
  const filterSearch = document.getElementById('filter-search');
  const filterLevel = document.getElementById('filter-level');
  const filterApp = document.getElementById('filter-app');

  if (!(tableBody instanceof HTMLTableSectionElement)) {
    throw new Error('Missing #log-table-body.');
  }

  if (!(tableSummary instanceof HTMLElement)) {
    throw new Error('Missing #table-summary.');
  }

  if (!(workspaceScope instanceof HTMLElement)) {
    throw new Error('Missing #workspace-scope.');
  }

  if (!(filterSearch instanceof HTMLInputElement)) {
    throw new Error('Missing #filter-search.');
  }

  if (!(filterLevel instanceof HTMLSelectElement)) {
    throw new Error('Missing #filter-level.');
  }

  if (!(filterApp instanceof HTMLSelectElement)) {
    throw new Error('Missing #filter-app.');
  }

  return {
    tableBody,
    tableSummary,
    workspaceScope,
    filters: {
      search: filterSearch,
      level: filterLevel,
      app: filterApp,
    },
  };
}

// ── Log parsing ──────────────────────────────────────────────────────────────

function parseCfRecentLog(rawText) {
  const rows = [];
  const lines = rawText.split(/\r?\n/);
  let previousRow = null;

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (trimmedLine.length === 0) {
      continue;
    }

    if (trimmedLine.startsWith('Retrieving logs for app')) {
      continue;
    }

    const parsedRow = parseCfLine(trimmedLine, rows.length + 1);

    if (parsedRow !== null) {
      rows.push(parsedRow);
      previousRow = parsedRow;
      continue;
    }

    if (previousRow !== null) {
      previousRow.message = `${previousRow.message}\n${trimmedLine}`;
      previousRow.rawBody = `${previousRow.rawBody}\n${trimmedLine}`;
      previousRow.searchableText = buildSearchableText(previousRow);
      continue;
    }

    const fallbackRow = buildTextRow({
      id: rows.length + 1,
      timestamp: 'N/A',
      source: 'SYSTEM',
      stream: 'OUT',
      body: trimmedLine,
    });
    rows.push(fallbackRow);
    previousRow = fallbackRow;
  }

  return rows;
}

function parseCfLine(line, id) {
  const match = line.match(CF_LINE_PATTERN);
  if (match === null || match.groups === undefined) {
    return null;
  }

  const timestamp = match.groups.timestamp;
  const source = match.groups.source;
  const stream = match.groups.stream === 'ERR' ? 'ERR' : 'OUT';
  const body = match.groups.body.trim();
  const jsonPayload = parseJsonBody(body);

  if (jsonPayload !== null) {
    return buildJsonRow({ id, timestamp, source, stream, body, payload: jsonPayload });
  }

  return buildTextRow({ id, timestamp, source, stream, body });
}

function parseJsonBody(body) {
  if (!body.startsWith('{') || !body.endsWith('}')) {
    return null;
  }

  try {
    const parsed = JSON.parse(body);
    if (isObjectRecord(parsed)) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function buildTextRow({ id, timestamp, source, stream, body }) {
  const message = body.length > 0 ? body : '(empty)';
  const level = normalizeLevel('', stream, message);
  const row = {
    id,
    timestamp,
    source,
    stream,
    format: 'text',
    level,
    logger: deriveLoggerFromSource(source),
    component: '',
    org: '',
    space: '',
    message,
    rawBody: body,
    jsonPayload: null,
    searchableText: '',
  };

  row.searchableText = buildSearchableText(row);
  return row;
}

function buildJsonRow({ id, timestamp, source, stream, body, payload }) {
  const message = readString(payload.msg) || body;
  const level = normalizeLevel(readString(payload.level), stream, message);
  const row = {
    id,
    timestamp,
    source,
    stream,
    format: 'json',
    level,
    logger: readString(payload.logger) || deriveLoggerFromSource(source),
    component: readString(payload.component_name),
    org: readString(payload.organization_name),
    space: readString(payload.space_name),
    message,
    rawBody: body,
    jsonPayload: payload,
    searchableText: '',
  };

  row.searchableText = buildSearchableText(row);
  return row;
}

function readString(value) {
  if (typeof value !== 'string') {
    return '';
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : '';
}

function deriveLoggerFromSource(source) {
  const firstToken = source.split('/')[0];
  return firstToken.length > 0 ? firstToken.toLowerCase() : 'source';
}

function normalizeLevel(candidateLevel, stream, message) {
  const normalizedCandidate = candidateLevel.trim().toLowerCase();

  if (normalizedCandidate === 'warning') {
    return 'warn';
  }

  if (LOG_LEVEL_ORDER.includes(normalizedCandidate)) {
    return normalizedCandidate;
  }

  const normalizedMessage = message.toLowerCase();

  if (normalizedMessage.includes('fatal')) {
    return 'fatal';
  }

  if (
    normalizedMessage.includes('error') ||
    normalizedMessage.includes('exception') ||
    normalizedMessage.includes('failed')
  ) {
    return 'error';
  }

  if (normalizedMessage.includes('warn')) {
    return 'warn';
  }

  if (stream === 'ERR') {
    return 'error';
  }

  return 'info';
}

function buildSearchableText(row) {
  const tokens = [
    row.timestamp,
    row.source,
    row.stream,
    row.format,
    row.level,
    row.logger,
    row.component,
    row.org,
    row.space,
    row.message,
  ];
  return tokens.join(' ').toLowerCase();
}

function isObjectRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// ── Filter controls ──────────────────────────────────────────────────────────

function hydrateDynamicFilterOptions(rows) {
  const levels = collectDistinctValues(rows, (row) => row.level, (value) => {
    const order = LOG_LEVEL_ORDER.indexOf(value);
    return order < 0 ? LOG_LEVEL_ORDER.length : order;
  });

  rebuildSelect(elements.filters.level, levels);
}

function collectDistinctValues(rows, selector, orderSelector) {
  const values = [];
  const seen = new Set();

  for (const row of rows) {
    const value = selector(row);
    if (value.length === 0 || seen.has(value)) {
      continue;
    }

    seen.add(value);
    values.push(value);
  }

  if (orderSelector === undefined) {
    values.sort((left, right) => left.localeCompare(right));
    return values;
  }

  values.sort((left, right) => {
    const leftOrder = orderSelector(left);
    const rightOrder = orderSelector(right);

    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }

    return left.localeCompare(right);
  });

  return values;
}

function rebuildSelect(select, values) {
  const previous = select.value;
  select.replaceChildren();

  const allOption = document.createElement('option');
  allOption.value = 'all';
  allOption.textContent = 'All';
  select.append(allOption);

  for (const value of values) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    select.append(option);
  }

  if (values.includes(previous)) {
    select.value = previous;
    return;
  }

  select.value = 'all';
}

function rebuildAppSelect(apps, selectedApp) {
  elements.filters.app.replaceChildren();

  if (apps.length === 0) {
    const noAppsOption = document.createElement('option');
    noAppsOption.value = '';
    noAppsOption.textContent = '— no apps available —';
    elements.filters.app.append(noAppsOption);
    elements.filters.app.disabled = true;
    return;
  }

  elements.filters.app.disabled = false;

  for (const app of apps) {
    const name = typeof app.name === 'string' ? app.name : '';
    const instances = typeof app.runningInstances === 'number' ? app.runningInstances : 0;
    const option = document.createElement('option');
    option.value = name;
    option.textContent = `${name} (${String(instances)})`;
    elements.filters.app.append(option);
  }

  const targetApp = typeof selectedApp === 'string' && selectedApp.length > 0 ? selectedApp : '';
  const hasTarget = targetApp.length > 0 && apps.some((a) => a.name === targetApp);
  elements.filters.app.value = hasTarget ? targetApp : (apps[0]?.name ?? '');
}

function bindFilterEvents() {
  elements.filters.search.addEventListener('input', () => {
    applyFiltersAndRender();
  });

  elements.filters.level.addEventListener('change', () => {
    applyFiltersAndRender();
  });

  elements.filters.app.addEventListener('change', () => {
    const selectedApp = elements.filters.app.value;
    if (selectedApp.length > 0) {
      allRows = [];
      filteredRows = [];
      selectedRowId = null;
      emptyStateMessage = `Loading logs for ${selectedApp}\u2026`;
      applyFiltersAndRender();
      requestLogsForApp(selectedApp);
    }
  });
}

// ── Extension messaging ──────────────────────────────────────────────────────

function requestLogsForApp(appName) {
  if (vscodeApi !== null) {
    pendingRequestId += 1;
    vscodeApi.postMessage({ type: 'sapTools.fetchLogs', appName, requestId: pendingRequestId });
  }
}

function handleAppsUpdate(apps, selectedApp) {
  rebuildAppSelect(apps, selectedApp);

  if (apps.length === 0) {
    allRows = [];
    filteredRows = [];
    selectedRowId = null;
    pendingRequestId += 1;
    emptyStateMessage = 'No running apps found in the selected space.';
    hydrateDynamicFilterOptions([]);
    applyFiltersAndRender();
    return;
  }

  const appToFetch =
    typeof selectedApp === 'string' && selectedApp.length > 0
      ? selectedApp
      : (apps[0]?.name ?? '');

  if (appToFetch.length > 0) {
    emptyStateMessage = `Loading logs for ${appToFetch}\u2026`;
    allRows = [];
    filteredRows = [];
    selectedRowId = null;
    applyFiltersAndRender();
    requestLogsForApp(appToFetch);
  }
}

function handleLogsLoaded(appName, logText, requestId) {
  // Discard stale responses (cross-scope same-app-name or quick app switching).
  if (requestId !== pendingRequestId) {
    return;
  }
  allRows = parseCfRecentLog(logText);
  filteredRows = [];
  selectedRowId = null;
  emptyStateMessage = `No log entries found for ${appName}.`;
  hydrateDynamicFilterOptions(allRows);
  applyFiltersAndRender();
}

function handleLogsError(appName, message, requestId) {
  // Discard stale responses (cross-scope same-app-name or quick app switching).
  if (requestId !== pendingRequestId) {
    return;
  }
  allRows = [];
  filteredRows = [];
  selectedRowId = null;
  emptyStateMessage = `Failed to load logs for ${appName}: ${message}`;
  // Reset level filter so stale options from a previous successful load are cleared.
  hydrateDynamicFilterOptions([]);
  applyFiltersAndRender();
}

/**
 * Listen for messages from the VS Code extension host.
 */
function bindExtensionMessages() {
  window.addEventListener('message', (event) => {
    const msg = event.data;
    if (typeof msg !== 'object' || msg === null) {
      return;
    }

    if (msg.type === 'sapTools.scopeUpdate' && typeof msg.scope === 'string') {
      elements.workspaceScope.textContent = msg.scope;
    }

    if (msg.type === 'sapTools.appsUpdate' && Array.isArray(msg.apps)) {
      const selectedApp = typeof msg.selectedApp === 'string' ? msg.selectedApp : '';
      handleAppsUpdate(msg.apps, selectedApp);
    }

    if (
      msg.type === 'sapTools.logsLoaded' &&
      typeof msg.appName === 'string' &&
      typeof msg.logText === 'string'
    ) {
      const requestId = typeof msg.requestId === 'number' ? msg.requestId : -1;
      handleLogsLoaded(msg.appName, msg.logText, requestId);
    }

    if (msg.type === 'sapTools.logsError' && typeof msg.appName === 'string') {
      const errorMsg = typeof msg.message === 'string' ? msg.message : 'Unknown error.';
      const requestId = typeof msg.requestId === 'number' ? msg.requestId : -1;
      handleLogsError(msg.appName, errorMsg, requestId);
    }
  });
}

// ── Render ───────────────────────────────────────────────────────────────────

function applyFiltersAndRender() {
  const searchTerm = elements.filters.search.value.trim().toLowerCase();
  const levelValue = elements.filters.level.value;

  filteredRows = allRows.filter((row) => {
    if (levelValue !== 'all' && row.level !== levelValue) {
      return false;
    }

    if (searchTerm.length > 0 && !row.searchableText.includes(searchTerm)) {
      return false;
    }

    return true;
  });

  if (!filteredRows.some((row) => row.id === selectedRowId)) {
    selectedRowId = filteredRows.length > 0 ? filteredRows[0].id : null;
  }

  renderTable(filteredRows);
  renderSummary(filteredRows, allRows);
}

function renderTable(rows) {
  elements.tableBody.replaceChildren();

  if (rows.length === 0) {
    const emptyRow = document.createElement('tr');
    const emptyCell = document.createElement('td');
    emptyCell.colSpan = 6;
    emptyCell.className = 'empty-row';
    emptyCell.textContent =
      allRows.length > 0 ? 'No rows match the current filters.' : emptyStateMessage;
    emptyRow.append(emptyCell);
    elements.tableBody.append(emptyRow);
    return;
  }

  for (const row of rows) {
    const tr = document.createElement('tr');

    if (row.id === selectedRowId) {
      tr.classList.add('is-selected');
    }

    tr.addEventListener('click', () => {
      selectedRowId = row.id;
      renderTable(filteredRows);
    });

    tr.append(createTextCell(row.timestamp));
    tr.append(createTextCell(row.source));
    tr.append(createTextCell(row.stream));
    tr.append(createBadgeCell(row.level, `badge badge-level-${row.level}`));
    tr.append(createTextCell(row.logger, 'cell-logger'));
    tr.append(createTextCell(compactMessage(row.message), 'cell-message'));

    elements.tableBody.append(tr);
  }
}

function createTextCell(value, className) {
  const td = document.createElement('td');
  if (className !== undefined) {
    td.className = className;
  }
  td.textContent = value.length > 0 ? value : '-';
  return td;
}

function createBadgeCell(value, badgeClass) {
  const td = document.createElement('td');
  const badge = document.createElement('span');
  badge.className = badgeClass;
  badge.textContent = value.toUpperCase();
  td.append(badge);
  return td;
}

function compactMessage(message) {
  return message.replace(/\s+/g, ' ').trim();
}

function renderSummary(rows, all) {
  const activeBits = [];
  if (elements.filters.level.value !== 'all') {
    activeBits.push(`level=${elements.filters.level.value}`);
  }

  const activeFilterText = activeBits.length > 0 ? ` (${activeBits.join(', ')})` : '';
  elements.tableSummary.textContent = `${rows.length} of ${all.length} rows visible${activeFilterText}.`;
}
