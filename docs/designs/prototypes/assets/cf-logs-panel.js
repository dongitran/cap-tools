// cspell:words appname logsloaded logserror fetchlogs appsupdate activeappsupdate logsappend logsstreamstate guid
const vscodeApi = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null;

const CF_LINE_PATTERN = /^\s*(?<timestamp>\d{4}-\d{2}-\d{2}T[^\s]+)\s+\[(?<source>[^\]]+)]\s+(?<stream>OUT|ERR)\s?(?<body>.*)$/;
const LOG_LEVEL_ORDER = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'];
const MAX_RAW_LOG_TEXT_CHARS = 1_000_000;
const MAX_PARSED_LOG_ROWS = 5_000;

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
let activeAppNames = new Set();
let latestApps = [];
let rawLogTextByApp = new Map();
let parsedRowsByApp = new Map();
let streamStateByApp = new Map();
let isLogsRequestInFlight = false;
let pendingRequestAppName = '';

if (vscodeApi === null) {
  // Browser prototype mode: render sample data and populate app selector.
  allRows = parseCfRecentLog(PROTOTYPE_SAMPLE_LOG);
  rawLogTextByApp.set('finance-config-admin', PROTOTYPE_SAMPLE_LOG);
  parsedRowsByApp.set('finance-config-admin', allRows);
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
  const formattedTimestamp = formatTimestampToClock(timestamp);
  const message = body.length > 0 ? body : '(empty)';
  const level = normalizeLevel('', stream, message);
  const row = {
    id,
    timestamp: formattedTimestamp,
    timestampRaw: timestamp,
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
  const formattedTimestamp = formatTimestampToClock(timestamp);
  const message = readString(payload.msg) || body;
  const level = normalizeLevel(readString(payload.level), stream, message);
  const row = {
    id,
    timestamp: formattedTimestamp,
    timestampRaw: timestamp,
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
    row.timestampRaw,
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

function formatTimestampToClock(timestamp) {
  const normalized = timestamp.trim();
  const withDateMatch = normalized.match(
    /T(?<hour>\d{2}):(?<minute>\d{2}):(?<second>\d{2})/
  );
  if (withDateMatch?.groups !== undefined) {
    const { hour, minute, second } = withDateMatch.groups;
    return `${hour}:${minute}:${second}`;
  }

  const clockOnlyMatch = normalized.match(
    /^(?<hour>\d{2}):(?<minute>\d{2}):(?<second>\d{2})(?:[.,]\d+)?$/
  );
  if (clockOnlyMatch?.groups !== undefined) {
    const { hour, minute, second } = clockOnlyMatch.groups;
    return `${hour}:${minute}:${second}`;
  }

  return normalized;
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
    noAppsOption.textContent = '— no active app logging —';
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
      showSelectedAppLogs(selectedApp, true);
    }
  });
}

// ── Extension messaging ──────────────────────────────────────────────────────

function requestLogsForApp(appName, force) {
  if (vscodeApi !== null) {
    const shouldForce = force === true;
    if (!shouldForce && isLogsRequestInFlight) {
      return;
    }

    if (isLogsRequestInFlight && pendingRequestAppName === appName) {
      return;
    }

    isLogsRequestInFlight = true;
    pendingRequestId += 1;
    pendingRequestAppName = appName;
    vscodeApi.postMessage({ type: 'sapTools.fetchLogs', appName, requestId: pendingRequestId });
  }
}

function handleAppsUpdate(apps, selectedApp) {
  latestApps = normalizeAppsCatalog(apps);
  activeAppNames = filterActiveNamesByCatalog(activeAppNames, latestApps);
  refreshAppSelectorAndLogs(selectedApp);
}

function handleActiveAppsUpdate(appNames) {
  activeAppNames = normalizeActiveAppNames(appNames);
  refreshAppSelectorAndLogs(elements.filters.app.value);
}

function handleLogsLoaded(appName, logText, requestId) {
  // Discard stale responses (cross-scope same-app-name or quick app switching).
  if (requestId !== pendingRequestId) {
    return;
  }
  isLogsRequestInFlight = false;
  pendingRequestAppName = '';
  rawLogTextByApp.set(appName, logText);
  parsedRowsByApp.set(appName, trimRowsForMemory(parseCfRecentLog(logText)));
  showSelectedAppLogs(elements.filters.app.value, false);
}

function handleLogsError(appName, message, requestId) {
  // Discard stale responses (cross-scope same-app-name or quick app switching).
  if (requestId !== pendingRequestId) {
    return;
  }
  isLogsRequestInFlight = false;
  pendingRequestAppName = '';
  allRows = [];
  filteredRows = [];
  selectedRowId = null;
  emptyStateMessage = `Failed to load logs for ${appName}: ${message}`;
  // Reset level filter so stale options from a previous successful load are cleared.
  hydrateDynamicFilterOptions([]);
  applyFiltersAndRender();
}

function handleLogsAppend(appName, lines) {
  if (!Array.isArray(lines) || lines.length === 0) {
    return;
  }

  const textLines = lines
    .filter((line) => typeof line === 'string')
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);
  if (textLines.length === 0) {
    return;
  }

  const currentRaw = rawLogTextByApp.get(appName) ?? '';
  const updatedRaw = appendRawLogText(currentRaw, textLines.join('\n'));
  rawLogTextByApp.set(appName, updatedRaw);

  if (elements.filters.app.value === appName) {
    const parsedRows = appendParsedLinesForApp(appName, textLines);
    showRowsForSelectedApp(appName, parsedRows);
    return;
  }

  // Defer parsing for non-selected apps to reduce UI CPU load under multi-app streams.
  parsedRowsByApp.delete(appName);
}

function handleLogsStreamState(appName, status, message) {
  streamStateByApp.set(appName, { status, message: typeof message === 'string' ? message : '' });
  if (elements.filters.app.value === appName) {
    applyFiltersAndRender();
  }
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

    if (msg.type === 'sapTools.activeAppsUpdate' && Array.isArray(msg.appNames)) {
      handleActiveAppsUpdate(msg.appNames);
    }

    if (
      msg.type === 'sapTools.logsLoaded' &&
      typeof msg.appName === 'string' &&
      typeof msg.logText === 'string'
    ) {
      const requestId = typeof msg.requestId === 'number' ? msg.requestId : -1;
      handleLogsLoaded(msg.appName, msg.logText, requestId);
    }

    if (msg.type === 'sapTools.logsAppend' && typeof msg.appName === 'string') {
      handleLogsAppend(msg.appName, msg.lines);
    }

    if (
      msg.type === 'sapTools.logsStreamState' &&
      typeof msg.appName === 'string' &&
      typeof msg.status === 'string'
    ) {
      handleLogsStreamState(msg.appName, msg.status, msg.message);
    }

    if (msg.type === 'sapTools.logsError' && typeof msg.appName === 'string') {
      const errorMsg = typeof msg.message === 'string' ? msg.message : 'Unknown error.';
      const requestId = typeof msg.requestId === 'number' ? msg.requestId : -1;
      handleLogsError(msg.appName, errorMsg, requestId);
    }
  });
}

function normalizeActiveAppNames(appNames) {
  const nextSet = new Set();
  for (const appName of appNames) {
    if (typeof appName !== 'string') {
      continue;
    }
    const normalized = appName.trim();
    if (normalized.length === 0) {
      continue;
    }
    nextSet.add(normalized);
  }
  return nextSet;
}

function normalizeAppsCatalog(apps) {
  const normalized = [];
  for (const app of apps) {
    if (typeof app !== 'object' || app === null) {
      continue;
    }

    const name = typeof app.name === 'string' ? app.name.trim() : '';
    if (name.length === 0) {
      continue;
    }

    const runningInstances =
      typeof app.runningInstances === 'number' && Number.isFinite(app.runningInstances)
        ? app.runningInstances
        : 0;

    normalized.push({
      name,
      runningInstances,
    });
  }

  return normalized;
}

function filterActiveNamesByCatalog(activeNames, appsCatalog) {
  if (appsCatalog.length === 0) {
    return new Set();
  }

  const catalogNameSet = new Set(appsCatalog.map((app) => app.name));
  const filtered = new Set();
  for (const name of activeNames) {
    if (catalogNameSet.has(name)) {
      filtered.add(name);
    }
  }
  return filtered;
}

function resolveActiveCatalogApps(appsCatalog, activeNames) {
  if (appsCatalog.length === 0 || activeNames.size === 0) {
    return [];
  }

  return appsCatalog.filter((app) => activeNames.has(app.name));
}

function clearTableToMessage(message) {
  allRows = [];
  filteredRows = [];
  selectedRowId = null;
  pendingRequestId += 1;
  isLogsRequestInFlight = false;
  pendingRequestAppName = '';
  emptyStateMessage = message;
  hydrateDynamicFilterOptions([]);
  applyFiltersAndRender();
}

function refreshAppSelectorAndLogs(preferredAppName) {
  if (latestApps.length === 0) {
    pruneAppCaches(new Set());
    rebuildAppSelect([], '');
    clearTableToMessage('No running apps found in the selected space.');
    return;
  }

  const activeApps = resolveActiveCatalogApps(latestApps, activeAppNames);
  const activeNameSet = new Set(activeApps.map((app) => app.name));
  pruneAppCaches(activeNameSet);

  if (activeApps.length === 0) {
    rebuildAppSelect([], '');
    clearTableToMessage('Start App Logging in the SAP Tools sidebar to stream logs.');
    return;
  }

  rebuildAppSelect(activeApps, preferredAppName);
  const selectedApp = elements.filters.app.value;
  if (selectedApp.length > 0) {
    showSelectedAppLogs(selectedApp, true);
  }
}

function showSelectedAppLogs(appName, requestSnapshotIfMissing) {
  const parsedRows = resolveParsedRowsForApp(appName);
  if (Array.isArray(parsedRows) && parsedRows.length > 0) {
    showRowsForSelectedApp(appName, parsedRows);
    return;
  }

  if (Array.isArray(parsedRows) && parsedRows.length === 0) {
    showRowsForSelectedApp(appName, parsedRows);
    return;
  }

  clearTableToMessage(`Loading logs for ${appName}\u2026`);
  if (requestSnapshotIfMissing) {
    requestLogsForApp(appName, true);
  }
}

function appendRawLogText(existingText, appendedText) {
  const mergedText = existingText.length > 0 ? `${existingText}\n${appendedText}` : appendedText;
  if (mergedText.length <= MAX_RAW_LOG_TEXT_CHARS) {
    return mergedText;
  }

  return mergedText.slice(mergedText.length - MAX_RAW_LOG_TEXT_CHARS);
}

function showRowsForSelectedApp(appName, rows) {
  allRows = rows.slice();
  filteredRows = [];
  selectedRowId = null;
  emptyStateMessage = `No log entries found for ${appName}.`;
  hydrateDynamicFilterOptions(allRows);
  applyFiltersAndRender();
}

function resolveParsedRowsForApp(appName) {
  const cachedRows = parsedRowsByApp.get(appName);
  if (Array.isArray(cachedRows)) {
    return cachedRows;
  }

  const rawLogText = rawLogTextByApp.get(appName);
  if (typeof rawLogText !== 'string') {
    return null;
  }

  const parsedRows = trimRowsForMemory(parseCfRecentLog(rawLogText));
  parsedRowsByApp.set(appName, parsedRows);
  return parsedRows;
}

function appendParsedLinesForApp(appName, textLines) {
  const cachedRows = resolveParsedRowsForApp(appName);
  let nextRows = Array.isArray(cachedRows) ? cachedRows.slice() : [];
  let previousRow = nextRows.length > 0 ? nextRows[nextRows.length - 1] : null;
  let nextId =
    previousRow !== null && typeof previousRow.id === 'number' ? previousRow.id + 1 : 1;

  for (const line of textLines) {
    const trimmedLine = line.trim();
    if (trimmedLine.length === 0) {
      continue;
    }

    if (trimmedLine.startsWith('Retrieving logs for app')) {
      continue;
    }

    const parsedRow = parseCfLine(trimmedLine, nextId);
    if (parsedRow !== null) {
      nextRows.push(parsedRow);
      previousRow = parsedRow;
      nextId += 1;
      continue;
    }

    if (previousRow !== null) {
      previousRow.message = `${previousRow.message}\n${trimmedLine}`;
      previousRow.rawBody = `${previousRow.rawBody}\n${trimmedLine}`;
      previousRow.searchableText = buildSearchableText(previousRow);
      continue;
    }

    const fallbackRow = buildTextRow({
      id: nextId,
      timestamp: 'N/A',
      source: 'SYSTEM',
      stream: 'OUT',
      body: trimmedLine,
    });
    nextRows.push(fallbackRow);
    previousRow = fallbackRow;
    nextId += 1;
  }

  nextRows = trimRowsForMemory(nextRows);
  parsedRowsByApp.set(appName, nextRows);
  return nextRows;
}

function pruneAppCaches(allowedAppNames) {
  pruneMapByKeys(rawLogTextByApp, allowedAppNames);
  pruneMapByKeys(parsedRowsByApp, allowedAppNames);
  pruneMapByKeys(streamStateByApp, allowedAppNames);
}

function pruneMapByKeys(map, allowedKeys) {
  for (const key of Array.from(map.keys())) {
    if (!allowedKeys.has(key)) {
      map.delete(key);
    }
  }
}

function trimRowsForMemory(rows) {
  if (rows.length <= MAX_PARSED_LOG_ROWS) {
    return rows;
  }

  const trimmed = rows.slice(rows.length - MAX_PARSED_LOG_ROWS);
  for (let index = 0; index < trimmed.length; index += 1) {
    trimmed[index].id = index + 1;
  }
  return trimmed;
}


// ── Render ───────────────────────────────────────────────────────────────────

function applyFiltersAndRender() {
  const searchTerm = elements.filters.search.value.trim().toLowerCase();
  const levelValue = elements.filters.level.value;

  const matchingRows = allRows.filter((row) => {
    if (levelValue !== 'all' && row.level !== levelValue) {
      return false;
    }

    if (searchTerm.length > 0 && !row.searchableText.includes(searchTerm)) {
      return false;
    }

    return true;
  });

  // Newest log lines should appear first in the table.
  filteredRows = matchingRows.slice().reverse();

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
    tr.append(createTextCell(row.message, 'cell-message'));

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

function renderSummary(rows, all) {
  const activeBits = [];
  if (elements.filters.level.value !== 'all') {
    activeBits.push(`level=${elements.filters.level.value}`);
  }

  const selectedApp = elements.filters.app.value;
  const streamState = streamStateByApp.get(selectedApp);
  if (
    typeof selectedApp === 'string' &&
    selectedApp.length > 0 &&
    typeof streamState === 'object' &&
    streamState !== null &&
    typeof streamState.status === 'string'
  ) {
    activeBits.push(`stream=${streamState.status}`);
  }

  const activeFilterText = activeBits.length > 0 ? ` (${activeBits.join(', ')})` : '';
  elements.tableSummary.textContent = `${rows.length} of ${all.length} rows visible${activeFilterText}.`;
}
