import * as vscode from 'vscode';

import type { ApisExplorerPanelManager, ApisExplorerPanelSession } from './apisExplorerPanel';
import { normalizeUserEmail, type CacheStore } from './cacheStore';
import type { CacheRuntimeSnapshot, CacheSyncService } from './cacheSyncService';
import type { CfSession } from './cfClient';
import {
    cfLogin,
    fetchCfLoginInfo,
    fetchOrgs,
    getCfApiEndpoint,
    isCfSessionExpired
} from './cfClient';
import { ensureCfHomeDir } from './cfHome';
import type { CfLogsPanelProvider } from './cfLogsPanel';
import { refreshCfSyncSpace } from './cfSpaceRefresh';
import {
    EMPTY_CF_TOPOLOGY,
    getCfTopologySnapshot,
    getCfTopologySnapshotSync,
    type CfTopology
} from './cfTopology';
import { getEffectiveCredentials } from './credentialStore';
import type { HanaSqlBackupStore } from './hanaSqlBackupStore';
import type { HanaSqlHistoryPanelManager } from './hanaSqlHistoryPanel';
import type { HanaSqlWorkbench } from './hanaSqlWorkbench';
import { buildDependencyOrder } from './localPackages/dependencyGraph';
import { scanLocalPackages } from './localPackages/localPackageScanner';
import {
    readLocalPackagesConfig,
    type LocalPackagesConfig,
} from './localPackages/localPackagesConfig';
import { VerdaccioManager } from './localPackages/verdaccioManager';
import {
    readMicrosoftGraphToolRunRequest,
    sanitizeGraphMessage,
    type MicrosoftGraphToolRunRequest,
    type MicrosoftGraphToolStepProgress
} from './microsoftGraphTools';
import { SAP_BTP_REGIONS, toHyphenatedRegionCode } from './regions';
import { type SharedCfScope } from './scopeSync';
import {
    buildServiceFolderMappings,
    type ServiceFolderMapping,
} from './serviceFolderMapping';
import { readSharedAppFolderMappings } from './sharedDebugConfig';
import {
    resolveMockCfTopology,
    resolveMockOrgsForRegion
} from './testModeData';


import { buildLoginGateHtml, buildMainHtml } from './sidebarProvider.html';

import type {
    AppListReloadRequest,
    CacheStatePayload,
    CfLogSessionSeed,
    ConfirmScopeOptions,
    ConfirmScopePayload,
    EventMeshViewerController,
    ExportServiceArtifactsPayload,
    ExportSqlToolsConfigPayload,
    LoadedScopeState,
    OpenHanaSqlFilePayload,
    OrgSelectionPayload,
    PersistedConfirmedScopeEntry,
    PersistedServiceMappingScopeEntry,
    QuickScopeConfirmPayload,
    RefreshHanaTablesPayload,
    RefreshServiceFolderMappingsPayload,
    RegionSelectionPayload,
    RootFolderCacheScope,
    RunHanaTableSelectPayload,
    SelectServiceFolderMappingPayload,
    SidebarAppEntry,
    SpaceSelectionPayload,
    TopologyOrgSelectedPayload
} from './sidebarProvider.types';
import {
    MSG_ACTIVE_APPS_CHANGED,
    MSG_APPS_ERROR,
    MSG_APPS_LOADED,
    MSG_APPS_RELOAD_ERROR,
    MSG_BUILD_PUBLISH_ALL,
    MSG_BUILD_PUBLISH_RESULT,
    MSG_BUILD_SINGLE_PACKAGE,
    MSG_CACHE_STATE,
    MSG_CF_TOPOLOGY,
    MSG_CLEAR_SSH_PROXY_SETTINGS,
    MSG_CONFIRM_SCOPE,
    MSG_EVENT_MESH_VIEWER_SETTLED,
    MSG_EXPORT_SERVICE_ARTIFACTS,
    MSG_EXPORT_SQLTOOLS_CONFIG,
    MSG_GET_SSH_PROXY_STATUS,
    MSG_HANA_SQL_FILE_OPEN_RESULT,
    MSG_HANA_TABLE_SELECT_RESULT,
    MSG_HANA_TABLES_LOADED,
    MSG_HANA_TUNNEL_STATE,
    MSG_LOCAL_PACKAGES_LOADED,
    MSG_LOCAL_PACKAGES_LOADING,
    MSG_LOCAL_REGISTRY_START,
    MSG_LOCAL_REGISTRY_STATE,
    MSG_LOCAL_REGISTRY_STATUS,
    MSG_LOCAL_REGISTRY_STOP,
    MSG_LOCAL_ROOT_FOLDER_UPDATED,
    MSG_LOGIN_SUBMIT,
    MSG_LOGOUT,
    MSG_OPEN_APIS_EXPLORER,
    MSG_OPEN_CF_LOGS_PANEL,
    MSG_OPEN_EVENT_MESH,
    MSG_OPEN_HANA_SQL_FILE,
    MSG_OPEN_LOCAL_PACKAGES_SETTINGS,
    MSG_OPEN_SQL_BACKUP_HISTORY,
    MSG_OPEN_SQLTOOLS_EXTENSION,
    MSG_ORG_SELECTED,
    MSG_ORGS_ERROR,
    MSG_ORGS_LOADED,
    MSG_PAUSED_APPS_CHANGED,
    MSG_QUICK_SCOPE_CONFIRM,
    MSG_REFRESH_HANA_TABLES,
    MSG_REFRESH_SERVICE_FOLDER_MAPPINGS,
    MSG_REGION_SELECTED,
    MSG_RELOAD_APP_LIST,
    MSG_REPLACE_SERVICE_PACKAGE_PLACEHOLDER,
    MSG_REQUEST_CF_TOPOLOGY,
    MSG_REQUEST_INITIAL_STATE,
    MSG_RESTORE_CONFIRMED_SCOPE,
    MSG_RUN_HANA_TABLE_SELECT,
    MSG_RUN_MICROSOFT_GRAPH_TOOL,
    MSG_SAVE_SSH_PROXY_SETTINGS,
    MSG_SELECT_LOCAL_ROOT_FOLDER,
    MSG_SELECT_SERVICE_FOLDER_MAPPING,
    MSG_SERVICE_FOLDER_MAPPINGS_ERROR,
    MSG_SERVICE_FOLDER_MAPPINGS_LOADED,
    MSG_SPACE_SELECTED,
    MSG_SPACES_ERROR,
    MSG_SSH_PROXY_STATUS,
    MSG_SYNC_NOW,
    MSG_TOPOLOGY_ORG_SELECTED,
    MSG_UPDATE_SYNC_INTERVAL
} from './sidebarProvider.types';

export { REGION_VIEW_ID } from './sidebarProvider.types';

import { handleBuildPublishAll, handleClearSshProxySettings, handleConfirmScope, handleExportServiceArtifacts, handleExportSqlToolsConfig, handleExternalScopeChange, handleLoginSubmit, handleLogout, handleMicrosoftGraphToolRun, handleOpenApisExplorer, handleOpenHanaSqlFile, handleOpenSqlBackupHistory, handleOpenSqlToolsExtension, handleOrgSelected, handleQuickScopeConfirm, handleRefreshHanaTables, handleRefreshServiceFolderMappings, handleRegionSelected, handleReloadAppList, handleReplaceServicePackagePlaceholder, handleRequestInitialState, handleRunHanaTableSelect, handleSaveSshProxySettings, handleSelectLocalRootFolder, handleSpaceSelected, handleTestModeSpaceSelection, handleTopologyOrgSelected } from "./sidebar/handlers/sidebarHandlers";
import {
    appListsEqual,
    areLocalPackageListsEqual,
    areRegionCodesEquivalent,
    areReloadScopesEqual,
    areSharedScopesEqual,
    buildLocalPackagesCacheKey,
    buildScopeLabel,
    buildServiceMappingsScopeKey,
    buildSharedScopeFromConfirmPayload,
    createNonce,
    formatAppListReloadFailure,
    haveSameOrgEntries,
    isActiveAppsChangedMessage,
    isConfirmScopeMessage,
    isExportServiceArtifactsMessage,
    isExportSqlToolsConfigMessage,
    isLoadedScopeForConfirmedScope,
    isLoginSubmitMessage,
    isOpenHanaSqlFileMessage,
    isOrgSelectedMessage,
    isQuickScopeConfirmMessage,
    isRecord,
    isRefreshHanaTablesMessage,
    isRefreshServiceFolderMappingsMessage,
    isRegionSelectedMessage,
    isRunHanaTableSelectMessage,
    isSelectServiceFolderMappingMessage,
    isSpaceSelectedMessage,
    isTestMode,
    isTopologyOrgSelectedMessage,
    isUpdateSyncIntervalMessage,
    normalizePersistedServiceMappingsByScope,
    normalizeServiceMappingForPersistence,
    pathExists,
    readActiveAppsChangedPayload,
    readConfirmScopePayload,
    readExportServiceArtifactsPayload,
    readExportSqlToolsConfigPayload,
    readLoginSubmitPayload,
    readOpenHanaSqlFilePayload,
    readOptionalString,
    readOrgSelectionPayload,
    readQuickScopeConfirmPayload,
    readRefreshHanaTablesPayload,
    readRefreshServiceFolderMappingsPayload,
    readRegionSelectionPayload,
    readRunHanaTableSelectPayload,
    readSelectServiceFolderMappingPayload,
    readSpaceSelectionPayload,
    readTopologyOrgSelectedPayload,
    readUpdateSyncIntervalPayload,
    sanitizeErrorForLog,
    sanitizeForLog,
    sanitizeSqlUiLogValue,
    shouldSkipSensitiveExportConfirmation
} from './sidebarProvider.helpers';

const CONFIRMED_SCOPE_BY_EMAIL_GLOBAL_STATE_KEY = 'sapTools.confirmedScopeByEmail.v1';
const SERVICE_MAPPINGS_BY_SCOPE_GLOBAL_STATE_KEY = 'sapTools.serviceMappingsByScope.v1';
export class RegionSidebarProvider
  implements vscode.WebviewViewProvider, vscode.Disposable
{
  private webviewView: vscode.WebviewView | undefined;
  private cfSession: CfSession | null = null;
  private cfSessionRegionCode = '';
  private selectedRegionCode = '';
  private selectedRegionId = '';
  private selectedOrgGuid = '';
  private regionSelectionRequestId = 0;
  private orgSelectionRequestId = 0;
  private spaceSelectionRequestId = 0;
  private selectedLocalRootFolderPath = '';
  private currentApps: SidebarAppEntry[] = [];
  private currentLogSessionSeed: CfLogSessionSeed | null = null;
  private serviceFolderMappings: ServiceFolderMapping[] = [];
  private readonly serviceFolderSelections = new Map<string, string>();
  private e2eRootDialogStepIndex = 0;
  private exportInProgress = false;
  private buildPublishInProgress = false;
  private hasAttemptedConfirmedScopeRestore = false;
  private lastLoadedScope: LoadedScopeState | null = null;
  private lastWrittenScope: SharedCfScope | undefined;
  private currentConfirmedScope: SharedCfScope | undefined;
  private externalScopeChangeRequestId = 0;
  private readonly disposables: vscode.Disposable[] = [];
  private readonly npmBuildChannel: vscode.OutputChannel;
  private readonly microsoftGraphChannel: vscode.OutputChannel;
  private readonly verdaccioManager: VerdaccioManager;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly outputChannel: vscode.OutputChannel,
    private readonly context: vscode.ExtensionContext,
    private readonly cfLogsPanel: CfLogsPanelProvider,
    private readonly cacheSyncService: CacheSyncService,
    private readonly cacheStore: CacheStore,
    private readonly hanaSqlWorkbench: HanaSqlWorkbench,
    private readonly apisExplorerPanelManager: ApisExplorerPanelManager,
    private readonly eventMeshPanelManager: EventMeshViewerController,
    private readonly hanaSqlBackupStore: HanaSqlBackupStore | null = null,
    private readonly hanaSqlHistoryPanelManager: HanaSqlHistoryPanelManager | null = null
  ) {
    this.hanaSqlWorkbench.registerActiveSessionProvider(() => this.currentLogSessionSeed);
    this.hanaSqlWorkbench.registerTunnelStateListener((appId, active) => {
      this.postMessage({
        type: MSG_HANA_TUNNEL_STATE,
        serviceId: appId,
        active,
      });
    });

    const cacheSubscription = this.cacheSyncService.subscribe((snapshot) => {
      this.postCacheState(snapshot);
    this.sendSshProxyStatus();

      if (!snapshot.syncInProgress) {
        void this.pushCfTopology();
      }
    });
    this.disposables.push(cacheSubscription);

    this.npmBuildChannel = vscode.window.createOutputChannel('SAP Tools: NPM Build');
    this.microsoftGraphChannel = vscode.window.createOutputChannel('SAP Tools: Microsoft Graph');
    this.verdaccioManager = new VerdaccioManager(this.npmBuildChannel);
    this.disposables.push(
      this.npmBuildChannel,
      this.microsoftGraphChannel,
      this.verdaccioManager
    );

    // Re-scan local packages whenever the user changes sapTools.localPackages settings
    // (e.g. namePatterns) without requiring a VSCode restart.
    const localPackagesConfigSubscription = vscode.workspace.onDidChangeConfiguration(
      (event): void => {
        if (event.affectsConfiguration('sapTools.localPackages')) {
          void this.postDetectedLocalPackages();
        }
      }
    );
    this.disposables.push(localPackagesConfigSubscription);
  }

  async resolveWebviewView(webviewView: vscode.WebviewView): Promise<void> {
    this.webviewView = webviewView;
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
    this.e2eRootDialogStepIndex = 0;
    this.exportInProgress = false;
    this.hasAttemptedConfirmedScopeRestore = false;
    this.lastLoadedScope = null;
    this.lastWrittenScope = undefined;
    this.currentConfirmedScope = undefined;

    const assetsRoot = vscode.Uri.joinPath(
      this.extensionUri,
      'docs',
      'designs',
      'prototypes',
      'assets'
    );

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [assetsRoot],
    };

    const credentials = await getEffectiveCredentials(this.context);
    await this.cacheSyncService.setCredentials(credentials);
    const nonce = createNonce();

    webviewView.webview.html =
      credentials !== null
        ? buildMainHtml(webviewView.webview, nonce, assetsRoot)
        : buildLoginGateHtml(webviewView.webview, nonce, assetsRoot);

    const messageSubscription = webviewView.webview.onDidReceiveMessage(
      (message: unknown): void => {
        void this.handleWebviewMessage(message).catch((error: unknown) => {
          this.logWebviewMessageFailure('message dispatch', error);
        });
      }
    );
    this.disposables.push(messageSubscription);
  }

  dispose(): void {
    while (this.disposables.length > 0) {
      this.disposables.pop()?.dispose();
    }
  }

  // ── Message dispatcher ───────────────────────────────────────────────────

  private async handleWebviewMessage(message: unknown): Promise<void> {
    if (!isRecord(message)) {
      return;
    }

    const type = message['type'];

    if (type === MSG_REQUEST_INITIAL_STATE) {
      await this.handleRequestInitialState();
      return;
    }

    if (type === MSG_LOGIN_SUBMIT && isLoginSubmitMessage(message)) {
      const payload = readLoginSubmitPayload(message);
      await this.handleLoginSubmit(payload.email, payload.password);
      return;
    }

    if (type === MSG_REGION_SELECTED && isRegionSelectedMessage(message)) {
      const payload = readRegionSelectionPayload(message);
      this.logRegionSelection(payload);
      await this.handleRegionSelected(payload);
      return;
    }

    if (type === MSG_ORG_SELECTED && isOrgSelectedMessage(message)) {
      const payload = readOrgSelectionPayload(message);
      try {
        await this.handleOrgSelected(payload);
      } catch (error) {
        this.logWebviewMessageFailure('org selection', error);
        this.postSpacesError('Failed to load spaces for the selected organization.');
      }
      return;
    }

    if (type === MSG_SPACE_SELECTED && isSpaceSelectedMessage(message)) {
      const payload = readSpaceSelectionPayload(message);
      await this.handleSpaceSelected(payload);
      return;
    }

    if (type === MSG_CONFIRM_SCOPE && isConfirmScopeMessage(message)) {
      const payload = readConfirmScopePayload(message);
      await this.handleConfirmScope(payload);
      return;
    }

    if (type === MSG_TOPOLOGY_ORG_SELECTED && isTopologyOrgSelectedMessage(message)) {
      const payload = readTopologyOrgSelectedPayload(message);
      await this.handleTopologyOrgSelected(payload);
      return;
    }

    if (type === MSG_QUICK_SCOPE_CONFIRM && isQuickScopeConfirmMessage(message)) {
      const payload = readQuickScopeConfirmPayload(message);
      await this.handleQuickScopeConfirm(payload);
      return;
    }

    if (type === MSG_REQUEST_CF_TOPOLOGY) {
      await this.pushCfTopology();
      return;
    }

    if (type === MSG_RELOAD_APP_LIST) {
      await this.handleReloadAppList();
      return;
    }

    if (type === MSG_OPEN_CF_LOGS_PANEL) {
      this.cfLogsPanel.focus();
      return;
    }

    if (type === MSG_OPEN_APIS_EXPLORER) {
      const appId = message['appId'] as string;
      await this.handleOpenApisExplorer(appId);
      return;
    }

    if (type === MSG_OPEN_EVENT_MESH) {
      const appId = message['appId'] as string;
      if (appId === '') {
        return;
      }
      try {
        if (this.currentConfirmedScope !== undefined) {
          const credentials = await getEffectiveCredentials(this.context);
          if (credentials !== null) {
            const cfHomeDir = await ensureCfHomeDir(this.context);
            await this.eventMeshPanelManager.openEventMeshViewer(appId, {
              apiEndpoint: getCfApiEndpoint(this.currentConfirmedScope.regionCode),
              email: credentials.email,
              password: credentials.password,
              orgName: this.currentConfirmedScope.orgName,
              spaceName: this.currentConfirmedScope.spaceName,
              cfHomeDir,
            });
            return;
          }
        }
        await this.eventMeshPanelManager.openEventMeshViewer(appId);
      } finally {
        this.postMessage({
          type: MSG_EVENT_MESH_VIEWER_SETTLED,
          appId,
        });
      }
      return;
    }

    if (type === MSG_ACTIVE_APPS_CHANGED && isActiveAppsChangedMessage(message)) {
      const payload = readActiveAppsChangedPayload(message);
      this.cfLogsPanel.updateActiveApps(payload.appNames);
      return;
    }

    if (type === MSG_PAUSED_APPS_CHANGED && isActiveAppsChangedMessage(message)) {
      const payload = readActiveAppsChangedPayload(message);
      this.cfLogsPanel.updatePausedApps(payload.appNames);
      return;
    }

    if (type === MSG_SELECT_LOCAL_ROOT_FOLDER) {
      await this.handleSelectLocalRootFolder();
      return;
    }

    if (
      type === MSG_REFRESH_SERVICE_FOLDER_MAPPINGS &&
      isRefreshServiceFolderMappingsMessage(message)
    ) {
      const payload = readRefreshServiceFolderMappingsPayload(message);
      await this.handleRefreshServiceFolderMappings(payload);
      return;
    }

    if (
      type === MSG_SELECT_SERVICE_FOLDER_MAPPING &&
      isSelectServiceFolderMappingMessage(message)
    ) {
      const payload = readSelectServiceFolderMappingPayload(message);
      this.handleSelectServiceFolderMapping(payload);
      return;
    }

    if (type === MSG_EXPORT_SERVICE_ARTIFACTS && isExportServiceArtifactsMessage(message)) {
      const payload = readExportServiceArtifactsPayload(message);
      await this.handleExportServiceArtifacts(payload, {
        includeDefaultEnv: true,
        includePnpmLock: true,
      });
      return;
    }

    if (type === MSG_REPLACE_SERVICE_PACKAGE_PLACEHOLDER) {
      const appId = (message as { appId?: unknown }).appId;
      if (typeof appId === 'string' && appId.length > 0) {
        await this.handleReplaceServicePackagePlaceholder(appId);
      }
      return;
    }

    if (type === MSG_EXPORT_SQLTOOLS_CONFIG && isExportSqlToolsConfigMessage(message)) {
      const payload = readExportSqlToolsConfigPayload(message);
      await this.handleExportSqlToolsConfig(payload);
      return;
    }

    if (type === MSG_OPEN_HANA_SQL_FILE && isOpenHanaSqlFileMessage(message)) {
      const payload = readOpenHanaSqlFilePayload(message);
      await this.handleOpenHanaSqlFile(payload);
      return;
    }

    if (type === MSG_OPEN_SQL_BACKUP_HISTORY) {
      await this.handleOpenSqlBackupHistory();
      return;
    }

    if (type === MSG_REFRESH_HANA_TABLES && isRefreshHanaTablesMessage(message)) {
      const payload = readRefreshHanaTablesPayload(message);
      await this.handleRefreshHanaTables(payload);
      return;
    }

    if (type === MSG_RUN_HANA_TABLE_SELECT && isRunHanaTableSelectMessage(message)) {
      const payload = readRunHanaTableSelectPayload(message);
      await this.handleRunHanaTableSelect(payload);
      return;
    }

    if (type === MSG_OPEN_SQLTOOLS_EXTENSION) {
      await this.handleOpenSqlToolsExtension();
      return;
    }

    if (type === MSG_BUILD_PUBLISH_ALL) {
      await this.handleBuildPublishAll();
      return;
    }

    if (type === MSG_BUILD_SINGLE_PACKAGE) {
      const payload = message['payload'];
      if (
        typeof payload === 'object' &&
        payload !== null &&
        typeof (payload as { packageName?: unknown }).packageName === 'string'
      ) {
        await this.handleBuildPublishAll((payload as { packageName: string }).packageName);
      }
      return;
    }

    if (type === MSG_LOCAL_REGISTRY_START) {
      await this.startLocalRegistry();
      return;
    }

    if (type === MSG_LOCAL_REGISTRY_STOP) {
      this.stopLocalRegistry();
      return;
    }

    if (type === MSG_LOCAL_REGISTRY_STATUS) {
      await this.postRegistryState();
      return;
    }

    if (type === MSG_OPEN_LOCAL_PACKAGES_SETTINGS) {
      await vscode.commands.executeCommand(
        'workbench.action.openSettings',
        '@ext:dongtran.sap-tools local'
      );
      return;
    }

    if (type === MSG_RUN_MICROSOFT_GRAPH_TOOL) {
      const request = readMicrosoftGraphToolRunRequest(message);
      if (request !== null) {
        await this.handleMicrosoftGraphToolRun(request);
      }
      return;
    }

    if (type === MSG_UPDATE_SYNC_INTERVAL && isUpdateSyncIntervalMessage(message)) {
      const payload = readUpdateSyncIntervalPayload(message);
      const snapshot = await this.cacheSyncService.updateSyncInterval(
        payload.syncIntervalHours
      );
      this.postCacheState(snapshot);
    this.sendSshProxyStatus();

      return;
    }

    if (type === MSG_SYNC_NOW) {
      const snapshot = await this.cacheSyncService.triggerSyncNow();
      this.postCacheState(snapshot);
    this.sendSshProxyStatus();

      return;
    }

    if (type === MSG_LOGOUT) {
      await this.handleLogout();
      return;
    }

    if (type === MSG_GET_SSH_PROXY_STATUS) {
      this.sendSshProxyStatus();
      return;
    }

    if (type === MSG_SAVE_SSH_PROXY_SETTINGS) {
      if ('payload' in message) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
        await this.handleSaveSshProxySettings((message as any).payload);
      }
      return;
    }

    if (type === MSG_CLEAR_SSH_PROXY_SETTINGS) {
      await this.handleClearSshProxySettings();
      return;
    }

  }

  private async handleOpenApisExplorer(appId: string): Promise<void> {
      return handleOpenApisExplorer.call(this, appId);
  }

  private async openApisExplorerSession(appId: string): Promise<ApisExplorerPanelSession> {
    const confirmedScope = this.currentConfirmedScope;
    if (confirmedScope === undefined) {
      return this.apisExplorerPanelManager.openApisExplorer(appId);
    }

    const credentials = await getEffectiveCredentials(this.context);
    if (credentials === null) {
      return this.apisExplorerPanelManager.openApisExplorer(appId);
    }

    const cfHomeDir = await ensureCfHomeDir(this.context);
    return this.apisExplorerPanelManager.openApisExplorer(appId, {
      apiEndpoint: getCfApiEndpoint(confirmedScope.regionCode),
      email: credentials.email,
      password: credentials.password,
      orgName: confirmedScope.orgName,
      spaceName: confirmedScope.spaceName,
      cfHomeDir,
    });
  }

  private async handleRequestInitialState(): Promise<void> {
      return handleRequestInitialState.call(this);
  }

  private resolveCfTopologySync(): CfTopology {
    if (isTestMode()) {
      return resolveMockCfTopology();
    }
    return getCfTopologySnapshotSync();
  }

  private async resolveCfTopologyAsync(): Promise<CfTopology> {
    if (isTestMode()) {
      return resolveMockCfTopology();
    }
    return getCfTopologySnapshot();
  }

  private async pushCfTopology(): Promise<void> {
    try {
      const topology = await this.resolveCfTopologyAsync();
      this.postCfTopologySnapshot(topology);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to read CF topology snapshot.';
      this.outputChannel.appendLine(
        `[topology] Failed to read cf-sync topology: ${sanitizeForLog(errorMessage)}`
      );
      this.postCfTopologySnapshot(EMPTY_CF_TOPOLOGY);
    }
  }

  private postCfTopologySnapshot(topology: CfTopology): void {
    this.outputChannel.appendLine(
      `[topology] Pushed snapshot ready=${topology.ready ? 'true' : 'false'} accounts=${String(topology.accounts.length)}`
    );
    this.postMessage({
      type: MSG_CF_TOPOLOGY,
      topology: {
        ready: topology.ready,
        accounts: topology.accounts.map((account) => ({
          regionKey: account.regionKey,
          regionLabel: account.regionLabel,
          apiEndpoint: account.apiEndpoint,
          orgName: account.orgName,
          spaces: [...account.spaces],
        })),
      },
    });
  }

  private async handleConfirmScope(
    payload: ConfirmScopePayload,
    options: ConfirmScopeOptions = {}
  ): Promise<void> {
      return handleConfirmScope.call(this, payload, options);
  }

  public async handleExternalScopeChange(scope: SharedCfScope): Promise<void> {
      return handleExternalScopeChange.call(this, scope);
  }

  private async restoreExternalScope(
    scope: SharedCfScope,
    requestId = this.externalScopeChangeRequestId
  ): Promise<void> {
    const region = SAP_BTP_REGIONS.find((entry) => entry.id === scope.regionCode);
    if (region === undefined) {
      return;
    }

    this.clearScopeBoundRuntimeStateForScopeChange();
    const orgGuid = await this.resolveOrgGuidByName(
      scope.regionCode,
      scope.orgName,
      () => this.isCurrentExternalScopeRequest(requestId)
    );
    if (!this.isCurrentExternalScopeRequest(requestId)) {
      return;
    }
    if (orgGuid.length === 0) {
      return;
    }

    const payload: ConfirmScopePayload = {
      regionId: region.id,
      regionCode: toHyphenatedRegionCode(region.id),
      regionName: region.displayName,
      regionArea: region.area,
      orgGuid,
      orgName: scope.orgName,
      spaceName: scope.spaceName,
    };

    await this.handleConfirmScope(payload, {
      invalidateHanaAppContexts: false,
      writeSharedScope: false,
    });
    if (!this.isCurrentExternalScopeRequest(requestId)) {
      return;
    }
    this.cfLogsPanel.updateScope(
      buildScopeLabel(payload.regionCode, payload.orgName, payload.spaceName)
    );
    this.postMessage({
      type: MSG_RESTORE_CONFIRMED_SCOPE,
      scope: {
        regionId: payload.regionId,
        orgGuid: payload.orgGuid,
        orgName: payload.orgName,
        spaceName: payload.spaceName,
      },
    });
    await this.hydrateRestoredScope({
      ...payload,
      confirmedAt: new Date().toISOString(),
    });
  }

  private clearScopeBoundRuntimeStateForScopeChange(): void {
    this.bumpRegionSelectionRequestId();
    this.currentApps = [];
    this.currentLogSessionSeed = null;
    this.serviceFolderMappings = [];
    this.serviceFolderSelections.clear();
    this.exportInProgress = false;
    this.lastLoadedScope = null;
    this.cfLogsPanel.updateApps([], null);
    this.hanaSqlWorkbench.invalidateAllAppContexts();
    this.postMessage({ type: MSG_APPS_LOADED, apps: [], scopeKey: '' });
    this.postMessage({
      type: MSG_SERVICE_FOLDER_MAPPINGS_LOADED,
      mappings: this.serviceFolderMappings,
    });
  }

  private async handleReloadAppList(): Promise<void> {
      return handleReloadAppList.call(this);
  }

  private createAppListReloadRequest(): AppListReloadRequest | null {
    const scope = this.currentConfirmedScope;
    const loadedScope = this.lastLoadedScope;
    if (scope === undefined) {
      return null;
    }
    if (loadedScope !== null && isLoadedScopeForConfirmedScope(loadedScope, scope)) {
      return {
        scope: { ...scope },
        loadedScope: { ...loadedScope },
        regionId: loadedScope.regionId,
        regionCode: loadedScope.regionCode,
        orgGuid: loadedScope.orgGuid,
        spaceSelectionRequestId: this.spaceSelectionRequestId,
      };
    }

    const selectedRegionMatches =
      areRegionCodesEquivalent(this.selectedRegionId, scope.regionCode) ||
      areRegionCodesEquivalent(this.selectedRegionCode, scope.regionCode);
    if (
      !selectedRegionMatches ||
      this.selectedRegionId.length === 0 ||
      this.selectedRegionCode.length === 0 ||
      this.selectedOrgGuid.length === 0
    ) {
      return null;
    }
    return {
      scope: { ...scope },
      loadedScope: null,
      regionId: this.selectedRegionId,
      regionCode: this.selectedRegionCode,
      orgGuid: this.selectedOrgGuid,
      spaceSelectionRequestId: this.spaceSelectionRequestId,
    };
  }

  private isCurrentAppListReloadRequest(request: AppListReloadRequest): boolean {
    const currentLoadedScope = this.lastLoadedScope;
    if (!areReloadScopesEqual(this.currentConfirmedScope, request.scope)) {
      return false;
    }

    if (request.loadedScope !== null) {
      return (
        currentLoadedScope !== null &&
        currentLoadedScope.regionId === request.loadedScope.regionId &&
        areRegionCodesEquivalent(
          currentLoadedScope.regionCode,
          request.loadedScope.regionCode
        ) &&
        currentLoadedScope.orgGuid === request.loadedScope.orgGuid &&
        currentLoadedScope.orgName === request.loadedScope.orgName &&
        currentLoadedScope.spaceName === request.loadedScope.spaceName
      );
    }

    return (
      this.spaceSelectionRequestId === request.spaceSelectionRequestId &&
      this.selectedRegionId === request.regionId &&
      areRegionCodesEquivalent(this.selectedRegionCode, request.regionCode) &&
      this.selectedOrgGuid === request.orgGuid
    );
  }

  private async applyReloadedAppListResult(
    request: AppListReloadRequest,
    result: Awaited<ReturnType<typeof refreshCfSyncSpace>>,
    credentials: { readonly email: string; readonly password: string },
    cfHomeDir: string
  ): Promise<void> {
    if (result.status !== 'refreshed') {
      this.postAppsReloadError(formatAppListReloadFailure(result));
      return;
    }
    const apps = result.apps.map((app) => ({
      id: app.id,
      name: app.name,
      runningInstances: app.runningInstances,
    }));
    this.outputChannel.appendLine(
      `[apps] Reloaded ${sanitizeForLog(request.scope.orgName)}/${sanitizeForLog(request.scope.spaceName)} via ${result.source} (${String(result.appCount)} apps)`
    );
    await this.postAppsLoaded(apps, {
      spaceName: request.scope.spaceName,
      orgGuid: request.orgGuid,
      orgName: request.scope.orgName,
    }, credentials, cfHomeDir, request.regionCode);
  }

  private async refreshTopologyForConfirmedScope(
    payload: ConfirmScopePayload
  ): Promise<void> {
    if (isTestMode()) {
      return;
    }
    const credentials = await getEffectiveCredentials(this.context);
    if (credentials === null) {
      return;
    }
    const apiEndpoint = getCfApiEndpoint(payload.regionCode);
    const result = await refreshCfSyncSpace({
      apiEndpoint,
      orgName: payload.orgName,
      spaceName: payload.spaceName,
      email: credentials.email,
      password: credentials.password,
      log: (message) => {
        this.outputChannel.appendLine(message);
      },
    });
    if (result.status === 'refreshed') {
      this.outputChannel.appendLine(
        `[topology] Refreshed ${result.regionKey}/${sanitizeForLog(payload.orgName)}/${sanitizeForLog(payload.spaceName)} via ${result.source} (${String(result.appCount)} apps)`
      );
      void this.pushCfTopology();
      const refreshedApps: SidebarAppEntry[] = result.apps.map((app) => ({
        id: app.id,
        name: app.name,
        runningInstances: app.runningInstances,
      }));
      await this.applyRefreshedAppsForConfirmedScope(payload, refreshedApps, credentials);
    } else if (result.status === 'failed') {
      const errorMessage =
        result.error instanceof Error ? result.error.message : String(result.error);
      this.outputChannel.appendLine(
        `[topology] Refresh failed for ${result.regionKey}/${sanitizeForLog(payload.orgName)}/${sanitizeForLog(payload.spaceName)}: ${sanitizeForLog(errorMessage)}`
      );
    } else {
      this.outputChannel.appendLine(
        `[topology] Refresh skipped (${result.reason}) for region=${sanitizeForLog(payload.regionCode)}`
      );
    }
  }

  /**
   * Surface the apps discovered by the confirmed-scope topology refresh.
   *
   * The shared cf-structure.json is a broad tree: it lists every region/org/space
   * but only carries the apps for spaces that have actually been app-synced.
   * Switching to a space that is in the tree yet was never app-synced makes
   * getAppsFromTopologySync return an empty list, so handleSpaceSelected renders
   * zero apps (and, since the list is empty rather than absent, never falls back to
   * a live refresh). refreshTopologyForConfirmedScope then syncs that space and
   * finds its real apps — re-post them so the dashboard reflects the freshly synced
   * list instead of the stale (empty) snapshot it first rendered. This mirrors the
   * sibling CDS Debug extension, which reloads and re-renders apps on scope change.
   *
   * Guarded against a refresh that resolves after the user has moved on: re-post
   * only while the just-refreshed scope is still the confirmed scope, and skip
   * entirely when the freshly synced list already matches what is shown (the common
   * case where the space was already populated, so no redundant re-render/remap).
   */
  private async applyRefreshedAppsForConfirmedScope(
    payload: ConfirmScopePayload,
    refreshedApps: readonly SidebarAppEntry[],
    credentials: { readonly email: string; readonly password: string }
  ): Promise<void> {
    const scope = buildSharedScopeFromConfirmPayload(payload);
    if (!areSharedScopesEqual(scope, this.currentConfirmedScope)) {
      return;
    }
    if (appListsEqual(refreshedApps, this.currentApps)) {
      return;
    }
    const cfHomeDir = await ensureCfHomeDir(this.context);
    // Resolving cfHomeDir awaits; a newer scope confirm may have landed meanwhile.
    // Re-check so we never stomp the app list of whatever scope is now active.
    if (!areSharedScopesEqual(scope, this.currentConfirmedScope)) {
      return;
    }
    this.outputChannel.appendLine(
      `[topology] Updated app list for ${sanitizeForLog(payload.orgName)}/${sanitizeForLog(payload.spaceName)} after refresh (${String(refreshedApps.length)} apps)`
    );
    await this.postAppsLoaded(
      [...refreshedApps],
      {
        spaceName: payload.spaceName,
        orgGuid: payload.orgGuid,
        orgName: payload.orgName,
      },
      credentials,
      cfHomeDir,
      payload.regionCode
    );
  }

  private async handleTopologyOrgSelected(
    payload: TopologyOrgSelectedPayload
  ): Promise<void> {
      return handleTopologyOrgSelected.call(this, payload);
  }

  private async handleQuickScopeConfirm(
    payload: QuickScopeConfirmPayload
  ): Promise<void> {
      return handleQuickScopeConfirm.call(this, payload);
  }

  private async resolveQuickScopeOrgGuid(
    region: (typeof SAP_BTP_REGIONS)[number],
    orgName: string
  ): Promise<string> {
    const cachedOrgs = await this.cacheSyncService.getCachedOrgs(region.id);
    const cachedMatch = cachedOrgs?.find((org) => org.name === orgName);
    if (cachedMatch !== undefined) {
      return cachedMatch.guid;
    }

    const regionCode = toHyphenatedRegionCode(region.id);
    if (isTestMode()) {
      const mockOrg = resolveMockOrgsForRegion(regionCode).find(
        (entry) => entry.name === orgName
      );
      return mockOrg?.guid ?? '';
    }

    const credentials = await getEffectiveCredentials(this.context);
    if (credentials === null) {
      throw new Error('No credentials found. Please re-open SAP Tools and log in.');
    }

    const session = await this.resolveQuickScopeSession(credentials, regionCode);
    const liveOrgs = await fetchOrgs(session);

    // Every fallible async step has now succeeded, so it is safe to commit the
    // shared scope/session state. Mutating earlier would corrupt provider state
    // (e.g. clearing a valid session, leaving selectedRegionCode pointing at a
    // region whose login then threw) on any failure.
    this.selectedRegionId = region.id;
    this.selectedRegionCode = regionCode;
    this.selectedOrgGuid = '';
    this.cfSession = session;
    this.cfSessionRegionCode = regionCode;

    const liveMatch = liveOrgs.find((org) => org.name === orgName);
    return liveMatch?.guid ?? '';
  }

  private async resolveQuickScopeSession(
    credentials: { readonly email: string; readonly password: string },
    regionCode: string
  ): Promise<CfSession> {
    if (
      this.cfSession !== null &&
      this.cfSessionRegionCode === regionCode &&
      !isCfSessionExpired(this.cfSession)
    ) {
      return this.cfSession;
    }

    const apiEndpoint = getCfApiEndpoint(regionCode);
    const loginInfo = await fetchCfLoginInfo(apiEndpoint);
    const token = await cfLogin(
      loginInfo.authorizationEndpoint,
      credentials.email,
      credentials.password
    );
    return { token, apiEndpoint };
  }

  private async hydrateQuickConfirmedScope(
    payload: ConfirmScopePayload
  ): Promise<void> {
    this.bumpRegionSelectionRequestId();
    this.selectedRegionId = payload.regionId;
    this.selectedRegionCode = payload.regionCode;
    this.selectedOrgGuid = payload.orgGuid;
    this.cfLogsPanel.updateScope(
      buildScopeLabel(payload.regionCode, payload.orgName, payload.spaceName)
    );
    this.postMessage({
      type: MSG_RESTORE_CONFIRMED_SCOPE,
      scope: {
        regionId: payload.regionId,
        orgGuid: payload.orgGuid,
        orgName: payload.orgName,
        spaceName: payload.spaceName,
      },
    });
    await this.handleSpaceSelected({
      spaceName: payload.spaceName,
      orgGuid: payload.orgGuid,
      orgName: payload.orgName,
    });
  }

  private async resolveOrgGuidByName(
    regionId: string,
    orgName: string,
    isCurrentRequest: () => boolean = () => true
  ): Promise<string> {
    const region = SAP_BTP_REGIONS.find((entry) => entry.id === regionId);
    if (region === undefined) {
      return '';
    }

    const regionCode = toHyphenatedRegionCode(region.id);
    this.selectedRegionId = region.id;
    this.selectedRegionCode = regionCode;
    this.selectedOrgGuid = '';

    const cachedOrTestGuid = await this.resolveCachedOrTestOrgGuid(
      regionId,
      regionCode,
      orgName,
      isCurrentRequest
    );
    if (cachedOrTestGuid !== null) {
      return cachedOrTestGuid;
    }

    return this.resolveLiveOrgGuid(regionCode, orgName, isCurrentRequest);
  }

  private async resolveCachedOrTestOrgGuid(
    regionId: string,
    regionCode: string,
    orgName: string,
    isCurrentRequest: () => boolean
  ): Promise<string | null> {
    const cachedOrgs = await this.cacheSyncService.getCachedOrgs(regionId);
    if (!isCurrentRequest()) {
      return '';
    }
    const cachedMatch = cachedOrgs?.find((org) => org.name === orgName);
    if (cachedMatch !== undefined) {
      return cachedMatch.guid;
    }
    if (isTestMode()) {
      const mockOrg = resolveMockOrgsForRegion(regionCode).find(
        (entry) => entry.name === orgName
      );
      return mockOrg?.guid ?? '';
    }

    return null;
  }

  private async resolveLiveOrgGuid(
    regionCode: string,
    orgName: string,
    isCurrentRequest: () => boolean
  ): Promise<string> {
    if (
      this.cfSessionRegionCode !== regionCode ||
      (this.cfSession !== null && isCfSessionExpired(this.cfSession))
    ) {
      this.cfSession = null;
      this.cfSessionRegionCode = '';
    }
    if (this.cfSession === null) {
      const credentials = await getEffectiveCredentials(this.context);
      if (!isCurrentRequest()) {
        return '';
      }
      if (credentials === null) {
        return '';
      }
      const establishedSession = await this.establishCurrentScopeResolutionSession(
        credentials,
        regionCode,
        isCurrentRequest
      );
      if (establishedSession === null) {
        return '';
      }
    }
    const session = this.cfSession;
    if (session === null) {
      return '';
    }
    try {
      const liveOrgs = await fetchOrgs(session);
      if (!isCurrentRequest()) {
        return '';
      }
      const liveMatch = liveOrgs.find((org) => org.name === orgName);
      return liveMatch?.guid ?? '';
    } catch {
      return '';
    }
  }

  private async establishCurrentScopeResolutionSession(
    credentials: { readonly email: string; readonly password: string },
    regionCode: string,
    isCurrentRequest: () => boolean
  ): Promise<CfSession | null> {
    if (
      this.cfSession !== null &&
      this.cfSessionRegionCode.length > 0 &&
      this.cfSessionRegionCode === regionCode &&
      !isCfSessionExpired(this.cfSession)
    ) {
      return this.cfSession;
    }

    const apiEndpoint = getCfApiEndpoint(regionCode);
    const loginInfo = await fetchCfLoginInfo(apiEndpoint);
    const token = await cfLogin(
      loginInfo.authorizationEndpoint,
      credentials.email,
      credentials.password
    );
    if (!isCurrentRequest() || this.selectedRegionCode !== regionCode) {
      return null;
    }
    this.cfSession = { token, apiEndpoint };
    this.cfSessionRegionCode = regionCode;
    return this.cfSession;
  }

  private async preloadRootFolderForPersistedScope(): Promise<void> {
    const credentials = await getEffectiveCredentials(this.context);
    if (credentials === null) {
      return;
    }

    const persistedScope = this.readPersistedConfirmedScopeForEmail(credentials.email);
    if (persistedScope === null) {
      return;
    }

    const cachedEntry = await this.cacheStore.getExportRootFolder(
      credentials.email,
      persistedScope.regionCode,
      persistedScope.orgGuid,
      persistedScope.spaceName
    );
    if (cachedEntry === null) {
      return;
    }

    const folderExists = await pathExists(cachedEntry.rootFolderPath);
    if (!folderExists) {
      await this.cacheStore.deleteExportRootFolder(
        credentials.email,
        persistedScope.regionCode,
        persistedScope.orgGuid,
        persistedScope.spaceName
      );
      return;
    }

    this.selectedLocalRootFolderPath = cachedEntry.rootFolderPath;
    this.preloadServiceFolderMappingsForPersistedScope(
      credentials.email,
      persistedScope,
      cachedEntry.rootFolderPath
    );
  }

  private preloadServiceFolderMappingsForPersistedScope(
    email: string,
    persistedScope: PersistedConfirmedScopeEntry,
    rootFolderPath: string
  ): void {
    const scopeKey = buildServiceMappingsScopeKey(
      email,
      persistedScope.regionCode,
      persistedScope.orgGuid,
      persistedScope.spaceName,
      rootFolderPath
    );
    if (scopeKey.length === 0) {
      return;
    }

    const cachedEntry = this.readServiceMappingCacheByScope()[scopeKey];
    if (cachedEntry === undefined || cachedEntry.mappings.length === 0) {
      return;
    }

    this.serviceFolderSelections.clear();
    for (const mapping of cachedEntry.mappings) {
      if (
        mapping.hasConflict &&
        mapping.folderPath.length > 0 &&
        mapping.candidateFolderPaths.includes(mapping.folderPath)
      ) {
        this.serviceFolderSelections.set(mapping.appId, mapping.folderPath);
      }
    }
    this.serviceFolderMappings = this.applyServiceFolderSelections(cachedEntry.mappings);
  }

  private async restoreConfirmedScopeForCurrentUser(): Promise<void> {
    const credentials = await getEffectiveCredentials(this.context);
    if (credentials === null) {
      return;
    }

    const persistedScope = this.readPersistedConfirmedScopeForEmail(credentials.email);
    if (persistedScope === null) {
      return;
    }

    const hasKnownRegion = SAP_BTP_REGIONS.some((region) => {
      return region.id === persistedScope.regionId;
    });
    if (!hasKnownRegion) {
      return;
    }

    this.currentConfirmedScope = {
      regionCode: persistedScope.regionId,
      orgName: persistedScope.orgName,
      spaceName: persistedScope.spaceName,
    };
    this.cfLogsPanel.updateScope(
      buildScopeLabel(
        persistedScope.regionCode,
        persistedScope.orgName,
        persistedScope.spaceName
      )
    );
    this.postMessage({
      type: MSG_RESTORE_CONFIRMED_SCOPE,
      scope: {
        regionId: persistedScope.regionId,
        orgGuid: persistedScope.orgGuid,
        orgName: persistedScope.orgName,
        spaceName: persistedScope.spaceName,
      },
    });

    try {
      void this.hydrateRestoredScope(persistedScope).catch((error: unknown) => {
        const errorMessage =
          error instanceof Error ? error.message : 'Failed to hydrate restored scope.';
        this.outputChannel.appendLine(
          `[scope] Restored scope hydration failed: ${sanitizeForLog(errorMessage)}`
        );
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to restore confirmed scope.';
      this.outputChannel.appendLine(
        `[scope] Restore confirmed scope failed: ${sanitizeForLog(errorMessage)}`
      );
    }
  }

  private async hydrateRestoredScope(
    persistedScope: PersistedConfirmedScopeEntry
  ): Promise<void> {
    await this.handleRegionSelected({
      id: persistedScope.regionId,
      name: persistedScope.regionName,
      code: persistedScope.regionCode,
      area: persistedScope.regionArea,
    });
    if (this.selectedRegionId !== persistedScope.regionId) {
      return;
    }

    await this.handleOrgSelected({
      guid: persistedScope.orgGuid,
      name: persistedScope.orgName,
    });
    if (this.selectedOrgGuid !== persistedScope.orgGuid) {
      return;
    }

    await this.handleSpaceSelected({
      spaceName: persistedScope.spaceName,
      orgGuid: persistedScope.orgGuid,
      orgName: persistedScope.orgName,
    });

    if (
      this.selectedRegionId === persistedScope.regionId &&
      this.selectedOrgGuid === persistedScope.orgGuid &&
      this.selectedLocalRootFolderPath.length > 0 &&
      this.currentApps.length > 0
    ) {
      await this.refreshServiceFolderMappings();
    }
  }

  private async persistConfirmedScopeForCurrentUser(
    payload: ConfirmScopePayload
  ): Promise<void> {
    const credentials = await getEffectiveCredentials(this.context);
    if (credentials === null) {
      return;
    }

    const emailKey = normalizeUserEmail(credentials.email);
    if (emailKey.length === 0) {
      return;
    }

    const normalizedScope: PersistedConfirmedScopeEntry = {
      regionId: payload.regionId.trim(),
      regionCode: payload.regionCode.trim().toLowerCase(),
      regionName: payload.regionName.trim(),
      regionArea: payload.regionArea.trim(),
      orgGuid: payload.orgGuid.trim(),
      orgName: payload.orgName.trim(),
      spaceName: payload.spaceName.trim(),
      confirmedAt: new Date().toISOString(),
    };

    if (
      normalizedScope.regionId.length === 0 ||
      normalizedScope.regionCode.length === 0 ||
      normalizedScope.regionName.length === 0 ||
      normalizedScope.regionArea.length === 0 ||
      normalizedScope.orgGuid.length === 0 ||
      normalizedScope.orgName.length === 0 ||
      normalizedScope.spaceName.length === 0
    ) {
      return;
    }

    const currentByEmail = this.readConfirmedScopeMap();
    currentByEmail[emailKey] = normalizedScope;
    await this.context.globalState.update(
      CONFIRMED_SCOPE_BY_EMAIL_GLOBAL_STATE_KEY,
      currentByEmail
    );
  }

  private readPersistedConfirmedScopeForEmail(email: string): PersistedConfirmedScopeEntry | null {
    const emailKey = normalizeUserEmail(email);
    if (emailKey.length === 0) {
      return null;
    }

    const confirmedScopeByEmail = this.readConfirmedScopeMap();
    const entry = confirmedScopeByEmail[emailKey];
    return entry ?? null;
  }

  private readConfirmedScopeMap(): Record<string, PersistedConfirmedScopeEntry> {
    const rawValue = this.context.globalState.get<unknown>(
      CONFIRMED_SCOPE_BY_EMAIL_GLOBAL_STATE_KEY
    );
    if (!isRecord(rawValue)) {
      return {};
    }

    const normalizedEntries: Record<string, PersistedConfirmedScopeEntry> = {};
    for (const [emailKeyRaw, scopeRaw] of Object.entries(rawValue)) {
      const normalizedEmailKey = normalizeUserEmail(emailKeyRaw);
      if (normalizedEmailKey.length === 0 || !isRecord(scopeRaw)) {
        continue;
      }

      const regionId = readOptionalString(scopeRaw['regionId'], 64);
      const regionCode = readOptionalString(scopeRaw['regionCode'], 32).toLowerCase();
      const regionName = readOptionalString(scopeRaw['regionName'], 96);
      const regionArea = readOptionalString(scopeRaw['regionArea'], 96);
      const orgGuid = readOptionalString(scopeRaw['orgGuid'], 128);
      const orgName = readOptionalString(scopeRaw['orgName'], 128);
      const spaceName = readOptionalString(scopeRaw['spaceName'], 128);
      const confirmedAt = readOptionalString(scopeRaw['confirmedAt'], 64);

      if (
        regionId.length === 0 ||
        regionCode.length === 0 ||
        regionName.length === 0 ||
        regionArea.length === 0 ||
        orgGuid.length === 0 ||
        orgName.length === 0 ||
        spaceName.length === 0 ||
        confirmedAt.length === 0
      ) {
        continue;
      }

      normalizedEntries[normalizedEmailKey] = {
        regionId,
        regionCode,
        regionName,
        regionArea,
        orgGuid,
        orgName,
        spaceName,
        confirmedAt,
      };
    }

    return normalizedEntries;
  }

  private async handleSelectLocalRootFolder(): Promise<void> {
      return handleSelectLocalRootFolder.call(this);
  }

  private resolveE2eRootDialogOverride(): {
    readonly handled: boolean;
    readonly uri: vscode.Uri | undefined;
  } {
    if (process.env['SAP_TOOLS_E2E'] !== '1') {
      return { handled: false, uri: undefined };
    }

    const rawSteps = process.env['SAP_TOOLS_E2E_ROOT_DIALOG_STEPS'] ?? '';
    const steps = rawSteps
      .split(',')
      .map((step) => step.trim().toLowerCase())
      .filter((step) => step.length > 0);
    const step = steps[this.e2eRootDialogStepIndex];
    if (step === undefined) {
      return { handled: false, uri: undefined };
    }

    this.e2eRootDialogStepIndex += 1;
    if (step === 'cancel') {
      return { handled: true, uri: undefined };
    }

    if (step === 'select') {
      const rawPathByStep = process.env['SAP_TOOLS_E2E_ROOT_FOLDER_PATHS'] ?? '';
      const pathByStep =
        rawPathByStep.trim().length === 0
          ? []
          : rawPathByStep.split('::').map((pathValue) => pathValue.trim());
      const indexedPath = pathByStep[this.e2eRootDialogStepIndex - 1] ?? '';
      const fallbackPath = process.env['SAP_TOOLS_E2E_ROOT_FOLDER_PATH']?.trim() ?? '';
      const rawPath = indexedPath.length > 0 ? indexedPath : fallbackPath;
      if (rawPath.length === 0) {
        return { handled: true, uri: undefined };
      }

      return { handled: true, uri: vscode.Uri.file(rawPath) };
    }

    return { handled: false, uri: undefined };
  }

  private async handleRefreshServiceFolderMappings(
    payload: RefreshServiceFolderMappingsPayload
  ): Promise<void> {
      return handleRefreshServiceFolderMappings.call(this, payload);
  }

  private handleSelectServiceFolderMapping(
    payload: SelectServiceFolderMappingPayload
  ): void {
    const mapping = this.serviceFolderMappings.find((entry) => {
      return entry.appId === payload.appId;
    });
    if (mapping?.hasConflict !== true) {
      return;
    }

    const normalizedFolderPath = payload.folderPath.trim();
    if (normalizedFolderPath.length === 0) {
      this.serviceFolderSelections.delete(payload.appId);
    } else {
      const allowedPaths = new Set(mapping.candidateFolderPaths);
      if (!allowedPaths.has(normalizedFolderPath)) {
        return;
      }
      this.serviceFolderSelections.set(payload.appId, normalizedFolderPath);
    }

    this.serviceFolderMappings = this.applyServiceFolderSelections(this.serviceFolderMappings);
    this.postMessage({
      type: MSG_SERVICE_FOLDER_MAPPINGS_LOADED,
      mappings: this.serviceFolderMappings,
    });
    void this.persistServiceFolderMappingsForCurrentScope(this.serviceFolderMappings);
  }

  private async refreshServiceFolderMappings(
    requestedAppNames: readonly string[] = []
  ): Promise<void> {
    // Scan for local npm packages independently of the CF-app service mapping below.
    void this.postDetectedLocalPackages();

    if (this.selectedLocalRootFolderPath.length === 0) {
      this.postMessage({
        type: MSG_SERVICE_FOLDER_MAPPINGS_ERROR,
        message: 'Select a local root folder before scanning service mappings.',
      });
      return;
    }

    const appNames =
      this.currentApps.length > 0
        ? this.currentApps.map((app) => app.name)
        : requestedAppNames;

    if (appNames.length === 0) {
      this.serviceFolderMappings = [];
      this.postMessage({
        type: MSG_SERVICE_FOLDER_MAPPINGS_LOADED,
        mappings: this.serviceFolderMappings,
      });
      return;
    }

    try {
      const mappings = await buildServiceFolderMappings(
        this.selectedLocalRootFolderPath,
        appNames,
        readSharedAppFolderMappings()
      );
      this.serviceFolderMappings = this.applyServiceFolderSelections(mappings);
      await this.persistServiceFolderMappingsForCurrentScope(this.serviceFolderMappings);
      this.postMessage({
        type: MSG_SERVICE_FOLDER_MAPPINGS_LOADED,
        mappings: this.serviceFolderMappings,
      });
    } catch (error) {
      this.serviceFolderMappings = [];
      this.serviceFolderSelections.clear();
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Failed to scan local folders for service mapping.';
      this.postMessage({
        type: MSG_SERVICE_FOLDER_MAPPINGS_ERROR,
        message: errorMessage,
      });
    }
  }

  private async restoreRootFolderForLoadedSpace(
    payload: SpaceSelectionPayload
  ): Promise<void> {
    try {
      await this.restoreRootFolderForLoadedSpaceUnsafe(payload);
    } catch (error) {
      if (!this.isLoadedScope(payload.orgGuid, payload.spaceName)) {
        return;
      }
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to restore root folder.';
      this.outputChannel.appendLine(
        `[cache] Failed to restore root folder for space ${sanitizeForLog(payload.spaceName)}: ${sanitizeErrorForLog(errorMessage)}`
      );
      this.clearRootFolderSelection();
    }
  }

  private async restoreRootFolderForLoadedSpaceUnsafe(
    payload: SpaceSelectionPayload
  ): Promise<void> {
    const cacheScope = await this.resolveRootFolderScopeForLoadedSpace(payload);
    if (!this.isLoadedScope(payload.orgGuid, payload.spaceName)) {
      return;
    }

    if (cacheScope === null) {
      this.clearRootFolderSelection();
      return;
    }

    const cachedEntry = await this.cacheStore.getExportRootFolder(
      cacheScope.email,
      cacheScope.regionCode,
      cacheScope.orgGuid,
      cacheScope.spaceName
    );
    if (!this.isLoadedScope(payload.orgGuid, payload.spaceName)) {
      return;
    }

    if (cachedEntry === null) {
      this.clearRootFolderSelection();
      return;
    }

    const folderExists = await pathExists(cachedEntry.rootFolderPath);
    if (!this.isLoadedScope(payload.orgGuid, payload.spaceName)) {
      return;
    }

    if (!folderExists) {
      await this.deleteMissingRootFolderCache(cacheScope);
      if (!this.isLoadedScope(payload.orgGuid, payload.spaceName)) {
        return;
      }

      this.clearRootFolderSelection();
      return;
    }

    this.selectedLocalRootFolderPath = cachedEntry.rootFolderPath;
    this.postMessage({
      type: MSG_LOCAL_ROOT_FOLDER_UPDATED,
      path: this.selectedLocalRootFolderPath,
    });
  }

  private async deleteMissingRootFolderCache(
    cacheScope: RootFolderCacheScope
  ): Promise<void> {
    await this.cacheStore.deleteExportRootFolder(
      cacheScope.email,
      cacheScope.regionCode,
      cacheScope.orgGuid,
      cacheScope.spaceName
    );
    this.outputChannel.appendLine(
      `[cache] Removed missing root folder cache for space ${sanitizeForLog(cacheScope.spaceName)}`
    );
  }

  private async persistRootFolderForCurrentScope(rootFolderPath: string): Promise<void> {
    const normalizedRootFolderPath = rootFolderPath.trim();
    if (normalizedRootFolderPath.length === 0) {
      return;
    }

    const cacheScope = await this.resolveCurrentRootFolderScope();
    if (cacheScope === null) {
      return;
    }

    try {
      await this.cacheStore.setExportRootFolder(
        cacheScope.email,
        cacheScope.regionCode,
        cacheScope.orgGuid,
        cacheScope.spaceName,
        normalizedRootFolderPath
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unable to persist root folder cache.';
      this.outputChannel.appendLine(
        `[cache] Failed to persist root folder cache: ${sanitizeForLog(errorMessage)}`
      );
    }
  }

  private async resolveCurrentRootFolderScope(): Promise<RootFolderCacheScope | null> {
    const loadedScope = this.lastLoadedScope;
    if (loadedScope === null) {
      return null;
    }

    return this.resolveRootFolderScopeForLoadedSpace({
      spaceName: loadedScope.spaceName,
      orgGuid: loadedScope.orgGuid,
      orgName: '',
    });
  }

  private async resolveRootFolderScopeForLoadedSpace(
    payload: SpaceSelectionPayload
  ): Promise<RootFolderCacheScope | null> {
    const regionCode = this.selectedRegionCode.trim();
    const orgGuid = payload.orgGuid.trim();
    const spaceName = payload.spaceName.trim();
    if (regionCode.length === 0 || orgGuid.length === 0 || spaceName.length === 0) {
      return null;
    }

    const credentials = await getEffectiveCredentials(this.context);
    if (credentials === null) {
      return null;
    }
    return {
      email: credentials.email,
      regionCode,
      orgGuid,
      spaceName,
    };
  }

  private isLoadedScope(orgGuid: string, spaceName: string): boolean {
    return (
      this.lastLoadedScope?.orgGuid === orgGuid &&
      this.lastLoadedScope.spaceName === spaceName
    );
  }

  private clearRootFolderSelection(): void {
    if (this.selectedLocalRootFolderPath.length === 0) {
      return;
    }

    this.selectedLocalRootFolderPath = '';
    this.serviceFolderSelections.clear();
    this.postMessage({
      type: MSG_LOCAL_ROOT_FOLDER_UPDATED,
      path: '',
    });
  }

  private applyServiceFolderSelections(
    baseMappings: readonly ServiceFolderMapping[]
  ): ServiceFolderMapping[] {
    return baseMappings.map((mapping) => {
      if (!mapping.hasConflict) {
        return { ...mapping };
      }

      const selectedFolderPath = this.serviceFolderSelections.get(mapping.appId) ?? '';
      const allowedPaths = new Set(mapping.candidateFolderPaths);
      if (selectedFolderPath.length === 0 || !allowedPaths.has(selectedFolderPath)) {
        this.serviceFolderSelections.delete(mapping.appId);
        return {
          ...mapping,
          folderPath: '',
        };
      }

      return {
        ...mapping,
        folderPath: selectedFolderPath,
      };
    });
  }

  private async restoreServiceFolderMappingsForCurrentScope(): Promise<boolean> {
    if (this.currentApps.length === 0) {
      return false;
    }

    const cacheScope = await this.resolveCurrentServiceMappingCacheScope();
    if (cacheScope === null) {
      return false;
    }

    const mappingCacheByScope = this.readServiceMappingCacheByScope();
    const cachedEntry = mappingCacheByScope[cacheScope.scopeKey];
    if (cachedEntry === undefined || cachedEntry.mappings.length === 0) {
      return false;
    }

    const cachedMappingById = new Map(
      cachedEntry.mappings.map((mapping) => [mapping.appId, mapping])
    );
    const cachedMappingByName = new Map(
      cachedEntry.mappings.map((mapping) => [mapping.appName, mapping])
    );

    const restoredMappings = this.currentApps.map((app) => {
      const cachedMapping = cachedMappingById.get(app.id) ?? cachedMappingByName.get(app.name);
      if (cachedMapping === undefined) {
        return {
          appId: app.id,
          appName: app.name,
          folderPath: '',
          matchType: 'none',
          candidateFolderPaths: [],
          hasConflict: false,
        } satisfies ServiceFolderMapping;
      }

      return {
        ...cachedMapping,
        appId: app.id,
        appName: app.name,
      } satisfies ServiceFolderMapping;
    });

    this.serviceFolderSelections.clear();
    for (const mapping of restoredMappings) {
      if (
        mapping.hasConflict &&
        mapping.folderPath.length > 0 &&
        mapping.candidateFolderPaths.includes(mapping.folderPath)
      ) {
        this.serviceFolderSelections.set(mapping.appId, mapping.folderPath);
      }
    }

    this.serviceFolderMappings = this.applyServiceFolderSelections(restoredMappings);
    this.postMessage({
      type: MSG_SERVICE_FOLDER_MAPPINGS_LOADED,
      mappings: this.serviceFolderMappings,
    });
    return true;
  }

  private async persistServiceFolderMappingsForCurrentScope(
    mappings: readonly ServiceFolderMapping[]
  ): Promise<void> {
    if (mappings.length === 0) {
      return;
    }

    const cacheScope = await this.resolveCurrentServiceMappingCacheScope();
    if (cacheScope === null) {
      return;
    }

    const normalizedMappings = mappings
      .map((mapping) => normalizeServiceMappingForPersistence(mapping))
      .filter((mapping): mapping is ServiceFolderMapping => mapping !== null);
    if (normalizedMappings.length === 0) {
      return;
    }

    const mappingCacheByScope = this.readServiceMappingCacheByScope();
    mappingCacheByScope[cacheScope.scopeKey] = {
      rootFolderPath: cacheScope.rootFolderPath,
      mappings: normalizedMappings,
      updatedAt: new Date().toISOString(),
    };

    try {
      await this.context.globalState.update(
        SERVICE_MAPPINGS_BY_SCOPE_GLOBAL_STATE_KEY,
        mappingCacheByScope
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unable to persist service mapping cache.';
      this.outputChannel.appendLine(
        `[cache] Failed to persist service mapping cache: ${sanitizeForLog(errorMessage)}`
      );
    }
  }

  private async resolveCurrentServiceMappingCacheScope(): Promise<{
    readonly scopeKey: string;
    readonly rootFolderPath: string;
  } | null> {
    const loadedScope = this.lastLoadedScope;
    const regionCode = this.selectedRegionCode.trim();
    const rootFolderPath = this.selectedLocalRootFolderPath.trim();
    if (
      loadedScope === null ||
      regionCode.length === 0 ||
      rootFolderPath.length === 0
    ) {
      return null;
    }

    const spaceName = loadedScope.spaceName.trim();
    const orgGuid = loadedScope.orgGuid.trim();
    if (spaceName.length === 0 || orgGuid.length === 0) {
      return null;
    }

    const credentials = await getEffectiveCredentials(this.context);
    if (credentials === null) {
      return null;
    }

    const scopeKey = buildServiceMappingsScopeKey(
      credentials.email,
      regionCode,
      orgGuid,
      spaceName,
      rootFolderPath
    );
    if (scopeKey.length === 0) {
      return null;
    }

    return {
      scopeKey,
      rootFolderPath,
    };
  }

  private readServiceMappingCacheByScope(): Record<string, PersistedServiceMappingScopeEntry> {
    const rawValue = this.context.globalState.get<unknown>(
      SERVICE_MAPPINGS_BY_SCOPE_GLOBAL_STATE_KEY
    );
    return normalizePersistedServiceMappingsByScope(rawValue);
  }

  private async handleExportServiceArtifacts(
    payload: ExportServiceArtifactsPayload,
    options: {
      readonly includeDefaultEnv: boolean;
      readonly includePnpmLock: boolean;
    }
  ): Promise<void> {
      return handleExportServiceArtifacts.call(this, payload, options);
  }

  // ── Local package build + publish (Verdaccio) ────────────────────────────

  private async handleBuildPublishAll(targetPackageName?: string): Promise<void> {
      return handleBuildPublishAll.call(this, targetPackageName);
  }

  private async handleReplaceServicePackagePlaceholder(appId: string): Promise<void> {
      return handleReplaceServicePackagePlaceholder.call(this, appId);
  }

  private async resolveLocalPackageNamesForReplacement(
    config: LocalPackagesConfig
  ): Promise<string[]> {
    const rootFolderPath = this.selectedLocalRootFolderPath.trim();
    const patterns = config.namePatterns.trim();
    if (rootFolderPath.length === 0 || patterns.length === 0) {
      return [];
    }

    const packages = await scanLocalPackages(rootFolderPath, patterns);
    return packages.map((pkg) => pkg.name);
  }

  async startLocalRegistry(): Promise<void> {
    const config = readLocalPackagesConfig(this.currentConfirmedScope);
    this.npmBuildChannel.show(true);
    try {
      await this.verdaccioManager.start({
        port: config.registry.port,
        scopes: config.registry.scopes,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start local registry.';
      this.npmBuildChannel.appendLine(`ERROR: ${message}`);
      void vscode.window.showErrorMessage(`SAP Tools: ${message}`);
    } finally {
      await this.postRegistryState();
    }
  }

  stopLocalRegistry(): void {
    this.verdaccioManager.stop();
    void this.postRegistryState();
  }

  private async postRegistryState(): Promise<void> {
    const status = await this.verdaccioManager.status();
    this.postMessage({ type: MSG_LOCAL_REGISTRY_STATE, ...status });
  }

  /**
   * Scans the selected root folder for locally-developed npm packages (by the
   * configured name regex), computes their build order, and pushes the list to the
   * webview as a separate "Detected packages" list, independent of the CF-app service
   * mapping list.
   */
  private async postDetectedLocalPackages(): Promise<void> {
    const rootFolderPath = this.selectedLocalRootFolderPath.trim();
    const patterns = readLocalPackagesConfig(this.currentConfirmedScope).namePatterns.trim();

    if (rootFolderPath.length === 0 || patterns.length === 0) {
      this.postMessage({ type: MSG_LOCAL_PACKAGES_LOADING, loading: false });
      this.postMessage({
        type: MSG_LOCAL_PACKAGES_LOADED,
        configured: patterns.length > 0,
        patterns,
        packages: [],
      });
      return;
    }

    this.postMessage({ type: MSG_LOCAL_PACKAGES_LOADING, loading: true });

    const cacheKey = buildLocalPackagesCacheKey(rootFolderPath, patterns);
    const cached = await this.cacheStore.getLocalPackages(cacheKey);
    if (cached !== null) {
      // Serve stale-while-revalidate: show cached data instantly, then rescan.
      this.postMessage({ type: MSG_LOCAL_PACKAGES_LOADING, loading: false });
      this.postMessage({
        type: MSG_LOCAL_PACKAGES_LOADED,
        configured: true,
        patterns,
        packages: cached.packages,
      });
    }

    try {
      const scanned = await this.scanAndOrderLocalPackages(rootFolderPath, patterns);
      const isSameAsCached = cached !== null && areLocalPackageListsEqual(scanned, cached.packages);
      if (!isSameAsCached) {
        this.postMessage({ type: MSG_LOCAL_PACKAGES_LOADING, loading: false });
        this.postMessage({
          type: MSG_LOCAL_PACKAGES_LOADED,
          configured: true,
          patterns,
          packages: scanned,
        });
      }
      await this.cacheStore.setLocalPackages(cacheKey, scanned);
    } catch (error) {
      this.postMessage({ type: MSG_LOCAL_PACKAGES_LOADING, loading: false });
      this.postMessage({
        type: MSG_LOCAL_PACKAGES_LOADED,
        configured: true,
        patterns,
        packages: [],
        error: error instanceof Error ? error.message : 'Failed to scan local packages.',
      });
    }
  }

  private async scanAndOrderLocalPackages(
    rootFolderPath: string,
    patterns: string
  ): Promise<{ name: string; version: string; hasBuildScript: boolean; round: number | null }[]> {
    const packages = await scanLocalPackages(rootFolderPath, patterns);
    const roundByName = new Map<string, number>();
    try {
      const order = buildDependencyOrder(
        packages.map((pkg) => ({ name: pkg.name, deps: pkg.dependencyNames }))
      );
      order.rounds.forEach((round, index) => {
        for (const name of round) {
          roundByName.set(name, index);
        }
      });
    } catch {
      // Dependency cycle — leave rounds unset; the list still shows the packages.
    }
    return packages.map((pkg) => ({
      name: pkg.name,
      version: pkg.version,
      hasBuildScript: pkg.buildScript !== undefined,
      round: roundByName.get(pkg.name) ?? null,
    }));
  }

  private postBuildResult(success: boolean, message: string): void {
    this.postMessage({ type: MSG_BUILD_PUBLISH_RESULT, success, message });
  }

  private async handleMicrosoftGraphToolRun(
    request: MicrosoftGraphToolRunRequest
  ): Promise<void> {
      return handleMicrosoftGraphToolRun.call(this, request);
  }

  private appendMicrosoftGraphToolProgress(
    progress: MicrosoftGraphToolStepProgress
  ): void {
    this.appendMicrosoftGraphToolLog(
      progress.toolId,
      progress.stepId,
      progress.status,
      progress.message
    );
  }

  private appendMicrosoftGraphToolLog(
    toolId: string,
    stepId: string,
    status: string,
    message: string
  ): void {
    this.microsoftGraphChannel.appendLine(
      `[${new Date().toISOString()}] ${toolId} ${stepId} ${status}: ` +
        sanitizeGraphMessage(message)
    );
  }

  private async handleExportSqlToolsConfig(
    payload: ExportSqlToolsConfigPayload
  ): Promise<void> {
      return handleExportSqlToolsConfig.call(this, payload);
  }

  private resolveServiceFolderMapping(
    payload: {
      readonly appId: string;
      readonly appName: string;
    }
  ): ServiceFolderMapping | null {
    const mappingById = this.serviceFolderMappings.find((mapping) => {
      return mapping.appId === payload.appId;
    });
    if (mappingById !== undefined) {
      return mappingById;
    }

    const mappingByName = this.serviceFolderMappings.find((mapping) => {
      return mapping.appName === payload.appName;
    });
    return mappingByName ?? null;
  }

  private async confirmSensitiveExport(options: {
    readonly appName: string;
    readonly exportType: 'artifacts' | 'sqltools';
  }): Promise<boolean> {
    if (shouldSkipSensitiveExportConfirmation()) {
      return true;
    }

    const message =
      options.exportType === 'sqltools'
        ? `Export SQLTools config for "${options.appName}"? This can write database credentials to .vscode/settings.json.`
        : `Export artifacts for "${options.appName}"? default-env.json may contain secrets.`;

    const detail =
      options.exportType === 'sqltools'
        ? 'Do not commit generated credentials to source control.'
        : 'Do not commit generated artifact files to source control.';

    const selectedAction = await vscode.window.showWarningMessage(
      message,
      {
        modal: true,
        detail,
      },
      'Export'
    );
    return selectedAction === 'Export';
  }

  // ── SQLTools integration ─────────────────────────────────────────────────

  private async handleOpenHanaSqlFile(payload: OpenHanaSqlFilePayload): Promise<void> {
      return handleOpenHanaSqlFile.call(this, payload);
  }

  private async handleOpenSqlBackupHistory(): Promise<void> {
      return handleOpenSqlBackupHistory.call(this);
  }

  private async publishHanaTablesForApp(
    appId: string,
    appName: string,
    session: CfLogSessionSeed | null,
    forceRefresh = false
  ): Promise<void> {
    this.outputChannel.appendLine(
      `[sql-ui] ${forceRefresh ? 'refresh' : 'load'} tables requested app=${sanitizeSqlUiLogValue(appName)}`
    );
    try {
      const tables = forceRefresh
        ? await this.hanaSqlWorkbench.refreshTableEntriesForApp({
            appId,
            appName,
            session,
          })
        : await this.hanaSqlWorkbench.loadTableEntriesForApp({
            appId,
            appName,
            session,
          });
      this.outputChannel.appendLine(
        `[sql-ui] ${forceRefresh ? 'refresh' : 'load'} tables succeeded app=${sanitizeSqlUiLogValue(appName)} count=${String(tables.length)}`
      );
      this.postMessage({
        type: MSG_HANA_TABLES_LOADED,
        serviceId: appId,
        success: true,
        tunnelActive: this.hanaSqlWorkbench.isAppTunneled(appId),
        tables: tables.map((table) => ({
          displayName: table.displayName,
          name: table.name,
        })),
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to load tables for app.';
      this.outputChannel.appendLine(
        `[sql-ui] ${forceRefresh ? 'refresh' : 'load'} tables failed app=${sanitizeSqlUiLogValue(appName)} message=${sanitizeSqlUiLogValue(message)}`
      );
      this.postMessage({
        type: MSG_HANA_TABLES_LOADED,
        serviceId: appId,
        success: false,
        tables: [],
        message,
      });
    }
  }

  private async handleRefreshHanaTables(
    payload: RefreshHanaTablesPayload
  ): Promise<void> {
      return handleRefreshHanaTables.call(this, payload);
  }

  private async handleRunHanaTableSelect(payload: RunHanaTableSelectPayload): Promise<void> {
      return handleRunHanaTableSelect.call(this, payload);
  }

  private postHanaSqlFileOpenResult(
    requestId: number,
    serviceId: string,
    success: boolean,
    message: string
  ): void {
    this.postMessage({
      type: MSG_HANA_SQL_FILE_OPEN_RESULT,
      requestId,
      serviceId,
      success,
      message,
    });
  }

  private postHanaTableSelectResult(
    serviceId: string,
    tableName: string,
    success: boolean,
    message: string
  ): void {
    this.postMessage({
      type: MSG_HANA_TABLE_SELECT_RESULT,
      serviceId,
      tableName,
      success,
      message,
    });
  }

  private async handleOpenSqlToolsExtension(): Promise<void> {
      return handleOpenSqlToolsExtension.call(this);
  }

  // ── Login / logout ───────────────────────────────────────────────────────

  private async handleLoginSubmit(email: string, password: string): Promise<void> {
      return handleLoginSubmit.call(this, email, password);
  }

  private async handleLogout(): Promise<void> {
      return handleLogout.call(this);
  }

  private reloadToMainView(): void {
    if (this.webviewView === undefined) {
      return;
    }

    const assetsRoot = vscode.Uri.joinPath(
      this.extensionUri,
      'docs',
      'designs',
      'prototypes',
      'assets'
    );
    const nonce = createNonce();
    this.webviewView.webview.html = buildMainHtml(
      this.webviewView.webview,
      nonce,
      assetsRoot
    );
  }

  private reloadToLoginView(): void {
    if (this.webviewView === undefined) {
      return;
    }

    const assetsRoot = vscode.Uri.joinPath(
      this.extensionUri,
      'docs',
      'designs',
      'prototypes',
      'assets'
    );
    const nonce = createNonce();
    this.webviewView.webview.html = buildLoginGateHtml(
      this.webviewView.webview,
      nonce,
      assetsRoot
    );
  }

  // ── Region selected → fetch orgs ─────────────────────────────────────────

  private async handleRegionSelected(region: RegionSelectionPayload): Promise<void> {
      return handleRegionSelected.call(this, region);
  }

  // ── Org selected → fetch spaces ──────────────────────────────────────────

  private async handleOrgSelected(org: OrgSelectionPayload): Promise<void> {
      return handleOrgSelected.call(this, org);
  }

  // ── Space selected → fetch apps ───────────────────────────────────────────

  private async handleSpaceSelected(payload: SpaceSelectionPayload): Promise<void> {
      return handleSpaceSelected.call(this, payload);
  }

  private async handleTestModeSpaceSelection(payload: SpaceSelectionPayload): Promise<void> {
      return handleTestModeSpaceSelection.call(this, payload);
  }

  // ── Session helpers ───────────────────────────────────────────────────────

  private async ensureRegionSession(
    credentials: { readonly email: string; readonly password: string }
  ): Promise<CfSession> {
    if (
      this.cfSession !== null &&
      this.cfSessionRegionCode.length > 0 &&
      this.cfSessionRegionCode === this.selectedRegionCode &&
      !isCfSessionExpired(this.cfSession)
    ) {
      return this.cfSession;
    }

    const regionCode = this.selectedRegionCode;
    if (regionCode.length === 0) {
      throw new Error('CF session expired. Please select a region again.');
    }

    const apiEndpoint = getCfApiEndpoint(regionCode);
    const loginInfo = await fetchCfLoginInfo(apiEndpoint);
    const token = await cfLogin(
      loginInfo.authorizationEndpoint,
      credentials.email,
      credentials.password
    );
    this.cfSession = { token, apiEndpoint };
    this.cfSessionRegionCode = regionCode;
    return this.cfSession;
  }

  private async establishRegionSession(
    credentials: { readonly email: string; readonly password: string },
    regionCode: string,
    requestId: number
  ): Promise<void> {
    const apiEndpoint = getCfApiEndpoint(regionCode);
    const loginInfo = await fetchCfLoginInfo(apiEndpoint);
    const token = await cfLogin(
      loginInfo.authorizationEndpoint,
      credentials.email,
      credentials.password
    );
    if (!this.isCurrentRegionRequest(requestId) || this.selectedRegionCode !== regionCode) {
      return;
    }
    this.cfSession = { token, apiEndpoint };
    this.cfSessionRegionCode = regionCode;
  }

  private async refreshOrgsFromLiveAfterCachedRender(
    credentials: { readonly email: string; readonly password: string },
    regionCode: string,
    requestId: number,
    cachedOrgs: readonly { readonly guid: string; readonly name: string }[]
  ): Promise<void> {
    await this.establishRegionSession(credentials, regionCode, requestId);
    if (!this.isCurrentRegionRequest(requestId)) {
      return;
    }

    const session = await this.ensureRegionSession(credentials);
    if (!this.isCurrentRegionRequest(requestId)) {
      return;
    }

    const liveOrgs = await fetchOrgs(session);
    if (!this.isCurrentRegionRequest(requestId)) {
      return;
    }

    if (!haveSameOrgEntries(cachedOrgs, liveOrgs)) {
      this.postMessage({
        type: MSG_ORGS_LOADED,
        orgs: liveOrgs,
      });
    }
  }

  private async postAppsLoaded(
    apps: SidebarAppEntry[],
    payload: SpaceSelectionPayload,
    credentials: { readonly email: string; readonly password: string },
    cfHomeDir: string,
    regionCode: string
  ): Promise<void> {
    this.postMessage({
      type: MSG_APPS_LOADED,
      apps,
      scopeKey: `${getCfApiEndpoint(regionCode)}::${payload.orgName}::${payload.spaceName}`,
    });
    this.updateCfLogsForLoadedApps(apps, payload, credentials, cfHomeDir, regionCode);
    this.currentApps = apps;
    this.lastLoadedScope = {
      regionId: this.selectedRegionId,
      regionCode,
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

  private updateCfLogsForLoadedApps(
    apps: SidebarAppEntry[],
    payload: SpaceSelectionPayload,
    credentials: { readonly email: string; readonly password: string },
    cfHomeDir: string,
    regionCode: string
  ): void {
    const sessionSeed: CfLogSessionSeed = {
      apiEndpoint: getCfApiEndpoint(regionCode),
      email: credentials.email,
      password: credentials.password,
      orgName: payload.orgName,
      spaceName: payload.spaceName,
      cfHomeDir,
    };
    this.cfLogsPanel.updateScope(
      buildScopeLabel(regionCode, payload.orgName, payload.spaceName)
    );
    this.cfLogsPanel.updateApps(apps, sessionSeed);
    this.currentLogSessionSeed = sessionSeed;
  }

  private postOrgsError(message: string): void {
    this.postMessage({ type: MSG_ORGS_ERROR, message });
    this.cfLogsPanel.updateApps([], null);
    this.lastLoadedScope = null;
    this.currentApps = [];
    this.currentLogSessionSeed = null;
    this.serviceFolderMappings = [];
    this.serviceFolderSelections.clear();
    this.exportInProgress = false;
    this.postMessage({
      type: MSG_SERVICE_FOLDER_MAPPINGS_LOADED,
      mappings: this.serviceFolderMappings,
    });
  }

  private postSpacesError(message: string): void {
    this.postMessage({ type: MSG_SPACES_ERROR, message });
    this.cfLogsPanel.updateApps([], null);
    this.lastLoadedScope = null;
    this.currentApps = [];
    this.currentLogSessionSeed = null;
    this.serviceFolderMappings = [];
    this.serviceFolderSelections.clear();
    this.exportInProgress = false;
    this.postMessage({
      type: MSG_SERVICE_FOLDER_MAPPINGS_LOADED,
      mappings: this.serviceFolderMappings,
    });
  }

  private postAppsError(message: string): void {
    this.postMessage({ type: MSG_APPS_ERROR, message });
    this.cfLogsPanel.updateApps([], null);
    this.lastLoadedScope = null;
    this.currentApps = [];
    this.currentLogSessionSeed = null;
    this.serviceFolderMappings = [];
    this.serviceFolderSelections.clear();
    this.exportInProgress = false;
    this.postMessage({
      type: MSG_SERVICE_FOLDER_MAPPINGS_LOADED,
      mappings: this.serviceFolderMappings,
    });
  }

  private postAppsReloadError(message: string): void {
    this.outputChannel.appendLine(
      `[apps] Reload failed: ${sanitizeErrorForLog(message)}`
    );
    this.postMessage({ type: MSG_APPS_RELOAD_ERROR, message });
  }

  private bumpRegionSelectionRequestId(): number {
    this.regionSelectionRequestId += 1;
    this.orgSelectionRequestId += 1;
    this.spaceSelectionRequestId += 1;
    return this.regionSelectionRequestId;
  }

  private bumpOrgSelectionRequestId(): number {
    this.orgSelectionRequestId += 1;
    this.spaceSelectionRequestId += 1;
    return this.orgSelectionRequestId;
  }

  private bumpSpaceSelectionRequestId(): number {
    this.spaceSelectionRequestId += 1;
    return this.spaceSelectionRequestId;
  }

  private bumpExternalScopeChangeRequestId(): number {
    this.externalScopeChangeRequestId += 1;
    return this.externalScopeChangeRequestId;
  }

  private isCurrentRegionRequest(requestId: number): boolean {
    return requestId === this.regionSelectionRequestId;
  }

  private isCurrentOrgRequest(requestId: number): boolean {
    return requestId === this.orgSelectionRequestId;
  }

  private isCurrentSpaceRequest(requestId: number): boolean {
    return requestId === this.spaceSelectionRequestId;
  }

  private isCurrentExternalScopeRequest(requestId: number): boolean {
    return requestId === this.externalScopeChangeRequestId;
  }

  // ── Region logging ───────────────────────────────────────────────────────

  private logRegionSelection(region: RegionSelectionPayload): void {
    const timestamp = new Date().toISOString();
    const formattedMessage = [
      `[${timestamp}] Selected SAP BTP region:`,
      `${sanitizeForLog(region.name)} (${sanitizeForLog(region.code)})`,
      `| ${sanitizeForLog(region.area)}`,
      `| ${sanitizeForLog(region.id)}`,
    ].join(' ');

    this.outputChannel.appendLine(formattedMessage);

    if (process.env['SAP_TOOLS_E2E'] === '1') {
      void vscode.window.showInformationMessage(formattedMessage);
    }
  }


private sendSshProxyStatus(): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
    const config = vscode.workspace.getConfiguration('sapTools').get<any>('sshProxy') ?? {};
    this.postMessage({
      type: MSG_SSH_PROXY_STATUS,
      payload: {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        enabled: config.enabled === true,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        host: typeof config.host === 'string' ? (config.host as string) : '',
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        port: typeof config.port === 'number' ? (config.port as number) : 22,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        username: typeof config.username === 'string' ? (config.username as string) : '',
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        connection: config.enabled === true ? 'disconnected' : 'disabled',
        message: null,
      },
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async handleSaveSshProxySettings(payload: any): Promise<void> {
      return handleSaveSshProxySettings.call(this, payload);
  }

  private async handleClearSshProxySettings(): Promise<void> {
      return handleClearSshProxySettings.call(this);
  }

  private logWebviewMessageFailure(context: string, error: unknown): void {
    const errorMessage =
      error instanceof Error ? error.message : 'Unexpected webview message failure.';
    this.outputChannel.appendLine(
      `[webview] ${sanitizeForLog(context)} failed: ${sanitizeErrorForLog(errorMessage)}`
    );
  }

  // ── postMessage helpers ──────────────────────────────────────────────────

  private postMessage(message: Record<string, unknown>): void {
    void this.webviewView?.webview.postMessage(message);
  }

  private postCacheState(snapshot: CacheRuntimeSnapshot): void {
    this.postMessage({
      type: MSG_CACHE_STATE,
      snapshot: {
        activeUserEmail: snapshot.activeUserEmail,
        syncInProgress: snapshot.syncInProgress,
        lastSyncStartedAt: snapshot.lastSyncStartedAt,
        lastSyncCompletedAt: snapshot.lastSyncCompletedAt,
        lastSyncError: snapshot.lastSyncError,
        syncIntervalHours: snapshot.syncIntervalHours,
        nextSyncAt: snapshot.nextSyncAt,
        regionAccessById: snapshot.regionAccessById,
      },
    } satisfies CacheStatePayload);
  }

  // ── HTML builders ────────────────────────────────────────────────────────
}
