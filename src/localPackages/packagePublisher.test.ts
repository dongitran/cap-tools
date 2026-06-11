import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

const { MockCommandFailedError, runCommandMock } = vi.hoisted(() => {
  class HoistedCommandFailedError extends Error {
    readonly code: number;
    readonly stdout: string;
    readonly stderr: string;

    constructor(command: string, code: number, stdout: string, stderr: string) {
      const detail = stderr.trim().length > 0 ? `: ${stderr.trim()}` : '';
      super(`Command "${command}" failed with exit code ${String(code)}${detail}`);
      this.code = code;
      this.stdout = stdout;
      this.stderr = stderr;
    }
  }

  return {
    MockCommandFailedError: HoistedCommandFailedError,
    runCommandMock: vi.fn(),
  };
});

vi.mock('./processRunner', () => ({
  CommandFailedError: MockCommandFailedError,
  runCommand: runCommandMock,
}));

import {
  computePublishVersion,
  npmRegistryAuthKey,
  publishPackage,
  resolvePublishTag,
} from './packagePublisher';

import type { LocalPackage } from './localPackageScanner';

const createdTempDirs: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  runCommandMock.mockReset();
  for (const dirPath of createdTempDirs.splice(0, createdTempDirs.length)) {
    await rm(dirPath, { recursive: true, force: true });
  }
});

async function makePackageDir(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'saptools-publisher-'));
  createdTempDirs.push(root);
  await writeFile(
    join(root, 'package.json'),
    `${JSON.stringify({ name: '@example/demo', version: '1.0.0' }, null, 2)}\n`,
    'utf8'
  );
  return root;
}

function createPackage(dir: string): LocalPackage {
  return {
    name: '@example/demo',
    dir,
    version: '1.0.0',
    buildScript: 'tsc',
    dependencyNames: [],
    dependencySpecs: {},
  };
}

describe('computePublishVersion', () => {
  it('appends a unique local prerelease suffix by default', () => {
    expect(computePublishVersion('1.0.0-origin-staging-5', 'prerelease-timestamp', 1700)).toBe(
      '1.0.0-origin-staging-5-local.1700'
    );
  });

  it('replaces an older org-space publish suffix with the active space-org suffix', () => {
    expect(
      computePublishVersion('1.0.0-origin-uat-10', 'prerelease-timestamp', 1700, 'uat-origin')
    ).toBe('1.0.0-uat-origin-1700');
  });

  it('does not stack local suffixes across republishes', () => {
    expect(computePublishVersion('1.0.0-local.1699', 'prerelease-timestamp', 1700)).toBe(
      '1.0.0-local.1700'
    );
  });

  it('leaves the version untouched for the "none" strategy', () => {
    expect(computePublishVersion('1.0.0', 'none', 1700)).toBe('1.0.0');
  });
});

describe('npmRegistryAuthKey', () => {
  it('derives the npm auth config key from the registry url', () => {
    expect(npmRegistryAuthKey('http://localhost:4873')).toBe('//localhost:4873/');
    expect(npmRegistryAuthKey('http://localhost:4873/')).toBe('//localhost:4873/');
  });
});

describe('resolvePublishTag', () => {
  it('reuses a plain dist-tag the service requests', () => {
    expect(resolvePublishTag('staging', 'latest')).toBe('staging');
  });

  it('falls back to the default tag for semver ranges', () => {
    expect(resolvePublishTag('^1.0.0', 'staging')).toBe('staging');
    expect(resolvePublishTag('1.2.3', 'staging')).toBe('staging');
    expect(resolvePublishTag(undefined, 'staging')).toBe('staging');
  });
});

describe('publishPackage', () => {
  it('deletes the previous version behind the active tag after publishing the new version', async () => {
    const dir = await makePackageDir();
    vi.spyOn(Date, 'now').mockReturnValue(1700);
    runCommandMock
      .mockResolvedValueOnce({
        code: 0,
        stdout: '"1.0.0-local.1699"\n',
        stderr: '',
      })
      .mockResolvedValueOnce({ code: 0, stdout: '', stderr: '' })
      .mockResolvedValueOnce({ code: 0, stdout: '', stderr: '' });

    const result = await publishPackage(createPackage(dir), {
      registryUrl: 'http://localhost:4873',
      tag: 'cf-uat-finance',
      authToken: 'token',
      versionBumpStrategy: 'prerelease-timestamp',
      versionSuffix: 'uat-finance',
      onOutput: () => undefined,
    });

    expect(result).toEqual({
      publishedVersion: '1.0.0-uat-finance-1700',
      tag: 'cf-uat-finance',
    });
    expect(runCommandMock).toHaveBeenNthCalledWith(
      1,
      'npm',
      [
        'view',
        '@example/demo@cf-uat-finance',
        'version',
        '--json',
        '--registry',
        'http://localhost:4873',
        '--//localhost:4873/:_authToken=token',
      ],
      expect.objectContaining({ cwd: dir })
    );
    expect(runCommandMock).toHaveBeenNthCalledWith(
      2,
      'npm',
      [
        'publish',
        '--registry',
        'http://localhost:4873',
        '--tag',
        'cf-uat-finance',
        '--//localhost:4873/:_authToken=token',
      ],
      expect.objectContaining({ cwd: dir })
    );
    expect(runCommandMock).toHaveBeenNthCalledWith(
      3,
      'npm',
      [
        'unpublish',
        '@example/demo@1.0.0-local.1699',
        '--force',
        '--registry',
        'http://localhost:4873',
        '--//localhost:4873/:_authToken=token',
      ],
      expect.objectContaining({ cwd: dir })
    );
    await expect(readFile(join(dir, 'package.json'), 'utf8')).resolves.toContain(
      '"version": "1.0.0"'
    );
  });

  it('does not delete a tag version when the tag already points to the published version', async () => {
    const dir = await makePackageDir();
    vi.spyOn(Date, 'now').mockReturnValue(1700);
    runCommandMock
      .mockResolvedValueOnce({
        code: 0,
        stdout: '"1.0.0-uat-finance-1700"\n',
        stderr: '',
      })
      .mockResolvedValueOnce({ code: 0, stdout: '', stderr: '' });

    await publishPackage(createPackage(dir), {
      registryUrl: 'http://localhost:4873',
      tag: 'cf-uat-finance',
      authToken: 'token',
      versionBumpStrategy: 'prerelease-timestamp',
      versionSuffix: 'uat-finance',
      onOutput: () => undefined,
    });

    expect(runCommandMock).toHaveBeenCalledTimes(2);
  });

  it('publishes without cleanup when the tag does not exist yet', async () => {
    const dir = await makePackageDir();
    vi.spyOn(Date, 'now').mockReturnValue(1700);
    runCommandMock
      .mockRejectedValueOnce(
        new MockCommandFailedError(
          'npm',
          1,
          '',
          'npm ERR! code E404\nnpm ERR! 404 Not Found'
        )
      )
      .mockResolvedValueOnce({ code: 0, stdout: '', stderr: '' });

    await publishPackage(createPackage(dir), {
      registryUrl: 'http://localhost:4873',
      tag: 'cf-uat-finance',
      authToken: 'token',
      versionBumpStrategy: 'prerelease-timestamp',
      versionSuffix: 'uat-finance',
      onOutput: () => undefined,
    });

    expect(runCommandMock).toHaveBeenCalledTimes(2);
  });

  it('keeps the previous tag version when publishing fails', async () => {
    const dir = await makePackageDir();
    vi.spyOn(Date, 'now').mockReturnValue(1700);
    runCommandMock
      .mockResolvedValueOnce({
        code: 0,
        stdout: '"1.0.0-local.1699"\n',
        stderr: '',
      })
      .mockRejectedValueOnce(
        new MockCommandFailedError('npm', 1, '', 'npm ERR! publish failed')
      );

    await expect(
      publishPackage(createPackage(dir), {
        registryUrl: 'http://localhost:4873',
        tag: 'cf-uat-finance',
        authToken: 'token',
        versionBumpStrategy: 'prerelease-timestamp',
        versionSuffix: 'uat-finance',
        onOutput: () => undefined,
      })
    ).rejects.toThrow('publish failed');

    expect(runCommandMock).toHaveBeenCalledTimes(2);
    await expect(readFile(join(dir, 'package.json'), 'utf8')).resolves.toContain(
      '"version": "1.0.0"'
    );
  });
});
