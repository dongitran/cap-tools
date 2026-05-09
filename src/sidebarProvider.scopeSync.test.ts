import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as vscode from 'vscode';

import type { CacheStore } from './cacheStore';
import type { CacheSyncService } from './cacheSyncService';
import type { CfSession } from './cfClient';
import type { CfLogsPanelProvider } from './cfLogsPanel';
import type { HanaSqlWorkbench } from './hanaSqlWorkbench';
import type { SharedCfScope } from './scopeSync';

const { getConfigurationMock, getEffectiveCredentialsMock, updateMock, state } =
  vi.hoisted(() => ({
    getConfigurationMock: vi.fn(),
    getEffectiveCredentialsMock: vi.fn(),
    updateMock: vi.fn(),
    state: {
      currentScope: undefined as unknown,
    },
  }));

vi.mock('vscode', () => ({
  ConfigurationTarget: {
    Global: 'global-target',
  },
  workspace: {
    getConfiguration: getConfigurationMock,
  },
}));

vi.mock('./credentialStore', () => ({
  clearCredentials: vi.fn(),
  getEffectiveCredentials: getEffectiveCredentialsMock,
  storeCredentials: vi.fn(),
}));

import { RegionSidebarProvider } from './sidebarProvider';

interface ConfirmScopePayloadForTest {
  readonly regionId: string;
  readonly regionCode: string;
  readonly regionName: string;
  readonly regionArea: string;
  readonly orgGuid: string;
  readonly orgName: string;
  readonly spaceName: string;
}

interface QuickScopeConfirmPayloadForTest {
  readonly regionKey: string;
  readonly orgName: string;
  readonly spaceName: string;
}

interface SidebarProviderTestAccess {
  cfSession: CfSession | null;
  currentConfirmedScope: SharedCfScope | undefined;
  handleQuickScopeConfirm(payload: QuickScopeConfirmPayloadForTest): Promise<void>;
  handleConfirmScope(payload: ConfirmScopePayloadForTest): Promise<void>;
  handleExternalScopeChange(scope: SharedCfScope): Promise<void>;
  hydrateQuickConfirmedScope(payload: ConfirmScopePayloadForTest): Promise<void>;
  hydrateRestoredScope(scope: unknown): Promise<void>;
  lastWrittenScope: SharedCfScope | undefined;
  postSpacesError(message: string): void;
  resolveOrgGuidByName(regionId: string, orgName: string): Promise<string>;
  restoreExternalScope(scope: SharedCfScope): Promise<void>;
}

interface ProviderFixture {
  readonly access: SidebarProviderTestAccess;
  readonly globalStateUpdateMock: ReturnType<typeof vi.fn>;
  readonly provider: RegionSidebarProvider;
}

function configureWorkspaceScope(scope: SharedCfScope | undefined): void {
  state.currentScope = scope;
  getConfigurationMock.mockReturnValue({
    get: vi.fn(() => state.currentScope),
    update: updateMock,
  });
}

function createMockSession(): CfSession {
  return {
    apiEndpoint: 'https://api.cf.us10.hana.ondemand.com',
    token: {
      accessToken: 'token',
      expiresAt: Date.now() + 60_000,
      refreshToken: '',
    },
  };
}

function createProviderFixture(): ProviderFixture {
  const globalStateValues = new Map<string, unknown>();
  const globalStateUpdateMock = vi.fn(
    async (key: string, value: unknown): Promise<void> => {
      globalStateValues.set(key, value);
    }
  );
  const context = {
    globalState: {
      get: <T>(key: string): T | undefined => {
        return globalStateValues.get(key) as T | undefined;
      },
      update: globalStateUpdateMock,
    },
    secrets: {
      delete: vi.fn(),
      get: vi.fn(),
      store: vi.fn(),
    },
  } as unknown as vscode.ExtensionContext;

  const cacheSyncService = {
    getCachedApps: vi.fn(),
    getCachedOrgs: vi.fn(),
    getCachedSpaces: vi.fn(),
    subscribe: vi.fn(() => ({ dispose: vi.fn() })),
  } as unknown as CacheSyncService;
  const cacheStore = {
    deleteExportRootFolder: vi.fn(),
    getExportRootFolder: vi.fn(async () => null),
  } as unknown as CacheStore;
  const cfLogsPanel = {
    focus: vi.fn(),
    updateApps: vi.fn(),
    updateScope: vi.fn(),
  } as unknown as CfLogsPanelProvider;
  const hanaSqlWorkbench = {} as unknown as HanaSqlWorkbench;
  const outputChannel = {
    appendLine: vi.fn(),
  } as unknown as vscode.OutputChannel;

  const provider = new RegionSidebarProvider(
    {} as vscode.Uri,
    outputChannel,
    context,
    cfLogsPanel,
    cacheSyncService,
    cacheStore,
    hanaSqlWorkbench
  );

  return {
    access: provider as unknown as SidebarProviderTestAccess,
    globalStateUpdateMock,
    provider,
  };
}

describe('RegionSidebarProvider shared CF scope sync', () => {
  beforeEach(() => {
    getConfigurationMock.mockReset();
    getEffectiveCredentialsMock.mockReset();
    updateMock.mockReset();
    configureWorkspaceScope(undefined);
    getEffectiveCredentialsMock.mockResolvedValue({
      email: 'test@example.com',
      password: 'test-password',
    });
    delete process.env['SAP_TOOLS_TEST_MODE'];
  });

  it('ignores an external scope change that matches the last written scope', async () => {
    const { access } = createProviderFixture();
    const scope: SharedCfScope = {
      regionCode: 'us10',
      orgName: 'finance-services-prod',
      spaceName: 'uat',
    };
    access.cfSession = createMockSession();
    access.lastWrittenScope = scope;
    const restoreSpy = vi.spyOn(access, 'restoreExternalScope');

    await access.handleExternalScopeChange(scope);

    expect(restoreSpy).not.toHaveBeenCalled();
  });

  it('ignores an external scope change when no CF session is active', async () => {
    const { access } = createProviderFixture();
    const restoreSpy = vi.spyOn(access, 'restoreExternalScope');

    await access.handleExternalScopeChange({
      regionCode: 'us10',
      orgName: 'finance-services-prod',
      spaceName: 'uat',
    });

    expect(restoreSpy).not.toHaveBeenCalled();
  });

  it('ignores an external scope change for an unknown region', async () => {
    const { access } = createProviderFixture();
    access.cfSession = createMockSession();
    const restoreSpy = vi.spyOn(access, 'restoreExternalScope');

    await access.handleExternalScopeChange({
      regionCode: 'zz99',
      orgName: 'finance-services-prod',
      spaceName: 'uat',
    });

    expect(restoreSpy).not.toHaveBeenCalled();
  });

  it('ignores an external scope change that matches the active confirmed scope', async () => {
    const { access } = createProviderFixture();
    const scope: SharedCfScope = {
      regionCode: 'us10',
      orgName: 'finance-services-prod',
      spaceName: 'uat',
    };
    access.cfSession = createMockSession();
    access.currentConfirmedScope = scope;
    const restoreSpy = vi.spyOn(access, 'restoreExternalScope');

    await access.handleExternalScopeChange(scope);

    expect(restoreSpy).not.toHaveBeenCalled();
  });

  it('does not confirm an external scope when the org GUID cannot be resolved', async () => {
    const { access } = createProviderFixture();
    access.cfSession = createMockSession();
    vi.spyOn(access, 'resolveOrgGuidByName').mockResolvedValue('');
    const confirmSpy = vi.spyOn(access, 'handleConfirmScope');

    await access.restoreExternalScope({
      regionCode: 'us10',
      orgName: 'missing-org',
      spaceName: 'uat',
    });

    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('confirms an external scope with compact region id and hyphenated region code', async () => {
    const { access } = createProviderFixture();
    access.cfSession = createMockSession();
    vi.spyOn(access, 'resolveOrgGuidByName').mockResolvedValue('org-finance-prod');
    vi.spyOn(access, 'hydrateRestoredScope').mockResolvedValue(undefined);
    const confirmSpy = vi.spyOn(access, 'handleConfirmScope').mockResolvedValue();

    await access.restoreExternalScope({
      regionCode: 'us10',
      orgName: 'finance-services-prod',
      spaceName: 'uat',
    });

    expect(confirmSpy).toHaveBeenCalledWith({
      regionId: 'us10',
      regionCode: 'us-10',
      regionName: 'US East (VA)',
      regionArea: 'Americas',
      orgGuid: 'org-finance-prod',
      orgName: 'finance-services-prod',
      spaceName: 'uat',
    });
  });

  it('writes confirmed scope with compact regionCode from payload.regionId', async () => {
    const { access, globalStateUpdateMock } = createProviderFixture();
    process.env['SAP_TOOLS_TEST_MODE'] = '1';

    await access.handleConfirmScope({
      regionId: 'us10',
      regionCode: 'us-10',
      regionName: 'US East (VA)',
      regionArea: 'Americas',
      orgGuid: 'org-finance-prod',
      orgName: 'finance-services-prod',
      spaceName: 'uat',
    });

    expect(globalStateUpdateMock).toHaveBeenCalled();
    expect(updateMock).toHaveBeenCalledWith(
      'currentScope',
      {
        regionCode: 'us10',
        orgName: 'finance-services-prod',
        spaceName: 'uat',
      },
      'global-target'
    );
  });

  it('confirms quick scope selection with org GUID resolved from test mode topology', async () => {
    const { access } = createProviderFixture();
    process.env['SAP_TOOLS_TEST_MODE'] = '1';
    const confirmSpy = vi.spyOn(access, 'handleConfirmScope').mockResolvedValue();
    const hydrateSpy = vi
      .spyOn(access, 'hydrateQuickConfirmedScope')
      .mockResolvedValue();

    await access.handleQuickScopeConfirm({
      regionKey: 'us10',
      orgName: 'finance-services-prod',
      spaceName: 'uat',
    });

    const expectedPayload = {
      regionId: 'us10',
      regionCode: 'us-10',
      regionName: 'US East (VA)',
      regionArea: 'Americas',
      orgGuid: 'org-finance-prod',
      orgName: 'finance-services-prod',
      spaceName: 'uat',
    };
    expect(confirmSpy).toHaveBeenCalledWith(expectedPayload);
    expect(hydrateSpy).toHaveBeenCalledWith(expectedPayload);
  });

  it('rejects quick scope selection for unknown regions', async () => {
    const { access } = createProviderFixture();
    process.env['SAP_TOOLS_TEST_MODE'] = '1';
    const confirmSpy = vi.spyOn(access, 'handleConfirmScope').mockResolvedValue();
    const spacesErrorSpy = vi.spyOn(access, 'postSpacesError');

    await access.handleQuickScopeConfirm({
      regionKey: 'zz99',
      orgName: 'finance-services-prod',
      spaceName: 'uat',
    });

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(spacesErrorSpy).toHaveBeenCalledWith(
      'Region "zz99" is not known to SAP Tools.'
    );
  });

  it('rejects quick scope selection when the org cannot be resolved', async () => {
    const { access } = createProviderFixture();
    process.env['SAP_TOOLS_TEST_MODE'] = '1';
    const confirmSpy = vi.spyOn(access, 'handleConfirmScope').mockResolvedValue();
    const spacesErrorSpy = vi.spyOn(access, 'postSpacesError');

    await access.handleQuickScopeConfirm({
      regionKey: 'us10',
      orgName: 'missing-org',
      spaceName: 'uat',
    });

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(spacesErrorSpy).toHaveBeenCalledWith(
      'Org "missing-org" was not found in region us10. It may have been removed.'
    );
  });

  it('shows a generic quick scope confirmation failure when live resolution cannot start', async () => {
    const { access } = createProviderFixture();
    getEffectiveCredentialsMock.mockResolvedValue(null);
    const confirmSpy = vi.spyOn(access, 'handleConfirmScope').mockResolvedValue();
    const spacesErrorSpy = vi.spyOn(access, 'postSpacesError');

    await access.handleQuickScopeConfirm({
      regionKey: 'us10',
      orgName: 'finance-services-prod',
      spaceName: 'uat',
    });

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(spacesErrorSpy).toHaveBeenCalledWith(
      'Could not confirm scope. Please try again or use Custom tab.'
    );
  });
});
