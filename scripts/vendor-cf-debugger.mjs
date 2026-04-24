import { access, cp, mkdir, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, '..');
const sourceDir = join(rootDir, 'node_modules', '@saptools', 'cf-debugger');
const targetDir = join(rootDir, 'dist', 'vendor', 'cf-debugger');

async function ensureSourcePackage() {
  try {
    await access(sourceDir);
  } catch {
    throw new Error(
      'Missing node_modules/@saptools/cf-debugger. Run npm install before building SAP Tools.'
    );
  }
}

async function main() {
  await ensureSourcePackage();
  await rm(targetDir, { recursive: true, force: true });
  await mkdir(dirname(targetDir), { recursive: true });
  await cp(sourceDir, targetDir, { recursive: true, force: true });
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
