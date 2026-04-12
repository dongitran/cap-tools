const CF_LINE_PATTERN = /^\s*(?<timestamp>\d{4}-\d{2}-\d{2}T[^\s]+)\s+\[(?<source>[^\]]+)]\s+(?<stream>OUT|ERR)\s?(?<body>.*)$/;
const LOG_LEVEL_ORDER = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'];

const SAMPLE_CF_RECENT_LOG = String.raw`Retrieving logs for app finance-config-admin in org finance-platform / space app as developer@example.com...

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

const elements = getRequiredElements();
const allRows = parseCfRecentLog(SAMPLE_CF_RECENT_LOG);
let filteredRows = [];
let selectedRowId = null;

hydrateDynamicFilterOptions(allRows);
setDefaultMeta(allRows);
applyFiltersAndRender();
bindFilterEvents();

function getRequiredElements() {
  const tableBody = document.getElementById('log-table-body');
  const tableSummary = document.getElementById('table-summary');
  const logDetail = document.getElementById('log-detail');
  const metaApp = document.getElementById('meta-app');
  const metaStream = document.getElementById('meta-stream');
  const metaBuffer = document.getElementById('meta-buffer');
  const metaFormat = document.getElementById('meta-format');

  const filterSearch = document.getElementById('filter-search');
  const filterFormat = document.getElementById('filter-format');
  const filterStream = document.getElementById('filter-stream');
  const filterLevel = document.getElementById('filter-level');
  const filterSource = document.getElementById('filter-source');
  const filterLogger = document.getElementById('filter-logger');
  const filterComponent = document.getElementById('filter-component');
  const filterOrg = document.getElementById('filter-org');
  const filterSpace = document.getElementById('filter-space');

  if (!(tableBody instanceof HTMLTableSectionElement)) {
    throw new Error('Missing #log-table-body.');
  }

  if (!(tableSummary instanceof HTMLElement)) {
    throw new Error('Missing #table-summary.');
  }

  if (!(logDetail instanceof HTMLElement)) {
    throw new Error('Missing #log-detail.');
  }

  if (!(metaApp instanceof HTMLElement)) {
    throw new Error('Missing #meta-app.');
  }

  if (!(metaStream instanceof HTMLElement)) {
    throw new Error('Missing #meta-stream.');
  }

  if (!(metaBuffer instanceof HTMLElement)) {
    throw new Error('Missing #meta-buffer.');
  }

  if (!(metaFormat instanceof HTMLElement)) {
    throw new Error('Missing #meta-format.');
  }

  if (!(filterSearch instanceof HTMLInputElement)) {
    throw new Error('Missing #filter-search.');
  }

  if (!(filterFormat instanceof HTMLSelectElement)) {
    throw new Error('Missing #filter-format.');
  }

  if (!(filterStream instanceof HTMLSelectElement)) {
    throw new Error('Missing #filter-stream.');
  }

  if (!(filterLevel instanceof HTMLSelectElement)) {
    throw new Error('Missing #filter-level.');
  }

  if (!(filterSource instanceof HTMLSelectElement)) {
    throw new Error('Missing #filter-source.');
  }

  if (!(filterLogger instanceof HTMLSelectElement)) {
    throw new Error('Missing #filter-logger.');
  }

  if (!(filterComponent instanceof HTMLSelectElement)) {
    throw new Error('Missing #filter-component.');
  }

  if (!(filterOrg instanceof HTMLSelectElement)) {
    throw new Error('Missing #filter-org.');
  }

  if (!(filterSpace instanceof HTMLSelectElement)) {
    throw new Error('Missing #filter-space.');
  }

  return {
    tableBody,
    tableSummary,
    logDetail,
    metaApp,
    metaStream,
    metaBuffer,
    metaFormat,
    filters: {
      search: filterSearch,
      format: filterFormat,
      stream: filterStream,
      level: filterLevel,
      source: filterSource,
      logger: filterLogger,
      component: filterComponent,
      org: filterOrg,
      space: filterSpace,
    },
  };
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

function hydrateDynamicFilterOptions(rows) {
  const levels = collectDistinctValues(rows, (row) => row.level, (value) => {
    const order = LOG_LEVEL_ORDER.indexOf(value);
    return order < 0 ? LOG_LEVEL_ORDER.length : order;
  });
  const sources = collectDistinctValues(rows, (row) => row.source);
  const loggers = collectDistinctValues(rows, (row) => row.logger);
  const components = collectDistinctValues(rows, (row) => row.component);
  const orgs = collectDistinctValues(rows, (row) => row.org);
  const spaces = collectDistinctValues(rows, (row) => row.space);

  rebuildSelect(elements.filters.level, levels);
  rebuildSelect(elements.filters.source, sources);
  rebuildSelect(elements.filters.logger, loggers);
  rebuildSelect(elements.filters.component, components);
  rebuildSelect(elements.filters.org, orgs);
  rebuildSelect(elements.filters.space, spaces);
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

function setDefaultMeta(rows) {
  const appName = readFirstNonEmpty(rows, (row) => row.component) || 'cf-app';
  elements.metaApp.textContent = appName;
}

function readFirstNonEmpty(rows, selector) {
  for (const row of rows) {
    const value = selector(row);
    if (value.length > 0) {
      return value;
    }
  }

  return '';
}

function bindFilterEvents() {
  elements.filters.search.addEventListener('input', () => {
    applyFiltersAndRender();
  });

  elements.filters.format.addEventListener('change', () => {
    applyFiltersAndRender();
  });

  elements.filters.stream.addEventListener('change', () => {
    applyFiltersAndRender();
  });

  elements.filters.level.addEventListener('change', () => {
    applyFiltersAndRender();
  });

  elements.filters.source.addEventListener('change', () => {
    applyFiltersAndRender();
  });

  elements.filters.logger.addEventListener('change', () => {
    applyFiltersAndRender();
  });

  elements.filters.component.addEventListener('change', () => {
    applyFiltersAndRender();
  });

  elements.filters.org.addEventListener('change', () => {
    applyFiltersAndRender();
  });

  elements.filters.space.addEventListener('change', () => {
    applyFiltersAndRender();
  });
}

function applyFiltersAndRender() {
  const searchTerm = elements.filters.search.value.trim().toLowerCase();
  const formatValue = elements.filters.format.value;
  const streamValue = elements.filters.stream.value;
  const levelValue = elements.filters.level.value;
  const sourceValue = elements.filters.source.value;
  const loggerValue = elements.filters.logger.value;
  const componentValue = elements.filters.component.value;
  const orgValue = elements.filters.org.value;
  const spaceValue = elements.filters.space.value;

  filteredRows = allRows.filter((row) => {
    if (formatValue !== 'all' && row.format !== formatValue) {
      return false;
    }

    if (streamValue !== 'all' && row.stream !== streamValue) {
      return false;
    }

    if (levelValue !== 'all' && row.level !== levelValue) {
      return false;
    }

    if (sourceValue !== 'all' && row.source !== sourceValue) {
      return false;
    }

    if (loggerValue !== 'all' && row.logger !== loggerValue) {
      return false;
    }

    if (componentValue !== 'all' && row.component !== componentValue) {
      return false;
    }

    if (orgValue !== 'all' && row.org !== orgValue) {
      return false;
    }

    if (spaceValue !== 'all' && row.space !== spaceValue) {
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
  const selectedRow = filteredRows.find((row) => row.id === selectedRowId) || null;
  renderDetail(selectedRow);
  renderSummary(filteredRows, allRows);
  renderMeta(filteredRows, allRows);
}

function renderTable(rows) {
  elements.tableBody.replaceChildren();

  if (rows.length === 0) {
    const emptyRow = document.createElement('tr');
    const emptyCell = document.createElement('td');
    emptyCell.colSpan = 10;
    emptyCell.className = 'empty-row';
    emptyCell.textContent = 'No rows match the current filters.';
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
      renderDetail(row);
    });

    tr.append(createTextCell(row.timestamp));
    tr.append(createTextCell(row.source));
    tr.append(createTextCell(row.stream));
    tr.append(createBadgeCell(row.format, `badge badge-format-${row.format}`));
    tr.append(createBadgeCell(row.level, `badge badge-level-${row.level}`));
    tr.append(createTextCell(row.logger, 'cell-logger'));
    tr.append(createTextCell(row.component, 'cell-component'));
    tr.append(createTextCell(row.org, 'cell-org'));
    tr.append(createTextCell(row.space, 'cell-space'));
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

function renderDetail(row) {
  elements.logDetail.replaceChildren();

  if (row === null) {
    const emptyTitle = document.createElement('h2');
    emptyTitle.textContent = 'Log detail';
    const emptyText = document.createElement('p');
    emptyText.textContent = 'Select a log row to inspect full payload.';
    elements.logDetail.append(emptyTitle, emptyText);
    return;
  }

  const title = document.createElement('h2');
  title.textContent = `${row.stream} ${row.source}`;

  const contextLine = document.createElement('p');
  contextLine.textContent = `${row.timestamp} | ${row.format.toUpperCase()} | ${row.level.toUpperCase()}`;

  const messageHeading = document.createElement('h3');
  messageHeading.textContent = 'Message';

  const messagePre = document.createElement('pre');
  messagePre.textContent = row.message;

  elements.logDetail.append(title, contextLine, messageHeading, messagePre);

  if (row.jsonPayload !== null) {
    const jsonHeading = document.createElement('h3');
    jsonHeading.textContent = 'JSON payload';

    const jsonPre = document.createElement('pre');
    jsonPre.textContent = JSON.stringify(row.jsonPayload, null, 2);

    elements.logDetail.append(jsonHeading, jsonPre);
  }
}

function renderSummary(rows, all) {
  const streamFilter = elements.filters.stream.value;
  const formatFilter = elements.filters.format.value;

  const activeBits = [];
  if (streamFilter !== 'all') {
    activeBits.push(`stream=${streamFilter}`);
  }
  if (formatFilter !== 'all') {
    activeBits.push(`format=${formatFilter}`);
  }

  const activeFilterText = activeBits.length > 0 ? ` (${activeBits.join(', ')})` : '';
  elements.tableSummary.textContent = `${rows.length} of ${all.length} rows visible${activeFilterText}.`;
}

function renderMeta(rows, all) {
  const jsonCount = rows.filter((row) => row.format === 'json').length;
  const textCount = rows.length - jsonCount;

  elements.metaBuffer.textContent = `Rows ${rows.length}/${all.length}`;
  elements.metaFormat.textContent = `JSON ${jsonCount} • Text ${textCount}`;

  const streamFilter = elements.filters.stream.value;
  elements.metaStream.textContent = streamFilter === 'all' ? 'ALL' : streamFilter;
}
