import { describe, expect, it, vi } from 'vitest';
import type * as vscode from 'vscode';

import { CacheStore, normalizeUserEmail } from './cacheStore';
import type { CacheState, CachedUserEntry } from './cacheModels';

interface MockGlobalState {
  readonly get: ReturnType<typeof vi.fn>;
  readonly update: ReturnType<typeof vi.fn>;
}

function createMockContext(
  initialState: unknown = undefined
): vscode.ExtensionContext {
  const storage = new Map<string, unknown>();
  if (initialState !== undefined) {
    storage.set('sapTools.cache.state.v1', initialState);
  }

  const globalState: MockGlobalState = {
    get: vi.fn((key: string) => storage.get(key)),
    update: vi.fn(async (key: string, value: unknown) => {
      storage.set(key, value);
    }),
  };

  return {
    globalState,
  } as unknown as vscode.ExtensionContext;
}

function createSampleUser(email: string): CachedUserEntry {
  return {
    email,
    syncInProgress: false,
    lastSyncStartedAt: '2026-04-13T01:00:00.000Z',
    lastSyncCompletedAt: '2026-04-13T01:15:00.000Z',
    lastSyncError: '',
    regions: [
      {
        regionId: 'us10',
        regionCode: 'us-10',
        area: 'Americas',
        displayName: 'US East (VA)',
        accessState: 'accessible',
        accessMessage: '',
        updatedAt: '2026-04-13T01:10:00.000Z',
        orgs: [
          {
            guid: 'org-1',
            name: 'finance-services-prod',
            spaces: [
              {
                guid: 'space-1',
                name: 'uat',
                apps: [{ id: 'app-1', name: 'finance-uat-api', runningInstances: 1 }],
              },
            ],
          },
        ],
      },
    ],
  };
}

describe('CacheStore', () => {
  it('returns default state when storage is empty', async () => {
    const context = createMockContext();
    const store = new CacheStore(context);

    const state = await store.readState();
    expect(state).toEqual({
      version: 1,
      settings: { syncIntervalHours: 24 },
      users: {},
    });
  });

  it('persists sync interval setting', async () => {
    const context = createMockContext();
    const store = new CacheStore(context);

    await store.setSyncIntervalHours(48);
    const settings = await store.getSettings();

    expect(settings.syncIntervalHours).toBe(48);
  });

  it('falls back to default interval when persisted value is invalid', async () => {
    const context = createMockContext({
      version: 1,
      settings: {
        syncIntervalHours: 13,
      },
      users: {},
    });
    const store = new CacheStore(context);

    const settings = await store.getSettings();
    expect(settings.syncIntervalHours).toBe(24);
  });

  it('stores user entries independently by normalized email key', async () => {
    const context = createMockContext();
    const store = new CacheStore(context);

    await store.upsertUser('User.A@Example.com', () => createSampleUser('User.A@Example.com'));
    await store.upsertUser('user.b@example.com', () => createSampleUser('user.b@example.com'));

    const userA = await store.getUser('user.a@example.com');
    const userB = await store.getUser('USER.B@EXAMPLE.COM');

    expect(userA?.email).toBe('User.A@Example.com');
    expect(userB?.email).toBe('user.b@example.com');
    expect(userA?.regions[0]?.regionCode).toBe('us-10');
    expect(userB?.regions[0]?.orgs[0]?.spaces[0]?.apps[0]?.name).toBe('finance-uat-api');
  });

  it('normalizes persisted user keys and strips invalid entries', async () => {
    const persisted: CacheState = {
      version: 1,
      settings: { syncIntervalHours: 24 },
      users: {
        'USER.C@EXAMPLE.COM': createSampleUser('user.c@example.com'),
        '': createSampleUser('invalid@example.com'),
      },
    };
    const context = createMockContext(persisted);
    const store = new CacheStore(context);

    const state = await store.readState();
    expect(Object.keys(state.users)).toEqual(['user.c@example.com']);
  });
});

describe('normalizeUserEmail', () => {
  it('trims and lowercases email key', () => {
    expect(normalizeUserEmail('  Dev.User@Example.Com  ')).toBe(
      'dev.user@example.com'
    );
  });
});

