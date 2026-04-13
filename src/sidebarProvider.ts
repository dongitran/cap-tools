import * as vscode from 'vscode';

import {
  cfLogin,
  fetchCfLoginInfo,
  fetchOrgs,
  fetchSpaces,
  fetchStartedAppsViaCfCli,
  getCfApiEndpoint,
} from './cfClient';
import type { CfSession } from './cfClient';
import { ensureCfHomeDir } from './cfHome';
import type { CacheRuntimeSnapshot, CacheSyncService } from './cacheSyncService';
import type { CfLogsPanelProvider } from './cfLogsPanel';
import { clearCredentials, getEffectiveCredentials, storeCredentials } from './credentialStore';
import { isSyncIntervalHours } from './cacheModels';
import type { SyncIntervalHours } from './cacheModels';
import {
  buildServiceFolderMappings,
  type ServiceFolderMapping,
} from './serviceFolderMapping';
import {
  exportServiceArtifacts,
  type ServiceExportSession,
} from './serviceArtifactExporter';
import { resolveMockApps, resolveMockOrgsForRegion, resolveMockSpacesForOrg } from './testModeData';

export const REGION_VIEW_ID = 'sapTools.regionView';

const PROTOTYPE_DESIGN_ID = '34';

// ── Inbound message types (webview → extension) ─────────────────────────────

const MSG_REQUEST_INITIAL_STATE = 'sapTools.requestInitialState';
const MSG_LOGIN_SUBMIT = 'sapTools.loginSubmit';
const MSG_REGION_SELECTED = 'sapTools.regionSelected';
const MSG_ORG_SELECTED = 'sapTools.orgSelected';
const MSG_SPACE_SELECTED = 'sapTools.spaceSelected';
const MSG_OPEN_CF_LOGS_PANEL = 'sapTools.openCfLogsPanel';
const MSG_ACTIVE_APPS_CHANGED = 'sapTools.activeAppsChanged';
const MSG_UPDATE_SYNC_INTERVAL = 'sapTools.updateSyncInterval';
const MSG_SYNC_NOW = 'sapTools.syncNow';
const MSG_LOGOUT = 'sapTools.logout';
const MSG_SELECT_LOCAL_ROOT_FOLDER = 'sapTools.selectLocalRootFolder';
const MSG_REFRESH_SERVICE_FOLDER_MAPPINGS = 'sapTools.refreshServiceFolderMappings';
const MSG_SELECT_SERVICE_FOLDER_MAPPING = 'sapTools.selectServiceFolderMapping';
const MSG_EXPORT_DEFAULT_ENV = 'sapTools.exportDefaultEnv';
const MSG_EXPORT_PNPM_LOCK = 'sapTools.exportPnpmLock';
const MSG_EXPORT_SERVICE_ARTIFACTS = 'sapTools.exportServiceArtifacts';

// ── Outbound message types (extension → webview) ────────────────────────────

const MSG_LOGIN_RESULT = 'sapTools.loginResult';
const MSG_LOGOUT_RESULT = 'sapTools.logoutResult';
const MSG_ORGS_LOADED = 'sapTools.orgsLoaded';
const MSG_ORGS_ERROR = 'sapTools.orgsError';
const MSG_SPACES_LOADED = 'sapTools.spacesLoaded';
const MSG_SPACES_ERROR = 'sapTools.spacesError';
const MSG_APPS_LOADED = 'sapTools.appsLoaded';
const MSG_APPS_ERROR = 'sapTools.appsError';
const MSG_CACHE_STATE = 'sapTools.cacheState';
const MSG_LOCAL_ROOT_FOLDER_UPDATED = 'sapTools.localRootFolderUpdated';
const MSG_SERVICE_FOLDER_MAPPINGS_LOADED = 'sapTools.serviceFolderMappingsLoaded';
const MSG_SERVICE_FOLDER_MAPPINGS_ERROR = 'sapTools.serviceFolderMappingsError';
const MSG_EXPORT_ARTIFACT_PROGRESS = 'sapTools.exportArtifactProgress';
const MSG_EXPORT_ARTIFACT_RESULT = 'sapTools.exportArtifactResult';

// ── Payload interfaces ───────────────────────────────────────────────────────

interface RegionSelectionPayload {
  readonly id: string;
  readonly name: string;
  readonly code: string;
  readonly area: string;
}

interface OrgSelectionPayload {
  readonly guid: string;
  readonly name: string;
}

interface SpaceSelectionPayload {
  readonly spaceName: string;
  readonly orgGuid: string;
  readonly orgName: string;
}

interface ActiveAppsChangedPayload {
  readonly appNames: string[];
}

interface UpdateSyncIntervalPayload {
  readonly syncIntervalHours: SyncIntervalHours;
}

interface RefreshServiceFolderMappingsPayload {
  readonly rootFolderPath: string;
  readonly appNames: readonly string[];
}

interface SelectServiceFolderMappingPayload {
  readonly appId: string;
  readonly folderPath: string;
}

interface ExportServiceArtifactsPayload {
  readonly appId: string;
  readonly appName: string;
  readonly rootFolderPath: string;
}

interface LogoutResultPayload {
  readonly type: string;
  readonly success: boolean;
  readonly error?: string;
}

interface CacheStatePayload {
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

interface CfLogSessionSeed {
  readonly apiEndpoint: string;
  readonly email: string;
  readonly password: string;
  readonly orgName: string;
  readonly spaceName: string;
  readonly cfHomeDir: string;
}

interface SidebarAppEntry {
  readonly id: string;
  readonly name: string;
  readonly runningInstances: number;
}

// ── Provider ─────────────────────────────────────────────────────────────────

export class RegionSidebarProvider
  implements vscode.WebviewViewProvider, vscode.Disposable
{
  private webviewView: vscode.WebviewView | undefined;
  private cfSession: CfSession | null = null;
  private cfSessionRegionCode = '';
  private selectedRegionCode = '';
  private selectedRegionId = '';
  private regionSelectionRequestId = 0;
  private orgSelectionRequestId = 0;
  private spaceSelectionRequestId = 0;
  private selectedLocalRootFolderPath = '';
  private currentApps: SidebarAppEntry[] = [];
  private currentLogSessionSeed: CfLogSessionSeed | null = null;
  private serviceFolderMappings: ServiceFolderMapping[] = [];
  private readonly serviceFolderSelections = new Map<string, string>();
  private exportInProgress = false;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly outputChannel: vscode.OutputChannel,
    private readonly context: vscode.ExtensionContext,
    private readonly cfLogsPanel: CfLogsPanelProvider,
    private readonly cacheSyncService: CacheSyncService
  ) {
    const cacheSubscription = this.cacheSyncService.subscribe((snapshot) => {
      this.postCacheState(snapshot);
    });
    this.disposables.push(cacheSubscription);
  }

  async resolveWebviewView(webviewView: vscode.WebviewView): Promise<void> {
    this.webviewView = webviewView;
    this.cfSession = null;
    this.cfSessionRegionCode = '';
    this.selectedRegionCode = '';
    this.selectedRegionId = '';
    this.bumpRegionSelectionRequestId();
    this.currentApps = [];
    this.currentLogSessionSeed = null;
    this.serviceFolderMappings = [];
    this.serviceFolderSelections.clear();
    this.exportInProgress = false;

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
        ? this.buildMainHtml(webviewView.webview, nonce, assetsRoot)
        : this.buildLoginGateHtml(webviewView.webview, nonce, assetsRoot);

    const messageSubscription = webviewView.webview.onDidReceiveMessage(
      (message: unknown): void => {
        void this.handleWebviewMessage(message);
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
      await this.handleOrgSelected(payload);
      return;
    }

    if (type === MSG_SPACE_SELECTED && isSpaceSelectedMessage(message)) {
      const payload = readSpaceSelectionPayload(message);
      await this.handleSpaceSelected(payload);
      return;
    }

    if (type === MSG_OPEN_CF_LOGS_PANEL) {
      this.cfLogsPanel.focus();
      return;
    }

    if (type === MSG_ACTIVE_APPS_CHANGED && isActiveAppsChangedMessage(message)) {
      const payload = readActiveAppsChangedPayload(message);
      this.cfLogsPanel.updateActiveApps(payload.appNames);
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

    if (type === MSG_EXPORT_DEFAULT_ENV && isExportServiceArtifactsMessage(message)) {
      const payload = readExportServiceArtifactsPayload(message);
      await this.handleExportServiceArtifacts(payload, {
        includeDefaultEnv: true,
        includePnpmLock: false,
      });
      return;
    }

    if (type === MSG_EXPORT_PNPM_LOCK && isExportServiceArtifactsMessage(message)) {
      const payload = readExportServiceArtifactsPayload(message);
      await this.handleExportServiceArtifacts(payload, {
        includeDefaultEnv: false,
        includePnpmLock: true,
      });
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

    if (type === MSG_UPDATE_SYNC_INTERVAL && isUpdateSyncIntervalMessage(message)) {
      const payload = readUpdateSyncIntervalPayload(message);
      const snapshot = await this.cacheSyncService.updateSyncInterval(
        payload.syncIntervalHours
      );
      this.postCacheState(snapshot);
      return;
    }

    if (type === MSG_SYNC_NOW) {
      const snapshot = await this.cacheSyncService.triggerSyncNow();
      this.postCacheState(snapshot);
      return;
    }

    if (type === MSG_LOGOUT) {
      await this.handleLogout();
    }
  }

  private async handleRequestInitialState(): Promise<void> {
    const snapshot = await this.cacheSyncService.getRuntimeSnapshot();
    this.postCacheState(snapshot);
    this.postMessage({
      type: MSG_LOCAL_ROOT_FOLDER_UPDATED,
      path: this.selectedLocalRootFolderPath,
    });
    this.postMessage({
      type: MSG_SERVICE_FOLDER_MAPPINGS_LOADED,
      mappings: this.serviceFolderMappings,
    });
  }

  private async handleSelectLocalRootFolder(): Promise<void> {
    const selectedUris = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      title: 'Select local root folder for service mapping',
    });
    const selectedUri = selectedUris?.[0];
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
    await this.refreshServiceFolderMappings();
  }

  private async handleRefreshServiceFolderMappings(
    payload: RefreshServiceFolderMappingsPayload
  ): Promise<void> {
    const rootFolderPath = payload.rootFolderPath.trim();
    if (rootFolderPath.length > 0 && rootFolderPath !== this.selectedLocalRootFolderPath) {
      this.selectedLocalRootFolderPath = rootFolderPath;
      this.serviceFolderSelections.clear();
      this.postMessage({
        type: MSG_LOCAL_ROOT_FOLDER_UPDATED,
        path: this.selectedLocalRootFolderPath,
      });
    }

    await this.refreshServiceFolderMappings();
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
  }

  private async refreshServiceFolderMappings(): Promise<void> {
    if (this.selectedLocalRootFolderPath.length === 0) {
      this.postMessage({
        type: MSG_SERVICE_FOLDER_MAPPINGS_ERROR,
        message: 'Select a local root folder before scanning service mappings.',
      });
      return;
    }

    if (this.currentApps.length === 0) {
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
        this.currentApps.map((app) => app.name)
      );
      this.serviceFolderMappings = this.applyServiceFolderSelections(mappings);
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

  private async handleExportServiceArtifacts(
    payload: ExportServiceArtifactsPayload,
    options: {
      readonly includeDefaultEnv: boolean;
      readonly includePnpmLock: boolean;
    }
  ): Promise<void> {
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

    this.exportInProgress = true;
    this.postMessage({
      type: MSG_EXPORT_ARTIFACT_PROGRESS,
      inProgress: true,
      message: `Exporting artifacts for "${payload.appName}"...`,
    });

    try {
      const result = await exportServiceArtifacts({
        appName: payload.appName,
        targetFolderPath: mapping.folderPath,
        session: exportSession,
        includeDefaultEnv: options.includeDefaultEnv,
        includePnpmLock: options.includePnpmLock,
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
        message: `Export completed for "${payload.appName}". ${filesLabel}`,
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

  private resolveServiceFolderMapping(
    payload: ExportServiceArtifactsPayload
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

  // ── Login / logout ───────────────────────────────────────────────────────

  private async handleLoginSubmit(email: string, password: string): Promise<void> {
    try {
      await storeCredentials(this.context, { email, password });
      await this.cacheSyncService.setCredentials({ email, password });
      this.reloadToMainView();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to save credentials.';
      this.postMessage({ type: MSG_LOGIN_RESULT, success: false, error: errorMessage });
    }
  }

  private async handleLogout(): Promise<void> {
    try {
      await clearCredentials(this.context);
      await this.cacheSyncService.setCredentials(null);
      this.cfSession = null;
      this.cfSessionRegionCode = '';
      this.selectedRegionCode = '';
      this.selectedRegionId = '';
      this.bumpRegionSelectionRequestId();
      this.currentApps = [];
      this.currentLogSessionSeed = null;
      this.serviceFolderMappings = [];
      this.serviceFolderSelections.clear();
      this.exportInProgress = false;
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
    this.webviewView.webview.html = this.buildMainHtml(
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
    this.webviewView.webview.html = this.buildLoginGateHtml(
      this.webviewView.webview,
      nonce,
      assetsRoot
    );
  }

  // ── Region selected → fetch orgs ─────────────────────────────────────────

  private async handleRegionSelected(region: RegionSelectionPayload): Promise<void> {
    const requestId = this.bumpRegionSelectionRequestId();
    this.selectedRegionId = region.id;
    this.selectedRegionCode = region.code;
    this.cfSession = null;
    this.cfSessionRegionCode = '';
    this.currentApps = [];
    this.currentLogSessionSeed = null;
    this.serviceFolderMappings = [];
    this.serviceFolderSelections.clear();
    this.exportInProgress = false;
    this.cfLogsPanel.updateApps([], null);
    this.cfLogsPanel.updateScope(buildScopeLabel(region.code, 'select-org', 'select-space'));
    this.postMessage({
      type: MSG_SERVICE_FOLDER_MAPPINGS_LOADED,
      mappings: this.serviceFolderMappings,
    });

    if (isTestMode()) {
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

    if (cachedOrgs !== null) {
      this.postMessage({
        type: MSG_ORGS_LOADED,
        orgs: cachedOrgs,
      });
      const warmupRequestId = requestId;
      void this.establishRegionSession(
        credentials,
        region.code,
        warmupRequestId
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

  // ── Org selected → fetch spaces ──────────────────────────────────────────

  private async handleOrgSelected(org: OrgSelectionPayload): Promise<void> {
    const requestId = this.bumpOrgSelectionRequestId();
    const scopeLabel = buildScopeLabel(this.selectedRegionCode, org.name, 'select-space');
    this.cfLogsPanel.updateScope(scopeLabel);
    this.cfLogsPanel.updateApps([], null);
    this.currentApps = [];
    this.currentLogSessionSeed = null;
    this.serviceFolderMappings = [];
    this.serviceFolderSelections.clear();
    this.exportInProgress = false;
    this.postMessage({
      type: MSG_SERVICE_FOLDER_MAPPINGS_LOADED,
      mappings: this.serviceFolderMappings,
    });

    if (isTestMode()) {
      this.postMessage({ type: MSG_SPACES_LOADED, spaces: resolveMockSpacesForOrg(org) });
      return;
    }

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

    try {
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
      this.postSpacesError(errorMessage);
    }
  }

  // ── Space selected → fetch apps ───────────────────────────────────────────

  private async handleSpaceSelected(payload: SpaceSelectionPayload): Promise<void> {
    const requestId = this.bumpSpaceSelectionRequestId();
    const regionCode = this.selectedRegionCode;

    if (isTestMode()) {
      this.handleTestModeSpaceSelection(payload);
      return;
    }

    const credentials = await getEffectiveCredentials(this.context);
    if (credentials === null) {
      this.postAppsError('No credentials found. Please re-open SAP Tools and log in.');
      return;
    }

    const cachedApps = await this.cacheSyncService.getCachedApps(
      this.selectedRegionId,
      payload.orgGuid,
      payload.spaceName
    );
    if (!this.isCurrentSpaceRequest(requestId)) {
      return;
    }
    const cfHomeDir = await ensureCfHomeDir(this.context);
    if (!this.isCurrentSpaceRequest(requestId)) {
      return;
    }

    if (cachedApps !== null) {
      const apps = cachedApps.map((app) => ({
        id: app.id,
        name: app.name,
        runningInstances: app.runningInstances,
      }));
      this.postAppsLoaded(apps, payload, credentials, cfHomeDir, regionCode);
      return;
    }

    try {
      const session = await this.ensureRegionSession(credentials);
      if (!this.isCurrentSpaceRequest(requestId)) {
        return;
      }
      const runningApps = await fetchStartedAppsViaCfCli({
        apiEndpoint: session.apiEndpoint,
        email: credentials.email,
        password: credentials.password,
        orgName: payload.orgName,
        spaceName: payload.spaceName,
        cfHomeDir,
      });
      const apps = runningApps.map((app) => ({
        id: app.name,
        name: app.name,
        runningInstances: app.runningInstances,
      }));
      if (!this.isCurrentSpaceRequest(requestId)) {
        return;
      }
      this.postAppsLoaded(apps, payload, credentials, cfHomeDir, regionCode);
    } catch (error) {
      if (!this.isCurrentSpaceRequest(requestId)) {
        return;
      }
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to fetch apps from CF CLI.';
      this.postAppsError(errorMessage);
    }
  }

  private handleTestModeSpaceSelection(payload: SpaceSelectionPayload): void {
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
    this.postMessage({ type: MSG_APPS_LOADED, apps });
    this.cfLogsPanel.updateScope(
      buildScopeLabel(this.selectedRegionCode, payload.orgName, payload.spaceName)
    );
    this.cfLogsPanel.updateApps(apps, null);
    this.currentApps = apps;
    this.currentLogSessionSeed = null;
    this.serviceFolderMappings = [];
    this.serviceFolderSelections.clear();
    this.exportInProgress = false;
    this.postMessage({
      type: MSG_SERVICE_FOLDER_MAPPINGS_LOADED,
      mappings: this.serviceFolderMappings,
    });
    if (this.selectedLocalRootFolderPath.length > 0) {
      void this.refreshServiceFolderMappings();
    }
  }

  // ── Session helpers ───────────────────────────────────────────────────────

  private async ensureRegionSession(
    credentials: { readonly email: string; readonly password: string }
  ): Promise<CfSession> {
    if (
      this.cfSession !== null &&
      this.cfSessionRegionCode.length > 0 &&
      this.cfSessionRegionCode === this.selectedRegionCode
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

  private postAppsLoaded(
    apps: SidebarAppEntry[],
    payload: SpaceSelectionPayload,
    credentials: { readonly email: string; readonly password: string },
    cfHomeDir: string,
    regionCode: string
  ): void {
    this.postMessage({ type: MSG_APPS_LOADED, apps });
    this.cfLogsPanel.updateScope(
      buildScopeLabel(regionCode, payload.orgName, payload.spaceName)
    );
    this.cfLogsPanel.updateApps(apps, {
      apiEndpoint: getCfApiEndpoint(regionCode),
      email: credentials.email,
      password: credentials.password,
      orgName: payload.orgName,
      spaceName: payload.spaceName,
      cfHomeDir,
    } satisfies CfLogSessionSeed);
    this.currentApps = apps;
    this.currentLogSessionSeed = {
      apiEndpoint: getCfApiEndpoint(regionCode),
      email: credentials.email,
      password: credentials.password,
      orgName: payload.orgName,
      spaceName: payload.spaceName,
      cfHomeDir,
    };
    this.serviceFolderMappings = [];
    this.serviceFolderSelections.clear();
    this.exportInProgress = false;
    this.postMessage({
      type: MSG_SERVICE_FOLDER_MAPPINGS_LOADED,
      mappings: this.serviceFolderMappings,
    });
    if (this.selectedLocalRootFolderPath.length > 0) {
      void this.refreshServiceFolderMappings();
    }
  }

  private postOrgsError(message: string): void {
    this.postMessage({ type: MSG_ORGS_ERROR, message });
    this.cfLogsPanel.updateApps([], null);
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

  private isCurrentRegionRequest(requestId: number): boolean {
    return requestId === this.regionSelectionRequestId;
  }

  private isCurrentOrgRequest(requestId: number): boolean {
    return requestId === this.orgSelectionRequestId;
  }

  private isCurrentSpaceRequest(requestId: number): boolean {
    return requestId === this.spaceSelectionRequestId;
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
    this.outputChannel.show(true);

    if (process.env['SAP_TOOLS_E2E'] === '1') {
      void vscode.window.showInformationMessage(formattedMessage);
    }
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

  private buildMainHtml(
    webview: vscode.Webview,
    nonce: string,
    assetsRoot: vscode.Uri
  ): string {
    const scriptSrc = webview
      .asWebviewUri(vscode.Uri.joinPath(assetsRoot, 'prototype.js'))
      .toString();
    const cssSrc = webview
      .asWebviewUri(vscode.Uri.joinPath(assetsRoot, 'prototype.css'))
      .toString();
    const themeCssSrc = webview
      .asWebviewUri(vscode.Uri.joinPath(assetsRoot, 'themes', 'design-34.css'))
      .toString();

    const csp = buildCsp(webview, nonce);

    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta http-equiv="Content-Security-Policy" content="${csp}" />
    <title>SAP Tools</title>
    <link rel="stylesheet" href="${cssSrc}" />
    <link rel="stylesheet" href="${themeCssSrc}" />
  </head>
  <body class="prototype-page saptools-extension" data-design-id="${PROTOTYPE_DESIGN_ID}">
    <main id="app"></main>
    <script nonce="${nonce}" type="module" src="${scriptSrc}"></script>
  </body>
</html>`;
  }

  private buildLoginGateHtml(
    webview: vscode.Webview,
    nonce: string,
    assetsRoot: vscode.Uri
  ): string {
    const scriptSrc = webview
      .asWebviewUri(vscode.Uri.joinPath(assetsRoot, 'login-gate.js'))
      .toString();
    const cssSrc = webview
      .asWebviewUri(vscode.Uri.joinPath(assetsRoot, 'login-gate.css'))
      .toString();
    const csp = buildCsp(webview, nonce);

    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta http-equiv="Content-Security-Policy" content="${csp}" />
    <title>SAP Tools Login</title>
    <link rel="stylesheet" href="${cssSrc}" />
  </head>
  <body class="login-gate-page saptools-extension">
    <main class="login-shell">
      <header class="layout-head">
        <div class="layout-title-row">
          <h1>SAP Tools Login</h1>
          <span class="layout-chip">Secure</span>
        </div>
        <p class="layout-subline">Connect your SAP account to open region workspace.</p>
      </header>

      <section class="login-card" aria-label="SAP credential setup">
        <form id="login-gate-form" class="login-form" novalidate>
          <div class="field-row">
            <label for="sap-email">SAP Email</label>
            <input
              id="sap-email"
              name="sap-email"
              type="email"
              autocomplete="email"
              placeholder="developer@company.com"
              required
            />
          </div>

          <div class="field-row">
            <label for="sap-password">SAP Password</label>
            <input
              id="sap-password"
              name="sap-password"
              type="password"
              autocomplete="current-password"
              placeholder="Enter SAP password"
              required
            />
          </div>

          <p id="form-status" class="form-status" role="status" aria-live="polite"></p>

          <button id="submit-login-gate" type="submit">Save and Continue</button>
        </form>
      </section>
    </main>

    <script nonce="${nonce}" type="module" src="${scriptSrc}"></script>
  </body>
</html>`;
  }
}

function isTestMode(): boolean {
  return process.env['SAP_TOOLS_TEST_MODE'] === '1';
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function buildCsp(webview: vscode.Webview, nonce: string): string {
  return [
    "default-src 'none'",
    `img-src ${webview.cspSource} data:`,
    `style-src ${webview.cspSource}`,
    `font-src ${webview.cspSource}`,
    `script-src 'nonce-${nonce}' ${webview.cspSource}`,
  ].join('; ');
}

function buildScopeLabel(regionCode: string, orgName: string, spaceName: string): string {
  const normalizedRegionCode = regionCode.trim().length > 0 ? regionCode.trim() : 'no-region';
  const normalizedOrgName = orgName.trim().length > 0 ? orgName.trim() : 'no-org';
  const normalizedSpaceName = spaceName.trim().length > 0 ? spaceName.trim() : 'no-space';
  return `${normalizedRegionCode} \u2192 ${normalizedOrgName} \u2192 ${normalizedSpaceName}`;
}

function createNonce(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let index = 0; index < 24; index += 1) {
    const randomIndex = Math.floor(Math.random() * alphabet.length);
    nonce += alphabet[randomIndex] ?? 'A';
  }
  return nonce;
}

function sanitizeForLog(value: string): string {
  return value.replaceAll(/\s+/g, ' ').trim();
}

// ── Type guards ─────────────────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isNonEmptyString(value: unknown, maxLength: number): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= maxLength;
}

function isLoginSubmitMessage(value: Record<string, unknown>): boolean {
  return isNonEmptyString(value['email'], 256) && isNonEmptyString(value['password'], 256);
}

function readLoginSubmitPayload(value: Record<string, unknown>): {
  readonly email: string;
  readonly password: string;
} {
  return {
    email: String(value['email']),
    password: String(value['password']),
  };
}

function isRegionSelectedMessage(value: Record<string, unknown>): boolean {
  const region = value['region'];
  if (!isRecord(region)) {
    return false;
  }
  return (
    isNonEmptyString(region['id'], 64) &&
    isNonEmptyString(region['name'], 96) &&
    isNonEmptyString(region['code'], 32) &&
    isNonEmptyString(region['area'], 64)
  );
}

function readRegionSelectionPayload(value: Record<string, unknown>): RegionSelectionPayload {
  const region = value['region'] as Record<string, unknown>;
  return {
    id: String(region['id']),
    name: String(region['name']),
    code: String(region['code']),
    area: String(region['area']),
  };
}

function isOrgSelectedMessage(value: Record<string, unknown>): boolean {
  const org = value['org'];
  if (!isRecord(org)) {
    return false;
  }
  return isNonEmptyString(org['guid'], 128) && isNonEmptyString(org['name'], 128);
}

function readOrgSelectionPayload(value: Record<string, unknown>): OrgSelectionPayload {
  const org = value['org'] as Record<string, unknown>;
  return {
    guid: String(org['guid']),
    name: String(org['name']),
  };
}

function isSpaceSelectedMessage(value: Record<string, unknown>): boolean {
  const scope = value['scope'];
  if (!isRecord(scope)) {
    return false;
  }

  return (
    isNonEmptyString(scope['spaceName'], 128) &&
    isNonEmptyString(scope['orgGuid'], 128) &&
    isNonEmptyString(scope['orgName'], 128)
  );
}

function readSpaceSelectionPayload(value: Record<string, unknown>): SpaceSelectionPayload {
  const scope = value['scope'] as Record<string, unknown>;
  return {
    spaceName: String(scope['spaceName']),
    orgGuid: String(scope['orgGuid']),
    orgName: String(scope['orgName']),
  };
}

function isActiveAppsChangedMessage(value: Record<string, unknown>): boolean {
  const appNames = value['appNames'];
  if (!Array.isArray(appNames) || appNames.length > 64) {
    return false;
  }

  for (const appName of appNames) {
    if (!isNonEmptyString(appName, 128)) {
      return false;
    }
  }

  return true;
}

function readActiveAppsChangedPayload(
  value: Record<string, unknown>
): ActiveAppsChangedPayload {
  return {
    appNames: (value['appNames'] as string[]).map((name) => name.trim()),
  };
}

function isUpdateSyncIntervalMessage(value: Record<string, unknown>): boolean {
  const syncIntervalHours = value['syncIntervalHours'];
  return typeof syncIntervalHours === 'number' && isSyncIntervalHours(syncIntervalHours);
}

function readUpdateSyncIntervalPayload(
  value: Record<string, unknown>
): UpdateSyncIntervalPayload {
  return {
    syncIntervalHours: value['syncIntervalHours'] as SyncIntervalHours,
  };
}

function isRefreshServiceFolderMappingsMessage(
  value: Record<string, unknown>
): boolean {
  const rootFolderPath = value['rootFolderPath'];
  const appNames = value['appNames'];
  if (
    typeof rootFolderPath !== 'string' ||
    rootFolderPath.trim().length > 4096 ||
    !Array.isArray(appNames) ||
    appNames.length > 256
  ) {
    return false;
  }

  for (const appName of appNames) {
    if (!isNonEmptyString(appName, 128)) {
      return false;
    }
  }

  return true;
}

function readRefreshServiceFolderMappingsPayload(
  value: Record<string, unknown>
): RefreshServiceFolderMappingsPayload {
  const appNamesRaw = value['appNames'] as string[];
  return {
    rootFolderPath: String(value['rootFolderPath']).trim(),
    appNames: appNamesRaw.map((appName) => appName.trim()),
  };
}

function isSelectServiceFolderMappingMessage(value: Record<string, unknown>): boolean {
  return (
    isNonEmptyString(value['appId'], 128) &&
    typeof value['folderPath'] === 'string' &&
    value['folderPath'].trim().length <= 4096
  );
}

function readSelectServiceFolderMappingPayload(
  value: Record<string, unknown>
): SelectServiceFolderMappingPayload {
  return {
    appId: String(value['appId']).trim(),
    folderPath: String(value['folderPath']).trim(),
  };
}

function isExportServiceArtifactsMessage(value: Record<string, unknown>): boolean {
  return (
    isNonEmptyString(value['appId'], 128) &&
    isNonEmptyString(value['appName'], 128) &&
    typeof value['rootFolderPath'] === 'string' &&
    value['rootFolderPath'].trim().length <= 4096
  );
}

function readExportServiceArtifactsPayload(
  value: Record<string, unknown>
): ExportServiceArtifactsPayload {
  return {
    appId: String(value['appId']).trim(),
    appName: String(value['appName']).trim(),
    rootFolderPath: String(value['rootFolderPath']).trim(),
  };
}
