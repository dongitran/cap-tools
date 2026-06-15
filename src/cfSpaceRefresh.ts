import { mkdir, stat, unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

interface CfSyncRegion {
  readonly key: string;
  readonly label: string;
  readonly apiEndpoint: string;
}

interface CfSyncApp {
  readonly name: string;
  readonly runningInstances?: number;
}

interface CfSyncSyncSpaceResult {
  readonly space: { readonly apps: readonly CfSyncApp[] };
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

/** App entry projected from a cf-sync space result; matches the sidebar shape. */
export interface CfSyncAppEntry {
  readonly id: string;
  readonly name: string;
  readonly runningInstances: number;
}

// --- shared / fallback data-directory resilience -------------------------
//
// @saptools/cf-sync persists Cloud Foundry topology under ~/.saptools/, a
// directory SHARED with the sibling CDS Debug extension. Writes are guarded by
// an exclusive lock file (cf-sync-state.lock) created with open(path, "wx").
// That lock carries no owner metadata and has no stale-recovery, so if any
// process holding it dies between create and unlink (window/host killed, crash,
// OOM) the file is orphaned and every later sync fails forever with
// "Timed out acquiring file lock at .../cf-sync-state.lock".
//
// We make the refresh resilient without ever yanking a lock a healthy sibling
// might still own:
//   1. Sweep the shared lock only when it is older than 2h — long past any real
//      sub-second hold. Conservative because the directory is shared.
//   2. While the shared lock is held but younger than 2h, neither block nor
//      fail: redirect cf-sync to an extension-private fallback directory inside
//      ~/.saptools/ and sync there, returning the freshly collected apps.
//
// The fallback directory is used by this extension only, so its own lock never
// contends. The vendored package honours SAPTOOLS_DIR_OVERRIDE (injected by
// scripts/vendor-cf-sync.mjs) to relocate its entire data directory.

const SAPTOOLS_DIR_NAME = '.saptools';
const STATE_LOCK_FILENAME = 'cf-sync-state.lock';
const FALLBACK_DIR_NAME = '.sap-tools-vscode-fallback';
const STALE_LOCK_THRESHOLD_MS = 2 * 60 * 60 * 1000;

function sharedSaptoolsDir(): string {
  return join(homedir(), SAPTOOLS_DIR_NAME);
}

function sharedStateLockPath(): string {
  return join(sharedSaptoolsDir(), STATE_LOCK_FILENAME);
}

function fallbackSaptoolsDir(): string {
  return join(sharedSaptoolsDir(), FALLBACK_DIR_NAME);
}

function fallbackStateLockPath(): string {
  return join(fallbackSaptoolsDir(), STATE_LOCK_FILENAME);
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
  | {
      readonly status: 'refreshed';
      readonly regionKey: string;
      readonly appCount: number;
      readonly apps: readonly CfSyncAppEntry[];
      readonly source: 'shared' | 'fallback';
    }
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

// Serialize every cf-sync run from this extension. The fallback path toggles a
// process-wide env var (SAPTOOLS_DIR_OVERRIDE) around syncSpace, so overlapping
// runs could otherwise read each other's directory override.
let syncChain: Promise<unknown> = Promise.resolve();
function runSerialized<T>(work: () => Promise<T>): Promise<T> {
  const next = syncChain.then(work, work);
  syncChain = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

async function lockAgeMs(lockPath: string): Promise<number | null> {
  try {
    const stats = await stat(lockPath);
    return Math.max(0, Date.now() - stats.mtimeMs);
  } catch {
    return null;
  }
}

function isLockTimeoutError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('Timed out acquiring file lock');
}

function projectApps(result: CfSyncSyncSpaceResult): CfSyncAppEntry[] {
  return result.space.apps.map((app) => ({
    id: app.name,
    name: app.name,
    runningInstances: typeof app.runningInstances === 'number' ? app.runningInstances : 0,
  }));
}

interface SyncParams {
  readonly regionKey: string;
  readonly orgName: string;
  readonly spaceName: string;
  readonly email: string;
  readonly password: string;
}

async function syncInFallbackDir(
  module: CfSyncModule,
  params: SyncParams
): Promise<CfSyncSyncSpaceResult> {
  await mkdir(fallbackSaptoolsDir(), { recursive: true }).catch(() => undefined);
  // The fallback directory is private to this extension and all runs here are
  // serialized, so any lock left behind is stale by definition — clear it.
  await unlink(fallbackStateLockPath()).catch(() => undefined);
  // The vendored cf-sync reads SAPTOOLS_DIR_OVERRIDE to relocate its whole data
  // directory; restore the prior value afterwards so the shared directory stays
  // the default for the next run.
  const previous = process.env['SAPTOOLS_DIR_OVERRIDE'];
  process.env['SAPTOOLS_DIR_OVERRIDE'] = fallbackSaptoolsDir();
  try {
    return await module.syncSpace(params);
  } finally {
    // An empty value disables the override (the patched saptoolsDir() treats it
    // as "use the default ~/.saptools"), so restoring '' is equivalent to clear.
    process.env['SAPTOOLS_DIR_OVERRIDE'] = previous ?? '';
  }
}

export async function refreshCfSyncSpace(input: {
  readonly apiEndpoint: string;
  readonly orgName: string;
  readonly spaceName: string;
  readonly email: string;
  readonly password: string;
  readonly log?: (message: string) => void;
}): Promise<CfSyncSpaceRefreshResult> {
  const regionKey = await resolveRegionKeyForEndpoint(input.apiEndpoint);
  if (regionKey === undefined) {
    return { status: 'skipped', reason: 'unknown-region' };
  }
  if (input.email.length === 0 || input.password.length === 0) {
    return { status: 'skipped', reason: 'missing-credentials' };
  }

  const module = await loadCfSyncModule();
  const params: SyncParams = {
    regionKey,
    orgName: input.orgName,
    spaceName: input.spaceName,
    email: input.email,
    password: input.password,
  };
  const scope = `${regionKey}/${input.orgName}/${input.spaceName}`;
  const log = input.log ?? ((): void => undefined);

  const refreshViaFallback = async (): Promise<CfSyncSpaceRefreshResult> => {
    const fallbackResult = await syncInFallbackDir(module, params);
    const apps = projectApps(fallbackResult);
    return { status: 'refreshed', regionKey, appCount: apps.length, apps, source: 'fallback' };
  };

  return runSerialized(async (): Promise<CfSyncSpaceRefreshResult> => {
    try {
      const sharedAge = await lockAgeMs(sharedStateLockPath());

      if (sharedAge !== null && sharedAge >= STALE_LOCK_THRESHOLD_MS) {
        // Long past any real sub-second hold: the lock is orphaned. Safe to
        // remove even on the shared directory, then sync normally.
        await unlink(sharedStateLockPath()).catch(() => undefined);
        log(
          `[topology] Swept stale cf-sync lock (age ${String(Math.round(sharedAge / 60000))}m) before refreshing ${scope}`
        );
      } else if (sharedAge !== null) {
        // Held but younger than 2h — a sibling may still own it. Do not contend
        // with the shared directory; sync into the private fallback instead.
        log(
          `[topology] Shared cf-sync lock held (age ${String(Math.round(sharedAge / 1000))}s); using private fallback for ${scope}`
        );
        return await refreshViaFallback();
      }

      try {
        const result = await module.syncSpace(params);
        const apps = projectApps(result);
        return { status: 'refreshed', regionKey, appCount: apps.length, apps, source: 'shared' };
      } catch (error) {
        if (!isLockTimeoutError(error)) {
          return { status: 'failed', regionKey, error };
        }
        // The lock was grabbed between our check and the sync — fall back.
        log(`[topology] Shared cf-sync lock busy; using private fallback for ${scope}`);
        return await refreshViaFallback();
      }
    } catch (error) {
      return { status: 'failed', regionKey, error };
    }
  });
}
