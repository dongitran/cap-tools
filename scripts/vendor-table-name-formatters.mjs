import { spawnSync } from 'node:child_process';
import { access, cp, mkdir, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, '..');
const vendorRoot = join(rootDir, 'dist', 'vendor');

const packages = [
  {
    name: 'wordsninja',
    sourceDir: join(rootDir, 'node_modules', 'wordsninja'),
    targetDir: join(vendorRoot, 'wordsninja'),
  },
  {
    name: 'change-case',
    sourceDir: join(rootDir, 'node_modules', 'change-case'),
    targetDir: join(vendorRoot, 'change-case'),
  },
];

async function ensureSourcePackage(packageConfig) {
  try {
    await access(packageConfig.sourceDir);
  } catch {
    throw new Error(`Missing node_modules/${packageConfig.name}. Run npm install before building SAP Tools.`);
  }
}

async function copyPackage(packageConfig) {
  await ensureSourcePackage(packageConfig);
  await rm(packageConfig.targetDir, { recursive: true, force: true });
  await mkdir(dirname(packageConfig.targetDir), { recursive: true });
  await cp(packageConfig.sourceDir, packageConfig.targetDir, { recursive: true, force: true });
}

function runNodeSmokeTest(script, label) {
  const result = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8' });
  if (result.status !== 0) {
    const stderr = result.stderr.trim();
    throw new Error(`${label} failed smoke test:\n${stderr}`);
  }
}

async function smokeTestVendoredPackages() {
  const wordsNinjaEntry = join(vendorRoot, 'wordsninja', 'index.js');
  const changeCaseEntry = join(vendorRoot, 'change-case', 'dist', 'index.js');

  runNodeSmokeTest(
    `const WordsNinjaPack = require(${JSON.stringify(wordsNinjaEntry)});\n` +
      `const wordsNinja = new WordsNinjaPack();\n` +
      `wordsNinja.loadDictionary().then(() => {\n` +
      `  wordsNinja.addWords(['purchase', 'order', 'item', 'mapping']);\n` +
      `  const words = wordsNinja.splitSentence('purchaseorderitemmapping');\n` +
      `  if (!Array.isArray(words) || words.join(' ') !== 'purchase order item mapping') {\n` +
      `    throw new Error('Unexpected wordsninja split: ' + String(words));\n` +
      `  }\n` +
      `}).catch((error) => { throw error; });\n`,
    'wordsninja'
  );

  runNodeSmokeTest(
    `import(${JSON.stringify(pathToFileURL(changeCaseEntry).href)}).then((moduleValue) => {\n` +
      `  if (typeof moduleValue.pascalCase !== 'function') {\n` +
      `    throw new Error('Missing pascalCase export.');\n` +
      `  }\n` +
      `  if (moduleValue.pascalCase('purchase order') !== 'PurchaseOrder') {\n` +
      `    throw new Error('Unexpected pascalCase result.');\n` +
      `  }\n` +
      `}).catch((error) => { throw error; });\n`,
    'change-case'
  );
}

async function main() {
  for (const packageConfig of packages) {
    await copyPackage(packageConfig);
  }
  await smokeTestVendoredPackages();
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
