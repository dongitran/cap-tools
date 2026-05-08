import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

interface ExtensionManifest {
  readonly dependencies: Record<string, unknown>;
  readonly scripts: Record<string, unknown>;
  readonly version: string;
}

function readExtensionManifest(): ExtensionManifest {
  const raw = readFileSync(new URL('../package.json', import.meta.url), 'utf8');
  const parsed: unknown = JSON.parse(raw);
  if (!isRecord(parsed)) {
    return { dependencies: {}, scripts: {}, version: '' };
  }
  return {
    dependencies: readRecord(parsed['dependencies']),
    scripts: readRecord(parsed['scripts']),
    version: typeof parsed['version'] === 'string' ? parsed['version'] : '',
  };
}

function readChangelogTopHeading(): string {
  const raw = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
  return raw
    .split('\n')
    .find((line) => line.startsWith('## '))
    ?.trim() ?? '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

describe('Extension manifest feature surface', () => {
  it('does not package the removed workspace debug runtime', () => {
    const manifest = readExtensionManifest();

    expect(Object.keys(manifest.dependencies)).not.toContain(
      '@saptools/cf-debugger'
    );
    expect(String(manifest.scripts['postbuild'] ?? '')).not.toContain(
      'vendor-cf-debugger'
    );
  });

  it('keeps Marketplace pre-release metadata aligned with the release workflow', () => {
    const manifest = readExtensionManifest();
    const topHeading = readChangelogTopHeading();
    const publishPreScript = String(manifest.scripts['publish:pre'] ?? '');
    const minorVersion = Number(manifest.version.split('.')[1] ?? Number.NaN);

    expect(topHeading).toContain(`${manifest.version} (pre-release)`);
    expect(Number.isInteger(minorVersion)).toBe(true);
    expect(minorVersion % 2).toBe(1);
    expect(publishPreScript).toContain('--pre-release');
  });
});
