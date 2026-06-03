import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  buildServiceFolderMappings,
  getFolderNameCandidates,
  resolveOverrideFolder,
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

  it('puts an explicit override folder first as the highest-priority candidate', () => {
    expect(
      getFolderNameCandidates('finance-uat-api', [
        { appName: 'finance-uat-api', folderName: 'legacy-billing' },
      ])
    ).toEqual(['legacy-billing', 'finance-uat-api', 'finance_uat_api']);
  });

  it('does not duplicate when the override equals an existing candidate', () => {
    expect(
      getFolderNameCandidates('finance-uat-api', [
        { appName: 'finance-uat-api', folderName: 'finance-uat-api' },
      ])
    ).toEqual(['finance-uat-api', 'finance_uat_api']);
  });

  it('ignores overrides for other apps', () => {
    expect(
      getFolderNameCandidates('billingapi', [
        { appName: 'other-app', folderName: 'somewhere' },
      ])
    ).toEqual(['billingapi']);
  });
});

describe('resolveOverrideFolder', () => {
  it('returns the configured folder name for an exact app-name match', () => {
    expect(
      resolveOverrideFolder('finance-uat-api', [
        { appName: 'finance-uat-api', folderName: 'legacy-billing' },
      ])
    ).toBe('legacy-billing');
  });

  it('returns undefined when there is no override or the list is empty', () => {
    expect(resolveOverrideFolder('finance-uat-api')).toBeUndefined();
    expect(resolveOverrideFolder('finance-uat-api', [])).toBeUndefined();
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
        candidateFolderPaths: [join(rootDir, 'finance-uat-api')],
        hasConflict: false,
      },
      {
        appId: 'finance-uat-worker',
        appName: 'finance-uat-worker',
        folderPath: join(rootDir, 'finance_uat_worker'),
        matchType: 'underscore',
        candidateFolderPaths: [join(rootDir, 'finance_uat_worker')],
        hasConflict: false,
      },
      {
        appId: 'missing-service',
        appName: 'missing-service',
        folderPath: '',
        matchType: 'none',
        candidateFolderPaths: [],
        hasConflict: false,
      },
    ]);
  });

  it('maps an app to an explicitly overridden folder name as an exact match', async (): Promise<void> => {
    const rootDir = await createTempRootDir();
    await createRepoFolder(rootDir, 'legacy-billing');

    const mappings = await buildServiceFolderMappings(
      rootDir,
      ['finance-uat-api'],
      [{ appName: 'finance-uat-api', folderName: 'legacy-billing' }]
    );

    expect(mappings).toEqual([
      {
        appId: 'finance-uat-api',
        appName: 'finance-uat-api',
        folderPath: join(rootDir, 'legacy-billing'),
        matchType: 'exact',
        candidateFolderPaths: [join(rootDir, 'legacy-billing')],
        hasConflict: false,
      },
    ]);
  });

  it('returns conflict state when multiple local folders match the same app', async (): Promise<void> => {
    const rootDir = await createTempRootDir();
    await createRepoFolder(rootDir, 'apps-a/finance-uat-api');
    await createRepoFolder(rootDir, 'apps-b/finance-uat-api');

    const mappings = await buildServiceFolderMappings(rootDir, ['finance-uat-api']);

    expect(mappings).toEqual([
      {
        appId: 'finance-uat-api',
        appName: 'finance-uat-api',
        folderPath: '',
        matchType: 'ambiguous',
        candidateFolderPaths: [
          join(rootDir, 'apps-a/finance-uat-api'),
          join(rootDir, 'apps-b/finance-uat-api'),
        ],
        hasConflict: true,
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
        candidateFolderPaths: [],
        hasConflict: false,
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
      candidateFolderPaths: [],
      hasConflict: false,
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
