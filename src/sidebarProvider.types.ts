import type { SyncIntervalHours } from './cacheModels';
import type { ServiceFolderMapping } from './serviceFolderMapping';
import type { EventMeshTargetParams } from './eventMeshPanel';
import type { EventMeshStopReason } from './eventMeshProviderRouter';
import type { SharedCfScope } from './scopeSync';

export const REGION_VIEW_ID = 'sapTools.regionView';


// ── Inbound message types (webview → extension) ─────────────────────────────

export const MSG_REQUEST_INITIAL_STATE = 'sapTools.requestInitialState';
export const MSG_LOGIN_SUBMIT = 'sapTools.loginSubmit';
export const MSG_REGION_SELECTED = 'sapTools.regionSelected';
export const MSG_ORG_SELECTED = 'sapTools.orgSelected';
export const MSG_SPACE_SELECTED = 'sapTools.spaceSelected';
export const MSG_CONFIRM_SCOPE = 'sapTools.confirmScope';
export const MSG_TOPOLOGY_ORG_SELECTED = 'sapTools.topologyOrgSelected';
export const MSG_QUICK_SCOPE_CONFIRM = 'sapTools.quickScopeConfirm';
export const MSG_REQUEST_CF_TOPOLOGY = 'sapTools.requestCfTopology';
export const MSG_OPEN_CF_LOGS_PANEL = 'sapTools.openCfLogsPanel';
export const MSG_ACTIVE_APPS_CHANGED = 'sapTools.activeAppsChanged';
export const MSG_PAUSED_APPS_CHANGED = 'sapTools.pausedAppsChanged';
export const MSG_UPDATE_SYNC_INTERVAL = 'sapTools.updateSyncInterval';
export const MSG_SYNC_NOW = 'sapTools.syncNow';
export const MSG_GET_SSH_PROXY_STATUS = 'sapTools.getSshProxyStatus';
export const MSG_SAVE_SSH_PROXY_SETTINGS = 'sapTools.saveSshProxySettings';
export const MSG_CLEAR_SSH_PROXY_SETTINGS = 'sapTools.clearSshProxySettings';

export const MSG_LOGOUT = 'sapTools.logout';
export const MSG_SELECT_LOCAL_ROOT_FOLDER = 'sapTools.selectLocalRootFolder';
export const MSG_REFRESH_SERVICE_FOLDER_MAPPINGS = 'sapTools.refreshServiceFolderMappings';
export const MSG_SELECT_SERVICE_FOLDER_MAPPING = 'sapTools.selectServiceFolderMapping';
export const MSG_EXPORT_SERVICE_ARTIFACTS = 'sapTools.exportServiceArtifacts';
export const MSG_REPLACE_SERVICE_PACKAGE_PLACEHOLDER = 'sapTools.replaceServicePackagePlaceholder';
export const MSG_EXPORT_SQLTOOLS_CONFIG = 'sapTools.exportSqlToolsConfig';
export const MSG_OPEN_HANA_SQL_FILE = 'sapTools.openHanaSqlFile';
export const MSG_OPEN_APIS_EXPLORER = 'saptools.openApisExplorer';
export const MSG_OPEN_EVENT_MESH = 'saptools.openEventMesh';
export const MSG_RUN_HANA_TABLE_SELECT = 'sapTools.runHanaTableSelect';
export const MSG_OPEN_SQLTOOLS_EXTENSION = 'sapTools.openSqlToolsExtension';
export const MSG_BUILD_PUBLISH_ALL = 'sapTools.buildPublishAll';
export const MSG_BUILD_SINGLE_PACKAGE = 'sapTools.buildSinglePackage';
export const MSG_LOCAL_REGISTRY_START = 'sapTools.localRegistryStart';
export const MSG_LOCAL_REGISTRY_STOP = 'sapTools.localRegistryStop';
export const MSG_LOCAL_REGISTRY_STATUS = 'sapTools.localRegistryStatus';
export const MSG_OPEN_LOCAL_PACKAGES_SETTINGS = 'sapTools.openLocalPackagesSettings';
export const MSG_RUN_MICROSOFT_GRAPH_TOOL = 'sapTools.runMicrosoftGraphTool';
export const MSG_RELOAD_APP_LIST = 'sapTools.reloadAppList';
export const MSG_OPEN_SQL_BACKUP_HISTORY = 'sapTools.openSqlBackupHistory';
export const SQLTOOLS_EXTENSION_ID = 'mtxr.sqltools';
export const SQLTOOLS_ACTIVITY_BAR_COMMAND = 'workbench.view.extension.sqltools-activity-bar';
export const BUILTIN_EXTENSION_OPEN_COMMAND = 'extension.open';

// ── Outbound message types (extension → webview) ────────────────────────────

export const MSG_LOGIN_RESULT = 'sapTools.loginResult';
export const MSG_SSH_PROXY_STATUS = 'sapTools.sshProxyStatus';

export const MSG_LOGOUT_RESULT = 'sapTools.logoutResult';
export const MSG_ORGS_LOADED = 'sapTools.orgsLoaded';
export const MSG_ORGS_ERROR = 'sapTools.orgsError';
export const MSG_SPACES_LOADED = 'sapTools.spacesLoaded';
export const MSG_SPACES_ERROR = 'sapTools.spacesError';
export const MSG_APPS_LOADED = 'sapTools.appsLoaded';
export const MSG_APPS_ERROR = 'sapTools.appsError';
export const MSG_APPS_RELOAD_ERROR = 'sapTools.appsReloadError';
export const MSG_CACHE_STATE = 'sapTools.cacheState';
export const MSG_LOCAL_ROOT_FOLDER_UPDATED = 'sapTools.localRootFolderUpdated';
export const MSG_SERVICE_FOLDER_MAPPINGS_LOADED = 'sapTools.serviceFolderMappingsLoaded';
export const MSG_SERVICE_FOLDER_MAPPINGS_ERROR = 'sapTools.serviceFolderMappingsError';
export const MSG_EXPORT_ARTIFACT_PROGRESS = 'sapTools.exportArtifactProgress';
export const MSG_EXPORT_ARTIFACT_RESULT = 'sapTools.exportArtifactResult';
export const MSG_EXPORT_SQLTOOLS_PROGRESS = 'sapTools.exportSqlToolsProgress';
export const MSG_EXPORT_SQLTOOLS_RESULT = 'sapTools.exportSqlToolsResult';
export const MSG_RESTORE_CONFIRMED_SCOPE = 'sapTools.restoreConfirmedScope';
export const MSG_HANA_SQL_FILE_OPEN_RESULT = 'sapTools.hanaSqlFileOpenResult';
export const MSG_HANA_TABLES_LOADED = 'sapTools.hanaTablesLoaded';
export const MSG_HANA_TUNNEL_STATE = 'sapTools.hanaTunnelState';
export const MSG_HANA_TABLE_SELECT_RESULT = 'sapTools.hanaTableSelectResult';
export const MSG_REFRESH_HANA_TABLES = 'sapTools.refreshHanaTables';
export const MSG_CF_TOPOLOGY = 'sapTools.cfTopology';
export const MSG_TOPOLOGY_SCOPE_RESOLVED = 'sapTools.topologyScopeResolved';
export const MSG_LOCAL_REGISTRY_STATE = 'sapTools.localRegistryState';
export const MSG_LOCAL_PACKAGES_LOADED = 'sapTools.localPackagesLoaded';
export const MSG_LOCAL_PACKAGES_LOADING = 'sapTools.localPackagesLoading';
export const MSG_BUILD_PUBLISH_PREVIEW = 'sapTools.buildPublishPreview';
export const MSG_BUILD_PUBLISH_PROGRESS = 'sapTools.buildPublishProgress';
export const MSG_BUILD_PUBLISH_RESULT = 'sapTools.buildPublishResult';
export const MSG_MICROSOFT_GRAPH_TOOL_PROGRESS = 'sapTools.microsoftGraphToolProgress';
export const MSG_MICROSOFT_GRAPH_TOOL_RESULT = 'sapTools.microsoftGraphToolResult';
export const MSG_APIS_EXPLORER_SETTLED = 'sapTools.apisExplorerSettled';
export const MSG_EVENT_MESH_VIEWER_SETTLED = 'sapTools.eventMeshViewerSettled';

// ── Payload interfaces ───────────────────────────────────────────────────────

export interface RegionSelectionPayload {
  readonly id: string;
  readonly name: string;
  readonly code: string;
  readonly area: string;
}

export interface OrgSelectionPayload {
  readonly guid: string;
  readonly name: string;
}

export interface SpaceSelectionPayload {
  readonly spaceName: string;
  readonly orgGuid: string;
  readonly orgName: string;
}

export interface ConfirmScopePayload {
  readonly regionId: string;
  readonly regionCode: string;
  readonly regionName: string;
  readonly regionArea: string;
  readonly orgGuid: string;
  readonly orgName: string;
  readonly spaceName: string;
}

export interface ConfirmScopeOptions {
  readonly invalidateHanaAppContexts?: boolean;
  readonly writeSharedScope?: boolean;
}

export interface TopologyOrgSelectedPayload {
  readonly regionKey: string;
  readonly orgName: string;
}

export interface QuickScopeConfirmPayload {
  readonly regionKey: string;
  readonly orgName: string;
  readonly spaceName: string;
}

export interface ActiveAppsChangedPayload {
  readonly appNames: string[];
}

export interface UpdateSyncIntervalPayload {
  readonly syncIntervalHours: SyncIntervalHours;
}

export interface RefreshServiceFolderMappingsPayload {
  readonly rootFolderPath: string;
  readonly appNames: readonly string[];
}

export interface SelectServiceFolderMappingPayload {
  readonly appId: string;
  readonly folderPath: string;
}

export interface ExportServiceArtifactsPayload {
  readonly appId: string;
  readonly appName: string;
  readonly rootFolderPath: string;
}

export interface ExportSqlToolsConfigPayload {
  readonly appId: string;
  readonly appName: string;
  readonly rootFolderPath: string;
}

export interface OpenHanaSqlFilePayload {
  readonly requestId: number;
  readonly serviceId: string;
  readonly serviceName: string;
}

export interface RefreshHanaTablesPayload {
  readonly serviceId: string;
  readonly serviceName: string;
}

export interface RunHanaTableSelectPayload {
  readonly serviceId: string;
  readonly serviceName: string;
  readonly tableName: string;
}

export interface LogoutResultPayload {
  readonly type: string;
  readonly success: boolean;
  readonly error?: string;
}

export interface CacheStatePayload {
  readonly type: string;
  readonly snapshot: {
    readonly activeUserEmail: string | null;
    readonly syncInProgress: boolean;
    readonly lastSyncStartedAt: string | null;
    readonly lastSyncCompletedAt: string | null;
    readonly lastSyncError: string;
    readonly syncIntervalHours: number;
    readonly nextSyncAt: string | null;
    readonly regionAccessById: Record<string, string>;
  };
}

export interface CfLogSessionSeed {
  readonly apiEndpoint: string;
  readonly email: string;
  readonly password: string;
  readonly orgName: string;
  readonly spaceName: string;
  readonly cfHomeDir: string;
}

export interface SidebarAppEntry {
  readonly id: string;
  readonly name: string;
  readonly runningInstances: number;
}

export interface PersistedConfirmedScopeEntry {
  readonly regionId: string;
  readonly regionCode: string;
  readonly regionName: string;
  readonly regionArea: string;
  readonly orgGuid: string;
  readonly orgName: string;
  readonly spaceName: string;
  readonly confirmedAt: string;
}

export interface LoadedScopeState {
  readonly regionId: string;
  readonly regionCode: string;
  readonly orgGuid: string;
  readonly orgName: string;
  readonly spaceName: string;
}

export interface AppListReloadRequest {
  readonly scope: SharedCfScope;
  readonly loadedScope: LoadedScopeState | null;
  readonly regionId: string;
  readonly regionCode: string;
  readonly orgGuid: string;
  readonly spaceSelectionRequestId: number;
}

export interface RootFolderCacheScope {
  readonly email: string;
  readonly regionCode: string;
  readonly orgGuid: string;
  readonly spaceName: string;
}

export interface PersistedServiceMappingScopeEntry {
  readonly rootFolderPath: string;
  readonly mappings: readonly ServiceFolderMapping[];
  readonly updatedAt: string;
}

export interface EventMeshViewerController {
  openEventMeshViewer(appId: string, targetParams?: EventMeshTargetParams): void | Promise<void>;
  stopAllListeners(reason: EventMeshStopReason): void;
}

// ── Provider ─────────────────────────────────────────────────────────────────
