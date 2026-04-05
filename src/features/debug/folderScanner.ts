import * as fs from 'fs';
import * as path from 'path';

/**
 * Recursively finds all directories that look like CAP/Node.js project folders
 * (contain a package.json) within a root directory up to a given depth.
 */
export function findAppFolders(rootPath: string, maxDepth = 6): string[] {
  const results: string[] = [];
  scanDir(rootPath, 0, maxDepth, results);
  return results;
}

function scanDir(dir: string, depth: number, maxDepth: number, results: string[]): void {
  if (depth > maxDepth) return;

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  const hasPackageJson = entries.some(e => e.isFile() && e.name === 'package.json');
  if (hasPackageJson && depth > 0) {
    results.push(dir);
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') continue;
    scanDir(path.join(dir, entry.name), depth + 1, maxDepth, results);
  }
}

/**
 * Returns the folder name (basename) for a given path.
 */
export function folderBasename(folderPath: string): string {
  return path.basename(folderPath);
}
