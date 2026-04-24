// cspell:words hdbsql hdbclient
import { describe, expect, test } from 'vitest';

import {
  DEFAULT_HDBSQL_BINARY_NAME_UNIX,
  DEFAULT_HDBSQL_BINARY_NAME_WINDOWS,
  listDefaultHdbsqlPaths,
  resolveHdbsqlPath,
} from './hdbsqlDiscovery';

describe('listDefaultHdbsqlPaths', () => {
  test('returns macOS paths including the Applications install location', () => {
    const paths = listDefaultHdbsqlPaths({ platform: 'darwin', homeDir: '/Users/tester' });
    expect(paths[0]).toBe('/Applications/sap/hdbclient/hdbsql');
    expect(paths).toContain('/Users/tester/sap/hdbclient/hdbsql');
  });

  test('returns Windows paths for Program Files', () => {
    const paths = listDefaultHdbsqlPaths({ platform: 'win32', homeDir: 'C:\\Users\\tester' });
    expect(paths).toContain('C:\\Program Files\\sap\\hdbclient\\hdbsql.exe');
    expect(paths).toContain('C:\\Program Files (x86)\\sap\\hdbclient\\hdbsql.exe');
  });

  test('returns Linux-like paths for linux platform', () => {
    const paths = listDefaultHdbsqlPaths({ platform: 'linux', homeDir: '/home/tester' });
    expect(paths).toContain('/usr/sap/hdbclient/hdbsql');
    expect(paths).toContain('/opt/sap/hdbclient/hdbsql');
    expect(paths).toContain('/home/tester/sap/hdbclient/hdbsql');
  });
});

describe('resolveHdbsqlPath', () => {
  test('returns the configured path when it is reachable', async () => {
    const accessCheck = async (target: string): Promise<void> => {
      if (target !== '/custom/hdbsql') {
        throw new Error('missing');
      }
    };
    const result = await resolveHdbsqlPath({
      configuredPath: '/custom/hdbsql',
      platform: 'darwin',
      accessCheck,
    });
    expect(result).toEqual({ path: '/custom/hdbsql', source: 'configured' });
  });

  test('falls back to the default install location when configured path is unreachable', async () => {
    const accessCheck = async (target: string): Promise<void> => {
      if (target !== '/Applications/sap/hdbclient/hdbsql') {
        throw new Error('missing');
      }
    };
    const result = await resolveHdbsqlPath({
      configuredPath: '/broken/hdbsql',
      platform: 'darwin',
      homeDir: '/Users/tester',
      accessCheck,
    });
    expect(result).toEqual({
      path: '/Applications/sap/hdbclient/hdbsql',
      source: 'default-install',
    });
  });

  test('returns the first reachable default install path when no path is configured', async () => {
    const accessCheck = async (target: string): Promise<void> => {
      if (target !== '/usr/local/sap/hdbclient/hdbsql') {
        throw new Error('missing');
      }
    };
    const result = await resolveHdbsqlPath({
      platform: 'darwin',
      homeDir: '/Users/tester',
      accessCheck,
    });
    expect(result.path).toBe('/usr/local/sap/hdbclient/hdbsql');
    expect(result.source).toBe('default-install');
  });

  test('falls back to the PATH binary name when nothing is reachable', async () => {
    const accessCheck = async (): Promise<void> => {
      throw new Error('nothing reachable');
    };
    const darwinResult = await resolveHdbsqlPath({
      platform: 'darwin',
      homeDir: '/Users/tester',
      accessCheck,
    });
    expect(darwinResult).toEqual({
      path: DEFAULT_HDBSQL_BINARY_NAME_UNIX,
      source: 'path-lookup',
    });

    const windowsResult = await resolveHdbsqlPath({
      platform: 'win32',
      homeDir: 'C:\\Users\\tester',
      accessCheck,
    });
    expect(windowsResult).toEqual({
      path: DEFAULT_HDBSQL_BINARY_NAME_WINDOWS,
      source: 'path-lookup',
    });
  });

  test('treats blank configured path as no configuration', async () => {
    const accessCheck = async (target: string): Promise<void> => {
      if (target !== '/usr/sap/hdbclient/hdbsql') {
        throw new Error('missing');
      }
    };
    const result = await resolveHdbsqlPath({
      configuredPath: '   ',
      platform: 'linux',
      homeDir: '/home/tester',
      accessCheck,
    });
    expect(result.source).toBe('default-install');
    expect(result.path).toBe('/usr/sap/hdbclient/hdbsql');
  });
});
