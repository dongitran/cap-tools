import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  buildDependencyOrder,
  buildOrderForService,
  type PackageNode,
} from './dependencyGraph';
import type { LocalPackagesConfig } from './localPackagesConfig';
import { scanLocalPackages, type LocalPackage } from './localPackageScanner';
import { buildPackage, type BuildOutcome } from './packageBuilder';
import { publishPackage } from './packagePublisher';
import { runCommand } from './processRunner';
import { replaceServicePackageDependencyTags } from './serviceDependencyTags';

/**
 * Drives the package pipeline: scan the root folder for locally-developed npm packages
 * (by the configured name regex), order them topologically, then build → publish each
 * to the local registry in that order. This operates on the *packages* found under the
 * root — not on the Cloud Foundry app/service list, which is a separate concept. The
 * registry must already be running; the caller passes its URL + auth token.
 */

export type BuildPublishPhase = 'pre-publish-script' | 'build' | 'publish';
export type BuildPublishStatus = 'running' | 'done' | 'skipped' | 'failed';

export interface BuildPublishProgress {
  readonly packageName: string;
  readonly phase: BuildPublishPhase;
  readonly status: BuildPublishStatus;
  readonly index: number;
  readonly total: number;
  readonly message?: string;
}

export interface BuildPublishRequest {
  readonly rootFolderPath: string;
  readonly config: LocalPackagesConfig;
  readonly registryUrl: string;
  readonly authToken: string;
  /** Called once with the resolved build order, before any package is built. */
  readonly onOrder?: (order: readonly string[]) => void;
  readonly onProgress: (progress: BuildPublishProgress) => void;
  readonly onOutput: (chunk: string) => void;
  readonly targetPackageName?: string;
}

export interface BuildPublishOutcome {
  readonly order: readonly string[];
  readonly builtCount: number;
  readonly skippedCount: number;
}

interface BuildPublishCounts {
  readonly builtCount: number;
  readonly skippedCount: number;
}

interface PackagePipelineContext {
  readonly request: BuildPublishRequest;
  readonly pkg: LocalPackage;
  readonly index: number;
  readonly total: number;
  readonly tag: string;
  readonly tagPlaceholders: readonly string[];
  readonly localPackageNames: readonly string[];
}

/**
 * Builds and publishes every detected local package, in dependency order (a package is
 * built only after everything it depends on). Throws if no packages are found or the
 * dependency graph has a cycle.
 */
export async function runBuildPublishAll(
  request: BuildPublishRequest
): Promise<BuildPublishOutcome> {
  const packages = await scanLocalPackages(
    request.rootFolderPath,
    request.config.namePatterns
  );
  if (packages.length === 0) {
    throw new Error(
      'No local packages found under the root folder. Configure "sapTools.localPackages.namePatterns" to match your package names (e.g. "@example/").'
    );
  }

  const byName = new Map<string, LocalPackage>(packages.map((pkg) => [pkg.name, pkg]));
  const nodes: PackageNode[] = packages.map((pkg) => ({
    name: pkg.name,
    deps: pkg.dependencyNames,
  }));
  const order = resolveRequestedOrder(nodes, request.targetPackageName);

  if (request.targetPackageName !== undefined && order.length === 0) {
    throw new Error(`Package "${request.targetPackageName}" not found under the root folder.`);
  }

  request.onOrder?.(order);

  const counts = await buildPublishOrder(request, byName, order, packages);

  return { order, ...counts };
}

function resolveRequestedOrder(
  nodes: readonly PackageNode[],
  targetPackageName: string | undefined
): readonly string[] {
  const fullOrder = buildDependencyOrder(nodes).ordered;
  if (targetPackageName === undefined) {
    return fullOrder;
  }
  return buildOrderForService([targetPackageName], nodes).ordered;
}

async function buildPublishOrder(
  request: BuildPublishRequest,
  byName: ReadonlyMap<string, LocalPackage>,
  order: readonly string[],
  packages: readonly LocalPackage[]
): Promise<BuildPublishCounts> {
  const localPackageNames = packages.map((pkg) => pkg.name);
  const tagPlaceholders = parseTagPlaceholders(request.config);
  let builtCount = 0;
  let skippedCount = 0;

  for (let index = 0; index < order.length; index += 1) {
    const name = order[index] ?? '';
    const pkg = byName.get(name);
    if (pkg === undefined) {
      continue;
    }

    const buildOutcome = await buildPublishPackage({
      request,
      pkg,
      index,
      total: order.length,
      tag: request.config.registry.defaultTag,
      tagPlaceholders,
      localPackageNames,
    });
    if (buildOutcome === 'skipped') {
      skippedCount += 1;
    } else {
      builtCount += 1;
    }
  }

  return { builtCount, skippedCount };
}

function parseTagPlaceholders(config: LocalPackagesConfig): string[] {
  return config.packageJsonTagPlaceholder
    .split(',')
    .map((placeholder) => placeholder.trim())
    .filter((placeholder) => placeholder.length > 0);
}

async function buildPublishPackage(context: PackagePipelineContext): Promise<BuildOutcome> {
  const packageJsonPath = join(context.pkg.dir, 'package.json');
  let originalPackageJsonContent: string | undefined;

  try {
    originalPackageJsonContent = await patchPackageJsonForActiveTag(
      packageJsonPath,
      context
    );
    await runPrePublishScript(context);
    const buildOutcome = await runBuildStep(context);
    await runPublishStep(context);
    return buildOutcome;
  } catch (error) {
    context.request.onProgress({
      packageName: context.pkg.name,
      phase: 'publish',
      status: 'failed',
      index: context.index,
      total: context.total,
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  } finally {
    if (originalPackageJsonContent !== undefined) {
      await writeFile(packageJsonPath, originalPackageJsonContent, 'utf8');
    }
  }
}

async function patchPackageJsonForActiveTag(
  packageJsonPath: string,
  context: PackagePipelineContext
): Promise<string | undefined> {
  const content = await readFile(packageJsonPath, 'utf8');
  const result = replaceServicePackageDependencyTags(content, {
    placeholders: context.tagPlaceholders,
    localPackageNames: context.localPackageNames,
    tag: context.tag,
  });
  if (!result.changed) {
    return undefined;
  }
  await writeFile(packageJsonPath, result.content, 'utf8');
  return content;
}

async function runPrePublishScript(context: PackagePipelineContext): Promise<void> {
  if (context.request.config.prePublishScript.length === 0) {
    return;
  }

  context.request.onProgress({
    packageName: context.pkg.name,
    phase: 'pre-publish-script',
    status: 'running',
    index: context.index,
    total: context.total,
  });
  await runCommand('node', ['-e', context.request.config.prePublishScript], {
    cwd: context.pkg.dir,
    onOutput: context.request.onOutput,
  });
  context.request.onProgress({
    packageName: context.pkg.name,
    phase: 'pre-publish-script',
    status: 'done',
    index: context.index,
    total: context.total,
  });
}

async function runBuildStep(context: PackagePipelineContext): Promise<BuildOutcome> {
  context.request.onProgress({
    packageName: context.pkg.name,
    phase: 'build',
    status: 'running',
    index: context.index,
    total: context.total,
  });
  const buildOutcome = await buildPackage(context.pkg, {
    registryUrl: context.request.registryUrl,
    authToken: context.request.authToken,
    deleteNpmrcBeforeBuild: context.request.config.deleteNpmrcBeforeBuild,
    localDependencyNames: context.pkg.dependencyNames.filter((name) =>
      context.localPackageNames.includes(name)
    ),
    onOutput: context.request.onOutput,
  });
  context.request.onProgress({
    packageName: context.pkg.name,
    phase: 'build',
    status: buildOutcome === 'skipped' ? 'skipped' : 'done',
    index: context.index,
    total: context.total,
    ...(buildOutcome === 'skipped' ? { message: 'no build script' } : {}),
  });
  return buildOutcome;
}

async function runPublishStep(context: PackagePipelineContext): Promise<void> {
  context.request.onProgress({
    packageName: context.pkg.name,
    phase: 'publish',
    status: 'running',
    index: context.index,
    total: context.total,
  });
  const result = await publishPackage(context.pkg, {
    registryUrl: context.request.registryUrl,
    tag: context.tag,
    authToken: context.request.authToken,
    versionBumpStrategy: context.request.config.versionBumpStrategy,
    versionSuffix: context.request.config.registry.versionSuffix,
    onOutput: context.request.onOutput,
  });
  context.request.onProgress({
    packageName: context.pkg.name,
    phase: 'publish',
    status: 'done',
    index: context.index,
    total: context.total,
    message: `${result.publishedVersion} (${result.tag})`,
  });
}
