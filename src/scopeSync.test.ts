import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SharedCfScope } from './scopeSync';

const { getConfigurationMock, updateMock, state } = vi.hoisted(() => ({
  getConfigurationMock: vi.fn(),
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

import { writeScopeIfChanged } from './scopeSync';

function configureWorkspaceScope(scope: SharedCfScope | undefined): void {
  state.currentScope = scope;
  getConfigurationMock.mockReturnValue({
    get: vi.fn(() => state.currentScope),
    update: updateMock,
  });
}

describe('shared CF scope settings sync', () => {
  beforeEach(() => {
    getConfigurationMock.mockReset();
    updateMock.mockReset();
    configureWorkspaceScope(undefined);
  });

  it('does not update the global setting when the current scope is unchanged', async () => {
    const scope: SharedCfScope = {
      regionCode: 'us10',
      orgName: 'finance-services-prod',
      spaceName: 'uat',
    };
    configureWorkspaceScope(scope);

    await writeScopeIfChanged(scope);

    expect(updateMock).not.toHaveBeenCalled();
  });

  it('updates the global setting when the current scope is different', async () => {
    configureWorkspaceScope({
      regionCode: 'eu10',
      orgName: 'core-platform-prod',
      spaceName: 'prod',
    });

    const nextScope: SharedCfScope = {
      regionCode: 'us10',
      orgName: 'finance-services-prod',
      spaceName: 'uat',
    };
    await writeScopeIfChanged(nextScope);

    expect(getConfigurationMock).toHaveBeenCalledWith('sapCap');
    expect(updateMock).toHaveBeenCalledWith(
      'currentScope',
      nextScope,
      'global-target'
    );
  });
});
