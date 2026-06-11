const DEPENDENCY_FIELDS = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
] as const;

export interface ServiceDependencyTagReplacementOptions {
  readonly placeholders: readonly string[];
  readonly localPackageNames: readonly string[];
  readonly tag: string;
}

export interface ServiceDependencyTagReplacementResult {
  readonly content: string;
  readonly changed: boolean;
  readonly placeholderReplacementCount: number;
  readonly updatedPackageNames: readonly string[];
}

export function replaceServicePackageDependencyTags(
  content: string,
  options: ServiceDependencyTagReplacementOptions
): ServiceDependencyTagReplacementResult {
  const tag = options.tag.trim();
  if (tag.length === 0) {
    return unchangedResult(content);
  }

  const placeholderResult = replacePlaceholders(content, options.placeholders, tag);
  const dependencyResult = replaceDependencySpecs(
    placeholderResult.content,
    normalizePackageNames(options.localPackageNames),
    tag
  );

  return {
    content: dependencyResult.content,
    changed: placeholderResult.count > 0 || dependencyResult.changed,
    placeholderReplacementCount: placeholderResult.count,
    updatedPackageNames: dependencyResult.updatedPackageNames,
  };
}

function replacePlaceholders(
  content: string,
  placeholders: readonly string[],
  tag: string
): { readonly content: string; readonly count: number } {
  let nextContent = content;
  let count = 0;

  for (const placeholder of placeholders) {
    if (placeholder.length === 0) {
      continue;
    }
    count += countOccurrences(nextContent, placeholder);
    nextContent = nextContent.replaceAll(placeholder, tag);
  }

  return { content: nextContent, count };
}

function replaceDependencySpecs(
  content: string,
  packageNames: readonly string[],
  tag: string
): {
  readonly content: string;
  readonly changed: boolean;
  readonly updatedPackageNames: readonly string[];
} {
  if (packageNames.length === 0) {
    return { content, changed: false, updatedPackageNames: [] };
  }

  const parsed = parsePackageJson(content);
  const updatedPackageNames = new Set<string>();
  let changed = false;

  for (const field of DEPENDENCY_FIELDS) {
    const dependencies = parsed[field];
    if (!isRecord(dependencies)) {
      continue;
    }

    for (const packageName of packageNames) {
      const currentSpec = dependencies[packageName];
      if (typeof currentSpec !== 'string') {
        continue;
      }
      updatedPackageNames.add(packageName);
      if (currentSpec !== tag) {
        dependencies[packageName] = tag;
        changed = true;
      }
    }
  }

  return {
    content: changed ? `${JSON.stringify(parsed, null, 2)}\n` : content,
    changed,
    updatedPackageNames: [...updatedPackageNames],
  };
}

function normalizePackageNames(packageNames: readonly string[]): string[] {
  const normalizedNames = new Set<string>();
  for (const packageName of packageNames) {
    const trimmed = packageName.trim();
    if (trimmed.length > 0) {
      normalizedNames.add(trimmed);
    }
  }
  return [...normalizedNames];
}

function countOccurrences(content: string, needle: string): number {
  let count = 0;
  let cursor = 0;

  while (cursor < content.length) {
    const nextIndex = content.indexOf(needle, cursor);
    if (nextIndex === -1) {
      break;
    }
    count += 1;
    cursor = nextIndex + needle.length;
  }

  return count;
}

function parsePackageJson(content: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid JSON.';
    throw new Error(`Failed to update local package dependency tags: ${message}`);
  }

  if (!isRecord(parsed)) {
    throw new Error('Failed to update local package dependency tags: package.json is not an object.');
  }

  return parsed;
}

function unchangedResult(content: string): ServiceDependencyTagReplacementResult {
  return {
    content,
    changed: false,
    placeholderReplacementCount: 0,
    updatedPackageNames: [],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
