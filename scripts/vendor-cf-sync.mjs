import { access, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, '..');
const cfSyncTargetDir = join(rootDir, 'dist', 'vendor', '@saptools', 'cf-sync');

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function readPackageJson(pkgDir) {
  const data = await readFile(join(pkgDir, 'package.json'), 'utf8');
  return JSON.parse(data);
}

async function resolvePackageDir(name, fromDir) {
  let cursor = fromDir;
  while (true) {
    const candidate = join(cursor, 'node_modules', name);
    if (await exists(join(candidate, 'package.json'))) {
      return candidate;
    }
    const parent = dirname(cursor);
    if (parent === cursor) {
      return undefined;
    }
    cursor = parent;
  }
}

async function collectDependencyTree(rootPkgDir) {
  const visited = new Map();

  async function visit(pkgDir) {
    const pkg = await readPackageJson(pkgDir);
    if (visited.has(pkg.name)) {
      return;
    }
    visited.set(pkg.name, pkgDir);
    const merged = {
      ...(pkg.dependencies ?? {}),
      ...(pkg.optionalDependencies ?? {}),
    };
    for (const depName of Object.keys(merged)) {
      const depDir = await resolvePackageDir(depName, pkgDir);
      if (depDir === undefined) {
        continue;
      }
      await visit(depDir);
    }
  }

  await visit(rootPkgDir);
  return visited;
}

/**
 * @saptools/cf-sync hard-codes its data directory to ~/.saptools/ via
 * `saptoolsDir()`. That directory — and its exclusive lock files — are shared
 * with the sibling CDS Debug extension, and the state lock has no stale
 * recovery, so an orphaned lock breaks every later sync. To let the extension
 * fall back to a private working directory when the shared lock is busy, we
 * teach the vendored copy to honour the SAPTOOLS_DIR_OVERRIDE env var. Every
 * path helper funnels through saptoolsDir(), so this single-point patch
 * relocates the entire data directory (structure, runtime state, every lock).
 *
 * The patch runs against the freshly copied dist on every build, so it stays
 * applied across `npm install` without touching node_modules. It fails loudly
 * if the upstream internals change, surfacing the need to update the patch.
 */
async function patchSaptoolsDirOverride() {
  const entryPath = join(cfSyncTargetDir, 'dist', 'index.js');
  const source = await readFile(entryPath, 'utf8');
  if (source.includes('SAPTOOLS_DIR_OVERRIDE')) {
    return;
  }
  const original =
    'function saptoolsDir() {\n  return join(homedir(), SAPTOOLS_DIR_NAME);\n}';
  if (!source.includes(original)) {
    throw new Error(
      'vendor-cf-sync: could not locate saptoolsDir() to inject SAPTOOLS_DIR_OVERRIDE. ' +
        'The @saptools/cf-sync internals changed — update scripts/vendor-cf-sync.mjs.'
    );
  }
  const patched =
    'function saptoolsDir() {\n' +
    '  const override = process.env["SAPTOOLS_DIR_OVERRIDE"];\n' +
    '  return override && override.length > 0 ? override : join(homedir(), SAPTOOLS_DIR_NAME);\n' +
    '}';
  await writeFile(entryPath, source.replace(original, patched), 'utf8');
}

/**
 * @saptools/cf-sync runs every `cf` CLI command (api/auth/target/apps, …) with a
 * fixed 30s timeout (DEFAULT_CF_COMMAND_TIMEOUT_MS), and syncSpace() never passes a
 * per-call override — withCfSession() builds a context with only CF_HOME. On a slow
 * network the first-time org/space sync, whose `cf apps` can legitimately take
 * minutes, was being killed at 30s, so the app list silently failed to load. Raise
 * the vendored default to 10 minutes to match the extension's own CF CLI timeout
 * (CF_COMMAND_TIMEOUT_MS in src/cfClient.ts).
 *
 * Like the SAPTOOLS_DIR_OVERRIDE patch, this runs against the freshly copied dist on
 * every build, so it survives `npm install` without touching node_modules, and fails
 * loudly if the upstream constant changes.
 */
async function patchCfCommandTimeout() {
  const entryPath = join(cfSyncTargetDir, 'dist', 'index.js');
  const source = await readFile(entryPath, 'utf8');
  const patched = 'var DEFAULT_CF_COMMAND_TIMEOUT_MS = 6e5;';
  if (source.includes(patched)) {
    return;
  }
  const original = 'var DEFAULT_CF_COMMAND_TIMEOUT_MS = 3e4;';
  if (!source.includes(original)) {
    throw new Error(
      'vendor-cf-sync: could not locate DEFAULT_CF_COMMAND_TIMEOUT_MS to raise the CF CLI timeout. ' +
        'The @saptools/cf-sync internals changed — update scripts/vendor-cf-sync.mjs.'
    );
  }
  await writeFile(entryPath, source.replace(original, patched), 'utf8');
}

async function smokeTestVendoredCfSync() {
  const entryPath = join(cfSyncTargetDir, 'dist', 'index.js');
  const entryUrl = pathToFileURL(entryPath).href;
  const cfSync = await import(entryUrl);
  if (typeof cfSync.getAllRegions !== 'function') {
    throw new Error('Vendored @saptools/cf-sync is missing getAllRegions.');
  }
  if (typeof cfSync.cfStructurePath !== 'function') {
    throw new Error('Vendored @saptools/cf-sync is missing cfStructurePath.');
  }
  if (typeof cfSync.syncSpace !== 'function') {
    throw new Error('Vendored @saptools/cf-sync is missing syncSpace.');
  }
}

async function main() {
  const cfSyncSourceDir = join(rootDir, 'node_modules', '@saptools', 'cf-sync');
  if (!(await exists(cfSyncSourceDir))) {
    throw new Error(
      'Missing node_modules/@saptools/cf-sync. Run npm install before building SAP Tools.'
    );
  }

  const tree = await collectDependencyTree(cfSyncSourceDir);

  await rm(cfSyncTargetDir, { recursive: true, force: true });
  await mkdir(dirname(cfSyncTargetDir), { recursive: true });

  for (const [name, sourceDir] of tree) {
    const targetDir =
      name === '@saptools/cf-sync'
        ? cfSyncTargetDir
        : join(cfSyncTargetDir, 'node_modules', name);
    await mkdir(dirname(targetDir), { recursive: true });
    await cp(sourceDir, targetDir, { recursive: true, force: true });
  }

  await patchSaptoolsDirOverride();
  await patchCfCommandTimeout();
  await smokeTestVendoredCfSync();
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
