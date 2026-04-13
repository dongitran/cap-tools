import type * as vscode from 'vscode';

import {
  DEFAULT_SYNC_INTERVAL_HOURS,
  isSyncIntervalHours,
} from './cacheModels';
import type {
  CachedAppEntry,
  CachedOrgEntry,
  CachedRegionEntry,
  CachedSpaceEntry,
  CacheSettings,
  CacheState,
  ExportRootFolderCacheEntry,
  CachedUserEntry,
  RegionAccessState,
  SyncIntervalHours,
} from './cacheModels';

const CACHE_STATE_KEY = 'sapTools.cache.state.v1';

const EMPTY_USERS: Record<string, CachedUserEntry> = Object.freeze({});
const EMPTY_EXPORT_ROOT_FOLDERS: Record<string, ExportRootFolderCacheEntry> =
  Object.freeze({});

export class CacheStore {
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly context: vscode.ExtensionContext) {}

  readState(): Promise<CacheState> {
    const rawState = this.context.globalState.get<unknown>(CACHE_STATE_KEY);
    return Promise.resolve(normalizeCacheState(rawState));
  }

  async writeState(state: CacheState): Promise<void> {
    await this.context.globalState.update(CACHE_STATE_KEY, state);
  }

  async getSettings(): Promise<CacheSettings> {
    const state = await this.readState();
    return state.settings;
  }

  async setSyncIntervalHours(hours: SyncIntervalHours): Promise<CacheSettings> {
    const nextState = await this.updateState((state) => {
      return {
        ...state,
        settings: {
          syncIntervalHours: hours,
        },
      };
    });
    return nextState.settings;
  }

  async getUser(email: string): Promise<CachedUserEntry | null> {
    const normalizedKey = normalizeUserEmail(email);
    if (normalizedKey.length === 0) {
      return null;
    }

    const state = await this.readState();
    const cachedUser = state.users[normalizedKey];
    return cachedUser ?? null;
  }

  async getExportRootFolder(
    email: string,
    regionCode: string,
    orgGuid: string
  ): Promise<ExportRootFolderCacheEntry | null> {
    const scopeKey = buildExportRootFolderScopeKey(email, regionCode, orgGuid);
    if (scopeKey.length === 0) {
      return null;
    }

    const state = await this.readState();
    const cachedEntry = state.exportRootFolders[scopeKey];
    return cachedEntry ?? null;
  }

  async setExportRootFolder(
    email: string,
    regionCode: string,
    orgGuid: string,
    rootFolderPath: string
  ): Promise<ExportRootFolderCacheEntry> {
    const scopeKey = buildExportRootFolderScopeKey(email, regionCode, orgGuid);
    if (scopeKey.length === 0) {
      throw new Error('Cannot cache export root folder for an empty scope key.');
    }

    const normalizedRootFolderPath = rootFolderPath.trim();
    if (normalizedRootFolderPath.length === 0) {
      throw new Error('Cannot cache an empty export root folder path.');
    }

    const nextEntry: ExportRootFolderCacheEntry = {
      rootFolderPath: normalizedRootFolderPath,
      updatedAt: new Date().toISOString(),
    };

    await this.updateState((state) => {
      return {
        ...state,
        exportRootFolders: {
          ...state.exportRootFolders,
          [scopeKey]: nextEntry,
        },
      };
    });

    return nextEntry;
  }

  async deleteExportRootFolder(
    email: string,
    regionCode: string,
    orgGuid: string
  ): Promise<void> {
    const scopeKey = buildExportRootFolderScopeKey(email, regionCode, orgGuid);
    if (scopeKey.length === 0) {
      return;
    }

    await this.updateState((state) => {
      if (state.exportRootFolders[scopeKey] === undefined) {
        return state;
      }

      const remainingEntries = Object.fromEntries(
        Object.entries(state.exportRootFolders).filter(([key]) => key !== scopeKey)
      );
      return {
        ...state,
        exportRootFolders: remainingEntries,
      };
    });
  }

  async upsertUser(
    email: string,
    updater: (current: CachedUserEntry | null) => CachedUserEntry
  ): Promise<CachedUserEntry> {
    const normalizedKey = normalizeUserEmail(email);
    if (normalizedKey.length === 0) {
      throw new Error('Cannot upsert cache user with an empty email key.');
    }

    const nextState = await this.updateState((state) => {
      const currentUser = state.users[normalizedKey] ?? null;
      const updatedUser = updater(currentUser);

      return {
        ...state,
        users: {
          ...state.users,
          [normalizedKey]: updatedUser,
        },
      };
    });

    const storedUser = nextState.users[normalizedKey];
    if (storedUser === undefined) {
      throw new Error('Failed to update cache user state.');
    }

    return storedUser;
  }

  async updateState(
    updater: (current: CacheState) => CacheState
  ): Promise<CacheState> {
    return this.enqueueWrite(async () => {
      const currentState = await this.readState();
      const nextState = updater(currentState);
      await this.writeState(nextState);
      return nextState;
    });
  }

  private enqueueWrite<T>(operation: () => Promise<T>): Promise<T> {
    const nextOperation = this.writeQueue.then(operation, operation);
    this.writeQueue = nextOperation.then(
      () => undefined,
      () => undefined
    );
    return nextOperation;
  }
}

export function normalizeUserEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function normalizeRegionCode(regionCode: string): string {
  return regionCode.trim().toLowerCase();
}

export function normalizeOrgGuid(orgGuid: string): string {
  return orgGuid.trim().toLowerCase();
}

export function buildExportRootFolderScopeKey(
  email: string,
  regionCode: string,
  orgGuid: string
): string {
  const normalizedEmail = normalizeUserEmail(email);
  const normalizedRegionCode = normalizeRegionCode(regionCode);
  const normalizedOrgGuid = normalizeOrgGuid(orgGuid);
  if (
    normalizedEmail.length === 0 ||
    normalizedRegionCode.length === 0 ||
    normalizedOrgGuid.length === 0
  ) {
    return '';
  }

  return `${normalizedEmail}::${normalizedRegionCode}::${normalizedOrgGuid}`;
}

function normalizeCacheState(rawState: unknown): CacheState {
  if (!isRecord(rawState)) {
    return createDefaultCacheState();
  }

  const rawVersion = rawState['version'];
  if (rawVersion !== 1) {
    return createDefaultCacheState();
  }

  const rawSettings = normalizeSettings(rawState['settings']);
  const rawUsers = normalizeUsers(rawState['users']);
  const rawExportRootFolders = normalizeExportRootFolders(rawState['exportRootFolders']);

  return {
    version: 1,
    settings: rawSettings,
    users: rawUsers,
    exportRootFolders: rawExportRootFolders,
  };
}

function normalizeSettings(rawSettings: unknown): CacheSettings {
  if (!isRecord(rawSettings)) {
    return {
      syncIntervalHours: DEFAULT_SYNC_INTERVAL_HOURS,
    };
  }

  const rawInterval = rawSettings['syncIntervalHours'];
  if (typeof rawInterval !== 'number' || !isSyncIntervalHours(rawInterval)) {
    return {
      syncIntervalHours: DEFAULT_SYNC_INTERVAL_HOURS,
    };
  }

  return {
    syncIntervalHours: rawInterval,
  };
}

function normalizeUsers(rawUsers: unknown): Record<string, CachedUserEntry> {
  if (!isRecord(rawUsers)) {
    return EMPTY_USERS;
  }

  const users: Record<string, CachedUserEntry> = {};
  for (const [emailKey, rawUser] of Object.entries(rawUsers)) {
    const normalizedEmailKey = normalizeUserEmail(emailKey);
    if (normalizedEmailKey.length === 0) {
      continue;
    }

    const normalizedUser = normalizeCachedUser(rawUser);
    if (normalizedUser === null) {
      continue;
    }

    users[normalizedEmailKey] = normalizedUser;
  }

  return users;
}

function normalizeExportRootFolders(
  rawExportRootFolders: unknown
): Record<string, ExportRootFolderCacheEntry> {
  if (!isRecord(rawExportRootFolders)) {
    return EMPTY_EXPORT_ROOT_FOLDERS;
  }

  const entries: Record<string, ExportRootFolderCacheEntry> = {};
  for (const [rawScopeKey, rawEntry] of Object.entries(rawExportRootFolders)) {
    const scopeKey = normalizeScopeKey(rawScopeKey);
    if (scopeKey.length === 0) {
      continue;
    }

    const normalizedEntry = normalizeExportRootFolderEntry(rawEntry);
    if (normalizedEntry === null) {
      continue;
    }

    entries[scopeKey] = normalizedEntry;
  }

  return entries;
}

function normalizeScopeKey(scopeKey: string): string {
  const [emailPartRaw, regionCodePartRaw, orgGuidPartRaw] = scopeKey
    .split('::')
    .map((part) => part.trim());
  if (
    emailPartRaw === undefined ||
    regionCodePartRaw === undefined ||
    orgGuidPartRaw === undefined
  ) {
    return '';
  }

  return buildExportRootFolderScopeKey(
    emailPartRaw,
    regionCodePartRaw,
    orgGuidPartRaw
  );
}

function normalizeExportRootFolderEntry(
  rawEntry: unknown
): ExportRootFolderCacheEntry | null {
  if (!isRecord(rawEntry)) {
    return null;
  }

  const rootFolderPath = readString(rawEntry['rootFolderPath']);
  if (rootFolderPath.length === 0) {
    return null;
  }

  const updatedAt = readString(rawEntry['updatedAt']);
  if (updatedAt.length === 0) {
    return null;
  }

  return {
    rootFolderPath,
    updatedAt,
  };
}

function normalizeCachedUser(rawUser: unknown): CachedUserEntry | null {
  if (!isRecord(rawUser)) {
    return null;
  }

  const email = readString(rawUser['email']);
  if (email.length === 0) {
    return null;
  }

  const syncInProgress = rawUser['syncInProgress'] === true;
  const lastSyncStartedAt = readNullableString(rawUser['lastSyncStartedAt']);
  const lastSyncCompletedAt = readNullableString(rawUser['lastSyncCompletedAt']);
  const lastSyncError = readString(rawUser['lastSyncError']);
  const regions = normalizeRegions(rawUser['regions']);

  return {
    email,
    syncInProgress,
    lastSyncStartedAt,
    lastSyncCompletedAt,
    lastSyncError,
    regions,
  };
}

function normalizeRegions(rawRegions: unknown): readonly CachedRegionEntry[] {
  if (!Array.isArray(rawRegions)) {
    return [];
  }

  const regions: CachedRegionEntry[] = [];
  for (const rawRegion of rawRegions) {
    const normalizedRegion = normalizeRegion(rawRegion);
    if (normalizedRegion !== null) {
      regions.push(normalizedRegion);
    }
  }
  return regions;
}

function normalizeRegion(rawRegion: unknown): CachedRegionEntry | null {
  if (!isRecord(rawRegion)) {
    return null;
  }

  const regionId = readString(rawRegion['regionId']);
  const regionCode = readString(rawRegion['regionCode']);
  const area = readString(rawRegion['area']);
  const displayName = readString(rawRegion['displayName']);
  const accessState = normalizeRegionAccessState(rawRegion['accessState']);
  const accessMessage = readString(rawRegion['accessMessage']);
  const updatedAt = readString(rawRegion['updatedAt']);
  const orgs = normalizeOrgs(rawRegion['orgs']);

  if (regionId.length === 0 || regionCode.length === 0 || area.length === 0) {
    return null;
  }

  return {
    regionId,
    regionCode,
    area,
    displayName,
    accessState,
    accessMessage,
    orgs,
    updatedAt,
  };
}

function normalizeOrgs(rawOrgs: unknown): readonly CachedOrgEntry[] {
  if (!Array.isArray(rawOrgs)) {
    return [];
  }

  const orgs: CachedOrgEntry[] = [];
  for (const rawOrg of rawOrgs) {
    const normalizedOrg = normalizeOrg(rawOrg);
    if (normalizedOrg !== null) {
      orgs.push(normalizedOrg);
    }
  }
  return orgs;
}

function normalizeOrg(rawOrg: unknown): CachedOrgEntry | null {
  if (!isRecord(rawOrg)) {
    return null;
  }

  const guid = readString(rawOrg['guid']);
  const name = readString(rawOrg['name']);
  if (guid.length === 0 || name.length === 0) {
    return null;
  }

  return {
    guid,
    name,
    spaces: normalizeSpaces(rawOrg['spaces']),
  };
}

function normalizeSpaces(rawSpaces: unknown): readonly CachedSpaceEntry[] {
  if (!Array.isArray(rawSpaces)) {
    return [];
  }

  const spaces: CachedSpaceEntry[] = [];
  for (const rawSpace of rawSpaces) {
    const normalizedSpace = normalizeSpace(rawSpace);
    if (normalizedSpace !== null) {
      spaces.push(normalizedSpace);
    }
  }
  return spaces;
}

function normalizeSpace(rawSpace: unknown): CachedSpaceEntry | null {
  if (!isRecord(rawSpace)) {
    return null;
  }

  const guid = readString(rawSpace['guid']);
  const name = readString(rawSpace['name']);
  if (guid.length === 0 || name.length === 0) {
    return null;
  }

  return {
    guid,
    name,
    apps: normalizeApps(rawSpace['apps']),
  };
}

function normalizeApps(rawApps: unknown): readonly CachedAppEntry[] {
  if (!Array.isArray(rawApps)) {
    return [];
  }

  const apps: CachedAppEntry[] = [];
  for (const rawApp of rawApps) {
    const normalizedApp = normalizeApp(rawApp);
    if (normalizedApp !== null) {
      apps.push(normalizedApp);
    }
  }
  return apps;
}

function normalizeApp(rawApp: unknown): CachedAppEntry | null {
  if (!isRecord(rawApp)) {
    return null;
  }

  const id = readString(rawApp['id']);
  const name = readString(rawApp['name']);
  const runningInstancesRaw = rawApp['runningInstances'];
  if (
    id.length === 0 ||
    name.length === 0 ||
    typeof runningInstancesRaw !== 'number' ||
    !Number.isFinite(runningInstancesRaw) ||
    runningInstancesRaw < 0
  ) {
    return null;
  }

  return {
    id,
    name,
    runningInstances: runningInstancesRaw,
  };
}

function normalizeRegionAccessState(rawState: unknown): RegionAccessState {
  if (rawState === 'accessible') {
    return 'accessible';
  }
  if (rawState === 'inaccessible') {
    return 'inaccessible';
  }
  if (rawState === 'error') {
    return 'error';
  }
  return 'unknown';
}

function readString(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : '';
}

function readNullableString(value: unknown): string | null {
  if (value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function createDefaultCacheState(): CacheState {
  return {
    version: 1,
    settings: {
      syncIntervalHours: DEFAULT_SYNC_INTERVAL_HOURS,
    },
    users: EMPTY_USERS,
    exportRootFolders: EMPTY_EXPORT_ROOT_FOLDERS,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
