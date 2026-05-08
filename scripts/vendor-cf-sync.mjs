import { access, cp, mkdir, readFile, rm } from 'node:fs/promises';
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

  await smokeTestVendoredCfSync();
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
