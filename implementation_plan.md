# Implementation Plan — Cache Lifecycle Hardening + CF Retry Strategy via TDD

## 1) Goal
Fix cache synchronization lifecycle issues around logout and VS Code shutdown/crash, and improve CF call resilience with controlled retries. Deliver with strict test-first workflow.

Target outcomes:
1. In-flight cache sync is cancelled when user logs out.
2. In-flight cache sync is cancelled when extension is disposed (VS Code close/reload).
3. No stale `syncInProgress=true` persists indefinitely after abrupt shutdown.
4. Scheduler/snapshot state remains coherent across restart/login/logout transitions.
5. CF transient failures are retried with bounded backoff; permanent failures still fail fast.
6. Regression coverage exists in unit tests and E2E tests.

## 2) Scope & Files Reviewed
Core cache lifecycle and integration:
- `src/cacheSyncService.ts`
- `src/cacheStore.ts`
- `src/cacheModels.ts`
- `src/extension.ts`
- `src/sidebarProvider.ts`
- `src/cfClient.ts`
- `src/cacheSyncService.test.ts`
- `src/cfClient.test.ts`
- `e2e/tests/region-selector.e2e.spec.ts`
- `e2e/src/launchVscode.ts`

## 3) Root-Cause Summary
1. `setCredentials(null)` currently clears timer but does not abort already-running sync work.
2. `dispose()` clears timer/listeners but does not abort running sync work.
3. Sync marks `syncInProgress=true` at start and only flips false in completed/failed handlers. Abrupt stop can leave stale state.
4. Startup path does not reconcile stale in-progress state from previous interrupted run.
5. CF HTTP and CLI paths mostly fail-fast; transient network/server issues are not retried centrally.

## 4) TDD Strategy (Mandatory)
### Step A — Add failing tests first (no production fix yet)
1. Unit: `logout` while sync in progress.
   - Expect in-flight sync to be cancelled/ignored.
   - Expect no stale completion write after logout.
2. Unit: `dispose` while sync in progress.
   - Expect in-flight sync cancellation and no post-dispose state mutation side effects.
3. Unit: stale recovery on initialization.
   - Seed user cache with `syncInProgress=true` and old `lastSyncStartedAt`.
   - Expect service to reconcile to `syncInProgress=false` with interruption marker.
4. Unit: CF retry behavior in `cfClient`.
   - Retry transient HTTP errors (network timeout/abort, 429, 5xx).
   - Do not retry permanent auth/client errors (400/401/403/404 where appropriate).
   - Retry transient CLI failures (connection/reset/timeout hints), capped attempts.
5. E2E: deterministic reproduction flow.
   - Add controlled E2E sync delay hooks (strictly gated by E2E env only).
   - Reproduce logout/shutdown-during-sync and assert UI/cache status remains coherent after relaunch.

### Step B — Implement production fixes
1. Add explicit cancellation token/versioning for each sync run.
2. Abort on `setCredentials(null)` and `dispose()`.
3. Guard post-sync writes so cancelled runs cannot overwrite newer state.
4. Add startup reconciliation for stale `syncInProgress` using timeout threshold.
5. Ensure schedule/nextSync state is updated safely after cancellation.
6. Add shared retry utility for CF calls:
   - bounded attempts,
   - exponential backoff with jitter,
   - retry filters for transient-only conditions,
   - safe error propagation without secret leakage.

### Step C — Review and hardening
1. Re-read modified flow end-to-end for race conditions.
2. Validate no credential leakage and no insecure logging added.
3. Validate backward compatibility for existing cache schema.
4. Validate retry policy does not cause runaway latency.

## 5) Verification Gates
Run and fix until green:
1. `npm run test:unit -- src/cacheSyncService.test.ts src/cfClient.test.ts`
2. `npm --prefix e2e test -- --grep "logout|sync|shutdown|cache"`
3. `npm run typecheck`
4. `npm run lint`
5. `npm run cspell`
6. `npm run test:unit`
7. `npm --prefix e2e run validate`
8. `npm --prefix e2e test`

## 6) Release/Delivery
1. Bump patch version in `package.json` (extension code changes).
2. Re-run quick validation (`typecheck`, `lint`, `unit`) post-version-bump.
3. Commit with clear scope.
4. Push and monitor GitHub Actions; if red, fix-forward until green.

## 7) Done Criteria
1. Logout/dispose during sync no longer leaves stale or contradictory state.
2. Interrupted sync is represented consistently and recoverably.
3. CF transient errors recover better thanks to retry while permanent errors remain fast-fail.
4. Added tests catch regression for lifecycle and retry behavior.
5. All requested checks pass.
