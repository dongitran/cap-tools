import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

interface CfSyncRegion {
  readonly key: string;
  readonly label: string;
  readonly apiEndpoint: string;
}

interface CfSyncSyncSpaceResult {
  readonly space: { readonly apps: readonly unknown[] };
}

interface CfSyncModule {
  readonly getAllRegions: () => readonly CfSyncRegion[];
  readonly syncSpace: (input: {
    readonly regionKey: string;
    readonly orgName: string;
    readonly spaceName: string;
    readonly email: string;
    readonly password: string;
  }) => Promise<CfSyncSyncSpaceResult>;
}

let cachedModulePromise: Promise<CfSyncModule> | null = null;

function resolveVendoredCfSyncEntry(): string {
  // The compiled JS lives in dist/ and the vendor script copies cf-sync to
  // dist/vendor/@saptools/cf-sync/, so the entry sits next to this file at
  // ./vendor/@saptools/cf-sync/dist/index.js.
  return pathToFileURL(
    join(__dirname, 'vendor', '@saptools', 'cf-sync', 'dist', 'index.js')
  ).href;
}

async function loadCfSyncModule(): Promise<CfSyncModule> {
  if (cachedModulePromise === null) {
    const promise = import(resolveVendoredCfSyncEntry()) as Promise<CfSyncModule>;
    promise.catch(() => {
      cachedModulePromise = null;
    });
    cachedModulePromise = promise;
  }
  return cachedModulePromise;
}

export type CfSyncSpaceRefreshResult =
  | { readonly status: 'refreshed'; readonly regionKey: string; readonly appCount: number }
  | { readonly status: 'skipped'; readonly reason: 'missing-credentials' | 'unknown-region' }
  | { readonly status: 'failed'; readonly regionKey: string; readonly error: unknown };

function normalizeEndpoint(value: string): string {
  return value.trim().replace(/\/+$/, '').toLowerCase();
}

export async function resolveRegionKeyForEndpoint(
  apiEndpoint: string
): Promise<string | undefined> {
  const normalized = normalizeEndpoint(apiEndpoint);
  const module = await loadCfSyncModule();
  return module
    .getAllRegions()
    .find((region) => normalizeEndpoint(region.apiEndpoint) === normalized)?.key;
}

export async function refreshCfSyncSpace(input: {
  readonly apiEndpoint: string;
  readonly orgName: string;
  readonly spaceName: string;
  readonly email: string;
  readonly password: string;
}): Promise<CfSyncSpaceRefreshResult> {
  const regionKey = await resolveRegionKeyForEndpoint(input.apiEndpoint);
  if (regionKey === undefined) {
    return { status: 'skipped', reason: 'unknown-region' };
  }
  if (input.email.length === 0 || input.password.length === 0) {
    return { status: 'skipped', reason: 'missing-credentials' };
  }

  try {
    const module = await loadCfSyncModule();
    const result = await module.syncSpace({
      regionKey,
      orgName: input.orgName,
      spaceName: input.spaceName,
      email: input.email,
      password: input.password,
    });
    return {
      status: 'refreshed',
      regionKey,
      appCount: result.space.apps.length,
    };
  } catch (error: unknown) {
    return { status: 'failed', regionKey, error };
  }
}
