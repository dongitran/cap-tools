import { describe, it, expect, beforeEach } from 'vitest';
import { CacheManager } from '../../src/core/cacheManager.js';
import type { CfApp, CfOrg, CfSpace } from '../../src/types/index.js';

// Minimal in-memory Memento mock
interface Simplememento {
  keys(): readonly string[];
  get<T>(key: string, defaultValue?: T): T;
  update(key: string, value: unknown): Promise<void>;
}
function createMemento(): Simplememento {
  const store = new Map<string, unknown>();
  return {
    keys: () => [...store.keys()],
    get<T>(key: string, defaultValue?: T): T {
      return (store.has(key) ? store.get(key) : defaultValue) as T;
    },
    update(key: string, value: unknown): Promise<void> {
      store.set(key, value);
      return Promise.resolve();
    },
  };
}

const ORG: CfOrg[] = [{ name: 'my-org', guid: '1' }];
const SPACES: CfSpace[] = [{ name: 'dev', guid: '2' }];
const APPS: CfApp[] = [
  { name: 'app-a', state: 'STARTED', urls: ['app-a.example.com'] },
  { name: 'app-b', state: 'STOPPED', urls: [] },
];

describe('CacheManager', () => {
  let cache: CacheManager;

  beforeEach(() => {
    cache = new CacheManager(createMemento());
  });

  // ─── Orgs ──────────────────────────────────────────────────────────────────

  it('returns undefined for uncached orgs', () => {
    expect(cache.getOrgs('ap11')).toBeUndefined();
  });

  it('stores and retrieves orgs', () => {
    cache.setOrgs('ap11', ORG);
    expect(cache.getOrgs('ap11')).toEqual(ORG);
  });

  it('returns undefined for different region', () => {
    cache.setOrgs('ap11', ORG);
    expect(cache.getOrgs('eu10')).toBeUndefined();
  });

  it('returns undefined when TTL has expired', () => {
    cache.setOrgs('ap11', ORG);
    // TTL of -1 ms means any entry is immediately expired
    expect(cache.getOrgs('ap11', -1)).toBeUndefined();
  });

  // ─── Spaces ────────────────────────────────────────────────────────────────

  it('returns undefined for uncached spaces', () => {
    expect(cache.getSpaces('ap11', 'my-org')).toBeUndefined();
  });

  it('stores and retrieves spaces', () => {
    cache.setSpaces('ap11', 'my-org', SPACES);
    expect(cache.getSpaces('ap11', 'my-org')).toEqual(SPACES);
  });

  it('returns undefined for different org', () => {
    cache.setSpaces('ap11', 'my-org', SPACES);
    expect(cache.getSpaces('ap11', 'other-org')).toBeUndefined();
  });

  // ─── Apps ──────────────────────────────────────────────────────────────────

  it('returns undefined for uncached apps', () => {
    expect(cache.getApps('ap11', 'my-org')).toBeUndefined();
  });

  it('stores and retrieves apps (org-level key)', () => {
    cache.setApps('ap11', 'my-org', APPS);
    expect(cache.getApps('ap11', 'my-org')).toEqual(APPS);
  });

  it('stores and retrieves apps per space', () => {
    cache.setApps('ap11', 'my-org', APPS, 'dev');
    expect(cache.getApps('ap11', 'my-org', 'dev')).toEqual(APPS);
    // Different space should be undefined
    expect(cache.getApps('ap11', 'my-org', 'prod')).toBeUndefined();
    // Org-level key should also be undefined
    expect(cache.getApps('ap11', 'my-org')).toBeUndefined();
  });

  // ─── Sync Progress ─────────────────────────────────────────────────────────

  it('returns idle progress initially', () => {
    expect(cache.getSyncProgress()).toEqual({ status: 'idle', done: 0, total: 0 });
  });

  it('stores and retrieves sync progress', () => {
    const p = { status: 'running' as const, done: 5, total: 10 };
    cache.setSyncProgress(p);
    expect(cache.getSyncProgress()).toEqual(p);
  });

  // ─── Stats ─────────────────────────────────────────────────────────────────

  it('returns zero stats when empty', () => {
    expect(cache.getStats()).toEqual({ regions: 0, orgs: 0, apps: 0 });
  });

  it('counts regions, orgs, and apps correctly', () => {
    cache.setOrgs('ap11', ORG);
    cache.setApps('ap11', 'my-org', APPS);
    cache.setApps('ap11', 'my-org', [APPS[0]!], 'dev');
    cache.setOrgs('eu10', ORG);
    cache.setApps('eu10', 'eu-org', APPS);

    const stats = cache.getStats();
    expect(stats.regions).toBe(2);
    expect(stats.orgs).toBe(2);       // my-org (ap11) + eu-org (eu10)
    expect(stats.apps).toBeGreaterThanOrEqual(2); // at least APPS.length
  });

  // ─── Clear ─────────────────────────────────────────────────────────────────

  it('clears all data', () => {
    cache.setOrgs('ap11', ORG);
    cache.setApps('ap11', 'my-org', APPS);
    cache.clear();
    expect(cache.getOrgs('ap11')).toBeUndefined();
    expect(cache.getApps('ap11', 'my-org')).toBeUndefined();
    expect(cache.getStats()).toEqual({ regions: 0, orgs: 0, apps: 0 });
  });
});
