export const DEFAULT_SYNC_INTERVAL_HOURS = 24;

export const SYNC_INTERVAL_OPTIONS_HOURS = [12, 24, 48, 96] as const;

export type SyncIntervalHours = (typeof SYNC_INTERVAL_OPTIONS_HOURS)[number];

export type RegionAccessState =
  | 'unknown'
  | 'accessible'
  | 'inaccessible'
  | 'error';

export interface CachedAppEntry {
  readonly id: string;
  readonly name: string;
  readonly runningInstances: number;
}

export interface CachedSpaceEntry {
  readonly guid: string;
  readonly name: string;
  readonly apps: readonly CachedAppEntry[];
}

export interface CachedOrgEntry {
  readonly guid: string;
  readonly name: string;
  readonly spaces: readonly CachedSpaceEntry[];
}

export interface CachedRegionEntry {
  readonly regionId: string;
  readonly regionCode: string;
  readonly area: string;
  readonly displayName: string;
  readonly accessState: RegionAccessState;
  readonly accessMessage: string;
  readonly orgs: readonly CachedOrgEntry[];
  readonly updatedAt: string;
}

export interface CachedUserEntry {
  readonly email: string;
  readonly syncInProgress: boolean;
  readonly lastSyncStartedAt: string | null;
  readonly lastSyncCompletedAt: string | null;
  readonly lastSyncError: string;
  readonly regions: readonly CachedRegionEntry[];
}

export interface CacheSettings {
  readonly syncIntervalHours: SyncIntervalHours;
}

export interface CacheState {
  readonly version: 1;
  readonly settings: CacheSettings;
  readonly users: Record<string, CachedUserEntry>;
}

export function isSyncIntervalHours(
  value: number
): value is SyncIntervalHours {
  return SYNC_INTERVAL_OPTIONS_HOURS.includes(value as SyncIntervalHours);
}

