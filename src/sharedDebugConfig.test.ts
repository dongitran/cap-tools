import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getConfigurationMock } = vi.hoisted(() => ({
  getConfigurationMock: vi.fn(),
}));

vi.mock('vscode', () => ({
  workspace: {
    getConfiguration: getConfigurationMock,
  },
}));

import {
  extractRemoteRoot,
  mergeAppFolderMappings,
  normalizeAppFolderMappings,
  pickRemoteRoot,
  readSharedAppFolderMappings,
  readSharedRemoteRoot,
} from './sharedDebugConfig';

/**
 * Stubs `getConfiguration(section).get('sharedCapDebugConfig')` per section so we can
 * model "SAP Tools configured", "cds-debug configured", and "neither" independently.
 */
function configureSharedCapDebugConfig(values: {
  sapTools?: unknown;
  cdsDebug?: unknown;
}): void {
  getConfigurationMock.mockImplementation((section: string) => ({
    get: () => (section === 'sapTools' ? values.sapTools : values.cdsDebug),
  }));
}

beforeEach(() => {
  getConfigurationMock.mockReset();
});

describe('extractRemoteRoot', () => {
  it('returns a trimmed non-empty remoteRoot', () => {
    expect(extractRemoteRoot({ remoteRoot: '  /home/vcap/app  ' })).toBe('/home/vcap/app');
  });

  it('returns undefined for blank, missing, or non-string remoteRoot', () => {
    expect(extractRemoteRoot({ remoteRoot: '   ' })).toBeUndefined();
    expect(extractRemoteRoot({ remoteRoot: 42 })).toBeUndefined();
    expect(extractRemoteRoot({})).toBeUndefined();
    expect(extractRemoteRoot(null)).toBeUndefined();
    expect(extractRemoteRoot('string')).toBeUndefined();
  });
});

describe('pickRemoteRoot', () => {
  it("prefers SAP Tools' own setting over cds-debug", () => {
    expect(
      pickRemoteRoot({ remoteRoot: '/own' }, { remoteRoot: '/cds' })
    ).toBe('/own');
  });

  it('falls back to the cds-debug setting when own is unset', () => {
    expect(pickRemoteRoot({}, { remoteRoot: '/cds' })).toBe('/cds');
    expect(pickRemoteRoot(undefined, { remoteRoot: 'regex:srv$' })).toBe('regex:srv$');
  });

  it('returns undefined when neither is configured', () => {
    expect(pickRemoteRoot({}, {})).toBeUndefined();
  });
});

describe('readSharedRemoteRoot', () => {
  it('reads the SAP Tools setting first', () => {
    configureSharedCapDebugConfig({
      sapTools: { remoteRoot: '/own/root' },
      cdsDebug: { remoteRoot: '/cds/root' },
    });
    expect(readSharedRemoteRoot()).toBe('/own/root');
  });

  it('falls back to the cds-debug setting when only it is configured', () => {
    configureSharedCapDebugConfig({
      sapTools: {},
      cdsDebug: { remoteRoot: 'regex:/home/vcap/app/.*_srv$' },
    });
    expect(readSharedRemoteRoot()).toBe('regex:/home/vcap/app/.*_srv$');
  });

  it('returns undefined when neither extension is configured', () => {
    configureSharedCapDebugConfig({ sapTools: {}, cdsDebug: {} });
    expect(readSharedRemoteRoot()).toBeUndefined();
  });
});

/**
 * Models `getConfiguration(section).get(key)` so folder-mapping tests can set each
 * extension's `appFolderMappings` independently.
 */
function configureByKey(values: {
  sapTools?: Record<string, unknown>;
  cdsDebug?: Record<string, unknown>;
}): void {
  getConfigurationMock.mockImplementation((section: string) => ({
    get: (key: string) =>
      (section === 'sapTools' ? values.sapTools : values.cdsDebug)?.[key],
  }));
}

describe('normalizeAppFolderMappings', () => {
  it('keeps valid entries, trims values, and drops malformed/duplicate ones', () => {
    expect(
      normalizeAppFolderMappings([
        { appName: '  finance-api ', folderName: ' legacy-billing ' },
        { appName: 'finance-api', folderName: 'second-wins-not' },
        { appName: '', folderName: 'no-app' },
        { appName: 'no-folder', folderName: '' },
        { folderName: 'missing-app' },
        'nonsense',
      ])
    ).toEqual([{ appName: 'finance-api', folderName: 'legacy-billing' }]);
  });

  it('returns an empty list for non-array input', () => {
    expect(normalizeAppFolderMappings(undefined)).toEqual([]);
    expect(normalizeAppFolderMappings({ appName: 'x', folderName: 'y' })).toEqual([]);
  });
});

describe('mergeAppFolderMappings', () => {
  it('lets SAP Tools entries win on conflicting app names but keeps the rest', () => {
    expect(
      mergeAppFolderMappings(
        [{ appName: 'shared', folderName: 'own-folder' }],
        [
          { appName: 'shared', folderName: 'cds-folder' },
          { appName: 'cds-only', folderName: 'cds-only-folder' },
        ]
      )
    ).toEqual([
      { appName: 'shared', folderName: 'own-folder' },
      { appName: 'cds-only', folderName: 'cds-only-folder' },
    ]);
  });
});

describe('readSharedAppFolderMappings', () => {
  it('merges own settings ahead of cds-debug settings', () => {
    configureByKey({
      sapTools: { appFolderMappings: [{ appName: 'shared', folderName: 'own' }] },
      cdsDebug: {
        appFolderMappings: [
          { appName: 'shared', folderName: 'cds' },
          { appName: 'cds-only', folderName: 'cds-folder' },
        ],
      },
    });
    expect(readSharedAppFolderMappings()).toEqual([
      { appName: 'shared', folderName: 'own' },
      { appName: 'cds-only', folderName: 'cds-folder' },
    ]);
  });

  it('falls back to cds-debug settings when SAP Tools has none', () => {
    configureByKey({
      sapTools: {},
      cdsDebug: { appFolderMappings: [{ appName: 'app', folderName: 'folder' }] },
    });
    expect(readSharedAppFolderMappings()).toEqual([
      { appName: 'app', folderName: 'folder' },
    ]);
  });

  it('returns an empty list when neither extension is configured', () => {
    configureByKey({ sapTools: {}, cdsDebug: {} });
    expect(readSharedAppFolderMappings()).toEqual([]);
  });
});
