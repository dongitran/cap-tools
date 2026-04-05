import type * as vscode from 'vscode';
import type {
  AppCache,
  CacheEntry,
  CfApp,
  CfOrg,
  CfSpace,
  OrgCache,
  SyncProgress,
} from '../types/index.js';
import { logger } from './logger.js';

const CACHE_KEY = 'sapDevSuite.appCache';
const CACHE_VERSION = 2 as const;

function nowMs(): number {
  return Date.now();
}

function isExpired(entry: CacheEntry<unknown>, ttlMs: number): boolean {
  return nowMs() - entry.fetchedAt > ttlMs;
}

export class CacheManager {
  private cache: AppCache;

  constructor(private readonly state: vscode.Memento) {
    const saved = state.get<AppCache>(CACHE_KEY);
    if (saved?.version === CACHE_VERSION) {
      this.cache = saved;
    } else {
      this.cache = { version: CACHE_VERSION, regions: {} };
    }
  }

  // ─── Orgs ───────────────────────────────────────────────────────────────────

  getOrgs(regionId: string, ttlMs = 4 * 60 * 60 * 1000): CfOrg[] | undefined {
    const region = this.cache.regions[regionId];
    if (region === undefined) {return undefined;}
    const entry = region.orgs;
    if (isExpired(entry, ttlMs)) {return undefined;}
    return entry.data;
  }

  setOrgs(regionId: string, orgs: CfOrg[]): void {
    this.ensureRegion(regionId);
    const region = this.cache.regions[regionId];
    if (region !== undefined) {
      region.orgs = { data: orgs, fetchedAt: nowMs() };
    }
    this.persist();
  }

  // ─── Spaces ─────────────────────────────────────────────────────────────────

  getSpaces(regionId: string, orgName: string, ttlMs = 4 * 60 * 60 * 1000): CfSpace[] | undefined {
    const entry = this.cache.regions[regionId]?.orgData[orgName]?.spaces;
    if (entry === undefined || isExpired(entry, ttlMs)) {return undefined;}
    return entry.data;
  }

  setSpaces(regionId: string, orgName: string, spaces: CfSpace[]): void {
    this.ensureOrg(regionId, orgName);
    const org = this.cache.regions[regionId]?.orgData[orgName];
    if (org !== undefined) {
      org.spaces = { data: spaces, fetchedAt: nowMs() };
    }
    this.persist();
  }

  // ─── Apps ───────────────────────────────────────────────────────────────────

  getApps(regionId: string, orgName: string, spaceName?: string, ttlMs = 4 * 60 * 60 * 1000): CfApp[] | undefined {
    const key = spaceName ?? '__org__';
    const entry = this.cache.regions[regionId]?.orgData[orgName]?.apps[key];
    if (entry === undefined || isExpired(entry, ttlMs)) {return undefined;}
    return entry.data;
  }

  setApps(regionId: string, orgName: string, apps: CfApp[], spaceName?: string): void {
    this.ensureOrg(regionId, orgName);
    const key = spaceName ?? '__org__';
    const org = this.cache.regions[regionId]?.orgData[orgName];
    if (org !== undefined) {
      org.apps[key] = { data: apps, fetchedAt: nowMs() };
    }
    this.persist();
  }

  // ─── Sync Progress ──────────────────────────────────────────────────────────

  getSyncProgress(): SyncProgress {
    return this.cache.syncProgress ?? { status: 'idle', done: 0, total: 0 };
  }

  setSyncProgress(progress: SyncProgress): void {
    this.cache.syncProgress = progress;
    this.persist();
  }

  // ─── Full Cache Ops ─────────────────────────────────────────────────────────

  clear(): void {
    this.cache = { version: CACHE_VERSION, regions: {} };
    this.persist();
    logger.info('Cache cleared');
  }

  getStats(): { regions: number; orgs: number; apps: number } {
    let orgs = 0;
    let apps = 0;
    for (const region of Object.values(this.cache.regions)) {
      if (region === undefined) {continue;}
      orgs += Object.keys(region.orgData).length;
      for (const org of Object.values(region.orgData)) {
        if (org === undefined) {continue;}
        apps += Object.values(org.apps).reduce((sum, entry) => sum + (entry?.data.length ?? 0), 0);
      }
    }
    return { regions: Object.keys(this.cache.regions).length, orgs, apps };
  }

  // ─── Internals ──────────────────────────────────────────────────────────────

  private ensureRegion(regionId: string): void {
    if (this.cache.regions[regionId] !== undefined) {return;}
    this.cache.regions[regionId] = {
      orgs: { data: [], fetchedAt: 0 },
      orgData: {} as OrgCache,
    };
  }

  private ensureOrg(regionId: string, orgName: string): void {
    this.ensureRegion(regionId);
    const region = this.cache.regions[regionId];
    if (region === undefined) {return;}
    if (region.orgData[orgName] !== undefined) {return;}
    region.orgData[orgName] = {
      spaces: { data: [], fetchedAt: 0 },
      apps: {},
    };
  }

  private persist(): void {
    this.state.update(CACHE_KEY, this.cache).then(undefined, err => {
      logger.error('Failed to persist cache', err);
    });
  }
}
