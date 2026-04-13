import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  buildServiceFolderMappings,
  getFolderNameCandidates,
} from './serviceFolderMapping';

const createdTempDirs: string[] = [];

afterEach(async (): Promise<void> => {
  for (const dirPath of createdTempDirs.splice(0, createdTempDirs.length)) {
    await rm(dirPath, { recursive: true, force: true });
  }
});

describe('getFolderNameCandidates', () => {
  it('returns exact and underscore candidates for dashed app names', () => {
    expect(getFolderNameCandidates('finance-uat-api')).toEqual([
      'finance-uat-api',
      'finance_uat_api',
    ]);
  });

  it('returns only exact candidate when no dash exists', () => {
    expect(getFolderNameCandidates('billingapi')).toEqual(['billingapi']);
  });
});

describe('buildServiceFolderMappings', () => {
  it('maps apps by exact folder name and underscore variant', async (): Promise<void> => {
    const rootDir = await createTempRootDir();
    await createRepoFolder(rootDir, 'finance-uat-api');
    await createRepoFolder(rootDir, 'finance_uat_worker');

    const mappings = await buildServiceFolderMappings(rootDir, [
      'finance-uat-api',
      'finance-uat-worker',
      'missing-service',
    ]);

    expect(mappings).toEqual([
      {
        appId: 'finance-uat-api',
        appName: 'finance-uat-api',
        folderPath: join(rootDir, 'finance-uat-api'),
        matchType: 'exact',
      },
      {
        appId: 'finance-uat-worker',
        appName: 'finance-uat-worker',
        folderPath: join(rootDir, 'finance_uat_worker'),
        matchType: 'underscore',
      },
      {
        appId: 'missing-service',
        appName: 'missing-service',
        folderPath: '',
        matchType: 'none',
      },
    ]);
  });

  it('ignores directories without package.json', async (): Promise<void> => {
    const rootDir = await createTempRootDir();
    await mkdir(join(rootDir, 'not-a-repo'), { recursive: true });

    const mappings = await buildServiceFolderMappings(rootDir, ['not-a-repo']);

    expect(mappings).toEqual([
      {
        appId: 'not-a-repo',
        appName: 'not-a-repo',
        folderPath: '',
        matchType: 'none',
      },
    ]);
  });

  it('respects max scan depth and does not map overly deep folders', async (): Promise<void> => {
    const rootDir = await createTempRootDir();
    const deepServicePath = join(
      rootDir,
      'a',
      'b',
      'c',
      'd',
      'e',
      'f',
      'g',
      'deep-service'
    );
    await mkdir(deepServicePath, { recursive: true });
    await writeFile(join(deepServicePath, 'package.json'), '{"name":"deep-service"}', 'utf8');

    const mappings = await buildServiceFolderMappings(rootDir, ['deep-service']);

    expect(mappings[0]).toEqual({
      appId: 'deep-service',
      appName: 'deep-service',
      folderPath: '',
      matchType: 'none',
    });
  });
});

async function createTempRootDir(): Promise<string> {
  const rootDir = await mkdtemp(join(tmpdir(), 'sap-tools-folder-map-'));
  createdTempDirs.push(rootDir);
  return rootDir;
}

async function createRepoFolder(rootDir: string, relativePath: string): Promise<void> {
  const folderPath = join(rootDir, relativePath);
  await mkdir(folderPath, { recursive: true });
  await writeFile(join(folderPath, 'package.json'), '{"name":"repo"}', 'utf8');
}
