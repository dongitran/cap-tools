import { describe, expect, it } from 'vitest';

import { replaceServicePackageDependencyTags } from './serviceDependencyTags';

describe('replaceServicePackageDependencyTags', () => {
  it('replaces placeholders and pins detected local dependencies to the active tag', () => {
    const result = replaceServicePackageDependencyTags(
      `${JSON.stringify(
        {
          name: 'finance-service',
          dependencies: {
            '@example/core': '${BRANCH}',
            '@example/ui': '^1.2.3',
            lodash: '^4.17.21',
          },
          devDependencies: {
            '@example/devkit': 'old-tag',
          },
        },
        null,
        2
      )}\n`,
      {
        placeholders: ['${BRANCH}'],
        localPackageNames: ['@example/core', '@example/ui', '@example/devkit'],
        tag: 'cf-uat-finance',
      }
    );

    const parsed = JSON.parse(result.content) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };

    expect(result.changed).toBe(true);
    expect(result.placeholderReplacementCount).toBe(1);
    expect(result.updatedPackageNames).toEqual([
      '@example/core',
      '@example/ui',
      '@example/devkit',
    ]);
    expect(parsed.dependencies['@example/core']).toBe('cf-uat-finance');
    expect(parsed.dependencies['@example/ui']).toBe('cf-uat-finance');
    expect(parsed.dependencies['lodash']).toBe('^4.17.21');
    expect(parsed.devDependencies['@example/devkit']).toBe('cf-uat-finance');
  });

  it('updates detected local dependencies even when no placeholder is configured', () => {
    const result = replaceServicePackageDependencyTags(
      `${JSON.stringify(
        {
          name: 'finance-service',
          dependencies: {
            '@example/core': '1.0.0-local.1699',
          },
        },
        null,
        2
      )}\n`,
      {
        placeholders: [],
        localPackageNames: ['@example/core'],
        tag: 'cf-uat-finance',
      }
    );

    const parsed = JSON.parse(result.content) as {
      dependencies: Record<string, string>;
    };

    expect(result.changed).toBe(true);
    expect(result.placeholderReplacementCount).toBe(0);
    expect(result.updatedPackageNames).toEqual(['@example/core']);
    expect(parsed.dependencies['@example/core']).toBe('cf-uat-finance');
  });

  it('reports unchanged content when no placeholder or local dependency matches', () => {
    const content = `${JSON.stringify(
      {
        name: 'finance-service',
        dependencies: {
          lodash: '^4.17.21',
        },
      },
      null,
      2
    )}\n`;

    const result = replaceServicePackageDependencyTags(content, {
      placeholders: ['${BRANCH}'],
      localPackageNames: ['@example/core'],
      tag: 'cf-uat-finance',
    });

    expect(result.changed).toBe(false);
    expect(result.content).toBe(content);
    expect(result.updatedPackageNames).toEqual([]);
  });
});
