import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

interface ExtensionManifest {
  readonly dependencies: Record<string, unknown>;
  readonly scripts: Record<string, unknown>;
}

function readExtensionManifest(): ExtensionManifest {
  const raw = readFileSync(new URL('../package.json', import.meta.url), 'utf8');
  const parsed: unknown = JSON.parse(raw);
  if (!isRecord(parsed)) {
    return { dependencies: {}, scripts: {} };
  }
  return {
    dependencies: readRecord(parsed['dependencies']),
    scripts: readRecord(parsed['scripts']),
  };
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
});
