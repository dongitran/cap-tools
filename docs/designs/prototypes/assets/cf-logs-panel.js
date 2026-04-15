// cspell:words appname logsloaded logserror fetchlogs appsupdate activeappsupdate logsappend logsstreamstate copylog guid gorouter routererror
const vscodeApi = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null;

const COPY_LOG_MESSAGE_TYPE = 'sapTools.copyLogMessage';
const COPY_LOG_RESULT_MESSAGE_TYPE = 'sapTools.copyLogResult';
const SAVE_COLUMN_SETTINGS_MESSAGE_TYPE = 'sapTools.saveColumnSettings';
const COLUMN_SETTINGS_INIT_MESSAGE_TYPE = 'sapTools.columnSettingsInit';
const SAVE_FONT_SIZE_SETTING_MESSAGE_TYPE = 'sapTools.saveFontSizeSetting';
const FONT_SIZE_SETTING_INIT_MESSAGE_TYPE = 'sapTools.fontSizeSettingInit';
const SAVE_LOG_LIMIT_SETTING_MESSAGE_TYPE = 'sapTools.saveLogLimitSetting';
const LOG_LIMIT_SETTING_INIT_MESSAGE_TYPE = 'sapTools.logLimitSettingInit';
const CF_LINE_PATTERN = /^\s*(?<timestamp>\d{4}-\d{2}-\d{2}T[^\s]+)\s+\[(?<source>[^\]]+)]\s+(?<stream>OUT|ERR)\s?(?<body>.*)$/;
const CF_CLI_SYSTEM_MESSAGE_PREFIXES = [
  'Retrieving logs for app',
  'Failed to retrieve logs from Log Cache:',
  'Failed to retrieve recent logs from Log Cache:',
  'Server error, status code:',
];
const LOG_LEVEL_ORDER = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'];
const MAX_RAW_LOG_TEXT_CHARS = 1_000_000;
const MAX_PARSED_LOG_ROWS = 5_000;
const COPY_TOAST_VISIBLE_MS = 1_600;
const MIN_RAW_LOG_TEXT_CHARS = 120_000;
const RAW_LOG_TEXT_CHARS_PER_LIMIT_ROW = 1_200;

/** All columns in canonical display order. */
const COLUMN_DEFS = [
  { id: 'time',    label: 'Time',    cellClass: 'col-time',    required: true,  defaultOn: true  },
  { id: 'source',  label: 'Source',  cellClass: 'col-source',  required: false, defaultOn: false },
  { id: 'stream',  label: 'Stream',  cellClass: 'col-stream',  required: false, defaultOn: false },
  { id: 'level',   label: 'Level',   cellClass: 'col-level',   required: false, defaultOn: true  },
  { id: 'logger',  label: 'Logger',  cellClass: 'col-logger',  required: false, defaultOn: true  },
  { id: 'message', label: 'Message', cellClass: 'col-message', required: true,  defaultOn: true  },
];
const DEFAULT_VISIBLE_COLUMNS = COLUMN_DEFS.filter((c) => c.defaultOn).map((c) => c.id);
const FONT_SIZE_PRESETS = ['smaller', 'default', 'large', 'xlarge'];
const DEFAULT_FONT_SIZE_PRESET = 'default';
const LOG_LIMIT_PRESETS = [300, 500, 1000, 3000];
const DEFAULT_LOG_LIMIT = 300;

function isKnownColumnId(value) {
  return typeof value === 'string' && COLUMN_DEFS.some((column) => column.id === value);
}

function normalizeVisibleColumns(columnIds) {
  const selected = new Set();
  for (const columnId of columnIds) {
    if (isKnownColumnId(columnId)) {
      selected.add(columnId);
    }
  }

  for (const column of COLUMN_DEFS) {
    if (column.required) {
      selected.add(column.id);
    }
  }

  const normalized = [];
  for (const column of COLUMN_DEFS) {
    if (selected.has(column.id)) {
      normalized.push(column.id);
    }
  }

  return normalized.length > 0 ? normalized : [...DEFAULT_VISIBLE_COLUMNS];
}

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
2026-04-12T09:14:47.95+0700 [APP/PROC/WEB/0] OUT {"level":"error","logger":"cds","timestamp":"2026-04-12T02:14:47.953Z","component_name":"finance-config-admin","organization_name":"finance-platform","space_name":"app","msg":"database retry exhausted on startup","type":"log"}
2026-04-12T09:14:48.20+0700 [RTR/0] OUT finance-config-admin.cfapps.ap11.hana.ondemand.com - [2026-04-12T02:14:48.200Z] "GET /rtr-health-check HTTP/1.1" 200 42 10 "-" "probe/1.0" "10.0.1.1:1001" "10.0.2.1:2001" x_forwarded_for:"1.2.3.4" x_forwarded_proto:"https" vcap_request_id:"rtr-req-001" response_time:0.001 gorouter_time:0.000010 app_id:"app001" app_index:"0" instance_id:"inst001" failed_attempts:0 failed_attempts_time:"-" x_cf_routererror:"-" x_b3_traceid:"aabbccdd" x_b3_spanid:"aabbccdd" b3:"aabbccdd-aabbccdd"
2026-04-12T09:14:48.25+0700 [RTR/0] OUT finance-config-admin.cfapps.ap11.hana.ondemand.com - [2026-04-12T02:14:48.250Z] "GET /rtr-not-found HTTP/1.1" 404 80 10 "-" "curl/7.88.1" "10.0.1.2:1002" "10.0.2.2:2002" x_forwarded_for:"1.2.3.5" x_forwarded_proto:"https" vcap_request_id:"rtr-req-002" response_time:0.000 gorouter_time:0.000009 app_id:"app001" app_index:"0" instance_id:"inst001" failed_attempts:0 failed_attempts_time:"-" x_cf_routererror:"-" x_b3_traceid:"bbccddee" x_b3_spanid:"bbccddee" b3:"bbccddee-bbccddee"
2026-04-12T09:14:48.30+0700 [RTR/0] OUT finance-config-admin.cfapps.ap11.hana.ondemand.com - [2026-04-12T02:14:48.300Z] "POST /rtr-upstream-fail HTTP/1.1" 500 120 10 "-" "axios/1.0.0" "10.0.1.3:1003" "10.0.2.3:2003" x_forwarded_for:"1.2.3.6" x_forwarded_proto:"https" vcap_request_id:"rtr-req-003" response_time:0.123 gorouter_time:0.000011 app_id:"app001" app_index:"0" instance_id:"inst001" failed_attempts:0 failed_attempts_time:"-" x_cf_routererror:"-" x_b3_traceid:"ccddeeff" x_b3_spanid:"ccddeeff" b3:"ccddeeff-ccddeeff"
Failed to retrieve logs from Log Cache: unexpected status code 404
Failed to retrieve logs from Log Cache: unexpected status code 404
Failed to retrieve logs from Log Cache: unexpected status code 404`;
/* cspell:enable */

// ── Column visibility state ───────────────────────────────────────────────────
// Restored from webview state (persists within a VS Code session).
// Will be overridden by sapTools.columnSettingsInit once the extension sends it.
{
  const savedState = vscodeApi?.getState();
  const saved = Array.isArray(savedState?.visibleColumns) ? savedState.visibleColumns : null;
  const savedFontSizePreset =
    typeof savedState?.fontSizePreset === 'string' ? savedState.fontSizePreset : '';
  const savedLogLimitCandidate =
    typeof savedState?.logLimit === 'number' ? savedState.logLimit : Number.NaN;
  const normalizedSavedColumns =
    saved !== null ? normalizeVisibleColumns(saved) : [...DEFAULT_VISIBLE_COLUMNS];
  // eslint-disable-next-line no-var
  var visibleColumns = normalizedSavedColumns;
  // eslint-disable-next-line no-var
  var fontSizePreset = isKnownFontSizePreset(savedFontSizePreset)
    ? savedFontSizePreset
    : DEFAULT_FONT_SIZE_PRESET;
  // eslint-disable-next-line no-var
  var logLimit = isKnownLogLimit(savedLogLimitCandidate)
    ? savedLogLimitCandidate
    : DEFAULT_LOG_LIMIT;
}

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
let scheduledRenderFrame = null;
let hasPendingLevelHydration = false;
let isLogsRequestInFlight = false;
let pendingRequestAppName = '';
let nextCopyRequestId = 0;
/** Maps requestId → callback to invoke when copy result arrives from extension. */
const pendingCopyCallbacks = new Map();
let copyToastTimer = null;

applyFontSizePreset();
applyLogLimitSetting();

// Build header from current column config before first render.
rebuildTableHeader();

if (vscodeApi === null) {
  // Browser prototype mode: render sample data and populate app selector.
  allRows = trimRowsForMemory(parseCfRecentLog(PROTOTYPE_SAMPLE_LOG));
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
  const tableHead = document.getElementById('log-table-head');
  const tableBody = document.getElementById('log-table-body');
  const tableSummary = document.getElementById('table-summary');
  const workspaceScope = document.getElementById('workspace-scope');
  const filterSearch = document.getElementById('filter-search');
  const filterLevel = document.getElementById('filter-level');
  const filterApp = document.getElementById('filter-app');
  const settingsToggle = document.getElementById('settings-toggle');
  const settingsPanel = document.getElementById('settings-panel');
  const settingsColumnToggles = document.getElementById('settings-column-toggles');
  const settingsFontSize = document.getElementById('settings-font-size');
  const settingsLogLimit = document.getElementById('settings-log-limit');
  const copyToast = document.getElementById('copy-toast');

  if (!(tableHead instanceof HTMLTableSectionElement)) {
    throw new Error('Missing #log-table-head.');
  }

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

  if (!(settingsToggle instanceof HTMLButtonElement)) {
    throw new Error('Missing #settings-toggle.');
  }

  if (!(settingsPanel instanceof HTMLElement)) {
    throw new Error('Missing #settings-panel.');
  }

  if (!(settingsColumnToggles instanceof HTMLElement)) {
    throw new Error('Missing #settings-column-toggles.');
  }

  if (!(settingsFontSize instanceof HTMLSelectElement)) {
    throw new Error('Missing #settings-font-size.');
  }

  if (!(settingsLogLimit instanceof HTMLSelectElement)) {
    throw new Error('Missing #settings-log-limit.');
  }

  if (!(copyToast instanceof HTMLElement)) {
    throw new Error('Missing #copy-toast.');
  }

  return {
    tableHead,
    tableBody,
    tableSummary,
    workspaceScope,
    settingsToggle,
    settingsPanel,
    settingsColumnToggles,
    settingsFontSize,
    settingsLogLimit,
    copyToast,
    filters: {
      search: filterSearch,
      level: filterLevel,
      app: filterApp,
    },
  };
}

// ── Log parsing ──────────────────────────────────────────────────────────────

function isCfCliSystemMessage(line) {
  return CF_CLI_SYSTEM_MESSAGE_PREFIXES.some((prefix) => line.startsWith(prefix));
}

function parseCfRecentLog(rawText) {
  const rows = [];
  const lines = rawText.split(/\r?\n/);
  let previousRow = null;

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (trimmedLine.length === 0) {
      continue;
    }

    if (isCfCliSystemMessage(trimmedLine)) {
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
      previousRow.level = normalizeLevel(
        resolveCandidateLevel(previousRow),
        previousRow.stream,
        previousRow.message,
        previousRow.source
      );
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
  const level = normalizeLevel('', stream, message, source);
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
  const level = normalizeLevel(readString(payload.level), stream, message, source);
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

function resolveCandidateLevel(row) {
  if (row.format !== 'json' || row.jsonPayload === null || !isObjectRecord(row.jsonPayload)) {
    return '';
  }

  return readString(row.jsonPayload.level);
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

function normalizeLevel(candidateLevel, stream, message, source) {
  const normalizedCandidate = candidateLevel.trim().toLowerCase();

  if (normalizedCandidate === 'warning') {
    return 'warn';
  }

  if (LOG_LEVEL_ORDER.includes(normalizedCandidate)) {
    return normalizedCandidate;
  }

  // RTR (gorouter) access logs contain metadata field names like x_cf_routererror
  // and failed_attempts that would falsely trigger keyword-based level detection.
  // Classify by HTTP status code instead.
  if (typeof source === 'string' && /^rtr\b/i.test(source)) {
    return classifyRtrLog(message);
  }

  if (/\bfatal\b/i.test(message)) {
    return 'fatal';
  }

  if (/\b(?:error|exception|failed)\b/i.test(message)) {
    return 'error';
  }

  if (/\bwarn(?:ing)?\b/i.test(message)) {
    return 'warn';
  }

  if (stream === 'ERR') {
    return 'error';
  }

  return 'info';
}

function classifyRtrLog(message) {
  const match = /"[A-Z]+ [^ ]+ HTTP\/[\d.]+" (\d{3})/.exec(message);
  if (match !== null) {
    const status = parseInt(match[1], 10);
    if (status >= 500) return 'error';
    if (status >= 400) return 'warn';
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
    runFiltersRenderNow();
  });

  elements.filters.level.addEventListener('change', () => {
    runFiltersRenderNow();
  });

  elements.filters.app.addEventListener('change', () => {
    const selectedApp = elements.filters.app.value;
    if (selectedApp.length > 0) {
      showSelectedAppLogs(selectedApp, true);
    }
  });

  elements.settingsToggle.addEventListener('click', () => {
    toggleSettingsPanel();
  });

  // Column checkbox toggles — delegated from the toggles container.
  elements.settingsColumnToggles.addEventListener('change', (event) => {
    if (event.target instanceof HTMLInputElement && event.target.type === 'checkbox') {
      handleColumnToggle(event.target.dataset.columnId ?? '', event.target.checked);
    }
  });

  elements.settingsFontSize.addEventListener('change', () => {
    handleFontSizePresetChange(elements.settingsFontSize.value);
  });

  elements.settingsLogLimit.addEventListener('change', () => {
    handleLogLimitChange(elements.settingsLogLimit.value);
  });

  // Close settings panel when clicking outside it.
  document.addEventListener('click', (event) => {
    if (
      !elements.settingsPanel.hidden &&
      !elements.settingsPanel.contains(/** @type {Node} */ (event.target)) &&
      !elements.settingsToggle.contains(/** @type {Node} */ (event.target))
    ) {
      closeSettingsPanel();
    }
  });

  buildSettingsPanel();
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
  runFiltersRenderNow();
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
    showRowsForSelectedApp(appName, parsedRows, true);
    return;
  }

  // Keep parsed cache warm for faster service switching from the app dropdown.
  appendParsedLinesForApp(appName, textLines);
}

function handleLogsStreamState(appName, status, message) {
  streamStateByApp.set(appName, { status, message: typeof message === 'string' ? message : '' });
  if (elements.filters.app.value === appName) {
    runFiltersRenderNow();
  }
}

function handleCopyLogResult(requestId, success) {
  const callback = pendingCopyCallbacks.get(requestId);
  pendingCopyCallbacks.delete(requestId);
  if (typeof callback === 'function') {
    callback(success);
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

    if (
      msg.type === COPY_LOG_RESULT_MESSAGE_TYPE &&
      typeof msg.requestId === 'number' &&
      typeof msg.success === 'boolean'
    ) {
      handleCopyLogResult(msg.requestId, msg.success);
    }

    if (
      msg.type === COLUMN_SETTINGS_INIT_MESSAGE_TYPE &&
      Array.isArray(msg.visibleColumns)
    ) {
      const incoming = msg.visibleColumns.filter(
        (id) => typeof id === 'string'
      );
      visibleColumns = normalizeVisibleColumns(incoming);
      syncColumnSettingsToState();
      rebuildTableHeader();
      buildSettingsPanel();
      applyFiltersAndRender();
    }

    if (msg.type === FONT_SIZE_SETTING_INIT_MESSAGE_TYPE && typeof msg.fontSizePreset === 'string') {
      if (!isKnownFontSizePreset(msg.fontSizePreset)) {
        return;
      }
      fontSizePreset = msg.fontSizePreset;
      applyFontSizePreset();
      syncFontSizeSettingToState();
    }

    if (msg.type === LOG_LIMIT_SETTING_INIT_MESSAGE_TYPE && typeof msg.logLimit === 'number') {
      if (!isKnownLogLimit(msg.logLimit)) {
        return;
      }
      logLimit = msg.logLimit;
      applyLogLimitSetting();
      syncLogLimitSettingToState();
      reconcileRowsToCurrentLogLimit();
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
  runFiltersRenderNow();
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
  const charCap = resolveRawLogTextCharCap();
  if (mergedText.length <= charCap) {
    return mergedText;
  }

  return mergedText.slice(mergedText.length - charCap);
}

function showRowsForSelectedApp(appName, rows, deferRender = false) {
  allRows = rows.slice();
  filteredRows = [];
  // Preserve selection during streaming appends so the user's chosen row stays
  // highlighted when new lines arrive. Only reset on a full reload (deferRender=false).
  if (!deferRender) {
    selectedRowId = null;
  }
  emptyStateMessage = `No log entries found for ${appName}.`;
  if (deferRender) {
    hasPendingLevelHydration = true;
    scheduleFiltersRender();
    return;
  }
  hydrateDynamicFilterOptions(allRows);
  runFiltersRenderNow();
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

    if (isCfCliSystemMessage(trimmedLine)) {
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
      previousRow.level = normalizeLevel(
        resolveCandidateLevel(previousRow),
        previousRow.stream,
        previousRow.message,
        previousRow.source
      );
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
  const maxRows = Math.min(logLimit, MAX_PARSED_LOG_ROWS);
  if (rows.length <= maxRows) {
    return rows;
  }
  // Keep only the newest rows. Do not renumber IDs — stable IDs are required so
  // that selectedRowId remains valid across trims.
  return rows.slice(rows.length - maxRows);
}

function reconcileRowsToCurrentLogLimit() {
  const charCap = resolveRawLogTextCharCap();
  for (const [appName, rawLogText] of rawLogTextByApp.entries()) {
    const normalizedRaw =
      rawLogText.length > charCap ? rawLogText.slice(rawLogText.length - charCap) : rawLogText;
    if (normalizedRaw !== rawLogText) {
      rawLogTextByApp.set(appName, normalizedRaw);
    }
    parsedRowsByApp.set(appName, trimRowsForMemory(parseCfRecentLog(normalizedRaw)));
  }

  const selectedApp = elements.filters.app.value;
  if (selectedApp.length > 0) {
    const selectedRows = resolveParsedRowsForApp(selectedApp);
    if (Array.isArray(selectedRows)) {
      showRowsForSelectedApp(selectedApp, selectedRows);
      return;
    }
  }

  allRows = trimRowsForMemory(allRows.slice());
  runFiltersRenderNow();
}


// ── Render ───────────────────────────────────────────────────────────────────

function scheduleFiltersRender() {
  if (scheduledRenderFrame !== null) {
    return;
  }

  scheduledRenderFrame = window.requestAnimationFrame(() => {
    scheduledRenderFrame = null;
    if (hasPendingLevelHydration) {
      hydrateDynamicFilterOptions(allRows);
      hasPendingLevelHydration = false;
    }
    applyFiltersAndRender();
  });
}

function runFiltersRenderNow() {
  if (scheduledRenderFrame !== null) {
    window.cancelAnimationFrame(scheduledRenderFrame);
    scheduledRenderFrame = null;
  }

  if (hasPendingLevelHydration) {
    hydrateDynamicFilterOptions(allRows);
    hasPendingLevelHydration = false;
  }

  applyFiltersAndRender();
}

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

  // Clear stale selection when the selected row is no longer in the filtered view.
  // Never auto-select a row — only explicit user clicks should establish a selection.
  if (selectedRowId !== null && !filteredRows.some((row) => row.id === selectedRowId)) {
    selectedRowId = null;
  }

  renderTable(filteredRows);
  renderSummary(filteredRows, allRows);
}

function renderTable(rows) {
  elements.tableBody.replaceChildren();
  pendingCopyCallbacks.clear();

  if (rows.length === 0) {
    const emptyRow = document.createElement('tr');
    const emptyCell = document.createElement('td');
    emptyCell.colSpan = visibleColumns.length;
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
      copyRowMessage(row.message);
    });

    for (const colId of visibleColumns) {
      const colDef = COLUMN_DEFS.find((c) => c.id === colId);
      if (colDef === undefined) {
        continue;
      }

      switch (colId) {
        case 'time':
          tr.append(createTextCell(row.timestamp, colDef.cellClass));
          break;
        case 'source':
          tr.append(createTextCell(row.source, colDef.cellClass));
          break;
        case 'stream':
          tr.append(createTextCell(row.stream, colDef.cellClass));
          break;
        case 'level':
          tr.append(createBadgeCell(row.level, `badge badge-level-${row.level}`, colDef.cellClass));
          break;
        case 'logger':
          tr.append(createTextCell(row.logger, `cell-logger ${colDef.cellClass}`));
          break;
        case 'message':
          tr.append(createMessageCell(row.message));
          break;
        default:
          break;
      }
    }

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

function createBadgeCell(value, badgeClass, cellClass) {
  const td = document.createElement('td');
  if (cellClass !== undefined) {
    td.className = cellClass;
  }
  const badge = document.createElement('span');
  badge.className = badgeClass;
  badge.textContent = value.toUpperCase();
  td.append(badge);
  return td;
}

function createMessageCell(message) {
  const td = document.createElement('td');
  td.className = 'cell-message';
  const textValue = message.length > 0 ? message : '-';
  const messageText = document.createElement('div');
  messageText.className = 'cell-message-text';
  messageText.textContent = textValue;
  td.append(messageText);
  return td;
}

function copyRowMessage(value) {
  if (vscodeApi !== null) {
    nextCopyRequestId += 1;
    const requestId = nextCopyRequestId;
    pendingCopyCallbacks.set(requestId, (success) => {
      if (success) {
        showCopyToast();
      }
    });
    vscodeApi.postMessage({
      type: COPY_LOG_MESSAGE_TYPE,
      requestId,
      text: value,
    });
    return;
  }

  void writeTextToClipboard(value).finally(() => {
    showCopyToast();
  });
}

function showCopyToast() {
  elements.copyToast.classList.add('is-visible');
  if (copyToastTimer !== null) {
    clearTimeout(copyToastTimer);
  }
  copyToastTimer = window.setTimeout(() => {
    elements.copyToast.classList.remove('is-visible');
    copyToastTimer = null;
  }, COPY_TOAST_VISIBLE_MS);
}

async function writeTextToClipboard(value) {
  if (
    typeof navigator === 'object' &&
    navigator !== null &&
    typeof navigator.clipboard?.writeText === 'function'
  ) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      // Continue with fallback below.
    }
  }

  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'absolute';
  textarea.style.left = '-9999px';
  document.body.append(textarea);
  textarea.select();

  let copied = false;
  try {
    copied = document.execCommand('copy');
  } catch {
    copied = false;
  }

  textarea.remove();
  return copied;
}

// ── Column settings ───────────────────────────────────────────────────────────

function isKnownFontSizePreset(value) {
  return FONT_SIZE_PRESETS.includes(value);
}

function isKnownLogLimit(value) {
  return Number.isInteger(value) && LOG_LIMIT_PRESETS.includes(value);
}

function resolveRawLogTextCharCap() {
  const capByLimit = logLimit * RAW_LOG_TEXT_CHARS_PER_LIMIT_ROW;
  return Math.min(MAX_RAW_LOG_TEXT_CHARS, Math.max(MIN_RAW_LOG_TEXT_CHARS, capByLimit));
}

function applyFontSizePreset() {
  document.body.classList.remove(
    'cf-log-font-smaller',
    'cf-log-font-default',
    'cf-log-font-large',
    'cf-log-font-xlarge'
  );
  document.body.classList.add(`cf-log-font-${fontSizePreset}`);
  elements.settingsFontSize.value = fontSizePreset;
}

function handleFontSizePresetChange(nextPreset) {
  if (!isKnownFontSizePreset(nextPreset) || nextPreset === fontSizePreset) {
    return;
  }

  fontSizePreset = nextPreset;
  applyFontSizePreset();
  syncFontSizeSettingToState();
  saveFontSizeSetting();
}

function applyLogLimitSetting() {
  elements.settingsLogLimit.value = String(logLimit);
}

function handleLogLimitChange(nextLimitRaw) {
  const nextLimit = Number.parseInt(nextLimitRaw, 10);
  if (!isKnownLogLimit(nextLimit) || nextLimit === logLimit) {
    applyLogLimitSetting();
    return;
  }

  logLimit = nextLimit;
  applyLogLimitSetting();
  syncLogLimitSettingToState();
  saveLogLimitSetting();
  reconcileRowsToCurrentLogLimit();
}

/**
 * Rebuild the <thead> row to match the current visibleColumns list.
 */
function rebuildTableHeader() {
  const tr = elements.tableHead.rows[0] ?? elements.tableHead.insertRow();
  tr.replaceChildren();

  for (const colId of visibleColumns) {
    const colDef = COLUMN_DEFS.find((c) => c.id === colId);
    if (colDef === undefined) {
      continue;
    }
    const th = document.createElement('th');
    th.className = colDef.cellClass;
    th.textContent = colDef.label;
    tr.append(th);
  }
}

/**
 * Populate the settings panel checkboxes based on COLUMN_DEFS and visibleColumns.
 */
function buildSettingsPanel() {
  elements.settingsColumnToggles.replaceChildren();
  elements.settingsFontSize.value = fontSizePreset;
  elements.settingsLogLimit.value = String(logLimit);

  for (const colDef of COLUMN_DEFS) {
    const label = document.createElement('label');
    label.className = 'settings-column-item' + (colDef.required ? ' is-required' : '');

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.dataset.columnId = colDef.id;
    checkbox.checked = visibleColumns.includes(colDef.id);
    checkbox.disabled = colDef.required;

    const span = document.createElement('span');
    span.textContent = colDef.label;

    label.append(checkbox, span);
    elements.settingsColumnToggles.append(label);
  }
}

function openSettingsPanel() {
  elements.settingsPanel.hidden = false;
  elements.settingsPanel.setAttribute('aria-hidden', 'false');
  elements.settingsToggle.classList.add('is-active');
  elements.settingsToggle.setAttribute('aria-expanded', 'true');
}

function closeSettingsPanel() {
  elements.settingsPanel.hidden = true;
  elements.settingsPanel.setAttribute('aria-hidden', 'true');
  elements.settingsToggle.classList.remove('is-active');
  elements.settingsToggle.setAttribute('aria-expanded', 'false');
}

function toggleSettingsPanel() {
  if (elements.settingsPanel.hidden) {
    openSettingsPanel();
  } else {
    closeSettingsPanel();
  }
}

/**
 * Called when a column checkbox changes. Updates visibleColumns, persists, and re-renders.
 * @param {string} colId
 * @param {boolean} checked
 */
function handleColumnToggle(colId, checked) {
  const colDef = COLUMN_DEFS.find((c) => c.id === colId);
  if (colDef === undefined || colDef.required) {
    return;
  }

  if (checked && !visibleColumns.includes(colId)) {
    visibleColumns = normalizeVisibleColumns([...visibleColumns, colId]);
  } else if (!checked) {
    visibleColumns = normalizeVisibleColumns(
      visibleColumns.filter((id) => id !== colId)
    );
  }

  syncColumnSettingsToState();
  saveColumnSettings();
  rebuildTableHeader();
  applyFiltersAndRender();
}

/**
 * Persist visibleColumns to vscode webview state (fast, session-scoped cache).
 */
function syncColumnSettingsToState() {
  if (vscodeApi !== null) {
    const existing = vscodeApi.getState() ?? {};
    vscodeApi.setState({ ...existing, visibleColumns });
  }
}

function syncFontSizeSettingToState() {
  if (vscodeApi !== null) {
    const existing = vscodeApi.getState() ?? {};
    vscodeApi.setState({ ...existing, fontSizePreset });
  }
}

function syncLogLimitSettingToState() {
  if (vscodeApi !== null) {
    const existing = vscodeApi.getState() ?? {};
    vscodeApi.setState({ ...existing, logLimit });
  }
}

/**
 * Send visibleColumns to the extension host for cross-session persistence (globalState).
 */
function saveColumnSettings() {
  if (vscodeApi !== null) {
    vscodeApi.postMessage({
      type: SAVE_COLUMN_SETTINGS_MESSAGE_TYPE,
      visibleColumns,
    });
  }
}

function saveFontSizeSetting() {
  if (vscodeApi !== null) {
    vscodeApi.postMessage({
      type: SAVE_FONT_SIZE_SETTING_MESSAGE_TYPE,
      fontSizePreset,
    });
  }
}

function saveLogLimitSetting() {
  if (vscodeApi !== null) {
    vscodeApi.postMessage({
      type: SAVE_LOG_LIMIT_SETTING_MESSAGE_TYPE,
      logLimit,
    });
  }
}

function renderSummary(rows, all) {
  elements.tableSummary.textContent = `${rows.length} of ${all.length} rows`;
}
