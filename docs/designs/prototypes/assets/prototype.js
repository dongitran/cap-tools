import { DESIGN_CATALOG, REGION_GROUPS } from './design-catalog.js?v=20260412q';

const TAB_ITEMS = [
  { id: 'logs', label: 'Logs' },
  { id: 'apps', label: 'Apps' },
  { id: 'targets', label: 'Targets' },
  { id: 'settings', label: 'Settings' },
];

const DEFAULT_ORG_OPTIONS = [
  {
    id: 'org-core-prod',
    name: 'core-platform-prod',
    spaces: ['prod', 'staging', 'integration'],
  },
  {
    id: 'org-finance-prod',
    name: 'finance-services-prod',
    spaces: ['prod', 'uat', 'sandbox'],
  },
  {
    id: 'org-retail-prod',
    name: 'retail-experience-prod',
    spaces: ['prod', 'campaigns', 'performance'],
  },
  {
    id: 'org-data-prod',
    name: 'data-foundation-prod',
    spaces: ['prod', 'etl', 'observability'],
  },
];

const BR10_ORG_OPTIONS = [
  { id: 'org-br10-core-platform', name: 'core-platform-prod', spaces: ['prod', 'staging', 'integration'] },
  { id: 'org-br10-finance-services', name: 'finance-services-prod', spaces: ['prod', 'uat', 'sandbox'] },
  { id: 'org-br10-retail-experience', name: 'retail-experience-prod', spaces: ['prod', 'campaigns', 'performance'] },
  { id: 'org-br10-data-foundation', name: 'data-foundation-prod', spaces: ['prod', 'etl', 'observability'] },
  { id: 'org-br10-tax-engineering', name: 'tax-engineering-prod', spaces: ['prod', 'uat'] },
  { id: 'org-br10-payments-ledger', name: 'payments-ledger-prod', spaces: ['prod', 'staging'] },
  { id: 'org-br10-supply-chain', name: 'supply-chain-control-prod', spaces: ['prod', 'integration'] },
  { id: 'org-br10-customer-insights', name: 'customer-insights-prod', spaces: ['prod', 'performance'] },
  { id: 'org-br10-partner-gateway', name: 'partner-gateway-prod', spaces: ['prod', 'sandbox'] },
  { id: 'org-br10-revenue-ops', name: 'revenue-operations-prod', spaces: ['prod', 'uat', 'observability'] },
  { id: 'org-br10-commerce-catalog', name: 'commerce-catalog-prod', spaces: ['prod', 'campaigns'] },
  { id: 'org-br10-risk-compliance', name: 'risk-compliance-prod', spaces: ['prod', 'staging', 'observability'] },
  { id: 'org-br10-identity-access', name: 'identity-access-prod', spaces: ['prod', 'integration', 'sandbox'] },
  {
    id: 'org-br10-billing-reconciliation',
    name: 'billing-reconciliation-prod',
    spaces: ['prod', 'uat', 'etl'],
  },
];

const SPACE_APP_OPTIONS = {
  prod: ['billing-api', 'payments-worker', 'audit-service', 'destination-adapter'],
  staging: ['billing-api-staging', 'payments-worker-staging', 'audit-service-staging'],
  integration: ['billing-api-int', 'payments-worker-int', 'events-int-consumer'],
  uat: ['finance-uat-api', 'finance-uat-worker', 'finance-uat-audit'],
  sandbox: ['sandbox-api', 'sandbox-worker', 'sandbox-observer'],
  campaigns: ['campaign-engine', 'campaign-events', 'campaign-content'],
  performance: ['perf-api', 'perf-worker', 'perf-load-probe'],
  etl: ['etl-scheduler', 'etl-transformer', 'etl-writer'],
  observability: ['metrics-collector', 'traces-forwarder', 'alerts-dispatcher'],
};

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
const REQUEST_INITIAL_STATE_MESSAGE_TYPE = 'sapTools.requestInitialState';
const REGION_SELECTED_MESSAGE_TYPE = 'sapTools.regionSelected';
const OPEN_CF_LOGS_PANEL_MESSAGE_TYPE = 'sapTools.openCfLogsPanel';
const ORG_SELECTED_MESSAGE_TYPE = 'sapTools.orgSelected';
const SPACE_SELECTED_MESSAGE_TYPE = 'sapTools.spaceSelected';
const ACTIVE_APPS_CHANGED_MESSAGE_TYPE = 'sapTools.activeAppsChanged';
const UPDATE_SYNC_INTERVAL_MESSAGE_TYPE = 'sapTools.updateSyncInterval';
const SYNC_NOW_MESSAGE_TYPE = 'sapTools.syncNow';
const LOGOUT_MESSAGE_TYPE = 'sapTools.logout';
const SELECT_LOCAL_ROOT_FOLDER_MESSAGE_TYPE = 'sapTools.selectLocalRootFolder';
const REFRESH_SERVICE_FOLDER_MAPPINGS_MESSAGE_TYPE =
  'sapTools.refreshServiceFolderMappings';
const SELECT_SERVICE_FOLDER_MAPPING_MESSAGE_TYPE = 'sapTools.selectServiceFolderMapping';
const EXPORT_SERVICE_ARTIFACTS_MESSAGE_TYPE = 'sapTools.exportServiceArtifacts';
const vscodeApi = resolveVscodeApi();

const SYNC_INTERVAL_OPTIONS = [12, 24, 48, 96];

// Live data state — only used in VSCode mode (vscodeApi !== null).
let liveOrgOptions = null;        // [{guid, name}] when loaded, null = use mock data
let liveOrgLookup = new Map();    // guid → {guid, name}
let liveSpaceNames = null;        // string[] when loaded, null = use mock data
let liveAppOptions = null;        // [{id, name, runningInstances}] when loaded, null = use mock data
let orgsLoadingState = 'idle';    // 'idle' | 'loading' | 'loaded' | 'error'
let spacesLoadingState = 'idle';  // 'idle' | 'loading' | 'loaded' | 'error'
let appsLoadingState = 'idle';    // 'idle' | 'loading' | 'loaded' | 'error'
let orgsErrorMessage = '';
let spacesErrorMessage = '';
let appsErrorMessage = '';
let syncIntervalHours = 24;
let syncInProgress = false;
let lastSyncStartedAt = null;
let lastSyncCompletedAt = null;
let nextSyncAt = null;
let lastSyncError = '';
let activeUserEmail = '';
let settingsStatusMessage = '';
let previousModeBeforeSettings = 'selection';
let regionAccessById = new Map();
let localServiceRootFolderPath = '';
let serviceFolderMappings = [];
let selectedServiceExportAppId = '';
let serviceExportStatusMessage = '';
let serviceExportStatusTone = 'info';
let serviceFolderScanInProgress = false;
let serviceExportInProgress = false;

// Listen for messages from the extension host (org/space data, scope updates).
window.addEventListener('message', (event) => {
  const msg = event.data;
  if (!isRecord(msg)) {
    return;
  }

  // Ignore gallery navigation messages (prototype gallery only).
  if (msg.type === 'saptools.prototype.navigate') {
    return;
  }

  if (msg.type === 'sapTools.orgsLoaded') {
    const rawOrgs = msg.orgs;
    if (!Array.isArray(rawOrgs)) {
      return;
    }
    liveOrgOptions = rawOrgs
      .filter((o) => isRecord(o) && typeof o.guid === 'string' && typeof o.name === 'string')
      .map((o) => ({ guid: o.guid, name: o.name }));
    liveOrgLookup = new Map(liveOrgOptions.map((o) => [o.guid, o]));
    orgsLoadingState = 'loaded';
    rerenderSelectionStageSlotsWithMotion(['org', 'space', 'confirm']);
    return;
  }

  if (msg.type === 'sapTools.orgsError') {
    orgsLoadingState = 'error';
    orgsErrorMessage =
      typeof msg.message === 'string' ? msg.message : 'Failed to load organizations.';
    rerenderSelectionStageSlotsWithMotion(['org', 'space', 'confirm']);
    return;
  }

  if (msg.type === 'sapTools.spacesLoaded') {
    const rawSpaces = msg.spaces;
    if (!Array.isArray(rawSpaces)) {
      return;
    }
    liveSpaceNames = rawSpaces
      .filter((s) => isRecord(s) && typeof s.name === 'string' && s.name.length > 0)
      .map((s) => s.name);
    spacesLoadingState = 'loaded';
    appsLoadingState = 'idle';
    selectedSpaceId = '';
    liveAppOptions = null;
    appsErrorMessage = '';
    // Auto-select when there is only one space.
    if (liveSpaceNames.length === 1) {
      selectedSpaceId = liveSpaceNames[0];
      requestAppsForSelectedScope(selectedSpaceId);
    }
    rerenderSelectionStageSlotsWithMotion(['space', 'confirm']);
    return;
  }

  if (msg.type === 'sapTools.spacesError') {
    spacesLoadingState = 'error';
    spacesErrorMessage =
      typeof msg.message === 'string' ? msg.message : 'Failed to load spaces.';
    liveAppOptions = null;
    appsLoadingState = 'idle';
    appsErrorMessage = '';
    rerenderSelectionStageSlotsWithMotion(['space', 'confirm']);
    return;
  }

  if (msg.type === 'sapTools.appsLoaded') {
    const rawApps = msg.apps;
    if (!Array.isArray(rawApps)) {
      return;
    }

    liveAppOptions = rawApps
      .filter((app) => isRecord(app) && typeof app.name === 'string')
      .map((app) => ({
        id: typeof app.id === 'string' && app.id.length > 0 ? app.id : app.name,
        name: app.name,
        runningInstances:
          typeof app.runningInstances === 'number' && Number.isFinite(app.runningInstances)
            ? app.runningInstances
            : 0,
      }));

    appsLoadingState = 'loaded';
    appsErrorMessage = '';
    pruneSelectedAppIds();
    if (localServiceRootFolderPath.length > 0) {
      refreshServiceMappingsAfterAppsLoaded();
    } else {
      clearServiceMappingsForScope();
    }

    if (isWorkspaceLogsMounted()) {
      refreshWorkspaceLogsView();
      return;
    }
    renderPrototype();
    return;
  }

  if (msg.type === 'sapTools.appsError') {
    liveAppOptions = [];
    appsLoadingState = 'error';
    appsErrorMessage = typeof msg.message === 'string' ? msg.message : 'Failed to load apps.';
    pruneSelectedAppIds();
    clearServiceMappingsForScope();

    if (isWorkspaceLogsMounted()) {
      refreshWorkspaceLogsView();
      return;
    }
    renderPrototype();
    return;
  }

  if (msg.type === 'sapTools.cacheState') {
    applyCacheStateSnapshot(msg.snapshot);
    return;
  }

  if (msg.type === 'sapTools.logoutResult') {
    const success = msg.success === true;
    settingsStatusMessage = success
      ? 'Logging out...'
      : (typeof msg.error === 'string' && msg.error.length > 0
        ? msg.error
        : 'Failed to logout.');
    renderPrototype();
    return;
  }

  if (msg.type === 'sapTools.localRootFolderUpdated') {
    if (typeof msg.path === 'string') {
      localServiceRootFolderPath = msg.path.trim();
      if (localServiceRootFolderPath.length === 0) {
        serviceExportStatusTone = 'error';
        serviceExportStatusMessage = 'Root folder is not selected yet.';
      }
      refreshServiceMappingsAfterAppsLoaded();
      refreshUiAfterServiceExportStateChange();
    }
    return;
  }

  if (msg.type === 'sapTools.serviceFolderMappingsLoaded') {
    const rawMappings = msg.mappings;
    if (!Array.isArray(rawMappings)) {
      return;
    }

    serviceFolderScanInProgress = false;
    serviceFolderMappings = normalizeServiceFolderMappings(rawMappings);
    pruneSelectedServiceExportAppId();
    const mappedCount = serviceFolderMappings.filter((mapping) => mapping.isMapped).length;
    serviceExportStatusTone = 'info';
    serviceExportStatusMessage = `Mapped ${mappedCount}/${serviceFolderMappings.length} services.`;
    refreshUiAfterServiceExportStateChange();
    return;
  }

  if (msg.type === 'sapTools.serviceFolderMappingsError') {
    serviceFolderScanInProgress = false;
    serviceFolderMappings = [];
    selectedServiceExportAppId = '';
    serviceExportStatusTone = 'error';
    serviceExportStatusMessage =
      typeof msg.message === 'string' && msg.message.length > 0
        ? msg.message
        : 'Failed to scan local folder mappings.';
    refreshUiAfterServiceExportStateChange();
    return;
  }

  if (msg.type === 'sapTools.exportArtifactProgress') {
    serviceExportInProgress = msg.inProgress === true;
    if (typeof msg.message === 'string' && msg.message.length > 0) {
      serviceExportStatusTone = 'info';
      serviceExportStatusMessage = msg.message;
    }
    refreshUiAfterServiceExportStateChange();
    return;
  }

  if (msg.type === 'sapTools.exportArtifactResult') {
    serviceExportInProgress = false;
    const success = msg.success === true;
    serviceExportStatusTone = success ? 'success' : 'error';
    serviceExportStatusMessage =
      typeof msg.message === 'string' && msg.message.length > 0
        ? msg.message
        : success
          ? 'Export completed.'
          : 'Export failed.';
    refreshUiAfterServiceExportStateChange();
  }
});

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
let selectedOrgId = '';
let selectedSpaceId = '';
let activeTabId = 'logs';
let isConnected = false;
let isLiveMode = false;
let selectedLevel = 'all';
let searchKeyword = '';
let selectedLogId = '';
let statusMessage = '';
let lastSyncLabel = 'Not synced yet';
let logsData = cloneSeedLogs();
let selectedAppLogIds = [];
let activeAppLogIds = [];
let pendingSelectionMotion = null;
const pendingStageHeightMotions = new Map();
const DESIGN_PATTERN_CLASS_PREFIX = 'pattern-';
const DESIGN_THEME_CLASS_PREFIX = 'theme-';
const SELECTION_STAGE_SLOT_IDS = ['area', 'region', 'org', 'space', 'confirm'];

applyDesignTokens(activeDesign);
renderPrototype();
requestInitialState();

appElement.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const areaButton = target.closest('[data-group-id]');
  if (areaButton instanceof HTMLButtonElement) {
    if (areaButton.disabled) {
      return;
    }
    const nextGroupId = areaButton.dataset.groupId ?? '';
    if (selectedGroupId !== nextGroupId) {
      queueSelectionMotion(areaButton, buildDataSelector('data-group-id', nextGroupId));
      queueStageHeightMotion('area');
    }
    handleGroupSelection(nextGroupId);
    rerenderSelectionStageSlotsWithMotion(SELECTION_STAGE_SLOT_IDS);
    return;
  }

  const regionButton = target.closest('[data-region-id]');
  if (regionButton instanceof HTMLButtonElement) {
    if (regionButton.disabled) {
      return;
    }
    const nextRegionId = regionButton.dataset.regionId ?? '';
    if (selectedRegionId === nextRegionId) {
      return;
    }
    queueSelectionMotion(regionButton, buildDataSelector('data-region-id', nextRegionId));
    queueStageHeightMotion('region');
    handleRegionSelection(nextRegionId);
    rerenderSelectionStageSlotsWithMotion(['region', 'org', 'space', 'confirm']);
    return;
  }

  const orgButton = target.closest('[data-org-id]');
  if (orgButton instanceof HTMLButtonElement) {
    const nextOrgId = orgButton.dataset.orgId ?? '';
    if (selectedOrgId === nextOrgId) {
      return;
    }
    queueSelectionMotion(orgButton, buildDataSelector('data-org-id', nextOrgId));
    queueStageHeightMotion('org');
    handleOrgSelection(nextOrgId);
    rerenderSelectionStageSlotsWithMotion(['org', 'space', 'confirm']);
    return;
  }

  const spaceButton = target.closest('[data-space-id]');
  if (spaceButton instanceof HTMLButtonElement) {
    const nextSpaceId = spaceButton.dataset.spaceId ?? '';
    if (selectedSpaceId === nextSpaceId) {
      return;
    }
    queueSelectionMotion(spaceButton, buildDataSelector('data-space-id', nextSpaceId));
    queueStageHeightMotion('space');
    handleSpaceSelection(nextSpaceId);
    rerenderSelectionStageSlotsWithMotion(['space', 'confirm']);
    return;
  }

  const actionElement = target.closest('[data-action]');
  if (!(actionElement instanceof HTMLElement)) {
    return;
  }

  const action = actionElement.dataset.action ?? '';
  queueStageHeightMotionByAction(action);
  const modeBeforeAction = mode;
  const tabBeforeAction = activeTabId;
  if (!handleAction(action, actionElement)) {
    return;
  }

  if (shouldRefreshWorkspaceLogsOnly(action, modeBeforeAction, tabBeforeAction)) {
    refreshWorkspaceLogsView();
    return;
  }

  if (mode !== modeBeforeAction || mode !== 'selection') {
    renderPrototype();
    return;
  }

  const affectedSlots = resolveSelectionStageSlotsForAction(action);
  if (affectedSlots.length === 0) {
    rerenderSelectionStageSlotsWithMotion(SELECTION_STAGE_SLOT_IDS);
    return;
  }

  rerenderSelectionStageSlotsWithMotion(affectedSlots);
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

appElement.addEventListener('change', (event) => {
  const target = event.target;
  if (
    target instanceof HTMLSelectElement &&
    target.dataset.role === 'sync-interval-select'
  ) {
    const syncHoursRaw = Number.parseInt(target.value, 10);
    if (!SYNC_INTERVAL_OPTIONS.includes(syncHoursRaw)) {
      return;
    }

    syncIntervalHours = syncHoursRaw;
    settingsStatusMessage = `Sync interval updated to ${formatSyncIntervalLabel(syncHoursRaw)}.`;
    postSyncIntervalUpdate(syncHoursRaw);
    renderPrototype();
    return;
  }

  if (
    target instanceof HTMLSelectElement &&
    target.dataset.role === 'service-folder-path-select'
  ) {
    const appId = target.dataset.appId ?? '';
    if (appId.length === 0) {
      return;
    }

    const selectedFolderPath = target.value.trim();
    serviceFolderMappings = serviceFolderMappings.map((mapping) => {
      if (mapping.appId !== appId) {
        return mapping;
      }

      const candidateFolderPaths = Array.isArray(mapping.candidateFolderPaths)
        ? mapping.candidateFolderPaths
        : [];
      const isAllowedPath = candidateFolderPaths.includes(selectedFolderPath);
      const nextFolderPath = isAllowedPath ? selectedFolderPath : '';
      return {
        ...mapping,
        folderPath: nextFolderPath,
        isMapped: nextFolderPath.length > 0,
      };
    });

    if (selectedFolderPath.length > 0) {
      selectedServiceExportAppId = appId;
      serviceExportStatusTone = 'info';
      serviceExportStatusMessage = 'Service folder selected.';
    } else if (selectedServiceExportAppId === appId) {
      selectedServiceExportAppId = '';
      serviceExportStatusTone = 'info';
      serviceExportStatusMessage = 'Service folder selection cleared.';
    }

    postSelectServiceFolderMapping(appId, selectedFolderPath);
    refreshUiAfterServiceExportStateChange();
    return;
  }

  if (!(target instanceof HTMLInputElement)) {
    return;
  }

  if (target.dataset.role !== 'log-app-checkbox') {
    return;
  }

  const appId = target.dataset.appId ?? '';
  if (appId.length === 0) {
    return;
  }

  const selectedIds = new Set(selectedAppLogIds);
  if (target.checked) {
    selectedIds.add(appId);
  } else {
    selectedIds.delete(appId);
  }

  selectedAppLogIds = Array.from(selectedIds);
  if (isWorkspaceLogsMounted()) {
    refreshWorkspaceLogsView();
    return;
  }
  renderPrototype();
});

function shouldRefreshWorkspaceLogsOnly(action, modeBeforeAction, tabBeforeAction) {
  const isLogsAction = action === 'start-app-logging' || action === 'stop-app-logging';
  if (!isLogsAction) {
    return false;
  }

  return (
    modeBeforeAction === 'workspace' &&
    mode === 'workspace' &&
    tabBeforeAction === 'logs' &&
    activeTabId === 'logs'
  );
}

function isWorkspaceLogsMounted() {
  if (mode !== 'workspace' || activeTabId !== 'logs') {
    return false;
  }

  return appElement.querySelector('.app-logs-panel') instanceof HTMLElement;
}

function refreshWorkspaceLogsView() {
  const logsPanel = appElement.querySelector('.app-logs-panel');
  if (!(logsPanel instanceof HTMLElement)) {
    renderPrototype();
    return;
  }

  const availableApps = resolveCurrentSpaceApps();
  const selectedApps = new Set(selectedAppLogIds);
  const activeApps = new Set(activeAppLogIds);
  const startableSelectionCount = getStartableSelectionCount(activeApps);
  const catalogMarkup = renderCatalogByState(availableApps, selectedApps, activeApps);

  const catalogElement = logsPanel.querySelector('[data-role="app-log-catalog"]');
  if (!(catalogElement instanceof HTMLElement)) {
    renderPrototype();
    return;
  }
  catalogElement.innerHTML = catalogMarkup;

  const activeAppsElement = logsPanel.querySelector('[data-role="active-app-log-list"]');
  if (!(activeAppsElement instanceof HTMLElement)) {
    renderPrototype();
    return;
  }
  activeAppsElement.innerHTML = renderActiveAppsLogList(availableApps, activeApps);

  const startButton = logsPanel.querySelector('[data-action="start-app-logging"]');
  if (startButton instanceof HTMLButtonElement) {
    startButton.disabled = startableSelectionCount === 0 || !isAppsCatalogReady();
  }

  const statusElement = logsPanel.querySelector('[data-role="app-log-status"]');
  if (statusElement instanceof HTMLElement) {
    statusElement.hidden = statusMessage.length === 0;
    statusElement.textContent = statusMessage;
  }

  const syncElement = appElement.querySelector('[data-role="workspace-last-sync"]');
  if (syncElement instanceof HTMLElement) {
    syncElement.textContent = `Last sync: ${lastSyncLabel}`;
  }
}

function refreshUiAfterServiceExportStateChange() {
  if (mode === 'selection' && isSelectionShellMounted()) {
    updateSelectionStageSlots(SELECTION_STAGE_SLOT_IDS);
    return;
  }

  if (isWorkspaceLogsMounted()) {
    refreshWorkspaceLogsView();
    return;
  }

  renderPrototype();
}

function handleGroupSelection(nextGroupId) {
  const nextGroup = groupLookup.get(nextGroupId);
  if (nextGroup === undefined || isAreaDisabled(nextGroupId)) {
    return;
  }

  const didChangeGroup = selectedGroupId !== nextGroupId;
  selectedGroupId = nextGroupId;

  if (!didChangeGroup) {
    return;
  }

  selectedRegionId = '';
  selectedOrgId = '';
  selectedSpaceId = '';
  resetWorkspaceLoggingState();
}

function handleRegionSelection(nextRegionId) {
  if (isRegionDisabled(nextRegionId)) {
    return;
  }

  const nextRegion = regionLookup.get(nextRegionId);
  const nextGroupId = regionGroupLookup.get(nextRegionId) ?? '';
  const nextGroup = groupLookup.get(nextGroupId);

  if (nextRegion === undefined || nextGroupId.length === 0 || nextGroup === undefined) {
    return;
  }

  selectedGroupId = nextGroupId;
  selectedRegionId = nextRegionId;
  selectedOrgId = '';
  selectedSpaceId = '';
  resetWorkspaceLoggingState();

  // Reset live data state so the org stage starts fresh.
  liveOrgOptions = null;
  liveOrgLookup = new Map();
  liveSpaceNames = null;
  liveAppOptions = null;
  spacesLoadingState = 'idle';
  spacesErrorMessage = '';
  appsLoadingState = 'idle';
  appsErrorMessage = '';

  if (vscodeApi !== null) {
    orgsLoadingState = 'loading';
    orgsErrorMessage = '';
  } else {
    orgsLoadingState = 'idle';
  }

  postRegionSelection(nextRegion, nextGroup.label);
}

function handleOrgSelection(nextOrgId) {
  if (selectedRegionId.length === 0) {
    return;
  }

  const orgExists =
    vscodeApi !== null && liveOrgOptions !== null
      ? liveOrgLookup.has(nextOrgId)
      : resolveCurrentMockOrgOptions().some((org) => org.id === nextOrgId);

  if (!orgExists) {
    return;
  }

  selectedOrgId = nextOrgId;
  selectedSpaceId = '';
  resetWorkspaceLoggingState();
  liveSpaceNames = null;
  liveAppOptions = null;
  spacesErrorMessage = '';
  appsErrorMessage = '';
  appsLoadingState = 'idle';

  if (vscodeApi !== null) {
    spacesLoadingState = 'loading';
    const org = liveOrgLookup.get(nextOrgId);
    postOrgSelection(nextOrgId, org?.name ?? nextOrgId);
  } else {
    spacesLoadingState = 'idle';
  }
}

function handleSpaceSelection(nextSpaceId) {
  if (nextSpaceId === selectedSpaceId) {
    return;
  }

  const selectableSpaces = resolveSelectableSpaces();
  if (selectableSpaces.every((space) => space !== nextSpaceId)) {
    return;
  }

  selectedSpaceId = nextSpaceId;
  resetWorkspaceLoggingState();
  liveAppOptions = null;
  appsErrorMessage = '';

  if (vscodeApi !== null) {
    requestAppsForSelectedScope(nextSpaceId);
    return;
  }

  appsLoadingState = 'idle';
}

function handleAction(action, actionElement) {
  const selectionActionHandled = handleSelectionFlowAction(action);
  if (selectionActionHandled !== null) {
    return selectionActionHandled;
  }

  const tabActionHandled = handleTabAction(action, actionElement.dataset.tabId ?? '');
  if (tabActionHandled !== null) {
    return tabActionHandled;
  }

  const logsActionHandled = handleLogsAction(action, actionElement);
  if (logsActionHandled !== null) {
    return logsActionHandled;
  }

  const serviceExportActionHandled = handleServiceExportAction(action, actionElement);
  if (serviceExportActionHandled !== null) {
    return serviceExportActionHandled;
  }

  return false;
}

function handleSelectionFlowAction(action) {
  if (action === 'open-settings') {
    previousModeBeforeSettings = mode;
    mode = 'settings';
    settingsStatusMessage = '';
    return true;
  }

  if (action === 'close-settings') {
    mode = previousModeBeforeSettings === 'workspace' ? 'workspace' : 'selection';
    return true;
  }

  if (action === 'set-sync-interval') {
    return null;
  }

  if (action === 'sync-now') {
    return null;
  }

  if (action === 'logout') {
    return null;
  }

  if (action === 'reset-area-selection') {
    selectedGroupId = '';
    selectedRegionId = '';
    selectedOrgId = '';
    selectedSpaceId = '';
    resetWorkspaceLoggingState();
    return true;
  }

  if (action === 'reset-region-selection') {
    selectedRegionId = '';
    selectedOrgId = '';
    selectedSpaceId = '';
    resetWorkspaceLoggingState();
    return true;
  }

  if (action === 'reset-org-selection') {
    selectedOrgId = '';
    selectedSpaceId = '';
    resetWorkspaceLoggingState();
    return true;
  }

  if (action === 'reset-space-selection') {
    selectedSpaceId = '';
    resetWorkspaceLoggingState();
    return true;
  }

  if (action === 'confirm-region') {
    if (selectedRegionId.length === 0 || selectedOrgId.length === 0 || selectedSpaceId.length === 0) {
      return false;
    }

    mode = 'workspace';
    activeTabId = 'logs';
    statusMessage = '';
    return true;
  }

  if (action === 'change-region') {
    mode = 'selection';
    isLiveMode = false;
    resetWorkspaceLoggingState();
    return true;
  }

  return null;
}

function handleSettingsAction(action, actionElement) {
  if (action === 'set-sync-interval') {
    const syncHoursRaw = Number.parseInt(actionElement.dataset.syncHours ?? '', 10);
    if (!SYNC_INTERVAL_OPTIONS.includes(syncHoursRaw)) {
      return false;
    }

    syncIntervalHours = syncHoursRaw;
    settingsStatusMessage = `Sync interval updated to ${formatSyncIntervalLabel(syncHoursRaw)}.`;
    postSyncIntervalUpdate(syncHoursRaw);
    return true;
  }

  if (action === 'sync-now') {
    settingsStatusMessage = 'Sync started...';
    postSyncNow();
    return true;
  }

  if (action === 'logout') {
    settingsStatusMessage = 'Signing out...';
    postLogout();
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
  const settingsActionHandled = handleSettingsAction(action, actionElement);
  if (settingsActionHandled !== null) {
    return settingsActionHandled;
  }

  const selectionActionHandled = handleLogsSelectionAction(action, actionElement);
  if (selectionActionHandled !== null) {
    return selectionActionHandled;
  }

  const controlActionHandled = handleLogsControlAction(action, actionElement);
  if (controlActionHandled !== null) {
    return controlActionHandled;
  }

  return null;
}

function handleServiceExportAction(action, actionElement) {
  if (action === 'select-local-root-folder') {
    serviceExportStatusTone = 'info';
    serviceExportStatusMessage = '';
    if (vscodeApi !== null) {
      serviceFolderScanInProgress = true;
      vscodeApi.postMessage({
        type: SELECT_LOCAL_ROOT_FOLDER_MESSAGE_TYPE,
      });
      return true;
    }

    localServiceRootFolderPath = '/Users/demo/workspaces/sap-services';
    serviceExportStatusMessage = 'Root folder selected. Scan completed with prototype data.';
    serviceExportStatusTone = 'success';
    serviceFolderMappings = buildMockServiceFolderMappings(
      localServiceRootFolderPath,
      resolveCurrentSpaceApps()
    );
    pruneSelectedServiceExportAppId();
    return true;
  }

  if (action === 'refresh-service-mappings') {
    refreshServiceMappingsAfterAppsLoaded();
    return true;
  }

  if (action === 'select-export-service') {
    const appId = actionElement.dataset.appId ?? '';
    if (appId.length === 0) {
      return false;
    }
    const mapping = serviceFolderMappings.find((entry) => entry.appId === appId);
    if (mapping === undefined || !mapping.isMapped) {
      return true;
    }
    selectedServiceExportAppId = appId;
    serviceExportStatusTone = 'info';
    serviceExportStatusMessage = `Selected ${mapping.appName} for export.`;
    return true;
  }

  if (action === 'export-service-artifacts') {
    return triggerServiceExport();
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

function handleLogsControlAction(action, actionElement) {
  if (action === 'start-app-logging') {
    if (!isAppsCatalogReady()) {
      statusMessage =
        appsLoadingState === 'error'
          ? 'Cannot start logging because app list is unavailable.'
          : 'Apps are still loading. Please wait.';
      return true;
    }

    const availableApps = resolveCurrentSpaceApps();
    const validAppIds = new Set(availableApps.map((app) => app.id));
    const selectedValidIds = selectedAppLogIds.filter((appId) => validAppIds.has(appId));
    const nextActiveAppIds = new Set(activeAppLogIds.filter((appId) => validAppIds.has(appId)));

    if (selectedValidIds.length === 0) {
      statusMessage = 'Select at least one app to start logging.';
      return true;
    }

    let newlyStartedCount = 0;
    for (const appId of selectedValidIds) {
      if (!nextActiveAppIds.has(appId)) {
        newlyStartedCount += 1;
      }
      nextActiveAppIds.add(appId);
    }

    activeAppLogIds = Array.from(nextActiveAppIds);
    selectedAppLogIds = Array.from(new Set([...selectedValidIds, ...activeAppLogIds]));
    postActiveAppsChanged(resolveActiveAppNamesByIds(activeAppLogIds));
    postOpenCfLogsPanel();
    lastSyncLabel = formatNow();
    statusMessage =
      newlyStartedCount === 0
        ? 'All selected apps are already logging.'
        : `Logging started for ${newlyStartedCount} app${newlyStartedCount > 1 ? 's' : ''}.`;
    return true;
  }

  if (action === 'stop-app-logging') {
    const appId = actionElement.dataset.appId ?? '';
    if (appId.length === 0) {
      return false;
    }

    const isActive = activeAppLogIds.includes(appId);
    if (!isActive) {
      return true;
    }

    const appName =
      resolveCurrentSpaceApps().find((app) => app.id === appId)?.name ?? appId;
    activeAppLogIds = activeAppLogIds.filter((activeAppId) => activeAppId !== appId);
    selectedAppLogIds = selectedAppLogIds.filter((selectedAppId) => selectedAppId !== appId);
    postActiveAppsChanged(resolveActiveAppNamesByIds(activeAppLogIds));
    lastSyncLabel = formatNow();
    statusMessage = `Stopped logging for ${appName}.`;
    return true;
  }

  if (action === 'open-cf-logs-panel') {
    postOpenCfLogsPanel();
    statusMessage = 'CFLogs panel opened.';
    return true;
  }

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

function applyCacheStateSnapshot(snapshot) {
  if (!isRecord(snapshot)) {
    return;
  }

  if (
    typeof snapshot.syncIntervalHours === 'number' &&
    SYNC_INTERVAL_OPTIONS.includes(snapshot.syncIntervalHours)
  ) {
    syncIntervalHours = snapshot.syncIntervalHours;
  }

  syncInProgress = snapshot.syncInProgress === true;
  lastSyncStartedAt =
    typeof snapshot.lastSyncStartedAt === 'string' && snapshot.lastSyncStartedAt.length > 0
      ? snapshot.lastSyncStartedAt
      : null;
  lastSyncCompletedAt =
    typeof snapshot.lastSyncCompletedAt === 'string' && snapshot.lastSyncCompletedAt.length > 0
      ? snapshot.lastSyncCompletedAt
      : null;
  nextSyncAt =
    typeof snapshot.nextSyncAt === 'string' && snapshot.nextSyncAt.length > 0
      ? snapshot.nextSyncAt
      : null;
  lastSyncError =
    typeof snapshot.lastSyncError === 'string' ? snapshot.lastSyncError : '';
  activeUserEmail =
    typeof snapshot.activeUserEmail === 'string' ? snapshot.activeUserEmail : '';
  regionAccessById = normalizeRegionAccessById(snapshot.regionAccessById);

  const selectedRegionExists = regionLookup.has(selectedRegionId);
  if (!selectedRegionExists) {
    selectedRegionId = '';
    selectedOrgId = '';
    selectedSpaceId = '';
    resetWorkspaceLoggingState();
  }

  if (mode === 'selection' && isSelectionShellMounted()) {
    updateSelectionStageSlots(SELECTION_STAGE_SLOT_IDS);
    return;
  }

  if (isWorkspaceLogsMounted()) {
    refreshWorkspaceLogsView();
    return;
  }

  renderPrototype();
}

function normalizeRegionAccessById(rawRegionAccessById) {
  const accessMap = new Map();
  if (!isRecord(rawRegionAccessById)) {
    return accessMap;
  }

  for (const [rawRegionId, rawState] of Object.entries(rawRegionAccessById)) {
    const regionId = rawRegionId.trim().toLowerCase();
    if (regionId.length === 0) {
      continue;
    }

    const normalizedState = normalizeRegionAccessState(rawState);
    accessMap.set(regionId, normalizedState);
  }

  return accessMap;
}

function normalizeRegionAccessState(rawState) {
  if (typeof rawState !== 'string') {
    return 'unknown';
  }

  const normalized = rawState.trim().toLowerCase();
  if (normalized === 'accessible') {
    return 'accessible';
  }

  if (normalized === 'inaccessible') {
    return 'inaccessible';
  }

  if (normalized === 'error') {
    return 'error';
  }

  return 'unknown';
}

function resolveOrderedGroups() {
  const orderedGroups = REGION_GROUPS.slice();
  orderedGroups.sort((leftGroup, rightGroup) => {
    const leftRank = resolveGroupAccessRank(leftGroup);
    const rightRank = resolveGroupAccessRank(rightGroup);
    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }

    return leftGroup.label.localeCompare(rightGroup.label);
  });
  return orderedGroups;
}

function resolveGroupAccessRank(group) {
  const regionStates = group.regions.map((region) => resolveRegionAccessState(region.id));
  if (regionStates.some((state) => state === 'accessible')) {
    return 0;
  }

  if (regionStates.some((state) => state === 'unknown')) {
    return 1;
  }

  if (regionStates.some((state) => state === 'inaccessible')) {
    return 2;
  }

  return 3;
}

function resolveOrderedRegions(group) {
  const orderedRegions = group.regions.slice();
  orderedRegions.sort((leftRegion, rightRegion) => {
    const leftRank = resolveRegionAccessRank(leftRegion.id);
    const rightRank = resolveRegionAccessRank(rightRegion.id);
    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }

    return leftRegion.code.localeCompare(rightRegion.code);
  });
  return orderedRegions;
}

function resolveRegionAccessRank(regionId) {
  const state = resolveRegionAccessState(regionId);
  if (state === 'accessible') {
    return 0;
  }

  if (state === 'unknown') {
    return 1;
  }

  if (state === 'inaccessible') {
    return 2;
  }

  return 3;
}

function resolveRegionAccessState(regionId) {
  if (regionAccessById.size === 0) {
    return 'unknown';
  }

  const normalizedRegionId = regionId.trim().toLowerCase();
  const state = regionAccessById.get(normalizedRegionId);
  if (typeof state !== 'string') {
    return 'unknown';
  }

  return state;
}

function isAreaDisabled(groupId) {
  if (regionAccessById.size === 0) {
    return false;
  }

  const group = groupLookup.get(groupId);
  if (group === undefined) {
    return true;
  }

  return group.regions.every((region) => {
    const state = resolveRegionAccessState(region.id);
    return state !== 'accessible' && state !== 'unknown';
  });
}

function isRegionDisabled(regionId) {
  if (regionAccessById.size === 0) {
    return false;
  }

  const state = resolveRegionAccessState(regionId);
  return state === 'inaccessible' || state === 'error';
}

function formatSyncIntervalLabel(syncHours) {
  if (syncHours === 24) {
    return '1 day';
  }

  if (syncHours % 24 === 0) {
    return `${String(syncHours / 24)} days`;
  }

  return `${String(syncHours)} hours`;
}

function formatTimestampLabel(value) {
  if (typeof value !== 'string' || value.length === 0) {
    return 'Never';
  }

  const timestampMs = Date.parse(value);
  if (Number.isNaN(timestampMs)) {
    return 'Never';
  }

  return new Intl.DateTimeFormat('en-GB', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(timestampMs));
}

function resolveSyncStatusLabel() {
  if (syncInProgress) {
    return 'Sync in progress...';
  }

  if (lastSyncError.length > 0) {
    return `Last sync failed: ${lastSyncError}`;
  }

  if (lastSyncCompletedAt !== null) {
    return `Last sync completed at ${formatTimestampLabel(lastSyncCompletedAt)}.`;
  }

  return 'Sync has not started yet.';
}

function resolveSettingsStatusMessage() {
  if (settingsStatusMessage.length > 0) {
    return settingsStatusMessage;
  }

  return resolveSyncStatusLabel();
}

function applyDesignTokens(design) {
  const root = document.body;
  const themeClass = `theme-${String(design.id).padStart(2, '0')}`;
  const patternClass = `pattern-${design.pattern}`;
  applyDesignClasses(root, patternClass, themeClass);
  root.style.setProperty('--design-page-bg', design.colors.page);
  root.style.setProperty('--design-frame-bg', design.colors.frame);
  root.style.setProperty('--design-surface-bg', design.colors.surface);
  root.style.setProperty('--design-border-color', design.colors.border);
  root.style.setProperty('--design-text-color', design.colors.text);
  root.style.setProperty('--design-muted-color', design.colors.muted);
  root.style.setProperty('--design-accent-color', design.colors.accent);
  root.style.setProperty('--design-accent-soft', design.colors.accentSoft);
  root.style.setProperty('--design-chip-text', design.colors.chipText);
  root.style.setProperty('--design-panel-shadow', design.shadow);
  root.style.setProperty('--design-title-font', design.typography.title);
  root.style.setProperty('--design-body-font', design.typography.body);
}

function applyDesignClasses(root, patternClass, themeClass) {
  const classNames = Array.from(root.classList);
  for (const className of classNames) {
    if (
      className.startsWith(DESIGN_PATTERN_CLASS_PREFIX) ||
      className.startsWith(DESIGN_THEME_CLASS_PREFIX)
    ) {
      root.classList.remove(className);
    }
  }

  root.classList.add('prototype-page', patternClass, themeClass);
}

function renderPrototype() {
  const shellMarkup = resolveShellMarkupByMode();

  appElement.innerHTML = `
    <section class="prototype-shell select-style-${activeDesign.selectStyle} mode-${mode}">
      ${shellMarkup}
    </section>
  `;

  if (mode === 'selection') {
    updateSelectionStageSlots(SELECTION_STAGE_SLOT_IDS);
  }
}

function resolveShellMarkupByMode() {
  if (mode === 'selection') {
    return renderSelectionScreen();
  }

  if (mode === 'settings') {
    return renderSettingsScreen();
  }

  return renderWorkspaceScreen();
}

function rerenderSelectionStageSlotsWithMotion(stageSlotIds) {
  if (mode !== 'selection') {
    renderPrototype();
    return;
  }

  if (!isSelectionShellMounted()) {
    renderPrototype();
    playStageHeightMotions();
    playSelectionMotion();
    return;
  }

  updateSelectionStageSlots(stageSlotIds);
  playStageHeightMotions();
  playSelectionMotion();
}

function queueSelectionMotion(optionElement, selector) {
  const sourceRect = optionElement.getBoundingClientRect();
  pendingSelectionMotion = {
    selector,
    left: sourceRect.left,
    top: sourceRect.top,
  };
}

function playSelectionMotion() {
  if (pendingSelectionMotion === null) {
    return;
  }

  if (prefersReducedMotion()) {
    pendingSelectionMotion = null;
    return;
  }

  const target = appElement.querySelector(pendingSelectionMotion.selector);
  if (!(target instanceof HTMLElement)) {
    pendingSelectionMotion = null;
    return;
  }

  const targetRect = target.getBoundingClientRect();
  const dx = pendingSelectionMotion.left - targetRect.left;
  const dy = pendingSelectionMotion.top - targetRect.top;

  if (Math.abs(dx) < 1 && Math.abs(dy) < 1) {
    pendingSelectionMotion = null;
    return;
  }

  target.animate(
    [
      { transform: `translate(${dx}px, ${dy}px)` },
      { transform: 'translate(0, 0)' },
    ],
    {
      duration: 280,
      easing: 'cubic-bezier(0.2, 0.75, 0.25, 1)',
      fill: 'both',
    }
  );

  pendingSelectionMotion = null;
}

function queueStageHeightMotion(stageId) {
  if (mode !== 'selection') {
    return;
  }

  const stage = appElement.querySelector(buildStageSelector(stageId));
  if (!(stage instanceof HTMLElement)) {
    return;
  }

  pendingStageHeightMotions.set(stageId, stage.getBoundingClientRect().height);
}

function queueStageHeightMotionByAction(action) {
  if (action === 'reset-area-selection') {
    queueStageHeightMotion('area');
    return;
  }

  if (action === 'reset-region-selection') {
    queueStageHeightMotion('region');
    return;
  }

  if (action === 'reset-org-selection') {
    queueStageHeightMotion('org');
    return;
  }

  if (action === 'reset-space-selection') {
    queueStageHeightMotion('space');
  }
}

function playStageHeightMotions() {
  if (pendingStageHeightMotions.size === 0) {
    return;
  }

  const shouldReduceMotion = prefersReducedMotion();

  for (const [stageId, startHeight] of pendingStageHeightMotions.entries()) {
    const stage = appElement.querySelector(buildStageSelector(stageId));
    if (!(stage instanceof HTMLElement)) {
      continue;
    }

    const endHeight = stage.getBoundingClientRect().height;
    if (shouldReduceMotion || Math.abs(startHeight - endHeight) < 1) {
      continue;
    }

    stage.style.overflow = 'hidden';
    const animation = stage.animate(
      [{ height: `${startHeight}px` }, { height: `${endHeight}px` }],
      {
        duration: 220,
        easing: 'cubic-bezier(0.2, 0.75, 0.25, 1)',
        fill: 'both',
      }
    );

    animation.addEventListener('finish', () => {
      stage.style.overflow = '';
    });
    animation.addEventListener('cancel', () => {
      stage.style.overflow = '';
    });
  }

  pendingStageHeightMotions.clear();
}

function prefersReducedMotion() {
  if (typeof window.matchMedia !== 'function') {
    return false;
  }

  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function buildDataSelector(attribute, value) {
  const escapedValue =
    typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
      ? CSS.escape(value)
      : value.replaceAll('"', '\\"');

  return `[${attribute}="${escapedValue}"]`;
}

function buildStageSelector(stageId) {
  return `[data-stage-id="${stageId}"]`;
}

function resolveVscodeApi() {
  if (typeof acquireVsCodeApi !== 'function') {
    return null;
  }

  return acquireVsCodeApi();
}

function requestInitialState() {
  if (vscodeApi === null) {
    return;
  }

  vscodeApi.postMessage({
    type: REQUEST_INITIAL_STATE_MESSAGE_TYPE,
  });
}

function postRegionSelection(region, areaLabel) {
  if (vscodeApi === null) {
    return;
  }

  vscodeApi.postMessage({
    type: REGION_SELECTED_MESSAGE_TYPE,
    region: {
      id: region.id,
      name: region.name,
      code: region.code,
      area: areaLabel,
    },
  });
}

function postOrgSelection(orgGuid, orgName) {
  if (vscodeApi === null) {
    return;
  }

  vscodeApi.postMessage({
    type: ORG_SELECTED_MESSAGE_TYPE,
    org: { guid: orgGuid, name: orgName },
  });
}

function postSpaceSelection(spaceName, orgGuid, orgName) {
  if (vscodeApi === null) {
    return;
  }

  vscodeApi.postMessage({
    type: SPACE_SELECTED_MESSAGE_TYPE,
    scope: {
      spaceName,
      orgGuid,
      orgName,
    },
  });
}

function requestAppsForSelectedScope(spaceName) {
  if (vscodeApi === null) {
    return;
  }

  const normalizedSpaceName = spaceName.trim();
  if (normalizedSpaceName.length === 0 || selectedOrgId.length === 0) {
    return;
  }

  liveAppOptions = null;
  appsErrorMessage = '';
  appsLoadingState = 'loading';

  const orgName = resolveSelectedOrg()?.name ?? selectedOrgId;
  postSpaceSelection(normalizedSpaceName, selectedOrgId, orgName);
}

function postOpenCfLogsPanel() {
  if (vscodeApi === null) {
    return;
  }

  vscodeApi.postMessage({
    type: OPEN_CF_LOGS_PANEL_MESSAGE_TYPE,
  });
}

function postActiveAppsChanged(appNames) {
  if (vscodeApi === null) {
    return;
  }

  vscodeApi.postMessage({
    type: ACTIVE_APPS_CHANGED_MESSAGE_TYPE,
    appNames,
  });
}

function postSelectServiceFolderMapping(appId, folderPath) {
  if (vscodeApi === null) {
    return;
  }

  vscodeApi.postMessage({
    type: SELECT_SERVICE_FOLDER_MAPPING_MESSAGE_TYPE,
    appId,
    folderPath,
  });
}

function postSyncIntervalUpdate(syncHours) {
  if (vscodeApi === null) {
    return;
  }

  vscodeApi.postMessage({
    type: UPDATE_SYNC_INTERVAL_MESSAGE_TYPE,
    syncIntervalHours: syncHours,
  });
}

function postSyncNow() {
  if (vscodeApi === null) {
    return;
  }

  vscodeApi.postMessage({
    type: SYNC_NOW_MESSAGE_TYPE,
  });
}

function postLogout() {
  if (vscodeApi === null) {
    return;
  }

  vscodeApi.postMessage({
    type: LOGOUT_MESSAGE_TYPE,
  });
}

function renderSelectionScreen() {
  return `
    <header class="shell-header">
      <div class="shell-header-row">
        <h1>Select SAP BTP Region</h1>
        <button
          type="button"
          class="header-icon-button"
          data-action="open-settings"
          aria-label="Open Settings"
          title="Settings"
        >
          &#9881;
        </button>
      </div>
    </header>

    <div class="groups" role="list">
      ${renderSelectionStageSlots()}
    </div>
  `;
}

function renderSettingsScreen() {
  const syncIntervalOptions = SYNC_INTERVAL_OPTIONS.map((hours) => {
    const isSelected = syncIntervalHours === hours;
    return `
      <option value="${String(hours)}" ${isSelected ? 'selected' : ''}>
        ${formatSyncIntervalLabel(hours)}
      </option>
    `;
  }).join('');

  const userLabel = activeUserEmail.length > 0 ? activeUserEmail : 'Not signed in';
  const syncStatusMessage = resolveSettingsStatusMessage();

  return `
    <header class="shell-header settings-header">
      <div class="shell-header-row">
        <h1>Settings</h1>
        <button
          type="button"
          class="stage-reset"
          data-action="close-settings"
          aria-label="Close Settings"
        >
          Back
        </button>
      </div>
    </header>

    <section class="workspace-body settings-body">
      <section class="group-card settings-section">
        <h2>Cache Sync Interval</h2>
        <div class="sync-interval-picker">
          <label class="sync-interval-label" for="sync-interval-select">Sync interval</label>
          <select
            id="sync-interval-select"
            class="sync-interval-select"
            data-role="sync-interval-select"
            aria-label="Cache sync interval"
          >
            ${syncIntervalOptions}
          </select>
        </div>
        <p class="settings-meta">Current account: ${escapeHtml(userLabel)}</p>
      </section>

      <section class="group-card settings-section">
        <h2>Sync Status</h2>
        <ul class="settings-status-list">
          <li><span>Last start</span><strong>${escapeHtml(formatTimestampLabel(lastSyncStartedAt))}</strong></li>
          <li><span>Last completion</span><strong>${escapeHtml(formatTimestampLabel(lastSyncCompletedAt))}</strong></li>
          <li><span>Next sync</span><strong>${escapeHtml(formatTimestampLabel(nextSyncAt))}</strong></li>
        </ul>
        <p class="settings-status-message" role="status" aria-live="polite">${escapeHtml(syncStatusMessage)}</p>
        <div class="toolbar-row settings-actions" role="group" aria-label="Settings actions">
          <button type="button" class="primary-action" data-action="sync-now">Sync now</button>
          <button type="button" class="secondary-action" data-action="logout">Logout</button>
        </div>
      </section>
    </section>
  `;
}

function renderSelectionStageSlots() {
  return SELECTION_STAGE_SLOT_IDS.map((stageSlotId) => {
    return `<div class="stage-slot" data-stage-slot="${stageSlotId}"></div>`;
  }).join('');
}

function resolveSelectionStageSlotsForAction(action) {
  if (action === 'reset-area-selection') {
    return ['area', 'region', 'org', 'space', 'confirm'];
  }

  if (action === 'reset-region-selection') {
    return ['region', 'org', 'space', 'confirm'];
  }

  if (action === 'reset-org-selection') {
    return ['org', 'space', 'confirm'];
  }

  if (action === 'reset-space-selection') {
    return ['space', 'confirm'];
  }

  return [];
}

function updateSelectionStageSlots(stageSlotIds) {
  const selectedGroup = groupLookup.get(selectedGroupId);
  const selectedRegion = resolveSelectedRegion();
  const normalizedSlotIds = normalizeSelectionStageSlots(stageSlotIds);

  for (const stageSlotId of normalizedSlotIds) {
    const markup = renderSelectionStageMarkup(stageSlotId, selectedGroup, selectedRegion);
    setSelectionStageSlotMarkup(stageSlotId, markup);
  }
}

function normalizeSelectionStageSlots(stageSlotIds) {
  const seenStageSlots = new Set();
  const normalizedStageSlots = [];

  for (const stageSlotId of stageSlotIds) {
    if (
      !SELECTION_STAGE_SLOT_IDS.includes(stageSlotId) ||
      seenStageSlots.has(stageSlotId)
    ) {
      continue;
    }

    normalizedStageSlots.push(stageSlotId);
    seenStageSlots.add(stageSlotId);
  }

  return normalizedStageSlots;
}

function renderSelectionStageMarkup(stageSlotId, selectedGroup, selectedRegion) {
  if (stageSlotId === 'area') {
    return renderAreaStage(selectedGroup);
  }

  if (stageSlotId === 'region') {
    return selectedGroup === undefined
      ? renderEmptyRegionPanel()
      : renderSelectedGroupPanel(selectedGroup);
  }

  if (stageSlotId === 'org') {
    return selectedRegion === undefined ? '' : renderOrgStage();
  }

  if (stageSlotId === 'space') {
    return selectedOrgId.length === 0 ? '' : renderSpaceStage();
  }

  if (stageSlotId === 'confirm') {
    return renderConfirmPanel();
  }

  return '';
}

function setSelectionStageSlotMarkup(stageSlotId, markup) {
  const slotElement = appElement.querySelector(
    `[data-stage-slot="${stageSlotId}"]`
  );
  if (!(slotElement instanceof HTMLElement)) {
    return;
  }

  slotElement.innerHTML = markup;
}

function isSelectionShellMounted() {
  const groupsElement = appElement.querySelector('.groups');
  if (!(groupsElement instanceof HTMLElement)) {
    return false;
  }

  return SELECTION_STAGE_SLOT_IDS.every((stageSlotId) => {
    return (
      appElement.querySelector(`[data-stage-slot="${stageSlotId}"]`) !== null
    );
  });
}

function renderAreaStage(selectedGroup) {
  const isCollapsed = selectedGroup !== undefined;
  const orderedGroups = resolveOrderedGroups();

  return `
    <section class="group-card area-stage" aria-label="Area selector" data-stage-id="area">
      <div class="group-head">
        <h2>Choose Area</h2>
        ${
          isCollapsed
            ? '<button type="button" class="stage-reset" data-action="reset-area-selection">Change</button>'
            : `<span class="group-count">${orderedGroups.length}</span>`
        }
      </div>
      <div class="area-picker${isCollapsed ? ' is-collapsed' : ''}" role="listbox" aria-label="SAP area groups">
        ${renderAreaPicker(selectedGroup, orderedGroups)}
      </div>
    </section>
  `;
}

function renderAreaPicker(selectedGroup, orderedGroups) {
  const isCollapsed = selectedGroup !== undefined;

  return orderedGroups
    .map((group) => {
      const isActive = group.id === selectedGroupId;
      const isHidden = isCollapsed && !isActive;
      const isDisabled = isAreaDisabled(group.id) && !isActive;
      const areaLabelParts = splitAreaLabel(group.label);
      return `
        <button
          type="button"
          class="area-option${isActive ? ' is-active' : ''}${isHidden ? ' is-hidden' : ''}${isDisabled ? ' is-disabled' : ''}"
          data-group-id="${group.id}"
          aria-pressed="${isActive}"
          aria-hidden="${isHidden}"
          aria-disabled="${isDisabled}"
          ${isDisabled ? 'disabled' : ''}
        >
          <span class="area-label">${areaLabelParts.title}</span>
          ${
            areaLabelParts.meta.length > 0
              ? `<span class="area-meta">${areaLabelParts.meta}</span>`
              : ''
          }
        </button>
      `;
    })
    .join('');
}

function splitAreaLabel(label) {
  const normalizedLabel = label.trim();
  const match = /^(.+?)\s*\(([^)]+)\)$/.exec(normalizedLabel);
  if (match === null) {
    return {
      title: normalizedLabel,
      meta: '',
    };
  }

  return {
    title: match[1].trim(),
    meta: match[2].trim(),
  };
}

function renderSelectedGroupPanel(group) {
  const isCollapsed = selectedRegionId.length > 0;
  const orderedRegions = resolveOrderedRegions(group);
  const regionOptionsMarkup = orderedRegions
    .map((region) => {
      const isSelected = region.id === selectedRegionId;
      const isHidden = isCollapsed && !isSelected;
      const isDisabled = isRegionDisabled(region.id) && !isSelected;
      return `
        <button
          type="button"
          class="region-option${isSelected ? ' is-selected' : ''}${isHidden ? ' is-hidden' : ''}${isDisabled ? ' is-disabled' : ''}"
          data-region-id="${region.id}"
          aria-pressed="${isSelected}"
          aria-hidden="${isHidden}"
          aria-disabled="${isDisabled}"
          ${isDisabled ? 'disabled' : ''}
        >
          <span class="region-name">${region.name}</span>
          <span class="region-code">${region.code}</span>
        </button>
      `;
    })
    .join('');

  return `
    <section class="group-card" aria-label="Region list" data-stage-id="region">
      <div class="group-head">
        <h2>Choose Region</h2>
        <button
          type="button"
          class="stage-reset"
          data-action="reset-region-selection"
          ${selectedRegionId.length === 0 ? 'disabled' : ''}
        >
          Change
        </button>
      </div>
      <div class="region-layout ${activeDesign.layout}">
        ${regionOptionsMarkup}
      </div>
    </section>
  `;
}

function renderOrgStage() {
  if (vscodeApi !== null && orgsLoadingState === 'loading') {
    return `
      <section class="group-card org-stage" aria-label="Organization list" data-stage-id="org">
        <div class="group-head"><h2>Choose Organization</h2></div>
        <p class="stage-loading" aria-live="polite">Loading organizations&#8230;</p>
      </section>
    `;
  }

  if (vscodeApi !== null && orgsLoadingState === 'error') {
    return `
      <section class="group-card org-stage" aria-label="Organization list" data-stage-id="org">
        <div class="group-head"><h2>Choose Organization</h2></div>
        <p class="stage-error" role="alert">${escapeHtml(orgsErrorMessage)}</p>
      </section>
    `;
  }

  const activeOrgs =
    vscodeApi !== null && liveOrgOptions !== null
      ? liveOrgOptions.map((o) => ({ id: o.guid, name: o.name }))
      : resolveCurrentMockOrgOptions().map((o) => ({ id: o.id, name: o.name }));

  const isCollapsed = selectedOrgId.length > 0;
  const orgButtons = activeOrgs
    .map((org) => {
      const isSelected = org.id === selectedOrgId;
      const isHidden = isCollapsed && !isSelected;
      return `
        <button
          type="button"
          class="org-option${isSelected ? ' is-selected' : ''}${isHidden ? ' is-hidden' : ''}"
          data-org-id="${escapeHtml(org.id)}"
          aria-pressed="${isSelected}"
          aria-hidden="${isHidden}"
        >
          ${escapeHtml(org.name)}
        </button>
      `;
    })
    .join('');

  return `
    <section class="group-card org-stage" aria-label="Organization list" data-stage-id="org">
      <div class="group-head">
        <h2>Choose Organization</h2>
        <button
          type="button"
          class="stage-reset"
          data-action="reset-org-selection"
          ${selectedOrgId.length === 0 ? 'disabled' : ''}
        >
          Change
        </button>
      </div>
      <div class="org-picker">
        ${orgButtons}
      </div>
    </section>
  `;
}

function renderSpaceStage() {
  if (vscodeApi !== null && spacesLoadingState === 'loading') {
    return `
      <section class="group-card space-stage" aria-label="Space list" data-stage-id="space">
        <div class="group-head"><h2>Choose Space</h2></div>
        <p class="stage-loading" aria-live="polite">Loading spaces&#8230;</p>
      </section>
    `;
  }

  if (vscodeApi !== null && spacesLoadingState === 'error') {
    return `
      <section class="group-card space-stage" aria-label="Space list" data-stage-id="space">
        <div class="group-head"><h2>Choose Space</h2></div>
        <p class="stage-error" role="alert">${escapeHtml(spacesErrorMessage)}</p>
      </section>
    `;
  }

  const spaces = resolveSelectableSpaces();
  const isCollapsed = selectedSpaceId.length > 0;
  const spaceButtons = spaces
    .map((space) => {
      const isSelected = space === selectedSpaceId;
      const isHidden = isCollapsed && !isSelected;
      return `
        <button
          type="button"
          class="space-option${isSelected ? ' is-selected' : ''}${isHidden ? ' is-hidden' : ''}"
          data-space-id="${escapeHtml(space)}"
          aria-pressed="${isSelected}"
          aria-hidden="${isHidden}"
        >
          ${escapeHtml(space)}
        </button>
      `;
    })
    .join('');

  return `
    <section class="group-card space-stage" aria-label="Space list" data-stage-id="space">
      <div class="group-head">
        <h2>Choose Space</h2>
        <button
          type="button"
          class="stage-reset"
          data-action="reset-space-selection"
          ${selectedSpaceId.length === 0 ? 'disabled' : ''}
        >
          Change
        </button>
      </div>
      <div class="space-picker">
        ${spaceButtons}
      </div>
    </section>
  `;
}

function renderConfirmPanel() {
  const selectedRegion = resolveSelectedRegion();
  const selectedOrg = resolveSelectedOrg();
  const isReady = selectedRegion !== undefined && selectedOrg !== undefined && selectedSpaceId.length > 0;

  return `
    <section class="group-card confirm-stage" aria-label="Region confirmation">
      <button
        type="button"
        class="confirm-button"
        data-action="confirm-region"
        ${isReady ? '' : 'disabled'}
      >
        Confirm Scope
      </button>
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
  const selectedOrg = resolveSelectedOrg();
  const selectedSpace = selectedSpaceId.length > 0 ? selectedSpaceId : 'No space selected';
  const regionCode = selectedRegion?.code ?? 'no-region';
  const orgLabel = selectedOrg?.name ?? 'No org selected';
  const workspaceSummary = `Region: ${regionCode}. Org: ${orgLabel}. Space: ${selectedSpace}`;

  return `
    <header class="shell-header workspace-header">
      <div class="shell-header-row">
        <h1>Monitoring Workspace</h1>
        <button
          type="button"
          class="header-icon-button"
          data-action="open-settings"
          aria-label="Open Settings"
          title="Settings"
        >
          &#9881;
        </button>
      </div>
      <p class="workspace-context">${workspaceSummary}</p>
    </header>

    ${renderWorkspaceTabs()}

    <section class="workspace-body">
      ${renderWorkspaceTabContent()}
    </section>

    <footer class="workspace-footer">
      <span data-role="workspace-last-sync">Last sync: ${lastSyncLabel}</span>
      <button type="button" class="secondary-action workspace-logout" data-action="change-region">Change Region</button>
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

  if (activeTabId === 'apps') {
    return renderServiceExportTab();
  }

  return renderPlaceholderTab(activeTabId);
}

function renderLogsTab() {
  const availableApps = resolveCurrentSpaceApps();
  const selectedApps = new Set(selectedAppLogIds);
  const activeApps = new Set(activeAppLogIds);
  const startableSelectionCount = getStartableSelectionCount(activeApps);
  const spaceLabel = selectedSpaceId.length > 0 ? selectedSpaceId : 'current-space';
  const catalogMarkup = renderCatalogByState(availableApps, selectedApps, activeApps);
  const activeAppsMarkup = renderActiveAppsLogList(availableApps, activeApps);
  const statusMarkup =
    statusMessage.length === 0
      ? '<p class="status-note" data-role="app-log-status" hidden></p>'
      : `<p class="status-note" data-role="app-log-status">${escapeHtml(statusMessage)}</p>`;

  return `
    <section class="group-card logs-panel app-logs-panel">
      <section class="active-apps-log" aria-label="Active apps log">
        <h3>Active Apps Log</h3>
        <div data-role="active-app-log-list">${activeAppsMarkup}</div>
      </section>
      <h2>Apps Log Control</h2>
      <p class="logs-intro">Select app(s) in <strong>${escapeHtml(spaceLabel)}</strong> to stream logs.</p>
      <section class="app-log-catalog" aria-label="Apps in selected space" data-role="app-log-catalog">
        ${catalogMarkup}
      </section>
      <div class="toolbar-row" role="group" aria-label="App log actions">
        <button
          type="button"
          class="primary-action app-log-start"
          data-action="start-app-logging"
          ${startableSelectionCount === 0 || !isAppsCatalogReady() ? 'disabled' : ''}
        >
          Start App Logging
        </button>
      </div>
      ${statusMarkup}
    </section>
  `;
}

function renderServiceExportTab() {
  const availableApps = resolveCurrentSpaceApps();
  const mappingRows = resolveServiceExportRows(availableApps);
  const selectedMapping = mappingRows.find(
    (mapping) => mapping.appId === selectedServiceExportAppId && mapping.isMapped
  );
  const selectedSpaceLabel =
    selectedSpaceId.length > 0 ? selectedSpaceId : 'Select a space first';
  const selectedServiceLabel =
    selectedMapping === undefined ? 'No service selected' : selectedMapping.appName;
  const canRefreshMappings =
    localServiceRootFolderPath.length > 0 && availableApps.length > 0 && !serviceExportInProgress;
  const canExport = selectedMapping !== undefined && !serviceExportInProgress;

  return `
    <section class="group-card service-export-tab" aria-label="Service artifact export">
      <header class="service-export-header">
        <h2>Export Service Artifacts</h2>
        <p class="service-export-subline">
          Scope: <strong>${escapeHtml(selectedSpaceLabel)}</strong>
        </p>
      </header>

      <section class="service-export-controls">
        <button
          type="button"
          class="secondary-action"
          data-action="select-local-root-folder"
          ${serviceExportInProgress ? 'disabled' : ''}
        >
          Select Root Folder
        </button>
        <button
          type="button"
          class="small-action"
          data-action="refresh-service-mappings"
          ${canRefreshMappings ? '' : 'disabled'}
        >
          Refresh Mapping
        </button>
      </section>

      <p class="service-export-path" title="${escapeHtml(localServiceRootFolderPath)}">
        Root: ${escapeHtml(localServiceRootFolderPath.length > 0 ? localServiceRootFolderPath : 'Not selected')}
      </p>

      <section class="service-mapping-list" aria-label="Service folder mappings">
        ${
          serviceFolderScanInProgress
            ? '<p class="stage-loading" aria-live="polite">Scanning local folders&#8230;</p>'
            : renderServiceExportMappingRows(mappingRows)
        }
      </section>

      <p class="service-export-selected">
        Selected service: <strong>${escapeHtml(selectedServiceLabel)}</strong>
      </p>

      <div class="toolbar-row service-export-actions" role="group" aria-label="Service export actions">
        <button
          type="button"
          class="primary-action service-export-button"
          data-action="export-service-artifacts"
          ${canExport ? '' : 'disabled'}
        >
          Export Artifacts
        </button>
      </div>

      ${renderServiceExportStatus()}
    </section>
  `;
}

function renderServiceExportMappingRows(mappingRows) {
  if (mappingRows.length === 0) {
    if (!isAppsCatalogReady()) {
      return '<p class="stage-loading" aria-live="polite">Loading apps&#8230;</p>';
    }
    if (selectedSpaceId.length === 0) {
      return '<p class="logs-empty-message">Choose a space first to load services.</p>';
    }
    return '<p class="logs-empty-message">No running services available in this space.</p>';
  }

  const mappedRows = mappingRows.map((mapping) => {
    const isSelected = selectedServiceExportAppId === mapping.appId;
    const folderPathLabel = mapping.isMapped ? mapping.folderPath : 'No matching local folder';

    if (mapping.hasConflict) {
      const optionsMarkup = [
        '<option value="">Choose folder...</option>',
        ...mapping.candidateFolderPaths.map((candidatePath) => {
          const isCurrent = mapping.folderPath === candidatePath;
          return `<option value="${escapeHtml(candidatePath)}" ${isCurrent ? 'selected' : ''}>${escapeHtml(candidatePath)}</option>`;
        }),
      ].join('');
      return `
        <div class="service-map-row is-conflict${mapping.isMapped ? ' is-resolved' : ''}">
          <span class="service-map-name">${escapeHtml(mapping.appName)}</span>
          <label class="service-map-picker">
            <select data-role="service-folder-path-select" data-app-id="${escapeHtml(mapping.appId)}">
              ${optionsMarkup}
            </select>
          </label>
          <span class="service-map-state">${mapping.isMapped ? 'Resolved' : 'Choose folder'}</span>
        </div>
      `;
    }

    if (!mapping.isMapped) {
      return `
        <div class="service-map-row is-unmapped" aria-disabled="true">
          <span class="service-map-name">${escapeHtml(mapping.appName)}</span>
          <span class="service-map-path">${escapeHtml(folderPathLabel)}</span>
          <span class="service-map-state">Unmapped</span>
        </div>
      `;
    }

    return `
      <button
        type="button"
        class="service-map-row${isSelected ? ' is-selected' : ''}"
        data-action="select-export-service"
        data-app-id="${escapeHtml(mapping.appId)}"
      >
        <span class="service-map-name">${escapeHtml(mapping.appName)}</span>
        <span class="service-map-path">${escapeHtml(folderPathLabel)}</span>
        <span class="service-map-state">Mapped</span>
      </button>
    `;
  });

  return mappedRows.join('');
}

function renderServiceExportStatus() {
  if (serviceExportStatusMessage.length === 0) {
    return '<p class="service-export-status" data-role="service-export-status" hidden></p>';
  }

  const toneClass =
    serviceExportStatusTone === 'success'
      ? 'is-success'
      : serviceExportStatusTone === 'error'
        ? 'is-error'
        : 'is-info';
  return `<p class="service-export-status ${toneClass}" data-role="service-export-status">${escapeHtml(serviceExportStatusMessage)}</p>`;
}

function renderAppLogCatalogMarkup(availableApps, selectedApps, activeApps) {
  if (availableApps.length === 0) {
    return '<p class="logs-empty-message">No apps found in current space.</p>';
  }

  return availableApps
    .map((app) => {
      const isLogging = activeApps.has(app.id);
      const isChecked = isLogging || selectedApps.has(app.id);
      const actionMarkup = isLogging
        ? ''
        : '<span class="app-log-state is-idle">Ready</span>';

      return `
        <div class="app-log-item${isLogging ? ' is-logging is-locked' : ''}">
          <input
            type="checkbox"
            data-role="log-app-checkbox"
            data-app-id="${app.id}"
            aria-label="Select ${escapeHtml(app.name)}"
            ${isChecked ? 'checked' : ''}
            ${isLogging ? 'disabled' : ''}
          />
          <span class="app-log-name">${escapeHtml(app.name)}</span>
          ${actionMarkup}
        </div>
      `;
    })
    .join('');
}

function renderCatalogByState(availableApps, selectedApps, activeApps) {
  if (vscodeApi !== null && appsLoadingState === 'loading') {
    return '<p class="stage-loading" aria-live="polite">Loading apps&#8230;</p>';
  }

  if (
    vscodeApi !== null &&
    appsLoadingState === 'idle' &&
    selectedSpaceId.length > 0 &&
    liveAppOptions === null
  ) {
    return '<p class="stage-loading" aria-live="polite">Loading apps&#8230;</p>';
  }

  if (vscodeApi !== null && appsLoadingState === 'error') {
    return `<p class="stage-error" role="alert">${escapeHtml(appsErrorMessage)}</p>`;
  }

  return renderAppLogCatalogMarkup(availableApps, selectedApps, activeApps);
}

function isAppsCatalogReady() {
  if (vscodeApi === null) {
    return true;
  }

  return appsLoadingState === 'idle' || appsLoadingState === 'loaded';
}

function getStartableSelectionCount(activeApps) {
  return selectedAppLogIds.filter((appId) => !activeApps.has(appId)).length;
}

function renderActiveAppsLogList(availableApps, activeAppIds) {
  const activeItems = availableApps.filter((app) => activeAppIds.has(app.id));
  if (activeItems.length === 0) {
    return '<p class="logs-empty-message">No active app logs yet.</p>';
  }

  const rowsMarkup = activeItems
    .map((app) => {
      return `
        <div class="active-app-row">
          <span class="active-app-name">${escapeHtml(app.name)}</span>
          <span class="active-app-meta">
            <button type="button" class="small-action app-log-stop" data-action="stop-app-logging" data-app-id="${app.id}">
              Stop
            </button>
          </span>
        </div>
      `;
    })
    .join('');

  return `<div class="active-app-list">${rowsMarkup}</div>`;
}

function renderCfLogsPanelBridge(logs) {
  const previewLines = getCfLogsPanelPreviewLines(logs);

  return `
    <section class="panel-logs-bridge" aria-label="CFLogs panel bridge">
      <div class="panel-logs-head">
        <h3>CFLogs Panel</h3>
        <button type="button" class="small-action" data-action="open-cf-logs-panel">Open CFLogs Panel</button>
      </div>
      <p class="panel-logs-description">
        Log stream is presented in a dedicated panel channel named <strong>CFLogs</strong> near Output and Terminal.
      </p>
      <div class="panel-logs-preview" role="log" aria-live="polite">
        ${previewLines.map((line) => `<p>${escapeHtml(line)}</p>`).join('')}
      </div>
    </section>
  `;
}

function getCfLogsPanelPreviewLines(logs) {
  if (logs.length === 0) {
    return ['No log lines available yet in CFLogs panel.'];
  }

  return logs.slice(-3).map((entry) => {
    return `[${entry.time}] ${entry.level} ${entry.app}/${entry.instance} ${entry.message}`;
  });
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
      <span class="scope-chip">Org: ${resolveSelectedOrg()?.name ?? 'n/a'}</span>
      <span class="scope-chip">Space: ${selectedSpaceId.length > 0 ? selectedSpaceId : 'n/a'}</span>
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

function resolveSelectedOrg() {
  if (vscodeApi !== null && liveOrgOptions !== null) {
    return liveOrgLookup.get(selectedOrgId);
  }

  return resolveCurrentMockOrgOptions().find((org) => org.id === selectedOrgId);
}

function resolveCurrentMockOrgOptions() {
  const selectedRegion = resolveSelectedRegion();
  if (selectedRegion?.code === 'br-10') {
    return BR10_ORG_OPTIONS;
  }

  return DEFAULT_ORG_OPTIONS;
}

function resolveSelectableSpaces() {
  if (vscodeApi !== null && liveSpaceNames !== null) {
    return liveSpaceNames;
  }

  return resolveSelectedOrg()?.spaces ?? [];
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

function resolveCurrentSpaceApps() {
  if (vscodeApi !== null) {
    if (liveAppOptions === null) {
      return [];
    }
    return liveAppOptions.map((app) => ({ id: app.id, name: app.name }));
  }

  const spaceKey = selectedSpaceId.trim().toLowerCase();
  const curatedAppNames = SPACE_APP_OPTIONS[spaceKey];
  const appNames = Array.isArray(curatedAppNames) ? curatedAppNames : buildFallbackAppNames(spaceKey);
  return appNames.map((appName) => ({ id: appName, name: appName }));
}

function resolveServiceExportRows(availableApps) {
  const mappingByAppId = new Map(serviceFolderMappings.map((mapping) => [mapping.appId, mapping]));
  return availableApps.map((app) => {
    const existingMapping = mappingByAppId.get(app.id);
    if (existingMapping !== undefined) {
      return existingMapping;
    }

    return {
      appId: app.id,
      appName: app.name,
      folderPath: '',
      isMapped: false,
      hasConflict: false,
      candidateFolderPaths: [],
      matchType: 'none',
    };
  });
}

function normalizeServiceFolderMappings(rawMappings) {
  const normalizedMappings = [];
  for (const rawMapping of rawMappings) {
    if (!isRecord(rawMapping)) {
      continue;
    }
    const appIdRaw = typeof rawMapping.appId === 'string' ? rawMapping.appId.trim() : '';
    const appNameRaw = typeof rawMapping.appName === 'string' ? rawMapping.appName.trim() : '';
    const folderPathRaw =
      typeof rawMapping.folderPath === 'string' ? rawMapping.folderPath.trim() : '';
    const matchTypeRaw =
      typeof rawMapping.matchType === 'string' ? rawMapping.matchType.trim() : '';
    const rawCandidateFolderPaths = Array.isArray(rawMapping.candidateFolderPaths)
      ? rawMapping.candidateFolderPaths
      : [];
    const candidateFolderPaths = rawCandidateFolderPaths
      .filter((pathValue) => typeof pathValue === 'string')
      .map((pathValue) => pathValue.trim())
      .filter((pathValue) => pathValue.length > 0);
    const hasConflict =
      rawMapping.hasConflict === true ||
      matchTypeRaw === 'ambiguous' ||
      candidateFolderPaths.length > 1;
    const appId = appIdRaw.length > 0 ? appIdRaw : appNameRaw;
    if (appId.length === 0 || appNameRaw.length === 0) {
      continue;
    }
    const normalizedFolderPath = folderPathRaw.length > 0 ? folderPathRaw : '';
    const isMapped =
      normalizedFolderPath.length > 0 &&
      (!hasConflict || candidateFolderPaths.includes(normalizedFolderPath));
    normalizedMappings.push({
      appId,
      appName: appNameRaw,
      folderPath: isMapped ? normalizedFolderPath : '',
      isMapped,
      hasConflict,
      candidateFolderPaths,
      matchType: matchTypeRaw.length > 0 ? matchTypeRaw : 'none',
    });
  }
  return normalizedMappings;
}

function buildMockServiceFolderMappings(rootFolderPath, availableApps) {
  return availableApps.map((app, index) => {
    const shouldMap = index % 3 !== 2;
    const normalizedFolderName = app.name.replaceAll('-', '_');
    return {
      appId: app.id,
      appName: app.name,
      folderPath: shouldMap ? `${rootFolderPath}/${normalizedFolderName}` : '',
      isMapped: shouldMap,
      hasConflict: false,
      candidateFolderPaths: shouldMap ? [`${rootFolderPath}/${normalizedFolderName}`] : [],
      matchType: normalizedFolderName === app.name ? 'exact' : 'underscore',
    };
  });
}

function clearServiceMappingsForScope() {
  serviceFolderMappings = [];
  selectedServiceExportAppId = '';
  serviceFolderScanInProgress = false;
  serviceExportInProgress = false;
  serviceExportStatusMessage = '';
  serviceExportStatusTone = 'info';
}

function pruneSelectedServiceExportAppId() {
  if (selectedServiceExportAppId.length === 0) {
    return;
  }
  const mappedIds = new Set(
    serviceFolderMappings
      .filter((mapping) => mapping.isMapped)
      .map((mapping) => mapping.appId)
  );
  if (!mappedIds.has(selectedServiceExportAppId)) {
    selectedServiceExportAppId = '';
  }
}

function refreshServiceMappingsAfterAppsLoaded() {
  const availableApps = resolveCurrentSpaceApps();
  clearServiceMappingsForScope();

  if (localServiceRootFolderPath.length === 0) {
    serviceExportStatusTone = 'error';
    serviceExportStatusMessage = 'Select a local root folder before scanning service mappings.';
    return;
  }

  if (availableApps.length === 0) {
    serviceExportStatusTone = 'info';
    serviceExportStatusMessage = 'No running services available in this space.';
    return;
  }

  if (vscodeApi === null) {
    serviceFolderMappings = buildMockServiceFolderMappings(
      localServiceRootFolderPath,
      availableApps
    );
    pruneSelectedServiceExportAppId();
    return;
  }

  serviceFolderScanInProgress = true;
  serviceExportStatusTone = 'info';
  serviceExportStatusMessage = 'Scanning local folders for service mapping...';
  vscodeApi.postMessage({
    type: REFRESH_SERVICE_FOLDER_MAPPINGS_MESSAGE_TYPE,
    rootFolderPath: localServiceRootFolderPath,
    appNames: availableApps.map((app) => app.name),
  });
}

function triggerServiceExport() {
  const selectedMapping = serviceFolderMappings.find(
    (mapping) => mapping.appId === selectedServiceExportAppId && mapping.isMapped
  );
  if (selectedMapping === undefined) {
    serviceExportStatusTone = 'error';
    serviceExportStatusMessage = 'Choose one mapped service before exporting.';
    return true;
  }

  const basePayload = {
    appId: selectedMapping.appId,
    appName: selectedMapping.appName,
    rootFolderPath: localServiceRootFolderPath,
  };

  serviceExportInProgress = true;
  serviceExportStatusTone = 'info';
  serviceExportStatusMessage = 'Exporting artifacts from Cloud Foundry...';

  if (vscodeApi === null) {
    serviceExportInProgress = false;
    serviceExportStatusTone = 'success';
    serviceExportStatusMessage =
      `default-env.json and pnpm-lock.yaml exported for ${selectedMapping.appName}.`;
    return true;
  }

  vscodeApi.postMessage({
    type: EXPORT_SERVICE_ARTIFACTS_MESSAGE_TYPE,
    ...basePayload,
  });
  return true;
}

function resolveActiveAppNamesByIds(activeAppIds) {
  const appNameById = new Map(resolveCurrentSpaceApps().map((app) => [app.id, app.name]));
  const names = [];
  for (const appId of activeAppIds) {
    const appName = appNameById.get(appId);
    if (typeof appName === 'string' && appName.length > 0) {
      names.push(appName);
    }
  }
  return names;
}

function buildFallbackAppNames(spaceKey) {
  const orgName = resolveSelectedOrg()?.name ?? 'app-services';
  const orgSlug = orgName
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-+|-+$/g, '');
  const suffix = spaceKey.length > 0 ? spaceKey : 'space';
  return [
    `${orgSlug}-${suffix}-api`,
    `${orgSlug}-${suffix}-worker`,
    `${orgSlug}-${suffix}-jobs`,
  ];
}

function resetWorkspaceLoggingState() {
  const hadActiveApps = activeAppLogIds.length > 0;
  selectedAppLogIds = [];
  activeAppLogIds = [];
  statusMessage = '';
  clearServiceMappingsForScope();
  if (hadActiveApps) {
    postActiveAppsChanged([]);
  }
}

function pruneSelectedAppIds() {
  const allowedAppIds = new Set(resolveCurrentSpaceApps().map((app) => app.id));
  selectedAppLogIds = selectedAppLogIds.filter((appId) => allowedAppIds.has(appId));
  activeAppLogIds = activeAppLogIds.filter((appId) => allowedAppIds.has(appId));
  postActiveAppsChanged(resolveActiveAppNamesByIds(activeAppLogIds));
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

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
