import { spawnSync } from 'node:child_process';
import { access, cp, mkdir, readFile, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, '..');
const hdbTargetDir = join(rootDir, 'dist', 'vendor', 'hdb');

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

async function smokeTestVendoredHdb() {
  const entry = join(hdbTargetDir, 'index.js');
  const script = `const hdb = require(${JSON.stringify(entry)});\n` +
    `if (typeof hdb.createClient !== 'function') {\n` +
    `  throw new Error('Vendored hdb is missing createClient.');\n` +
    `}\n`;
  const result = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8' });
  if (result.status !== 0) {
    const stderr = result.stderr.trim();
    throw new Error(`Vendored hdb failed smoke test:\n${stderr}`);
  }
}

async function main() {
  const hdbSourceDir = join(rootDir, 'node_modules', 'hdb');
  if (!(await exists(hdbSourceDir))) {
    throw new Error('Missing node_modules/hdb. Run npm install before building SAP Tools.');
  }

  const tree = await collectDependencyTree(hdbSourceDir);

  await rm(hdbTargetDir, { recursive: true, force: true });
  await mkdir(dirname(hdbTargetDir), { recursive: true });

  for (const [name, sourceDir] of tree) {
    const targetDir = name === 'hdb'
      ? hdbTargetDir
      : join(hdbTargetDir, 'node_modules', name);
    await mkdir(dirname(targetDir), { recursive: true });
    await cp(sourceDir, targetDir, { recursive: true, force: true });
  }

  await smokeTestVendoredHdb();
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
