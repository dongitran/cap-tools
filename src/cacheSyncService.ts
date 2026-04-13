import type * as vscode from 'vscode';

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
import { normalizeUserEmail } from './cacheStore';
import type { CacheStore } from './cacheStore';
import type { CfCredentials } from './credentialStore';
import { SAP_BTP_REGIONS, toHyphenatedRegionCode } from './regions';
import type {
  CachedAppEntry,
  CachedOrgEntry,
  CachedRegionEntry,
  CachedSpaceEntry,
  CachedUserEntry,
  RegionAccessState,
  SyncIntervalHours,
} from './cacheModels';

const HOURS_TO_MS = 60 * 60 * 1000;

export interface CacheRuntimeSnapshot {
  readonly activeUserEmail: string | null;
  readonly syncInProgress: boolean;
  readonly lastSyncStartedAt: string | null;
  readonly lastSyncCompletedAt: string | null;
  readonly lastSyncError: string;
  readonly syncIntervalHours: SyncIntervalHours;
  readonly nextSyncAt: string | null;
  readonly regionAccessById: Record<string, RegionAccessState>;
}

export interface CachedOrgSummary {
  readonly guid: string;
  readonly name: string;
}

export interface CachedSpaceSummary {
  readonly guid: string;
  readonly name: string;
}

export interface CachedAppSummary {
  readonly id: string;
  readonly name: string;
  readonly runningInstances: number;
}

type SnapshotListener = (snapshot: CacheRuntimeSnapshot) => void;

export class CacheSyncService implements vscode.Disposable {
  private credentials: CfCredentials | null = null;
  private activeUserKey: string | null = null;
  private timer: NodeJS.Timeout | null = null;
  private nextSyncAt: string | null = null;
  private syncPromise: Promise<void> | null = null;
  private readonly listeners = new Set<SnapshotListener>();
  private disposed = false;
  private readonly testMode = process.env['SAP_TOOLS_TEST_MODE'] === '1';

  constructor(
    private readonly cacheStore: CacheStore,
    private readonly context: vscode.ExtensionContext,
    private readonly outputChannel: vscode.OutputChannel
  ) {}

  dispose(): void {
    this.disposed = true;
    this.clearTimer();
    this.listeners.clear();
  }

  subscribe(listener: SnapshotListener): vscode.Disposable {
    this.listeners.add(listener);
    return new ListenerDisposable(() => {
      this.listeners.delete(listener);
    });
  }

  async initialize(credentials: CfCredentials | null): Promise<CacheRuntimeSnapshot> {
    return this.setCredentials(credentials);
  }

  async setCredentials(
    credentials: CfCredentials | null
  ): Promise<CacheRuntimeSnapshot> {
    this.credentials = credentials;
    this.activeUserKey =
      credentials === null ? null : normalizeUserEmail(credentials.email);
    this.clearTimer();
    this.nextSyncAt = null;

    if (this.testMode) {
      await this.seedTestModeCache(credentials);
      const snapshot = await this.getRuntimeSnapshot();
      this.emitSnapshot(snapshot);
      return snapshot;
    }

    await this.rescheduleForActiveUser(true);
    const snapshot = await this.getRuntimeSnapshot();
    this.emitSnapshot(snapshot);
    return snapshot;
  }

  async updateSyncInterval(
    syncIntervalHours: SyncIntervalHours
  ): Promise<CacheRuntimeSnapshot> {
    await this.cacheStore.setSyncIntervalHours(syncIntervalHours);
    await this.rescheduleForActiveUser(true);
    const snapshot = await this.getRuntimeSnapshot();
    this.emitSnapshot(snapshot);
    return snapshot;
  }

  async triggerSyncNow(): Promise<CacheRuntimeSnapshot> {
    if (this.testMode) {
      const snapshot = await this.getRuntimeSnapshot();
      this.emitSnapshot(snapshot);
      return snapshot;
    }

    await this.startSyncIfNeeded(true);
    const snapshot = await this.getRuntimeSnapshot();
    this.emitSnapshot(snapshot);
    return snapshot;
  }

  async getRuntimeSnapshot(): Promise<CacheRuntimeSnapshot> {
    const settings = await this.cacheStore.getSettings();
    const activeUser = await this.getActiveUserEntry();
    return {
      activeUserEmail: activeUser?.email ?? null,
      syncInProgress: activeUser?.syncInProgress ?? false,
      lastSyncStartedAt: activeUser?.lastSyncStartedAt ?? null,
      lastSyncCompletedAt: activeUser?.lastSyncCompletedAt ?? null,
      lastSyncError: activeUser?.lastSyncError ?? '',
      syncIntervalHours: settings.syncIntervalHours,
      nextSyncAt: this.nextSyncAt,
      regionAccessById: buildRegionAccessMap(activeUser?.regions ?? []),
    };
  }

  async getRegionAccessById(): Promise<Record<string, RegionAccessState>> {
    const activeUser = await this.getActiveUserEntry();
    return buildRegionAccessMap(activeUser?.regions ?? []);
  }

  async getCachedOrgs(regionId: string): Promise<readonly CachedOrgSummary[] | null> {
    const cachedRegion = await this.getCachedRegion(regionId);
    if (cachedRegion === null) {
      return null;
    }

    return cachedRegion.orgs.map((org) => ({ guid: org.guid, name: org.name }));
  }

  async getCachedSpaces(
    regionId: string,
    orgGuid: string
  ): Promise<readonly CachedSpaceSummary[] | null> {
    const cachedRegion = await this.getCachedRegion(regionId);
    if (cachedRegion === null) {
      return null;
    }

    const org = cachedRegion.orgs.find((entry) => entry.guid === orgGuid);
    if (org === undefined) {
      return null;
    }

    return org.spaces.map((space) => ({ guid: space.guid, name: space.name }));
  }

  async getCachedApps(
    regionId: string,
    orgGuid: string,
    spaceName: string
  ): Promise<readonly CachedAppSummary[] | null> {
    const cachedRegion = await this.getCachedRegion(regionId);
    if (cachedRegion === null) {
      return null;
    }

    const org = cachedRegion.orgs.find((entry) => entry.guid === orgGuid);
    if (org === undefined) {
      return null;
    }

    const space = org.spaces.find((entry) => entry.name === spaceName);
    if (space === undefined) {
      return null;
    }

    return space.apps.map((app) => ({
      id: app.id,
      name: app.name,
      runningInstances: app.runningInstances,
    }));
  }

  private async getCachedRegion(regionId: string): Promise<CachedRegionEntry | null> {
    const activeUser = await this.getActiveUserEntry();
    if (activeUser === null) {
      return null;
    }

    const normalizedRegionId = regionId.trim().toLowerCase();
    if (normalizedRegionId.length === 0) {
      return null;
    }

    const region = activeUser.regions.find(
      (entry) => entry.regionId === normalizedRegionId
    );
    return region ?? null;
  }

  private async getActiveUserEntry(): Promise<CachedUserEntry | null> {
    if (this.activeUserKey === null) {
      return null;
    }
    return this.cacheStore.getUser(this.activeUserKey);
  }

  private async rescheduleForActiveUser(
    runDueSyncInBackground: boolean
  ): Promise<void> {
    if (
      this.disposed ||
      this.credentials === null ||
      this.activeUserKey === null ||
      this.testMode
    ) {
      this.nextSyncAt = null;
      return;
    }

    const settings = await this.cacheStore.getSettings();
    const activeUser = await this.getActiveUserEntry();
    const delayMs = resolveDelayUntilNextSync(settings.syncIntervalHours, activeUser);
    if (delayMs <= 0) {
      if (runDueSyncInBackground) {
        this.nextSyncAt = new Date().toISOString();
        void this.startSyncIfNeeded(false);
        return;
      }
      await this.startSyncIfNeeded(false);
      return;
    }

    this.scheduleTimer(delayMs);
  }

  private scheduleTimer(delayMs: number): void {
    if (this.disposed || this.credentials === null) {
      return;
    }

    this.clearTimer();
    const dueAt = new Date(Date.now() + delayMs).toISOString();
    this.nextSyncAt = dueAt;
    this.timer = setTimeout(() => {
      void this.startSyncIfNeeded(false);
    }, delayMs);
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private async startSyncIfNeeded(force: boolean): Promise<void> {
    if (
      this.disposed ||
      this.credentials === null ||
      this.activeUserKey === null ||
      this.testMode
    ) {
      return;
    }

    if (this.syncPromise !== null) {
      await this.syncPromise;
      return;
    }

    if (!force && !(await this.shouldSyncNow())) {
      await this.rescheduleForActiveUser(false);
      return;
    }

    this.syncPromise = this.runSyncForActiveUser().finally(() => {
      this.syncPromise = null;
    });
    await this.syncPromise;
  }

  private async shouldSyncNow(): Promise<boolean> {
    const settings = await this.cacheStore.getSettings();
    const activeUser = await this.getActiveUserEntry();
    return resolveDelayUntilNextSync(settings.syncIntervalHours, activeUser) <= 0;
  }

  private async runSyncForActiveUser(): Promise<void> {
    if (this.credentials === null || this.activeUserKey === null) {
      return;
    }

    const credentials = this.credentials;
    const previousUser = await this.cacheStore.getUser(credentials.email);
    const previousRegionsById = buildRegionByIdMap(previousUser?.regions ?? []);
    const syncStartedAt = new Date().toISOString();
    await this.markUserSyncStarted(credentials.email, syncStartedAt);

    try {
      const cfHomeDir = await ensureCfHomeDir(this.context);
      const regions = await syncAllRegions(
        credentials,
        cfHomeDir,
        previousRegionsById
      );
      await this.markUserSyncCompleted(credentials.email, syncStartedAt, regions);
    } catch (error) {
      const errorMessage = toSafeErrorMessage(error);
      await this.markUserSyncFailed(credentials.email, syncStartedAt, errorMessage);
      this.outputChannel.appendLine(`[cache] Sync failed: ${errorMessage}`);
    }

    await this.rescheduleForActiveUser(false);
    const snapshot = await this.getRuntimeSnapshot();
    this.emitSnapshot(snapshot);
  }

  private async markUserSyncStarted(
    email: string,
    syncStartedAt: string
  ): Promise<void> {
    await this.cacheStore.upsertUser(email, (currentUser) => {
      return {
        email,
        syncInProgress: true,
        lastSyncStartedAt: syncStartedAt,
        lastSyncCompletedAt: currentUser?.lastSyncCompletedAt ?? null,
        lastSyncError: '',
        regions: currentUser?.regions ?? [],
      };
    });
    const snapshot = await this.getRuntimeSnapshot();
    this.emitSnapshot(snapshot);
  }

  private async markUserSyncCompleted(
    email: string,
    syncStartedAt: string,
    regions: readonly CachedRegionEntry[]
  ): Promise<void> {
    const completedAt = new Date().toISOString();
    await this.cacheStore.upsertUser(email, () => {
      return {
        email,
        syncInProgress: false,
        lastSyncStartedAt: syncStartedAt,
        lastSyncCompletedAt: completedAt,
        lastSyncError: '',
        regions,
      };
    });

    this.outputChannel.appendLine(
      `[cache] Sync completed for ${maskEmail(email)} with ${String(regions.length)} regions.`
    );
  }

  private async markUserSyncFailed(
    email: string,
    syncStartedAt: string,
    errorMessage: string
  ): Promise<void> {
    await this.cacheStore.upsertUser(email, (currentUser) => {
      return {
        email,
        syncInProgress: false,
        lastSyncStartedAt: syncStartedAt,
        lastSyncCompletedAt: currentUser?.lastSyncCompletedAt ?? null,
        lastSyncError: errorMessage,
        regions: currentUser?.regions ?? [],
      };
    });
  }

  private emitSnapshot(snapshot: CacheRuntimeSnapshot): void {
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }

  private async seedTestModeCache(credentials: CfCredentials | null): Promise<void> {
    if (credentials === null) {
      return;
    }

    const updatedAt = new Date().toISOString();
    const regions = SAP_BTP_REGIONS.map((region) => {
      return {
        regionId: region.id,
        regionCode: toHyphenatedRegionCode(region.id),
        area: region.area,
        displayName: region.displayName,
        accessState: 'accessible',
        accessMessage: '',
        orgs: [],
        updatedAt,
      } satisfies CachedRegionEntry;
    });

    await this.cacheStore.upsertUser(credentials.email, () => {
      return {
        email: credentials.email,
        syncInProgress: false,
        lastSyncStartedAt: updatedAt,
        lastSyncCompletedAt: updatedAt,
        lastSyncError: '',
        regions,
      };
    });
  }
}

class ListenerDisposable implements vscode.Disposable {
  constructor(private readonly onDispose: () => void) {}

  dispose(): void {
    this.onDispose();
  }
}

async function syncAllRegions(
  credentials: CfCredentials,
  cfHomeDir: string,
  previousRegionsById: ReadonlyMap<string, CachedRegionEntry>
): Promise<readonly CachedRegionEntry[]> {
  const regions: CachedRegionEntry[] = [];
  for (const region of SAP_BTP_REGIONS) {
    const syncedRegion = await syncSingleRegion(
      credentials,
      cfHomeDir,
      region,
      previousRegionsById.get(region.id) ?? null
    );
    regions.push(syncedRegion);
  }
  return regions;
}

async function syncSingleRegion(
  credentials: CfCredentials,
  cfHomeDir: string,
  region: (typeof SAP_BTP_REGIONS)[number],
  previousRegion: CachedRegionEntry | null
): Promise<CachedRegionEntry> {
  const regionCode = toHyphenatedRegionCode(region.id);
  const apiEndpoint = getCfApiEndpoint(regionCode);
  const updatedAt = new Date().toISOString();

  try {
    const loginInfo = await fetchCfLoginInfo(apiEndpoint);
    const token = await cfLogin(
      loginInfo.authorizationEndpoint,
      credentials.email,
      credentials.password
    );
    const session = { token, apiEndpoint };
    const orgs = await syncOrgsForRegion(
      session,
      credentials,
      regionCode,
      cfHomeDir,
      previousRegion
    );
    return {
      regionId: region.id,
      regionCode,
      area: region.area,
      displayName: region.displayName,
      accessState: 'accessible',
      accessMessage: '',
      orgs,
      updatedAt,
    };
  } catch (error) {
    const message = toSafeErrorMessage(error);
    return {
      regionId: region.id,
      regionCode,
      area: region.area,
      displayName: region.displayName,
      accessState: resolveAccessStateFromMessage(message),
      accessMessage: message,
      orgs: [],
      updatedAt,
    };
  }
}

async function syncOrgsForRegion(
  session: CfSession,
  credentials: CfCredentials,
  regionCode: string,
  cfHomeDir: string,
  previousRegion: CachedRegionEntry | null
): Promise<readonly CachedOrgEntry[]> {
  const orgs = await fetchOrgs(session);
  const syncedOrgs: CachedOrgEntry[] = [];
  const previousOrgsByGuid = buildOrgByGuidMap(previousRegion?.orgs ?? []);
  for (const org of orgs) {
    const spaces = await syncSpacesForOrg(
      session,
      credentials,
      regionCode,
      org,
      cfHomeDir,
      previousOrgsByGuid.get(org.guid) ?? null
    );
    syncedOrgs.push({
      guid: org.guid,
      name: org.name,
      spaces,
    });
  }
  return syncedOrgs;
}

async function syncSpacesForOrg(
  session: CfSession,
  credentials: CfCredentials,
  regionCode: string,
  org: { readonly guid: string; readonly name: string },
  cfHomeDir: string,
  previousOrg: CachedOrgEntry | null
): Promise<readonly CachedSpaceEntry[]> {
  const spaces = await fetchSpaces(session, org.guid);
  const syncedSpaces: CachedSpaceEntry[] = [];
  const previousSpacesByName = buildSpaceByNameMap(previousOrg?.spaces ?? []);

  for (const space of spaces) {
    const apps = await syncAppsForSpace(
      credentials,
      regionCode,
      org.name,
      space,
      cfHomeDir,
      previousSpacesByName.get(space.name)?.apps ?? null
    );
    syncedSpaces.push({
      guid: space.guid,
      name: space.name,
      apps,
    });
  }

  return syncedSpaces;
}

async function syncAppsForSpace(
  credentials: CfCredentials,
  regionCode: string,
  orgName: string,
  space: { readonly guid: string; readonly name: string },
  cfHomeDir: string,
  previousApps: readonly CachedAppEntry[] | null
): Promise<readonly CachedAppEntry[]> {
  try {
    const runningApps = await fetchStartedAppsViaCfCli({
      apiEndpoint: getCfApiEndpoint(regionCode),
      email: credentials.email,
      password: credentials.password,
      orgName,
      spaceName: space.name,
      cfHomeDir,
    });

    return runningApps.map((app) => ({
      id: app.name,
      name: app.name,
      runningInstances: app.runningInstances,
    }));
  } catch (error) {
    if (previousApps !== null) {
      return previousApps;
    }

    throw error;
  }
}

function resolveDelayUntilNextSync(
  syncIntervalHours: SyncIntervalHours,
  userEntry: CachedUserEntry | null
): number {
  const intervalMs = syncIntervalHours * HOURS_TO_MS;
  const lastCompletedAt = userEntry?.lastSyncCompletedAt ?? null;
  if (lastCompletedAt === null) {
    return 0;
  }

  const lastCompletedAtMs = Date.parse(lastCompletedAt);
  if (Number.isNaN(lastCompletedAtMs)) {
    return 0;
  }

  const dueAtMs = lastCompletedAtMs + intervalMs;
  return dueAtMs - Date.now();
}

function resolveAccessStateFromMessage(message: string): RegionAccessState {
  const normalized = message.toLowerCase();
  if (
    normalized.includes('invalid sap credentials') ||
    normalized.includes('authentication failed') ||
    normalized.includes('status 401') ||
    normalized.includes('status 403')
  ) {
    return 'inaccessible';
  }

  if (normalized.includes('status 404')) {
    return 'inaccessible';
  }

  return 'error';
}

function buildRegionAccessMap(
  regions: readonly CachedRegionEntry[]
): Record<string, RegionAccessState> {
  const map: Record<string, RegionAccessState> = {};
  for (const region of regions) {
    map[region.regionId] = region.accessState;
  }
  return map;
}

function buildRegionByIdMap(
  regions: readonly CachedRegionEntry[]
): ReadonlyMap<string, CachedRegionEntry> {
  const entries = regions.map((region) => [region.regionId, region] as const);
  return new Map(entries);
}

function buildOrgByGuidMap(
  orgs: readonly CachedOrgEntry[]
): ReadonlyMap<string, CachedOrgEntry> {
  const entries = orgs.map((org) => [org.guid, org] as const);
  return new Map(entries);
}

function buildSpaceByNameMap(
  spaces: readonly CachedSpaceEntry[]
): ReadonlyMap<string, CachedSpaceEntry> {
  const entries = spaces.map((space) => [space.name, space] as const);
  return new Map(entries);
}

function toSafeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const normalizedMessage = error.message.trim();
    if (normalizedMessage.length > 0) {
      return normalizedMessage;
    }
  }
  return 'Unknown cache synchronization error.';
}

function maskEmail(email: string): string {
  const normalized = email.trim();
  const atIndex = normalized.indexOf('@');
  if (atIndex <= 1) {
    return '***';
  }

  const userPrefix = normalized.slice(0, 1);
  const domain = normalized.slice(atIndex);
  return `${userPrefix}***${domain}`;
}
