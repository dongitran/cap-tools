import type { LocalPackage } from './localPackageScanner';
import { runCommand } from './processRunner';

/**
 * Runs a single local package's `npm run build`. Packages without a `build` script
 * (e.g. dependency-only packages like `@example/demo`) are reported as `skipped`
 * — they still need to be published, just not compiled.
 */

export type BuildOutcome = 'built' | 'skipped';

export async function buildPackage(
  pkg: LocalPackage,
  onOutput: (chunk: string) => void
): Promise<BuildOutcome> {
  if (pkg.buildScript === undefined) {
    return 'skipped';
  }
  await runCommand('pnpm', ['i', '--shamefully-hoist'], { cwd: pkg.dir, onOutput });
  await runCommand('npm', ['run', 'build'], { cwd: pkg.dir, onOutput });
  return 'built';
}
