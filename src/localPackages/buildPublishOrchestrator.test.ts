import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { BuildOptions, BuildOutcome } from './packageBuilder';
import type { LocalPackagesConfig } from './localPackagesConfig';
import type { LocalPackage } from './localPackageScanner';
import type { PublishOptions, PublishResult } from './packagePublisher';

const {
  buildPackageMock,
  publishPackageMock,
  runCommandMock,
  scanLocalPackagesMock,
} = vi.hoisted(() => ({
  buildPackageMock: vi.fn(),
  publishPackageMock: vi.fn(),
  runCommandMock: vi.fn(),
  scanLocalPackagesMock: vi.fn(),
}));

vi.mock('./localPackageScanner', () => ({
  scanLocalPackages: scanLocalPackagesMock,
}));

vi.mock('./packageBuilder', () => ({
  buildPackage: buildPackageMock,
}));

vi.mock('./packagePublisher', () => ({
  publishPackage: publishPackageMock,
}));

vi.mock('./processRunner', () => ({
  runCommand: runCommandMock,
}));

import { runBuildPublishAll } from './buildPublishOrchestrator';

const createdTempDirs: string[] = [];

afterEach(async (): Promise<void> => {
  vi.restoreAllMocks();
  buildPackageMock.mockReset();
  publishPackageMock.mockReset();
  runCommandMock.mockReset();
  scanLocalPackagesMock.mockReset();
  for (const dirPath of createdTempDirs.splice(0, createdTempDirs.length)) {
    await rm(dirPath, { recursive: true, force: true });
  }
});

async function makeRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'neutral-localpkg-'));
  createdTempDirs.push(root);
  return root;
}

async function writePackageJson(
  dir: string,
  packageJson: Record<string, unknown>
): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'package.json'), `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8');
}

function createConfig(): LocalPackagesConfig {
  return {
    namePatterns: '@neutral/',
    prePublishScript: '',
    packageJsonTagPlaceholder: '',
    versionBumpStrategy: 'prerelease-timestamp',
    deleteNpmrcBeforeBuild: true,
    installInServiceAfterPublish: true,
    registry: {
      port: 4873,
      scopes: ['@neutral'],
      defaultTag: 'cf-test-workspace',
      versionSuffix: 'test-workspace',
      autoStart: true,
    },
  };
}

function createPackage(
  name: string,
  dir: string,
  dependencies: Readonly<Record<string, string>> = {}
): LocalPackage {
  return {
    name,
    dir,
    version: '1.0.0',
    buildScript: 'tsc',
    dependencyNames: Object.keys(dependencies),
    dependencySpecs: dependencies,
  };
}

function mockSuccessfulPipeline(): void {
  buildPackageMock.mockImplementation(
    async (): Promise<BuildOutcome> => 'built'
  );
  publishPackageMock.mockImplementation(
    async (pkg: LocalPackage, options: PublishOptions): Promise<PublishResult> => ({
      publishedVersion: `${pkg.version}-test-workspace-1`,
      tag: options.tag,
    })
  );
}

describe('runBuildPublishAll', () => {
  it('builds a targeted package after its transitive local dependencies', async () => {
    const root = await makeRoot();
    const baseDir = join(root, 'base');
    const appDir = join(root, 'app');
    await writePackageJson(baseDir, {
      name: '@neutral/base',
      version: '1.0.0',
    });
    await writePackageJson(appDir, {
      name: '@neutral/app',
      version: '1.0.0',
      dependencies: {
        '@neutral/base': 'cf-test-workspace',
      },
    });
    const packages = [
      createPackage('@neutral/base', baseDir),
      createPackage('@neutral/app', appDir, { '@neutral/base': 'cf-test-workspace' }),
    ];
    scanLocalPackagesMock.mockResolvedValue(packages);
    mockSuccessfulPipeline();

    const previewOrders: string[][] = [];

    const outcome = await runBuildPublishAll({
      rootFolderPath: root,
      config: createConfig(),
      registryUrl: 'http://localhost:4873',
      authToken: 'token',
      targetPackageName: '@neutral/app',
      onOrder: (order) => previewOrders.push([...order]),
      onProgress: () => undefined,
      onOutput: () => undefined,
    });

    expect(previewOrders).toEqual([['@neutral/base', '@neutral/app']]);
    expect(outcome.order).toEqual(['@neutral/base', '@neutral/app']);
    expect(buildPackageMock.mock.calls.map(([pkg]: [LocalPackage, BuildOptions]) => pkg.name))
      .toEqual(['@neutral/base', '@neutral/app']);
    expect(
      buildPackageMock.mock.calls.map(([, options]: [LocalPackage, BuildOptions]) =>
        options.localDependencyNames ?? []
      )
    ).toEqual([[], ['@neutral/base']]);
    expect(publishPackageMock.mock.calls.map(([pkg]: [LocalPackage, PublishOptions]) => pkg.name))
      .toEqual(['@neutral/base', '@neutral/app']);
  });

  it('builds local dependents with their local dependency specs pinned to the active tag', async () => {
    const root = await makeRoot();
    const baseDir = join(root, 'base');
    const appDir = join(root, 'app');
    await writePackageJson(baseDir, {
      name: '@neutral/base',
      version: '1.0.0',
    });
    await writePackageJson(appDir, {
      name: '@neutral/app',
      version: '1.0.0',
      dependencies: {
        '@neutral/base': 'old-tag',
        lodash: '^4.17.21',
      },
    });

    const packages = [
      createPackage('@neutral/base', baseDir),
      createPackage('@neutral/app', appDir, { '@neutral/base': 'old-tag' }),
    ];
    scanLocalPackagesMock.mockResolvedValue(packages);
    publishPackageMock.mockImplementation(
      async (pkg: LocalPackage, options: PublishOptions): Promise<PublishResult> => ({
        publishedVersion: `${pkg.version}-test-workspace-1`,
        tag: options.tag,
      })
    );

    const dependencySpecsDuringBuild: string[] = [];
    buildPackageMock.mockImplementation(
      async (pkg: LocalPackage): Promise<BuildOutcome> => {
        if (pkg.name === '@neutral/app') {
          const content = await readFile(join(pkg.dir, 'package.json'), 'utf8');
          const parsed = JSON.parse(content) as {
            dependencies: Record<string, string>;
          };
          dependencySpecsDuringBuild.push(parsed.dependencies['@neutral/base'] ?? '');
        }
        return 'built';
      }
    );

    await runBuildPublishAll({
      rootFolderPath: root,
      config: createConfig(),
      registryUrl: 'http://localhost:4873',
      authToken: 'token',
      onProgress: () => undefined,
      onOutput: () => undefined,
    });

    const restoredContent = await readFile(join(appDir, 'package.json'), 'utf8');
    const restored = JSON.parse(restoredContent) as {
      dependencies: Record<string, string>;
    };

    expect(dependencySpecsDuringBuild).toEqual(['cf-test-workspace']);
    expect(restored.dependencies['@neutral/base']).toBe('old-tag');
    expect(restored.dependencies['lodash']).toBe('^4.17.21');
  });
});
