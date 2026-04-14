import type {
  CachedOrgEntry,
  CachedRegionEntry,
  CachedSpaceEntry,
  RegionAccessState,
} from './cacheModels';

export function resolveAccessStateFromMessage(message: string): RegionAccessState {
  const normalized = message.toLowerCase();
  const statusMatch = /\bstatus\s+(\d{3})\b/.exec(normalized);
  if (statusMatch !== null) {
    const statusCode = Number.parseInt(statusMatch[1] ?? '0', 10);
    if (statusCode === 401 || statusCode === 403 || statusCode === 404) {
      return 'inaccessible';
    }
    return 'error';
  }

  if (normalized.includes('invalid sap credentials')) {
    return 'inaccessible';
  }

  if (normalized.includes('authentication failed')) {
    return 'inaccessible';
  }

  return 'error';
}

export function buildRegionAccessMap(
  regions: readonly CachedRegionEntry[]
): Record<string, RegionAccessState> {
  const map: Record<string, RegionAccessState> = {};
  for (const region of regions) {
    map[region.regionId] = region.accessState;
  }
  return map;
}

export function buildRegionByIdMap(
  regions: readonly CachedRegionEntry[]
): ReadonlyMap<string, CachedRegionEntry> {
  const entries = regions.map((region) => [region.regionId, region] as const);
  return new Map(entries);
}

export function buildOrgByGuidMap(
  orgs: readonly CachedOrgEntry[]
): ReadonlyMap<string, CachedOrgEntry> {
  const entries = orgs.map((org) => [org.guid, org] as const);
  return new Map(entries);
}

export function buildSpaceByNameMap(
  spaces: readonly CachedSpaceEntry[]
): ReadonlyMap<string, CachedSpaceEntry> {
  const entries = spaces.map((space) => [space.name, space] as const);
  return new Map(entries);
}

export function toSafeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const normalizedMessage = error.message.trim();
    if (normalizedMessage.length > 0) {
      return normalizedMessage;
    }
  }
  return 'Unknown cache synchronization error.';
}

export function maskEmail(email: string): string {
  const normalized = email.trim();
  const atIndex = normalized.indexOf('@');
  if (atIndex <= 1) {
    return '***';
  }

  const userPrefix = normalized.slice(0, 1);
  const domain = normalized.slice(atIndex);
  return `${userPrefix}***${domain}`;
}
