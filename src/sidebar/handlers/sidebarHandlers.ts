/* eslint-disable */
// @ts-nocheck
// @ts-nocheck



import * as vscode from 'vscode';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  cfLogin,
  fetchCfLoginInfo,
  fetchOrgs,
  fetchSpaces,
  getCfApiEndpoint,
  isCfSessionExpired,
} from '../../cfClient';
import type { CfSession } from '../../cfClient';
import { ensureCfHomeDir } from '../../cfHome';
import type { CacheRuntimeSnapshot, CacheSyncService } from '../../cacheSyncService';
import { normalizeUserEmail, type CacheStore } from '../../cacheStore';
import type { CfLogsPanelProvider } from '../../cfLogsPanel';
import { clearCredentials, getEffectiveCredentials, storeCredentials } from '../../credentialStore';
import {
  buildServiceFolderMappings,
  type ServiceFolderMapping,
} from '../../serviceFolderMapping';
import {
  exportServiceArtifacts,
  formatServiceArtifactExportCompletionMessage,
  type ServiceExportSession,
} from '../../serviceArtifactExporter';
import { readSharedAppFolderMappings, readSharedRemoteRoot } from '../../sharedDebugConfig';
import { exportSqlToolsConfig } from '../../sqlToolsConfigExporter';
import type { ApisExplorerPanelManager, ApisExplorerPanelSession } from '../../apisExplorerPanel';
import {
  resolveMockApps,
  resolveMockCfTopology,
  resolveMockOrgsForRegion,
  resolveMockSpacesForOrg,
} from '../../testModeData';
import { SAP_BTP_REGIONS, toHyphenatedRegionCode } from '../../regions';
import {
  EMPTY_CF_TOPOLOGY,
  getAppsFromTopologySync,
  getCfTopologySnapshot,
  getCfTopologySnapshotSync,
  type CfTopology,
} from '../../cfTopology';
import { refreshCfSyncSpace } from '../../cfSpaceRefresh';
import type { HanaSqlWorkbench } from '../../hanaSqlWorkbench';
import type { HanaSqlBackupStore } from '../../hanaSqlBackupStore';
import type { HanaSqlHistoryPanelManager } from '../../hanaSqlHistoryPanel';
import { writeScopeIfChanged, type SharedCfScope } from '../../scopeSync';
import {
  readLocalPackagesConfig,
  type LocalPackagesConfig,
} from '../../localPackages/localPackagesConfig';
import { VerdaccioManager } from '../../localPackages/verdaccioManager';
import { runBuildPublishAll } from '../../localPackages/buildPublishOrchestrator';
import { scanLocalPackages } from '../../localPackages/localPackageScanner';
import { buildDependencyOrder } from '../../localPackages/dependencyGraph';
import {
  replaceServicePackageDependencyTags,
} from '../../localPackages/serviceDependencyTags';
import {
  readMicrosoftGraphToolRunRequest,
  runMicrosoftGraphTool,
  type MicrosoftGraphToolRunRequest,
  type MicrosoftGraphToolStepProgress,
  sanitizeGraphMessage,
} from '../../microsoftGraphTools';
import { buildMainHtml, buildLoginGateHtml } from '../../sidebarProvider.html';
import type {
  RegionSelectionPayload,
  OrgSelectionPayload,
  SpaceSelectionPayload,
  ConfirmScopePayload,
  ConfirmScopeOptions,
  TopologyOrgSelectedPayload,
  QuickScopeConfirmPayload,
  RefreshServiceFolderMappingsPayload,
  SelectServiceFolderMappingPayload,
  ExportServiceArtifactsPayload,
  ExportSqlToolsConfigPayload,
  OpenHanaSqlFilePayload,
  RefreshHanaTablesPayload,
  RunHanaTableSelectPayload,
  LogoutResultPayload,
  CacheStatePayload,
  CfLogSessionSeed,
  SidebarAppEntry,
  PersistedConfirmedScopeEntry,
  LoadedScopeState,
  AppListReloadRequest,
  RootFolderCacheScope,
  PersistedServiceMappingScopeEntry,
  EventMeshViewerController
} from '../../sidebarProvider.types';
import {
  MSG_REQUEST_INITIAL_STATE,
  MSG_LOGIN_SUBMIT,
  MSG_REGION_SELECTED,
  MSG_ORG_SELECTED,
  MSG_SPACE_SELECTED,
  MSG_CONFIRM_SCOPE,
  MSG_TOPOLOGY_ORG_SELECTED,
  MSG_QUICK_SCOPE_CONFIRM,
  MSG_REQUEST_CF_TOPOLOGY,
  MSG_OPEN_CF_LOGS_PANEL,
  MSG_ACTIVE_APPS_CHANGED,
  MSG_PAUSED_APPS_CHANGED,
  MSG_UPDATE_SYNC_INTERVAL,
  MSG_SYNC_NOW,
  MSG_GET_SSH_PROXY_STATUS,
  MSG_SAVE_SSH_PROXY_SETTINGS,
  MSG_CLEAR_SSH_PROXY_SETTINGS,
  MSG_LOGOUT,
  MSG_SELECT_LOCAL_ROOT_FOLDER,
  MSG_REFRESH_SERVICE_FOLDER_MAPPINGS,
  MSG_SELECT_SERVICE_FOLDER_MAPPING,
  MSG_EXPORT_SERVICE_ARTIFACTS,
  MSG_REPLACE_SERVICE_PACKAGE_PLACEHOLDER,
  MSG_EXPORT_SQLTOOLS_CONFIG,
  MSG_OPEN_HANA_SQL_FILE,
  MSG_OPEN_APIS_EXPLORER,
  MSG_OPEN_EVENT_MESH,
  MSG_RUN_HANA_TABLE_SELECT,
  MSG_OPEN_SQLTOOLS_EXTENSION,
  MSG_BUILD_PUBLISH_ALL,
  MSG_BUILD_SINGLE_PACKAGE,
  MSG_LOCAL_REGISTRY_START,
  MSG_LOCAL_REGISTRY_STOP,
  MSG_LOCAL_REGISTRY_STATUS,
  MSG_OPEN_LOCAL_PACKAGES_SETTINGS,
  MSG_RUN_MICROSOFT_GRAPH_TOOL,
  MSG_RELOAD_APP_LIST,
  MSG_OPEN_SQL_BACKUP_HISTORY,
  SQLTOOLS_EXTENSION_ID,
  SQLTOOLS_ACTIVITY_BAR_COMMAND,
  BUILTIN_EXTENSION_OPEN_COMMAND,
  MSG_LOGIN_RESULT,
  MSG_SSH_PROXY_STATUS,
  MSG_LOGOUT_RESULT,
  MSG_ORGS_LOADED,
  MSG_ORGS_ERROR,
  MSG_SPACES_LOADED,
  MSG_SPACES_ERROR,
  MSG_APPS_LOADED,
  MSG_APPS_ERROR,
  MSG_APPS_RELOAD_ERROR,
  MSG_CACHE_STATE,
  MSG_LOCAL_ROOT_FOLDER_UPDATED,
  MSG_SERVICE_FOLDER_MAPPINGS_LOADED,
  MSG_SERVICE_FOLDER_MAPPINGS_ERROR,
  MSG_EXPORT_ARTIFACT_PROGRESS,
  MSG_EXPORT_ARTIFACT_RESULT,
  MSG_EXPORT_SQLTOOLS_PROGRESS,
  MSG_EXPORT_SQLTOOLS_RESULT,
  MSG_RESTORE_CONFIRMED_SCOPE,
  MSG_HANA_SQL_FILE_OPEN_RESULT,
  MSG_HANA_TABLES_LOADED,
  MSG_HANA_TUNNEL_STATE,
  MSG_HANA_TABLE_SELECT_RESULT,
  MSG_REFRESH_HANA_TABLES,
  MSG_CF_TOPOLOGY,
  MSG_TOPOLOGY_SCOPE_RESOLVED,
  MSG_LOCAL_REGISTRY_STATE,
  MSG_LOCAL_PACKAGES_LOADED,
  MSG_LOCAL_PACKAGES_LOADING,
  MSG_BUILD_PUBLISH_PREVIEW,
  MSG_BUILD_PUBLISH_PROGRESS,
  MSG_BUILD_PUBLISH_RESULT,
  MSG_MICROSOFT_GRAPH_TOOL_PROGRESS,
  MSG_MICROSOFT_GRAPH_TOOL_RESULT,
  MSG_APIS_EXPLORER_SETTLED,
  MSG_EVENT_MESH_VIEWER_SETTLED
} from '../../sidebarProvider.types';
import {
  isTestMode,
  buildSharedScopeFromConfirmPayload,
  areSharedScopesEqual,
  areReloadScopesEqual,
  isLoadedScopeForConfirmedScope,
  areRegionCodesEquivalent,
  appListsEqual,
  formatAppListReloadFailure,
  resolveE2eTestModeAppsDelayMs,
  sleep,
  buildScopeLabel,
  createNonce,
  sanitizeForLog,
  sanitizeErrorForLog,
  readOptionalString,
  buildServiceMappingsScopeKey,
  normalizePersistedServiceMappingsByScope,
  normalizeServiceMappingForPersistence,
  haveSameOrgEntries,
  shouldSkipSensitiveExportConfirmation,
  pathExists,
  isRecord,
  isLoginSubmitMessage,
  readLoginSubmitPayload,
  isRegionSelectedMessage,
  readRegionSelectionPayload,
  isOrgSelectedMessage,
  readOrgSelectionPayload,
  isSpaceSelectedMessage,
  readSpaceSelectionPayload,
  isTopologyOrgSelectedMessage,
  readTopologyOrgSelectedPayload,
  isQuickScopeConfirmMessage,
  readQuickScopeConfirmPayload,
  isConfirmScopeMessage,
  readConfirmScopePayload,
  isActiveAppsChangedMessage,
  readActiveAppsChangedPayload,
  isUpdateSyncIntervalMessage,
  readUpdateSyncIntervalPayload,
  isRefreshServiceFolderMappingsMessage,
  readRefreshServiceFolderMappingsPayload,
  isSelectServiceFolderMappingMessage,
  readSelectServiceFolderMappingPayload,
  isExportServiceArtifactsMessage,
  readExportServiceArtifactsPayload,
  isExportSqlToolsConfigMessage,
  readExportSqlToolsConfigPayload,
  isOpenHanaSqlFileMessage,
  readOpenHanaSqlFilePayload,
  isRefreshHanaTablesMessage,
  readRefreshHanaTablesPayload,
  isRunHanaTableSelectMessage,
  readRunHanaTableSelectPayload,
  formatServicePackageReplaceMessage,
  sanitizeSqlUiLogValue,
  buildLocalPackagesCacheKey,
  areLocalPackageListsEqual
} from '../../sidebarProvider.helpers';

import type { RegionSidebarProvider } from '../../sidebarProvider';

export async function handleOpenApisExplorer(this: RegionSidebarProvider, appId: string): Promise<void> {
if (appId.length === 0) {
  return;
}
try {
  const session = await this.openApisExplorerSession(appId);
  await session.initialLoad;
} finally {
  this.postMessage({
    type: MSG_APIS_EXPLORER_SETTLED,
    appId,
  });
}
}

export async function handleRequestInitialState(this: RegionSidebarProvider): Promise<void> {
const snapshot = await this.cacheSyncService.getRuntimeSnapshot();
this.postCacheState(snapshot);
this.sendSshProxyStatus();


if (!this.hasAttemptedConfirmedScopeRestore) {
  await this.preloadRootFolderForPersistedScope();
}

this.postMessage({
  type: MSG_LOCAL_ROOT_FOLDER_UPDATED,
  path: this.selectedLocalRootFolderPath,
});
this.postMessage({
  type: MSG_SERVICE_FOLDER_MAPPINGS_LOADED,
  mappings: this.serviceFolderMappings,
});
void this.postDetectedLocalPackages();

this.postCfTopologySnapshot(this.resolveCfTopologySync());
void this.pushCfTopology();

if (!this.hasAttemptedConfirmedScopeRestore) {
  this.hasAttemptedConfirmedScopeRestore = true;
  await this.restoreConfirmedScopeForCurrentUser();
}
}

export async function handleConfirmScope(this: RegionSidebarProvider, payload: ConfirmScopePayload, options: ConfirmScopeOptions = {}): Promise<void> {
await this.persistConfirmedScopeForCurrentUser(payload);
const sharedScope = buildSharedScopeFromConfirmPayload(payload);
const isChangedScope = !areSharedScopesEqual(sharedScope, this.currentConfirmedScope);
this.lastWrittenScope = sharedScope;
this.currentConfirmedScope = sharedScope;
const shouldInvalidateHanaAppContexts = options.invalidateHanaAppContexts ?? true;
if (isChangedScope && shouldInvalidateHanaAppContexts) {
  this.hanaSqlWorkbench.invalidateAllAppContexts();
}
if (isChangedScope) {
  // An open event viewer is bound to the previous scope's app/queue; stop its
  // AMQP listener and delete its debug queue so we never leak a tap across scopes.
  this.eventMeshPanelManager.stopAllListeners('scope-changed');
  void this.apisExplorerPanelManager.stopAllTraces('scope-changed');
}
const shouldWriteSharedScope = options.writeSharedScope ?? true;
if (shouldWriteSharedScope) {
  try {
    await writeScopeIfChanged(sharedScope);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Failed to write shared scope setting.';
    this.outputChannel.appendLine(
      `[scope] Shared setting update failed: ${sanitizeForLog(errorMessage)}`
    );
  }
}
this.outputChannel.appendLine(
  `[scope] Confirmed scope region=${sanitizeForLog(payload.regionCode)} org=${sanitizeForLog(payload.orgName)} space=${sanitizeForLog(payload.spaceName)}`
);
void this.refreshTopologyForConfirmedScope(payload).catch(() => undefined);
}

export async function handleExternalScopeChange(this: RegionSidebarProvider, scope: SharedCfScope): Promise<void> {
if (areSharedScopesEqual(scope, this.lastWrittenScope)) {
  return;
}

const region = SAP_BTP_REGIONS.find((entry) => entry.id === scope.regionCode);
if (region === undefined) {
  return;
}

if (areSharedScopesEqual(scope, this.currentConfirmedScope)) {
  return;
}

const requestId = this.bumpExternalScopeChangeRequestId();
try {
  await this.restoreExternalScope(scope, requestId);
} catch (error) {
  const errorMessage =
    error instanceof Error ? error.message : 'Failed to restore external scope.';
  this.outputChannel.appendLine(
    `[scope] External scope restore failed: ${sanitizeForLog(errorMessage)}`
  );
}
}

export async function handleReloadAppList(this: RegionSidebarProvider): Promise<void> {
const request = this.createAppListReloadRequest();
if (request === null) {
  this.postAppsReloadError('No active region/org/space is loaded.');
  return;
}

const credentials = await getEffectiveCredentials(this.context);
if (credentials === null) {
  this.postAppsReloadError('No credentials found. Please re-open SAP Tools and log in.');
  return;
}

const cfHomeDir = await ensureCfHomeDir(this.context);
if (!this.isCurrentAppListReloadRequest(request)) {
  return;
}

const result = await refreshCfSyncSpace({
  apiEndpoint: getCfApiEndpoint(request.regionCode),
  orgName: request.scope.orgName,
  spaceName: request.scope.spaceName,
  email: credentials.email,
  password: credentials.password,
  log: (message) => {
    this.outputChannel.appendLine(message);
  },
});
if (!this.isCurrentAppListReloadRequest(request)) {
  return;
}

await this.applyReloadedAppListResult(request, result, credentials, cfHomeDir);
}

export async function handleTopologyOrgSelected(this: RegionSidebarProvider, payload: TopologyOrgSelectedPayload): Promise<void> {
const region = SAP_BTP_REGIONS.find((entry) => entry.id === payload.regionKey);
if (region === undefined) {
  this.outputChannel.appendLine(
    `[topology] Quick org pick rejected: unknown region key=${sanitizeForLog(payload.regionKey)}`
  );
  this.postOrgsError(`Region "${payload.regionKey}" is not known to SAP Tools.`);
  return;
}

this.outputChannel.appendLine(
  `[topology] Quick org pick region=${region.id} org=${sanitizeForLog(payload.orgName)}`
);

const regionPayload: RegionSelectionPayload = {
  id: region.id,
  name: region.displayName,
  code: toHyphenatedRegionCode(region.id),
  area: region.area,
};
this.logRegionSelection(regionPayload);
await this.handleRegionSelected(regionPayload);
// Snapshot the region request id after handleRegionSelected resolves: any
// subsequent manual region click bumps it, and we must not stomp on the
// user's newer choice with our resolved scope.
const regionRequestId = this.regionSelectionRequestId;
if (this.selectedRegionId !== region.id) {
  return;
}

let orgGuid = '';
if (isTestMode()) {
  const mockOrg = resolveMockOrgsForRegion(regionPayload.code).find(
    (entry) => entry.name === payload.orgName
  );
  orgGuid = mockOrg?.guid ?? '';
} else {
  orgGuid = await this.resolveOrgGuidByName(region.id, payload.orgName);
}

if (!this.isCurrentRegionRequest(regionRequestId)) {
  return;
}

if (orgGuid.length === 0) {
  this.outputChannel.appendLine(
    `[topology] Quick org pick failed: org "${sanitizeForLog(payload.orgName)}" not found in region ${region.id}`
  );
  this.postSpacesError(
    `Org "${payload.orgName}" was not found in region ${region.id}.`
  );
  return;
}

this.postMessage({
  type: MSG_TOPOLOGY_SCOPE_RESOLVED,
  scope: {
    regionId: region.id,
    regionCode: regionPayload.code,
    regionName: region.displayName,
    regionArea: region.area,
    orgGuid,
    orgName: payload.orgName,
  },
});

await this.handleOrgSelected({ guid: orgGuid, name: payload.orgName });
}

export async function handleQuickScopeConfirm(this: RegionSidebarProvider, payload: QuickScopeConfirmPayload): Promise<void> {
const region = SAP_BTP_REGIONS.find((entry) => entry.id === payload.regionKey);
if (region === undefined) {
  this.postSpacesError(`Region "${payload.regionKey}" is not known to SAP Tools.`);
  return;
}

let orgGuid = '';
try {
  orgGuid = await this.resolveQuickScopeOrgGuid(region, payload.orgName);
} catch (error) {
  const errorMessage =
    error instanceof Error ? error.message : 'Could not confirm scope.';
  this.outputChannel.appendLine(
    `[scope] Quick scope confirm failed: ${sanitizeForLog(errorMessage)}`
  );
  this.postSpacesError(
    'Could not confirm scope. Please try again or use Custom tab.'
  );
  return;
}

if (orgGuid.length === 0) {
  this.postSpacesError(
    `Org "${payload.orgName}" was not found in region ${region.id}. It may have been removed.`
  );
  return;
}

const confirmPayload: ConfirmScopePayload = {
  regionId: region.id,
  regionCode: toHyphenatedRegionCode(region.id),
  regionName: region.displayName,
  regionArea: region.area,
  orgGuid,
  orgName: payload.orgName,
  spaceName: payload.spaceName,
};
await this.handleConfirmScope(confirmPayload);
await this.hydrateQuickConfirmedScope(confirmPayload);
}

export async function handleSelectLocalRootFolder(this: RegionSidebarProvider): Promise<void> {
let selectedUri: vscode.Uri | undefined;
const dialogOverride = this.resolveE2eRootDialogOverride();
if (dialogOverride.handled) {
  selectedUri = dialogOverride.uri;
} else {
  const selectedUris = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    title: 'Select local root folder for service mapping',
  });
  selectedUri = selectedUris?.[0];
}

if (selectedUri === undefined) {
  return;
}

const selectedPath = selectedUri.fsPath.trim();
if (selectedPath.length === 0) {
  return;
}

this.selectedLocalRootFolderPath = selectedPath;
this.serviceFolderSelections.clear();
this.postMessage({
  type: MSG_LOCAL_ROOT_FOLDER_UPDATED,
  path: selectedPath,
});
await this.persistRootFolderForCurrentScope(selectedPath);
await this.refreshServiceFolderMappings();
}

export async function handleRefreshServiceFolderMappings(this: RegionSidebarProvider, payload: RefreshServiceFolderMappingsPayload): Promise<void> {
const rootFolderPath = payload.rootFolderPath.trim();
if (rootFolderPath.length > 0 && rootFolderPath !== this.selectedLocalRootFolderPath) {
  this.selectedLocalRootFolderPath = rootFolderPath;
  this.serviceFolderSelections.clear();
  this.postMessage({
    type: MSG_LOCAL_ROOT_FOLDER_UPDATED,
    path: this.selectedLocalRootFolderPath,
  });
  await this.persistRootFolderForCurrentScope(this.selectedLocalRootFolderPath);
}

await this.refreshServiceFolderMappings(payload.appNames);
}

export async function handleExportServiceArtifacts(this: RegionSidebarProvider, payload: ExportServiceArtifactsPayload, options: {
      readonly includeDefaultEnv: boolean;
      readonly includePnpmLock: boolean;
    }): Promise<void> {
if (this.exportInProgress) {
  this.postMessage({
    type: MSG_EXPORT_ARTIFACT_RESULT,
    success: false,
    message: 'Another export is already running. Please wait.',
  });
  return;
}

const mapping = this.resolveServiceFolderMapping(payload);
if (mapping === null || mapping.folderPath.length === 0) {
  this.postMessage({
    type: MSG_EXPORT_ARTIFACT_RESULT,
    success: false,
    message: `No mapped local folder found for service "${payload.appName}".`,
  });
  return;
}

const session = this.currentLogSessionSeed;
if (session === null) {
  this.postMessage({
    type: MSG_EXPORT_ARTIFACT_RESULT,
    success: false,
    message: 'No active CF scope session. Select region/org/space again.',
  });
  return;
}

const exportSession: ServiceExportSession = {
  apiEndpoint: session.apiEndpoint,
  email: session.email,
  password: session.password,
  orgName: session.orgName,
  spaceName: session.spaceName,
  cfHomeDir: session.cfHomeDir,
};

const confirmed = await this.confirmSensitiveExport({
  appName: payload.appName,
  exportType: 'artifacts',
});
if (!confirmed) {
  this.postMessage({
    type: MSG_EXPORT_ARTIFACT_RESULT,
    success: false,
    message: 'Export cancelled.',
  });
  return;
}

this.exportInProgress = true;
this.postMessage({
  type: MSG_EXPORT_ARTIFACT_PROGRESS,
  inProgress: true,
  message: `Exporting artifacts for "${payload.appName}"...`,
});

try {
  const remoteRootSetting = readSharedRemoteRoot();
  const result = await exportServiceArtifacts({
    appName: payload.appName,
    targetFolderPath: mapping.folderPath,
    session: exportSession,
    includeDefaultEnv: options.includeDefaultEnv,
    includePnpmLock: options.includePnpmLock,
    ...(remoteRootSetting !== undefined ? { remoteRootSetting } : {}),
  });

  const filesLabel = result.writtenFiles
    .map((filePath) => `"${filePath}"`)
    .join(', ');
  this.outputChannel.appendLine(
    `[export] ${sanitizeForLog(payload.appName)} -> ${sanitizeForLog(filesLabel)}`
  );
  this.postMessage({
    type: MSG_EXPORT_ARTIFACT_RESULT,
    success: true,
    message: formatServiceArtifactExportCompletionMessage(
      payload.appName,
      result.writtenFiles
    ),
  });
} catch (error) {
  const errorMessage =
    error instanceof Error ? error.message : 'Failed to export service artifacts.';
  this.postMessage({
    type: MSG_EXPORT_ARTIFACT_RESULT,
    success: false,
    message: errorMessage,
  });
} finally {
  this.exportInProgress = false;
  this.postMessage({
    type: MSG_EXPORT_ARTIFACT_PROGRESS,
    inProgress: false,
  });
}
}

export async function handleBuildPublishAll(this: RegionSidebarProvider, targetPackageName?: string): Promise<void> {
if (this.buildPublishInProgress) {
  this.postBuildResult(false, 'A build & publish run is already in progress.');
  return;
}

const rootFolderPath = this.selectedLocalRootFolderPath.trim();
if (rootFolderPath.length === 0) {
  this.postBuildResult(false, 'Select a local root folder before building packages.');
  return;
}

const config = readLocalPackagesConfig(this.currentConfirmedScope);
if (config.namePatterns.trim().length === 0) {
  this.postBuildResult(
    false,
    'Configure "sapTools.localPackages.namePatterns" (e.g. "@example/") to detect your packages.'
  );
  return;
}

this.buildPublishInProgress = true;
// Log to the output channel but do not steal focus by auto-opening it.
// Users can open "SAP Tools: NPM Build" manually if they want to follow along.
this.npmBuildChannel.appendLine(
  `\n=== Build & publish all local packages (${new Date().toISOString()}) ===`
);

try {
  await this.verdaccioManager.start({
    port: config.registry.port,
    scopes: config.registry.scopes,
  });
  await this.postRegistryState();

  const requestOpts: import('../../localPackages/buildPublishOrchestrator').BuildPublishRequest = {
    rootFolderPath,
    config,
    registryUrl: this.verdaccioManager.getRegistryUrl(config.registry.port),
    authToken: this.verdaccioManager.getAuthToken(),
    onOrder: (order) => {
      this.postMessage({ type: MSG_BUILD_PUBLISH_PREVIEW, order: [...order] });
    },
    onProgress: (progress) => {
      this.postMessage({ type: MSG_BUILD_PUBLISH_PROGRESS, ...progress });
    },
    onOutput: (chunk) => {
      this.npmBuildChannel.append(chunk);
    },
  };

  if (targetPackageName !== undefined) {
    Object.assign(requestOpts, { targetPackageName });
  }

  const outcome = await runBuildPublishAll(requestOpts);

  const summary =
    `Published ${String(outcome.order.length)} package(s) ` +
    `(${String(outcome.builtCount)} built, ${String(outcome.skippedCount)} skipped) ` +
    'to the local registry.';
  this.npmBuildChannel.appendLine(summary);
  this.postBuildResult(true, targetPackageName === undefined ? '' : summary);
} catch (error) {
  const message = error instanceof Error ? error.message : 'Build & publish failed.';
  this.npmBuildChannel.appendLine(`ERROR: ${message}`);
  this.postBuildResult(false, message);
} finally {
  this.buildPublishInProgress = false;
  await this.postRegistryState();
}
}

export async function handleReplaceServicePackagePlaceholder(this: RegionSidebarProvider, appId: string): Promise<void> {
const mapping = this.serviceFolderMappings.find(
  (m) => m.appId === appId && m.folderPath.length > 0
);
if (mapping === undefined) {
  void vscode.window.showErrorMessage(
    `SAP Tools: No mapped folder found for service "${appId}".`
  );
  return;
}

const config = readLocalPackagesConfig(this.currentConfirmedScope);
const placeholders = config.packageJsonTagPlaceholder
  .split(',')
  .map((p) => p.trim())
  .filter((p) => p.length > 0);

const tag = config.registry.defaultTag;
const packageJsonPath = join(mapping.folderPath, 'package.json');

try {
  const localPackageNames = await this.resolveLocalPackageNamesForReplacement(config);
  if (placeholders.length === 0 && localPackageNames.length === 0) {
    void vscode.window.showWarningMessage(
      'SAP Tools: No placeholder configured. Set "sapTools.localPackages.packageJsonTagPlaceholder" first.'
    );
    return;
  }

  const content = await readFile(packageJsonPath, 'utf8');
  const result = replaceServicePackageDependencyTags(content, {
    placeholders,
    localPackageNames,
    tag,
  });
  if (!result.changed) {
    void vscode.window.showInformationMessage(
      `SAP Tools: No package.json update needed for "${mapping.appName}".`
    );
    return;
  }
  await writeFile(packageJsonPath, result.content, 'utf8');
  void vscode.window.showInformationMessage(
    formatServicePackageReplaceMessage(mapping.appName, tag, result)
  );
} catch (error) {
  const msg = error instanceof Error ? error.message : String(error);
  void vscode.window.showErrorMessage(`SAP Tools: Failed to update package.json: ${msg}`);
}
}

export async function handleMicrosoftGraphToolRun(this: RegionSidebarProvider, request: MicrosoftGraphToolRunRequest): Promise<void> {
this.microsoftGraphChannel.show(true);
this.appendMicrosoftGraphToolLog(request.toolId, 'run', 'started', 'Run started.');
const result = await runMicrosoftGraphTool(request, {
  onProgress: (progress) => {
    this.appendMicrosoftGraphToolProgress(progress);
    this.postMessage({ type: MSG_MICROSOFT_GRAPH_TOOL_PROGRESS, ...progress });
  },
});
this.appendMicrosoftGraphToolLog(
  result.toolId,
  'result',
  result.success ? 'done' : 'failed',
  result.message
);
this.postMessage({ type: MSG_MICROSOFT_GRAPH_TOOL_RESULT, ...result });
}

export async function handleExportSqlToolsConfig(this: RegionSidebarProvider, payload: ExportSqlToolsConfigPayload): Promise<void> {
if (this.exportInProgress) {
  this.postMessage({
    type: MSG_EXPORT_SQLTOOLS_RESULT,
    success: false,
    message: 'Another export is already running. Please wait.',
  });
  return;
}

const mapping = this.resolveServiceFolderMapping(payload);
if (mapping === null || mapping.folderPath.length === 0) {
  this.postMessage({
    type: MSG_EXPORT_SQLTOOLS_RESULT,
    success: false,
    message: `No mapped local folder found for service "${payload.appName}".`,
  });
  return;
}

const rootFolderPath = this.selectedLocalRootFolderPath.trim();
if (rootFolderPath.length === 0) {
  this.postMessage({
    type: MSG_EXPORT_SQLTOOLS_RESULT,
    success: false,
    message: 'No root folder selected. Select a root folder first.',
  });
  return;
}

const session = this.currentLogSessionSeed;
if (session === null) {
  this.postMessage({
    type: MSG_EXPORT_SQLTOOLS_RESULT,
    success: false,
    message: 'No active CF scope session. Select region/org/space again.',
  });
  return;
}

const exportSession = {
  apiEndpoint: session.apiEndpoint,
  email: session.email,
  password: session.password,
  orgName: session.orgName,
  spaceName: session.spaceName,
  cfHomeDir: session.cfHomeDir,
};

const confirmed = await this.confirmSensitiveExport({
  appName: payload.appName,
  exportType: 'sqltools',
});
if (!confirmed) {
  this.postMessage({
    type: MSG_EXPORT_SQLTOOLS_RESULT,
    success: false,
    message: 'Export cancelled.',
  });
  return;
}

this.exportInProgress = true;
this.postMessage({
  type: MSG_EXPORT_SQLTOOLS_PROGRESS,
  inProgress: true,
  message: `Exporting SQLTools config for "${payload.appName}"...`,
});

try {
  const result = await exportSqlToolsConfig({
    appName: payload.appName,
    regionCode: this.selectedRegionCode,
    rootFolderPath,
    session: exportSession,
  });

  this.outputChannel.appendLine(
    `[export] SQLTools ${sanitizeForLog(payload.appName)} -> ${sanitizeForLog(result.settingsPath)}`
  );
  this.postMessage({
    type: MSG_EXPORT_SQLTOOLS_RESULT,
    success: true,
    message: `SQLTools connection "${result.connection.name}" exported to "${result.settingsPath}".`,
  });
} catch (error) {
  const errorMessage =
    error instanceof Error ? error.message : 'Failed to export SQLTools config.';
  this.postMessage({
    type: MSG_EXPORT_SQLTOOLS_RESULT,
    success: false,
    message: errorMessage,
  });
} finally {
  this.exportInProgress = false;
  this.postMessage({
    type: MSG_EXPORT_SQLTOOLS_PROGRESS,
    inProgress: false,
  });
}
}

export async function handleOpenHanaSqlFile(this: RegionSidebarProvider, payload: OpenHanaSqlFilePayload): Promise<void> {
const targetApp =
  this.currentApps.find((app) => app.id === payload.serviceId) ??
  this.currentApps.find((app) => app.name === payload.serviceName);
if (targetApp === undefined) {
  this.outputChannel.appendLine(
    `[sql-ui] open sql file rejected: app not found serviceId=${sanitizeSqlUiLogValue(payload.serviceId)} serviceName=${sanitizeSqlUiLogValue(payload.serviceName)}`
  );
  this.postHanaSqlFileOpenResult(
    payload.requestId, payload.serviceId, false, 'Selected app was not found.'
  );
  return;
}

const sessionSeed = this.currentLogSessionSeed;
if (sessionSeed === null && !isTestMode()) {
  this.outputChannel.appendLine(
    `[sql-ui] open sql file rejected: no active session app=${sanitizeSqlUiLogValue(targetApp.name)}`
  );
  this.postHanaSqlFileOpenResult(
    payload.requestId, payload.serviceId, false,
    'No active CF scope session. Confirm scope and choose app again.'
  );
  return;
}

this.outputChannel.appendLine(
  `[sql-ui] open sql file requested app=${sanitizeSqlUiLogValue(targetApp.name)}`
);
try {
  await this.hanaSqlWorkbench.openSqlDocumentForApp({
    appId: targetApp.id,
    appName: targetApp.name,
    session: sessionSeed,
  });
  this.outputChannel.appendLine(
    `[sql-ui] open sql file succeeded app=${sanitizeSqlUiLogValue(targetApp.name)}`
  );
  this.postHanaSqlFileOpenResult(payload.requestId, targetApp.id, true, '');
  void this.publishHanaTablesForApp(targetApp.id, targetApp.name, sessionSeed);
} catch (error) {
  const errorMessage = error instanceof Error ? error.message : 'Failed to open SQL file.';
  this.outputChannel.appendLine(
    `[sql-ui] open sql file failed app=${sanitizeSqlUiLogValue(targetApp.name)} message=${sanitizeSqlUiLogValue(errorMessage)}`
  );
  this.postHanaSqlFileOpenResult(payload.requestId, targetApp.id, false, errorMessage);
}
}

export async function handleOpenSqlBackupHistory(this: RegionSidebarProvider): Promise<void> {
if (this.hanaSqlHistoryPanelManager === null || this.hanaSqlBackupStore === null) {
  this.outputChannel.appendLine('[sql-history] history panel manager or backup store not available');
  return;
}
if (this.currentConfirmedScope === undefined) {
  this.outputChannel.appendLine('[sql-history] active scope not available');
  return;
}
this.outputChannel.appendLine('[sql-history] opening backup history panel');
await this.hanaSqlHistoryPanelManager.openOrReveal(this.hanaSqlBackupStore, {
  region: this.currentConfirmedScope.regionCode,
  orgName: this.currentConfirmedScope.orgName,
  spaceName: this.currentConfirmedScope.spaceName
});
}

export async function handleRefreshHanaTables(this: RegionSidebarProvider, payload: RefreshHanaTablesPayload): Promise<void> {
const targetApp =
  this.currentApps.find((app) => app.id === payload.serviceId) ??
  this.currentApps.find((app) => app.name === payload.serviceName);
if (targetApp === undefined) {
  this.outputChannel.appendLine(
    `[sql-ui] refresh tables rejected: app not found serviceId=${sanitizeSqlUiLogValue(payload.serviceId)} serviceName=${sanitizeSqlUiLogValue(payload.serviceName)}`
  );
  this.postMessage({
    type: MSG_HANA_TABLES_LOADED,
    serviceId: payload.serviceId,
    success: false,
    tables: [],
    message: 'Selected app was not found.',
  });
  return;
}
const sessionSeed = this.currentLogSessionSeed;
await this.publishHanaTablesForApp(targetApp.id, targetApp.name, sessionSeed, true);
}

export async function handleRunHanaTableSelect(this: RegionSidebarProvider, payload: RunHanaTableSelectPayload): Promise<void> {
const targetApp =
  this.currentApps.find((app) => app.id === payload.serviceId) ??
  this.currentApps.find((app) => app.name === payload.serviceName);
if (targetApp === undefined) {
  this.outputChannel.appendLine(
    `[sql-ui] quick select rejected: app not found serviceId=${sanitizeSqlUiLogValue(payload.serviceId)} serviceName=${sanitizeSqlUiLogValue(payload.serviceName)} table=${sanitizeSqlUiLogValue(payload.tableName)}`
  );
  this.postHanaTableSelectResult(
    payload.serviceId,
    payload.tableName,
    false,
    'Selected app was not found.'
  );
  return;
}

const sessionSeed = this.currentLogSessionSeed;
if (sessionSeed === null && !isTestMode()) {
  this.outputChannel.appendLine(
    `[sql-ui] quick select rejected: no active session app=${sanitizeSqlUiLogValue(targetApp.name)} table=${sanitizeSqlUiLogValue(payload.tableName)}`
  );
  this.postHanaTableSelectResult(
    payload.serviceId,
    payload.tableName,
    false,
    'No active CF scope session. Confirm scope and choose app again.'
  );
  return;
}

this.outputChannel.appendLine(
  `[sql-ui] quick select requested app=${sanitizeSqlUiLogValue(targetApp.name)} table=${sanitizeSqlUiLogValue(payload.tableName)}`
);
try {
  await this.hanaSqlWorkbench.runQuickTableSelectForApp({
    appId: targetApp.id,
    appName: targetApp.name,
    session: sessionSeed,
    tableName: payload.tableName,
  });
  this.outputChannel.appendLine(
    `[sql-ui] quick select succeeded app=${sanitizeSqlUiLogValue(targetApp.name)} table=${sanitizeSqlUiLogValue(payload.tableName)}`
  );
  this.postHanaTableSelectResult(
    targetApp.id,
    payload.tableName,
    true,
    ''
  );
} catch (error) {
  const errorMessage =
    error instanceof Error ? error.message : 'Failed to run quick SELECT.';
  this.outputChannel.appendLine(
    `[sql-ui] quick select failed app=${sanitizeSqlUiLogValue(targetApp.name)} table=${sanitizeSqlUiLogValue(payload.tableName)} message=${sanitizeSqlUiLogValue(errorMessage)}`
  );
  this.postHanaTableSelectResult(
    targetApp.id,
    payload.tableName,
    false,
    errorMessage
  );
}
}

export async function handleOpenSqlToolsExtension(this: RegionSidebarProvider): Promise<void> {
const sqlToolsExtension = vscode.extensions.getExtension(SQLTOOLS_EXTENSION_ID);

if (sqlToolsExtension !== undefined) {
  try {
    if (!sqlToolsExtension.isActive) {
      await sqlToolsExtension.activate();
    }
    await vscode.commands.executeCommand(SQLTOOLS_ACTIVITY_BAR_COMMAND);
    return;
  } catch {
    // Fall through to the marketplace-open fallback if the activity bar
    // command is not registered for the installed SQLTools version.
  }
}

await vscode.commands.executeCommand(
  BUILTIN_EXTENSION_OPEN_COMMAND,
  SQLTOOLS_EXTENSION_ID
);
}

export async function handleLoginSubmit(this: RegionSidebarProvider, email: string, password: string): Promise<void> {
try {
  await storeCredentials(this.context, { email, password });
  await this.cacheSyncService.setCredentials({ email, password });
  this.hasAttemptedConfirmedScopeRestore = false;
  this.reloadToMainView();
} catch (error) {
  const errorMessage =
    error instanceof Error ? error.message : 'Failed to save credentials.';
  this.postMessage({ type: MSG_LOGIN_RESULT, success: false, error: errorMessage });
}
}

export async function handleLogout(this: RegionSidebarProvider): Promise<void> {
try {
  const previousCredentials = await getEffectiveCredentials(this.context).catch(() => null);
  const previousEmail = previousCredentials?.email ?? '';
  await clearCredentials(this.context);
  await this.cacheSyncService.setCredentials(null);
  if (previousEmail.length > 0) {
    try {
      const removed = await this.cacheStore.clearHanaTableListsForUser(previousEmail);
      if (removed > 0) {
        this.outputChannel.appendLine(
          `[sql-ui] cleared ${String(removed)} cached HANA table list(s) for ${sanitizeSqlUiLogValue(previousEmail)}`
        );
      }
      // Drop remembered HANA tunnel jump-hosts too (HANA hostnames + app
      // names) so a logged-out account leaves no residual SQL state.
      await this.cacheStore.clearHanaTunnelJumpApps();
    } catch {
      /* best effort cleanup, ignore failures */
    }
  }
  this.cfSession = null;
  this.cfSessionRegionCode = '';
  this.selectedRegionCode = '';
  this.selectedRegionId = '';
  this.selectedOrgGuid = '';
  this.bumpRegionSelectionRequestId();
  this.currentApps = [];
  this.currentLogSessionSeed = null;
  this.serviceFolderMappings = [];
  this.serviceFolderSelections.clear();
  this.exportInProgress = false;
  this.hasAttemptedConfirmedScopeRestore = false;
  this.lastLoadedScope = null;
  this.lastWrittenScope = undefined;
  this.currentConfirmedScope = undefined;
  this.hanaSqlWorkbench.invalidateAllAppContexts();
  this.cfLogsPanel.updateApps([], null);
  this.cfLogsPanel.updateScope('No scope selected');
  this.reloadToLoginView();
  this.postMessage({
    type: MSG_LOGOUT_RESULT,
    success: true,
  } satisfies LogoutResultPayload);
} catch (error) {
  const errorMessage =
    error instanceof Error ? error.message : 'Failed to clear credentials.';
  this.postMessage({
    type: MSG_LOGOUT_RESULT,
    success: false,
    error: errorMessage,
  } satisfies LogoutResultPayload);
}
}

export async function handleRegionSelected(this: RegionSidebarProvider, region: RegionSelectionPayload): Promise<void> {
const requestId = this.bumpRegionSelectionRequestId();
this.selectedRegionId = region.id;
this.selectedRegionCode = region.code;
this.selectedOrgGuid = '';
this.cfSession = null;
this.cfSessionRegionCode = '';
this.currentApps = [];
this.currentLogSessionSeed = null;
this.serviceFolderMappings = [];
this.serviceFolderSelections.clear();
this.exportInProgress = false;
this.lastLoadedScope = null;
this.hanaSqlWorkbench.invalidateAllAppContexts();
this.cfLogsPanel.updateApps([], null);
this.cfLogsPanel.updateScope(buildScopeLabel(region.code, 'select-org', 'select-space'));
this.postMessage({
  type: MSG_SERVICE_FOLDER_MAPPINGS_LOADED,
  mappings: this.serviceFolderMappings,
});

if (isTestMode()) {
  this.cfSession = {
    apiEndpoint: getCfApiEndpoint(region.code),
    token: {
      accessToken: 'sap-tools-test-token',
      expiresAt: Number.MAX_SAFE_INTEGER,
      refreshToken: '',
    },
  };
  this.cfSessionRegionCode = region.code;
  this.postMessage({
    type: MSG_ORGS_LOADED,
    orgs: resolveMockOrgsForRegion(region.code),
  });
  return;
}

const credentials = await getEffectiveCredentials(this.context);
if (credentials === null) {
  this.postOrgsError('No credentials found. Please re-open SAP Tools and log in.');
  return;
}

const cachedOrgs = await this.cacheSyncService.getCachedOrgs(region.id);
if (!this.isCurrentRegionRequest(requestId)) {
  return;
}

if (cachedOrgs !== null && cachedOrgs.length > 0) {
  this.postMessage({
    type: MSG_ORGS_LOADED,
    orgs: cachedOrgs,
  });
  const warmupRequestId = requestId;
  void this.refreshOrgsFromLiveAfterCachedRender(
    credentials,
    region.code,
    warmupRequestId,
    cachedOrgs
  ).catch((error: unknown) => {
    if (!this.isCurrentRegionRequest(warmupRequestId)) {
      return;
    }
    const errorMessage =
      error instanceof Error
        ? error.message
        : 'Unknown warm-up error while preparing CF session.';
    this.outputChannel.appendLine(
      `[session] Warm-up failed for ${region.code}: ${errorMessage}`
    );
  });
  return;
}

try {
  const session = await this.ensureRegionSession(credentials);
  if (!this.isCurrentRegionRequest(requestId)) {
    return;
  }
  const orgs = await fetchOrgs(session);
  if (!this.isCurrentRegionRequest(requestId)) {
    return;
  }
  this.postMessage({ type: MSG_ORGS_LOADED, orgs });
} catch (error) {
  if (!this.isCurrentRegionRequest(requestId)) {
    return;
  }
  const errorMessage =
    error instanceof Error ? error.message : 'Failed to connect to Cloud Foundry.';
  this.postOrgsError(errorMessage);
}
}

export async function handleOrgSelected(this: RegionSidebarProvider, org: OrgSelectionPayload): Promise<void> {
const requestId = this.bumpOrgSelectionRequestId();
this.selectedOrgGuid = org.guid;
const scopeLabel = buildScopeLabel(this.selectedRegionCode, org.name, 'select-space');
this.cfLogsPanel.updateScope(scopeLabel);
this.cfLogsPanel.updateApps([], null);
this.currentApps = [];
this.currentLogSessionSeed = null;
this.serviceFolderMappings = [];
this.serviceFolderSelections.clear();
this.exportInProgress = false;
this.lastLoadedScope = null;
this.hanaSqlWorkbench.invalidateAllAppContexts();
this.clearRootFolderSelection();
this.postMessage({
  type: MSG_SERVICE_FOLDER_MAPPINGS_LOADED,
  mappings: this.serviceFolderMappings,
});
if (!this.isCurrentOrgRequest(requestId)) {
  return;
}

if (isTestMode()) {
  this.postMessage({ type: MSG_SPACES_LOADED, spaces: resolveMockSpacesForOrg(org) });
  return;
}

try {
  const cachedSpaces = await this.cacheSyncService.getCachedSpaces(
    this.selectedRegionId,
    org.guid
  );
  if (!this.isCurrentOrgRequest(requestId)) {
    return;
  }

  if (cachedSpaces !== null) {
    this.postMessage({ type: MSG_SPACES_LOADED, spaces: cachedSpaces });
    return;
  }

  const credentials = await getEffectiveCredentials(this.context);
  if (credentials === null) {
    this.postSpacesError('No credentials found. Please re-open SAP Tools and log in.');
    return;
  }

  const session = await this.ensureRegionSession(credentials);
  if (!this.isCurrentOrgRequest(requestId)) {
    return;
  }
  const spaces = await fetchSpaces(session, org.guid);
  if (!this.isCurrentOrgRequest(requestId)) {
    return;
  }
  this.postMessage({ type: MSG_SPACES_LOADED, spaces });
} catch (error) {
  if (!this.isCurrentOrgRequest(requestId)) {
    return;
  }
  const errorMessage =
    error instanceof Error ? error.message : 'Failed to fetch spaces.';
  this.outputChannel.appendLine(
    `[spaces] Failed to load spaces for org ${sanitizeForLog(org.guid)}: ${sanitizeErrorForLog(errorMessage)}`
  );
  this.postSpacesError(errorMessage);
}
}

export async function handleSpaceSelected(this: RegionSidebarProvider, payload: SpaceSelectionPayload): Promise<void> {
const requestId = this.bumpSpaceSelectionRequestId();
const regionCode = this.selectedRegionCode;
this.lastLoadedScope = null;

if (isTestMode()) {
  await this.handleTestModeSpaceSelection(payload);
  return;
}

const credentials = await getEffectiveCredentials(this.context);
if (credentials === null) {
  this.postAppsError('No credentials found. Please re-open SAP Tools and log in.');
  return;
}

const apiEndpoint = getCfApiEndpoint(regionCode);

// Switching to a different space must close any HANA tunnels opened for the
// previous scope — they belong to the old space's apps. Skip when re-selecting
// the same space so an in-use tunnel is not needlessly torn down and rebuilt.
const previousSeed = this.currentLogSessionSeed;
const spaceChanged =
  previousSeed?.apiEndpoint !== apiEndpoint ||
  previousSeed.orgName !== payload.orgName ||
  previousSeed.spaceName !== payload.spaceName;
if (spaceChanged) {
  this.hanaSqlWorkbench.invalidateAllAppContexts();
}

// Primary source: the shared ~/.saptools/cf-structure.json (synced by the cf-sync
// engine, shared with the CDS Debug extension). It lists every app — running,
// scaled-to-zero, and stopped — so the dashboard matches CDS Debug instantly, even
// on a fresh install where this extension's own globalState cache is still empty.
const topologyApps = getAppsFromTopologySync(apiEndpoint, payload.orgName, payload.spaceName);

// Fall back to the legacy per-extension globalState cache only when the shared
// structure has nothing for this scope (e.g. a SAP-Tools-only install before a sync).
const cachedApps =
  topologyApps === null
    ? await this.cacheSyncService.getCachedApps(
        this.selectedRegionId,
        payload.orgGuid,
        payload.spaceName
      )
    : null;
if (!this.isCurrentSpaceRequest(requestId)) {
  return;
}
const cfHomeDir = await ensureCfHomeDir(this.context);
if (!this.isCurrentSpaceRequest(requestId)) {
  return;
}

const immediateApps: SidebarAppEntry[] | null =
  topologyApps ??
  (cachedApps === null
    ? null
    : cachedApps.map((app) => ({
        id: app.id,
        name: app.name,
        runningInstances: app.runningInstances,
      })));

if (immediateApps !== null) {
  // Serve straight from the shared cf-structure.json (kept fresh by the cf-sync
  // engine and the sibling CDS Debug extension). Do NOT trigger a live cf-sync
  // here: running it on every space selection — including scope hand-offs received
  // from CDS Debug via sapCap.currentScope — made both extensions drive the shared
  // ~/.saptools cf-sync engine at the same time, contending over its CF config and
  // lock files and breaking the bidirectional scope sync. Freshness for scopes the
  // user actually confirms is handled by refreshTopologyForConfirmedScope, and
  // CDS Debug keeps the shared structure fresh otherwise.
  await this.postAppsLoaded(immediateApps, payload, credentials, cfHomeDir, regionCode);
  return;
}

// Nothing cached for this scope yet (e.g. a SAP-Tools-only install before any
// sync has populated the shared structure): populate just this one space on
// demand, then serve it.
try {
  const refresh = await refreshCfSyncSpace({
    apiEndpoint,
    orgName: payload.orgName,
    spaceName: payload.spaceName,
    email: credentials.email,
    password: credentials.password,
    log: (message) => {
    this.outputChannel.appendLine(message);
  },
  });
  if (!this.isCurrentSpaceRequest(requestId)) {
    return;
  }

  if (refresh.status === 'refreshed') {
    // Use the apps returned by the refresh directly: when the shared lock is
    // busy the sync runs against a private fallback directory that
    // getAppsFromTopologySync (which only reads the shared structure) cannot
    // see, so re-reading the shared file would yield nothing.
    const freshApps: SidebarAppEntry[] = refresh.apps.map((app) => ({
      id: app.id,
      name: app.name,
      runningInstances: app.runningInstances,
    }));
    this.outputChannel.appendLine(
      `[apps] Refreshed ${sanitizeForLog(payload.spaceName)} via ${refresh.source} (${String(refresh.appCount)} apps)`
    );
    await this.postAppsLoaded(freshApps, payload, credentials, cfHomeDir, regionCode);
    return;
  }

  const reason =
    refresh.status === 'failed'
      ? refresh.error instanceof Error
        ? refresh.error.message
        : 'Failed to load apps from Cloud Foundry.'
      : 'Could not resolve the Cloud Foundry region for this scope.';
  this.outputChannel.appendLine(
    `[apps] Refresh ${refresh.status} for ${sanitizeForLog(payload.spaceName)}: ${sanitizeForLog(reason)}`
  );
  this.postAppsError(reason);
} catch (error) {
  if (!this.isCurrentSpaceRequest(requestId)) {
    return;
  }
  const errorMessage =
    error instanceof Error ? error.message : 'Failed to load apps from Cloud Foundry.';
  this.postAppsError(errorMessage);
}
}

export async function handleTestModeSpaceSelection(this: RegionSidebarProvider, payload: SpaceSelectionPayload): Promise<void> {
const appsDelayMs = resolveE2eTestModeAppsDelayMs();
if (appsDelayMs > 0) {
  await sleep(appsDelayMs);
}

if (payload.spaceName === 'failspace') {
  this.postAppsError(
    'Simulated CF CLI failure: could not reach API endpoint for failspace.'
  );
  return;
}

const apps = resolveMockApps(payload.spaceName).map((name) => ({
  id: name,
  name,
  runningInstances: 1,
}));
this.postMessage({
  type: MSG_APPS_LOADED,
  apps,
  scopeKey: `${this.selectedRegionCode}::${payload.orgName}::${payload.spaceName}`,
});
this.cfLogsPanel.updateScope(
  buildScopeLabel(this.selectedRegionCode, payload.orgName, payload.spaceName)
);
this.cfLogsPanel.updateApps(apps, null);
this.currentApps = apps;
this.currentLogSessionSeed = null;
this.lastLoadedScope = {
  regionId: this.selectedRegionId,
  regionCode: this.selectedRegionCode,
  orgGuid: payload.orgGuid,
  orgName: payload.orgName,
  spaceName: payload.spaceName,
};
this.exportInProgress = false;
await this.restoreRootFolderForLoadedSpace(payload);
const restoredMappings = await this.restoreServiceFolderMappingsForCurrentScope();
if (!restoredMappings) {
  this.serviceFolderMappings = [];
  this.serviceFolderSelections.clear();
  this.postMessage({
    type: MSG_SERVICE_FOLDER_MAPPINGS_LOADED,
    mappings: this.serviceFolderMappings,
  });
}

if (this.selectedLocalRootFolderPath.length > 0) {
  void this.refreshServiceFolderMappings();
}
}

export async function handleSaveSshProxySettings(this: RegionSidebarProvider, payload: any): Promise<void> {
const config = vscode.workspace.getConfiguration('sapTools');
await config.update('sshProxy', {
   
  enabled: payload.enabled === true,
   
  host: typeof payload.host === 'string' ? (payload.host as string) : '',
   
  port: typeof payload.port === 'number' ? (payload.port as number) : 22,
   
  username: typeof payload.username === 'string' ? (payload.username as string) : '',
   
  password: typeof payload.password === 'string' ? (payload.password as string) : undefined,
}, vscode.ConfigurationTarget.Global);

 
if (payload.enabled === true) {
  try {
    const { ensureSshProxy } = await import('../../sshProxyTunnel.js');
    await ensureSshProxy();
    this.postMessage({
      type: MSG_SSH_PROXY_STATUS,
      payload: { connection: 'connected', message: null }
    });
  } catch (error: unknown) {
    this.postMessage({
      type: MSG_SSH_PROXY_STATUS,
      payload: { connection: 'error', message: error instanceof Error ? error.message : String(error) }
    });
  }
} else {
  this.sendSshProxyStatus();
}
}

export async function handleClearSshProxySettings(this: RegionSidebarProvider): Promise<void> {
const config = vscode.workspace.getConfiguration('sapTools');
await config.update('sshProxy', undefined, vscode.ConfigurationTarget.Global);
this.sendSshProxyStatus();
}

