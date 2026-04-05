import * as esbuild from 'esbuild';

const isWatch = process.argv.includes('--watch');
const isProd = process.argv.includes('--production');

/** @type {import('esbuild').BuildOptions} */
const buildOptions = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  target: 'node20',
  sourcemap: !isProd,
  minify: isProd,
  treeShaking: true,
  logLevel: 'info',
  metafile: isProd,
};

if (isWatch) {
  const ctx = await esbuild.context(buildOptions);
  await ctx.watch();
  console.log('Watching for changes...');
} else {
  const result = await esbuild.build(buildOptions);
  if (isProd && result.metafile) {
    const analysis = await esbuild.analyzeMetafile(result.metafile, { verbose: false });
    console.log(analysis);
  }
}
