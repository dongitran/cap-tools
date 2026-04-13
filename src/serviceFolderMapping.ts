import { access, readdir } from 'node:fs/promises';
import { basename, join } from 'node:path';

const MAX_SCAN_DEPTH = 6;
const SKIPPED_DIRECTORIES = new Set([
  '.git',
  '.hg',
  '.svn',
  '.vscode',
  '.idea',
  'node_modules',
  'dist',
  'build',
  'coverage',
  'out',
]);

export interface ServiceFolderMapping {
  readonly appId: string;
  readonly appName: string;
  readonly folderPath: string;
  readonly matchType: 'exact' | 'underscore' | 'none';
}

export async function buildServiceFolderMappings(
  rootFolderPath: string,
  appNames: readonly string[]
): Promise<readonly ServiceFolderMapping[]> {
  const normalizedRootFolderPath = rootFolderPath.trim();
  if (normalizedRootFolderPath.length === 0) {
    throw new Error('Local root folder path is empty.');
  }

  const normalizedAppNames = normalizeAppNames(appNames);
  if (normalizedAppNames.length === 0) {
    return [];
  }

  const repoFolders = await collectRepoFolders(normalizedRootFolderPath);
  const folderIndex = createFolderIndex(repoFolders);

  return normalizedAppNames.map((appName) => {
    const candidates = getFolderNameCandidates(appName);
    for (const candidate of candidates) {
      const candidateKey = candidate.toLowerCase();
      const candidatePaths = folderIndex.get(candidateKey);
      if (candidatePaths === undefined || candidatePaths.length === 0) {
        continue;
      }
      const bestPath = pickBestPath(candidatePaths);
      return {
        appId: appName,
        appName,
        folderPath: bestPath,
        matchType: candidate === appName ? 'exact' : 'underscore',
      } satisfies ServiceFolderMapping;
    }

    return {
      appId: appName,
      appName,
      folderPath: '',
      matchType: 'none',
    } satisfies ServiceFolderMapping;
  });
}

export function getFolderNameCandidates(appName: string): string[] {
  const normalizedAppName = appName.trim();
  if (normalizedAppName.length === 0) {
    return [];
  }

  const candidates = [normalizedAppName];
  const underscoreVariant = normalizedAppName.replaceAll('-', '_');
  if (underscoreVariant !== normalizedAppName) {
    candidates.push(underscoreVariant);
  }
  return candidates;
}

function normalizeAppNames(appNames: readonly string[]): string[] {
  const uniqueNames = new Set<string>();
  const normalizedNames: string[] = [];

  for (const appName of appNames) {
    const normalizedName = appName.trim();
    if (
      normalizedName.length === 0 ||
      normalizedName.length > 128 ||
      uniqueNames.has(normalizedName)
    ) {
      continue;
    }
    uniqueNames.add(normalizedName);
    normalizedNames.push(normalizedName);
  }

  return normalizedNames;
}

async function collectRepoFolders(rootFolderPath: string): Promise<string[]> {
  const repoFolders: string[] = [];
  await walkDirectories(rootFolderPath, 0, repoFolders);
  return repoFolders;
}

async function walkDirectories(
  currentFolderPath: string,
  depth: number,
  repoFolders: string[]
): Promise<void> {
  if (depth > MAX_SCAN_DEPTH) {
    return;
  }

  let entries;
  try {
    entries = await readdir(currentFolderPath, { withFileTypes: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unable to read directory entries.';
    throw new Error(`Failed to scan "${currentFolderPath}": ${message}`);
  }

  const hasPackageJson = await directoryHasPackageJson(currentFolderPath);
  if (hasPackageJson) {
    repoFolders.push(currentFolderPath);
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    if (SKIPPED_DIRECTORIES.has(entry.name)) {
      continue;
    }

    const childFolderPath = join(currentFolderPath, entry.name);
    await walkDirectories(childFolderPath, depth + 1, repoFolders);
  }
}

async function directoryHasPackageJson(folderPath: string): Promise<boolean> {
  try {
    await access(join(folderPath, 'package.json'));
    return true;
  } catch {
    return false;
  }
}

function createFolderIndex(repoFolders: readonly string[]): Map<string, string[]> {
  const folderIndex = new Map<string, string[]>();

  for (const folderPath of repoFolders) {
    const folderName = basename(folderPath).trim();
    if (folderName.length === 0) {
      continue;
    }

    const folderKey = folderName.toLowerCase();
    const currentPaths = folderIndex.get(folderKey);
    if (currentPaths === undefined) {
      folderIndex.set(folderKey, [folderPath]);
      continue;
    }

    currentPaths.push(folderPath);
  }

  return folderIndex;
}

function pickBestPath(paths: readonly string[]): string {
  if (paths.length === 1) {
    return paths[0] ?? '';
  }

  const sortedPaths = [...paths].sort((leftPath, rightPath) => {
    const leftDepth = resolvePathDepth(leftPath);
    const rightDepth = resolvePathDepth(rightPath);
    if (leftDepth !== rightDepth) {
      return leftDepth - rightDepth;
    }

    if (leftPath.length !== rightPath.length) {
      return leftPath.length - rightPath.length;
    }

    return leftPath.localeCompare(rightPath);
  });

  return sortedPaths[0] ?? '';
}

function resolvePathDepth(pathValue: string): number {
  return pathValue.split(/[\\/]+/).length;
}
