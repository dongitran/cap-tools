import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const srcDir = path.join(__dirname, '../docs/designs/prototypes/src');
const destFile = path.join(__dirname, '../docs/designs/prototypes/assets/prototype.js');

const files = [
  '00-state.js',
  '01-events.js',
  '02-topology.js',
  '03-handlers.js',
  '04-hana-sql.js',
  '05-quick-selection.js',
  '06-utils.js',
  '07-render.js',
  '08-cf-logs.js'
];

let concatenatedCode = '';

for (const file of files) {
  const filePath = path.join(srcDir, file);
  if (!fs.existsSync(filePath)) {
    console.error(`Missing source file: ${file}`);
    process.exit(1);
  }
  const content = fs.readFileSync(filePath, 'utf8');
  concatenatedCode += `// --- BEGIN ${file} ---\n`;
  concatenatedCode += content;
  if (!content.endsWith('\n')) {
    concatenatedCode += '\n';
  }
  concatenatedCode += `// --- END ${file} ---\n\n`;
}

fs.writeFileSync(destFile, concatenatedCode);
console.log(`Successfully built prototype.js from ${files.length} source files.`);
