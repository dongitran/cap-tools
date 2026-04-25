import { access, cp, mkdir, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, '..');
const hdbSourceDir = join(rootDir, 'node_modules', 'hdb');
const iconvSourceDir = join(rootDir, 'node_modules', 'iconv-lite');
const hdbTargetDir = join(rootDir, 'dist', 'vendor', 'hdb');
const iconvTargetDir = join(hdbTargetDir, 'node_modules', 'iconv-lite');

async function ensureSource(name, sourcePath) {
  try {
    await access(sourcePath);
  } catch {
    throw new Error(
      `Missing node_modules/${name}. Run npm install before building SAP Tools.`
    );
  }
}

async function main() {
  await ensureSource('hdb', hdbSourceDir);
  await ensureSource('iconv-lite', iconvSourceDir);
  await rm(hdbTargetDir, { recursive: true, force: true });
  await mkdir(dirname(hdbTargetDir), { recursive: true });
  await cp(hdbSourceDir, hdbTargetDir, { recursive: true, force: true });
  await mkdir(dirname(iconvTargetDir), { recursive: true });
  await cp(iconvSourceDir, iconvTargetDir, { recursive: true, force: true });
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
