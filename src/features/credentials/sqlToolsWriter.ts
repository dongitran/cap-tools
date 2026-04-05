import * as fs from 'fs';
import * as path from 'path';
import type { HanaCredentials, SqlToolsConnection } from '../../types/index.js';
import { logger } from '../../core/logger.js';

const SETTINGS_FILE = '.vscode/settings.json';
const CONN_KEY = 'sqltools.connections';
const CONN_NAME_PREFIX = 'SAP HANA:';

/**
 * Converts HANA credentials into a SQLTools-compatible connection object.
 */
export function toSqlToolsConnection(appName: string, creds: HanaCredentials): SqlToolsConnection {
  return {
    name: `${CONN_NAME_PREFIX} ${appName}`,
    driver: 'SAP HANA',
    server: creds.host,
    port: creds.port,
    database: creds.database,
    username: creds.user,
    password: creds.password,
    connectionTimeout: 15,
    ...(creds.encrypt !== undefined ? { ssl: { enabled: creds.encrypt } } : {}),
  };
}

/**
 * Merges new SQLTools connection entries into .vscode/settings.json.
 * Replaces any existing entry with the same name; preserves all others.
 */
export function writeSqlToolsConnections(
  workspacePath: string,
  connections: SqlToolsConnection[],
): void {
  const settingsPath = path.join(workspacePath, SETTINGS_FILE);

  let settings: Record<string, unknown> = {};
  if (fs.existsSync(settingsPath)) {
    try {
      settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) as Record<string, unknown>;
    } catch {
      logger.warn('Could not parse existing settings.json, will overwrite sqltools section');
    }
  }

  const existing = (settings[CONN_KEY] as SqlToolsConnection[] | undefined) ?? [];
  const newNames = new Set(connections.map(c => c.name));

  const merged = [
    ...existing.filter(c => !newNames.has(c.name)),
    ...connections,
  ];

  settings[CONN_KEY] = merged;

  const vscodeDir = path.join(workspacePath, '.vscode');
  if (!fs.existsSync(vscodeDir)) fs.mkdirSync(vscodeDir, { recursive: true });

  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf-8');
  logger.info(`Wrote ${connections.length} HANA connection(s) to ${SETTINGS_FILE}`);
}

/**
 * Returns all SAP HANA connections currently in settings.json.
 */
export function readSqlToolsConnections(workspacePath: string): SqlToolsConnection[] {
  const settingsPath = path.join(workspacePath, SETTINGS_FILE);
  if (!fs.existsSync(settingsPath)) return [];
  try {
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) as Record<string, unknown>;
    const all = (settings[CONN_KEY] as SqlToolsConnection[] | undefined) ?? [];
    return all.filter(c => c.name.startsWith(CONN_NAME_PREFIX));
  } catch {
    return [];
  }
}
