import * as path from 'path';
import { findAppFolders } from './folderScanner.js';

/**
 * Normalizes a CF app name or folder name for comparison:
 * lowercases, replaces dashes and underscores with a common char.
 */
function normalize(name: string): string {
  return name.toLowerCase().replace(/[-_]/g, '-');
}

/**
 * Given a CF app name and a group folder path, tries to find the matching
 * local project folder by comparing normalized basenames.
 */
export function findLocalFolder(appName: string, groupFolderPath: string, maxDepth = 6): string | undefined {
  const folders = findAppFolders(groupFolderPath, maxDepth);
  const normalizedApp = normalize(appName);

  // Exact match first
  const exact = folders.find(f => normalize(path.basename(f)) === normalizedApp);
  if (exact) return exact;

  // Prefix match (CF app name often includes env suffix like -dev, -test)
  const prefix = folders.find(f => {
    const base = normalize(path.basename(f));
    return normalizedApp.startsWith(base) || base.startsWith(normalizedApp);
  });
  return prefix;
}

/**
 * Allocates a debug port starting from basePort, avoiding ports already in use
 * by existing configs.
 */
export function allocatePort(basePort: number, usedPorts: Set<number>): number {
  let port = basePort;
  while (usedPorts.has(port)) {
    port++;
  }
  usedPorts.add(port);
  return port;
}
