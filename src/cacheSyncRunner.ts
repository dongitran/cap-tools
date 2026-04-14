import {
  cfLogin,
  fetchCfLoginInfo,
  fetchOrgs,
  fetchSpaces,
  fetchStartedAppsViaCfCli,
  getCfApiEndpoint,
} from './cfClient';
import type { CfSession } from './cfClient';
import { resolveAccessStateFromMessage, toSafeErrorMessage } from './cacheSyncServiceSupport';
import type {
  CachedAppEntry,
  CachedOrgEntry,
  CachedRegionEntry,
  CachedSpaceEntry,
  CachedUserEntry,
  SyncIntervalHours,
} from './cacheModels';
import type { CfCredentials } from './credentialStore';
import { SAP_BTP_REGIONS, toHyphenatedRegionCode } from './regions';

const HOURS_TO_MS = 60 * 60 * 1000;

export class SyncCancelledError extends Error {}

export async function syncAllRegions(
  credentials: CfCredentials,
  cfHomeDir: string,
  previousRegionsById: ReadonlyMap<string, CachedRegionEntry>,
  resolveCancellationReason: () => string | null
): Promise<readonly CachedRegionEntry[]> {
  const regions: CachedRegionEntry[] = [];
  for (const region of SAP_BTP_REGIONS) {
    const cancellationReason = resolveCancellationReason();
    if (cancellationReason !== null) {
      throw new SyncCancelledError(cancellationReason);
    }

    const syncedRegion = await syncSingleRegion(
      credentials,
      cfHomeDir,
      region,
      previousRegionsById.get(region.id) ?? null
    );
    regions.push(syncedRegion);

    const nextCancellationReason = resolveCancellationReason();
    if (nextCancellationReason !== null) {
      throw new SyncCancelledError(nextCancellationReason);
    }
  }
  return regions;
}

export function resolveDelayUntilNextSync(
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
    const accessState = resolveAccessStateFromMessage(message);
    const fallbackOrgs = accessState === 'error' ? previousRegion?.orgs ?? [] : [];
    return {
      regionId: region.id,
      regionCode,
      area: region.area,
      displayName: region.displayName,
      accessState,
      accessMessage: message,
      orgs: fallbackOrgs,
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
