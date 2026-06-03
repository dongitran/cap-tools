import * as vscode from 'vscode';

import type { AppFolderMapping } from './serviceFolderMapping';

/**
 * Shared configuration bridge between SAP Tools and the cds-debug extension.
 *
 * Both extensions are published together and already share `sapCap.currentScope`.
 * Artifact export needs the same "where do remote sources live" hint that cds-debug
 * exposes through `cdsDebug.sharedCapDebugConfig.remoteRoot`, so we read SAP Tools'
 * own `sapTools.sharedCapDebugConfig` first and transparently fall back to the
 * cds-debug key. This way a user who already configured cds-debug gets the behavior
 * for free, while a SAP Tools-only install can still configure it standalone.
 */

const SHARED_CAP_DEBUG_CONFIG_KEY = 'sharedCapDebugConfig';
const APP_FOLDER_MAPPINGS_KEY = 'appFolderMappings';
const OWN_CONFIG_SECTION = 'sapTools';
const CDS_DEBUG_CONFIG_SECTION = 'cdsDebug';

/**
 * Pulls a usable `remoteRoot` string out of a `sharedCapDebugConfig` object, or
 * `undefined` when it is missing/blank/not a string.
 */
export function extractRemoteRoot(config: unknown): string | undefined {
  if (!isRecord(config)) {
    return undefined;
  }
  const remoteRoot = config['remoteRoot'];
  if (typeof remoteRoot !== 'string') {
    return undefined;
  }
  const trimmed = remoteRoot.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * SAP Tools' own setting wins; the cds-debug setting is the fallback so a single
 * cds-debug configuration keeps working when SAP Tools is added later.
 */
export function pickRemoteRoot(ownConfig: unknown, cdsDebugConfig: unknown): string | undefined {
  return extractRemoteRoot(ownConfig) ?? extractRemoteRoot(cdsDebugConfig);
}

/**
 * Reads the effective remoteRoot setting from VS Code configuration.
 */
export function readSharedRemoteRoot(): string | undefined {
  const ownConfig = vscode.workspace
    .getConfiguration(OWN_CONFIG_SECTION)
    .get<unknown>(SHARED_CAP_DEBUG_CONFIG_KEY);
  const cdsDebugConfig = vscode.workspace
    .getConfiguration(CDS_DEBUG_CONFIG_SECTION)
    .get<unknown>(SHARED_CAP_DEBUG_CONFIG_KEY);
  return pickRemoteRoot(ownConfig, cdsDebugConfig);
}

/**
 * Validates a raw `appFolderMappings` setting value into a clean list: drops
 * malformed entries, trims values, and keeps the first entry per app name.
 */
export function normalizeAppFolderMappings(value: unknown): AppFolderMapping[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const result: AppFolderMapping[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    const mapping = normalizeAppFolderMappingEntry(entry);
    if (mapping === null || seen.has(mapping.appName)) {
      continue;
    }
    seen.add(mapping.appName);
    result.push(mapping);
  }
  return result;
}

/**
 * Merges SAP Tools' own mappings with cds-debug's, SAP Tools first so its entries
 * win on conflicting app names; the rest of cds-debug's entries are still honored.
 */
export function mergeAppFolderMappings(
  ownValue: unknown,
  cdsDebugValue: unknown
): AppFolderMapping[] {
  const merged: AppFolderMapping[] = [];
  const seen = new Set<string>();
  for (const mapping of [
    ...normalizeAppFolderMappings(ownValue),
    ...normalizeAppFolderMappings(cdsDebugValue),
  ]) {
    if (seen.has(mapping.appName)) {
      continue;
    }
    seen.add(mapping.appName);
    merged.push(mapping);
  }
  return merged;
}

/**
 * Reads the effective explicit app→folder overrides from VS Code configuration.
 */
export function readSharedAppFolderMappings(): AppFolderMapping[] {
  const ownValue = vscode.workspace
    .getConfiguration(OWN_CONFIG_SECTION)
    .get<unknown>(APP_FOLDER_MAPPINGS_KEY);
  const cdsDebugValue = vscode.workspace
    .getConfiguration(CDS_DEBUG_CONFIG_SECTION)
    .get<unknown>(APP_FOLDER_MAPPINGS_KEY);
  return mergeAppFolderMappings(ownValue, cdsDebugValue);
}

function normalizeAppFolderMappingEntry(entry: unknown): AppFolderMapping | null {
  if (!isRecord(entry)) {
    return null;
  }
  const appName = typeof entry['appName'] === 'string' ? entry['appName'].trim() : '';
  const folderName = typeof entry['folderName'] === 'string' ? entry['folderName'].trim() : '';
  if (appName.length === 0 || folderName.length === 0) {
    return null;
  }
  return { appName, folderName };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
