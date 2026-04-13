import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as vscode from 'vscode';

const {
  fetchCfLoginInfoMock,
  cfLoginMock,
  fetchOrgsMock,
  fetchSpacesMock,
  fetchStartedAppsViaCfCliMock,
  ensureCfHomeDirMock,
} = vi.hoisted(() => {
  return {
    fetchCfLoginInfoMock: vi.fn(),
    cfLoginMock: vi.fn(),
    fetchOrgsMock: vi.fn(),
    fetchSpacesMock: vi.fn(),
    fetchStartedAppsViaCfCliMock: vi.fn(),
    ensureCfHomeDirMock: vi.fn(),
  };
});

vi.mock('./cfClient', () => {
  return {
    getCfApiEndpoint: (regionCode: string) => {
      const normalized = regionCode.replace('-', '');
      return `https://api.cf.${normalized}.hana.ondemand.com`;
    },
    fetchCfLoginInfo: fetchCfLoginInfoMock,
    cfLogin: cfLoginMock,
    fetchOrgs: fetchOrgsMock,
    fetchSpaces: fetchSpacesMock,
    fetchStartedAppsViaCfCli: fetchStartedAppsViaCfCliMock,
  };
});

vi.mock('./cfHome', () => {
  return {
    ensureCfHomeDir: ensureCfHomeDirMock,
  };
});

import { CacheStore } from './cacheStore';
import { CacheSyncService } from './cacheSyncService';

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
    globalStorageUri: { fsPath: '/tmp/sap-tools-tests' },
  } as unknown as vscode.ExtensionContext;
}

function createOutputChannel(): vscode.OutputChannel {
  return {
    appendLine: vi.fn(),
  } as unknown as vscode.OutputChannel;
}

function createTokenResponse() {
  return {
    accessToken: 'token-1',
    refreshToken: '',
    expiresAt: Date.now() + 60_000,
  };
}

describe('CacheSyncService', () => {
  beforeEach(() => {
    fetchCfLoginInfoMock.mockReset();
    cfLoginMock.mockReset();
    fetchOrgsMock.mockReset();
    fetchSpacesMock.mockReset();
    fetchStartedAppsViaCfCliMock.mockReset();
    ensureCfHomeDirMock.mockReset();
  });

  it('syncs all regions and publishes access map', async () => {
    fetchCfLoginInfoMock.mockResolvedValue({
      authorizationEndpoint: 'https://uaa.example.com',
    });
    cfLoginMock.mockResolvedValue(createTokenResponse());
    fetchOrgsMock.mockResolvedValue([]);
    fetchSpacesMock.mockResolvedValue([]);
    fetchStartedAppsViaCfCliMock.mockResolvedValue([]);
    ensureCfHomeDirMock.mockResolvedValue('/tmp/sap-tools-cf-home');

    const context = createMockContext();
    const cacheStore = new CacheStore(context);
    const service = new CacheSyncService(cacheStore, context, createOutputChannel());

    await service.initialize({
      email: 'dev@example.com',
      password: 'secret',
    });
    const snapshot = await service.triggerSyncNow();

    expect(snapshot.activeUserEmail).toBe('dev@example.com');
    expect(Object.keys(snapshot.regionAccessById)).toHaveLength(41);
    expect(snapshot.regionAccessById['us10']).toBe('accessible');
    expect(snapshot.syncInProgress).toBe(false);
  });

  it('marks region as inaccessible when auth fails', async () => {
    fetchCfLoginInfoMock.mockResolvedValue({
      authorizationEndpoint: 'https://uaa.example.com',
    });
    cfLoginMock.mockRejectedValue(new Error('Invalid SAP credentials.'));
    fetchOrgsMock.mockResolvedValue([]);
    fetchSpacesMock.mockResolvedValue([]);
    fetchStartedAppsViaCfCliMock.mockResolvedValue([]);
    ensureCfHomeDirMock.mockResolvedValue('/tmp/sap-tools-cf-home');

    const context = createMockContext();
    const cacheStore = new CacheStore(context);
    const service = new CacheSyncService(cacheStore, context, createOutputChannel());

    await service.initialize({
      email: 'dev@example.com',
      password: 'secret',
    });
    const snapshot = await service.triggerSyncNow();

    expect(snapshot.regionAccessById['us10']).toBe('inaccessible');
    expect(snapshot.lastSyncError).toBe('');
  });

  it('resolves cached org/space/app trees from active user cache', async () => {
    fetchCfLoginInfoMock.mockResolvedValue({
      authorizationEndpoint: 'https://uaa.example.com',
    });
    cfLoginMock.mockResolvedValue(createTokenResponse());
    fetchOrgsMock.mockResolvedValue([]);
    fetchSpacesMock.mockResolvedValue([]);
    fetchStartedAppsViaCfCliMock.mockResolvedValue([]);
    ensureCfHomeDirMock.mockResolvedValue('/tmp/sap-tools-cf-home');

    const now = new Date().toISOString();
    const context = createMockContext({
      version: 1,
      settings: { syncIntervalHours: 24 },
      users: {
        'dev@example.com': {
          email: 'dev@example.com',
          syncInProgress: false,
          lastSyncStartedAt: now,
          lastSyncCompletedAt: now,
          lastSyncError: '',
          regions: [
            {
              regionId: 'us10',
              regionCode: 'us-10',
              area: 'Americas',
              displayName: 'US East (VA)',
              accessState: 'accessible',
              accessMessage: '',
              updatedAt: now,
              orgs: [
                {
                  guid: 'org-guid-1',
                  name: 'finance-services-prod',
                  spaces: [
                    {
                      guid: 'space-guid-1',
                      name: 'uat',
                      apps: [
                        {
                          id: 'app-1',
                          name: 'finance-uat-api',
                          runningInstances: 1,
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
      exportRootFolders: {},
    });

    const cacheStore = new CacheStore(context);
    const service = new CacheSyncService(cacheStore, context, createOutputChannel());
    await service.initialize({
      email: 'dev@example.com',
      password: 'secret',
    });

    const orgs = await service.getCachedOrgs('us10');
    const spaces = await service.getCachedSpaces('us10', 'org-guid-1');
    const apps = await service.getCachedApps('us10', 'org-guid-1', 'uat');

    expect(orgs).toEqual([{ guid: 'org-guid-1', name: 'finance-services-prod' }]);
    expect(spaces).toEqual([{ guid: 'space-guid-1', name: 'uat' }]);
    expect(apps).toEqual([
      {
        id: 'app-1',
        name: 'finance-uat-api',
        runningInstances: 1,
      },
    ]);
  });

  it('keeps previous cached apps when app sync fails for a known space', async () => {
    fetchCfLoginInfoMock.mockResolvedValue({
      authorizationEndpoint: 'https://uaa.example.com',
    });
    cfLoginMock.mockResolvedValue(createTokenResponse());
    fetchOrgsMock.mockResolvedValue([
      { guid: 'org-guid-1', name: 'finance-services-prod' },
    ]);
    fetchSpacesMock.mockResolvedValue([{ guid: 'space-guid-1', name: 'uat' }]);
    fetchStartedAppsViaCfCliMock.mockRejectedValue(new Error('cf apps failed'));
    ensureCfHomeDirMock.mockResolvedValue('/tmp/sap-tools-cf-home');

    const now = new Date().toISOString();
    const context = createMockContext({
      version: 1,
      settings: { syncIntervalHours: 24 },
      users: {
        'dev@example.com': {
          email: 'dev@example.com',
          syncInProgress: false,
          lastSyncStartedAt: now,
          lastSyncCompletedAt: now,
          lastSyncError: '',
          regions: [
            {
              regionId: 'us10',
              regionCode: 'us-10',
              area: 'Americas',
              displayName: 'US East (VA)',
              accessState: 'accessible',
              accessMessage: '',
              updatedAt: now,
              orgs: [
                {
                  guid: 'org-guid-1',
                  name: 'finance-services-prod',
                  spaces: [
                    {
                      guid: 'space-guid-1',
                      name: 'uat',
                      apps: [
                        {
                          id: 'app-1',
                          name: 'finance-uat-api',
                          runningInstances: 1,
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
      exportRootFolders: {},
    });

    const cacheStore = new CacheStore(context);
    const service = new CacheSyncService(cacheStore, context, createOutputChannel());
    await service.initialize({
      email: 'dev@example.com',
      password: 'secret',
    });

    const snapshot = await service.triggerSyncNow();
    const apps = await service.getCachedApps('us10', 'org-guid-1', 'uat');

    expect(snapshot.regionAccessById['us10']).toBe('accessible');
    expect(apps).toEqual([
      {
        id: 'app-1',
        name: 'finance-uat-api',
        runningInstances: 1,
      },
    ]);
  });

  it('marks region as error when app sync fails and no previous space cache exists', async () => {
    fetchCfLoginInfoMock.mockResolvedValue({
      authorizationEndpoint: 'https://uaa.example.com',
    });
    cfLoginMock.mockResolvedValue(createTokenResponse());
    fetchOrgsMock.mockResolvedValue([
      { guid: 'org-guid-1', name: 'finance-services-prod' },
    ]);
    fetchSpacesMock.mockResolvedValue([{ guid: 'space-guid-1', name: 'uat' }]);
    fetchStartedAppsViaCfCliMock.mockRejectedValue(new Error('cf apps failed'));
    ensureCfHomeDirMock.mockResolvedValue('/tmp/sap-tools-cf-home');

    const context = createMockContext();
    const cacheStore = new CacheStore(context);
    const service = new CacheSyncService(cacheStore, context, createOutputChannel());
    await service.initialize({
      email: 'dev@example.com',
      password: 'secret',
    });

    const snapshot = await service.triggerSyncNow();
    expect(snapshot.regionAccessById['us10']).toBe('error');
  });
});
