import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

const { runCommandMock } = vi.hoisted(() => ({
  runCommandMock: vi.fn(),
}));

vi.mock('./processRunner', () => ({
  runCommand: runCommandMock,
}));

import { buildPackage } from './packageBuilder';
import type { LocalPackage } from './localPackageScanner';

const createdTempDirs: string[] = [];

afterEach(async (): Promise<void> => {
  runCommandMock.mockReset();
  for (const dirPath of createdTempDirs.splice(0, createdTempDirs.length)) {
    await rm(dirPath, { recursive: true, force: true });
  }
});

async function makePackageDir(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'saptools-builder-'));
  createdTempDirs.push(root);
  return root;
}

function createPackage(dir: string, buildScript = 'tsc'): LocalPackage {
  return {
    name: '@example/demo',
    dir,
    version: '1.0.0',
    buildScript,
    dependencyNames: [],
    dependencySpecs: {},
  };
}

describe('buildPackage', () => {
  it('deletes a package .npmrc before installing dependencies by default', async () => {
    const dir = await makePackageDir();
    const npmrcPath = join(dir, '.npmrc');
    await writeFile(npmrcPath, 'registry=https://registry.npmjs.org/\n', 'utf8');
    runCommandMock.mockImplementation(async () => {
      await expect(readFile(npmrcPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    });

    await buildPackage(createPackage(dir), {
      registryUrl: 'http://localhost:4873',
      authToken: 'token',
      onOutput: () => undefined,
    });

    await expect(readFile(npmrcPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('keeps a package .npmrc when deletion is disabled', async () => {
    const dir = await makePackageDir();
    const npmrcPath = join(dir, '.npmrc');
    await writeFile(npmrcPath, 'registry=https://registry.npmjs.org/\n', 'utf8');
    runCommandMock.mockResolvedValue(undefined);

    await buildPackage(createPackage(dir), {
      registryUrl: 'http://localhost:4873',
      authToken: 'token',
      deleteNpmrcBeforeBuild: false,
      onOutput: () => undefined,
    });

    await expect(readFile(npmrcPath, 'utf8')).resolves.toContain('registry=https://registry.npmjs.org/');
  });

  it('refreshes broken lockfile entries before installing dependencies', async () => {
    const dir = await makePackageDir();
    runCommandMock.mockResolvedValue(undefined);

    await buildPackage(createPackage(dir), {
      registryUrl: 'http://localhost:4873',
      authToken: 'token',
      onOutput: () => undefined,
    });

    expect(runCommandMock).toHaveBeenNthCalledWith(
      1,
      'pnpm',
      expect.arrayContaining(['i', '--fix-lockfile']),
      expect.objectContaining({ cwd: dir })
    );
  });

  it('updates local dependency lockfile resolutions before the main install', async () => {
    const dir = await makePackageDir();
    runCommandMock.mockResolvedValue(undefined);

    await buildPackage(createPackage(dir), {
      registryUrl: 'http://localhost:4873',
      authToken: 'token',
      localDependencyNames: ['@neutral/base', '@neutral/base'],
      onOutput: () => undefined,
    });

    expect(runCommandMock).toHaveBeenNthCalledWith(
      1,
      'pnpm',
      [
        'update',
        '@neutral/base',
        '--fix-lockfile',
        '--shamefully-hoist',
        '--config.node-linker=hoisted',
        '--registry',
        'http://localhost:4873',
        '--//localhost:4873/:_authToken=token',
      ],
      expect.objectContaining({ cwd: dir })
    );
    expect(runCommandMock).toHaveBeenNthCalledWith(
      2,
      'pnpm',
      expect.arrayContaining(['i', '--fix-lockfile']),
      expect.objectContaining({ cwd: dir })
    );
  });
});
