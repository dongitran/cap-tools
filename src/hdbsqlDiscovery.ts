// cspell:words hdbsql hdbclient
import { access, constants } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const DEFAULT_HDBSQL_BINARY_NAME_UNIX = 'hdbsql';
export const DEFAULT_HDBSQL_BINARY_NAME_WINDOWS = 'hdbsql.exe';

export interface ListDefaultHdbsqlPathsOptions {
  readonly platform?: NodeJS.Platform;
  readonly homeDir?: string;
}

export function listDefaultHdbsqlPaths(
  options: ListDefaultHdbsqlPathsOptions = {}
): readonly string[] {
  const platform = options.platform ?? process.platform;
  const home = options.homeDir ?? homedir();

  if (platform === 'darwin') {
    return [
      '/Applications/sap/hdbclient/hdbsql',
      '/usr/local/sap/hdbclient/hdbsql',
      join(home, 'sap/hdbclient/hdbsql'),
    ];
  }

  if (platform === 'win32') {
    return [
      'C:\\Program Files\\sap\\hdbclient\\hdbsql.exe',
      'C:\\Program Files (x86)\\sap\\hdbclient\\hdbsql.exe',
    ];
  }

  return [
    '/usr/sap/hdbclient/hdbsql',
    '/opt/sap/hdbclient/hdbsql',
    join(home, 'sap/hdbclient/hdbsql'),
  ];
}

export interface ResolveHdbsqlPathOptions extends ListDefaultHdbsqlPathsOptions {
  readonly configuredPath?: string;
  readonly accessCheck?: (path: string) => Promise<void>;
}

export interface ResolveHdbsqlPathResult {
  readonly path: string;
  readonly source: 'configured' | 'default-install' | 'path-lookup';
}

async function defaultAccessCheck(path: string): Promise<void> {
  await access(path, constants.X_OK);
}

export async function resolveHdbsqlPath(
  options: ResolveHdbsqlPathOptions = {}
): Promise<ResolveHdbsqlPathResult> {
  const accessCheck = options.accessCheck ?? defaultAccessCheck;
  const configured = (options.configuredPath ?? '').trim();

  if (configured.length > 0) {
    try {
      await accessCheck(configured);
      return { path: configured, source: 'configured' };
    } catch {
      // Configured path is present but unreachable; fall through to auto-detect
      // so the user still gets a working SQL run when a default install exists.
    }
  }

  for (const candidate of listDefaultHdbsqlPaths(options)) {
    try {
      await accessCheck(candidate);
      return { path: candidate, source: 'default-install' };
    } catch {
      continue;
    }
  }

  const platform = options.platform ?? process.platform;
  const fallbackName =
    platform === 'win32'
      ? DEFAULT_HDBSQL_BINARY_NAME_WINDOWS
      : DEFAULT_HDBSQL_BINARY_NAME_UNIX;
  return { path: fallbackName, source: 'path-lookup' };
}
