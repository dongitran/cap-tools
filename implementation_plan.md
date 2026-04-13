# Implementation Plan — UI Refinement + Cache Access Reliability + Export Safety

## 1) Goal
Implement and verify all requested changes with root-cause fixes:
1. Fix UX/UI details in `Choose Region` and `Settings`.
2. Investigate and fix cache-sync logic where `br-10` can become disabled after sync despite valid org access.
3. Fix previously identified issues 2→5:
   - stale app list from cache-only flow,
   - wrong theme CSS path in extension webview,
   - forced Output panel focus on region selection,
   - missing safety guard before exporting sensitive artifacts.
4. Update tests and run full quality gates.

## 2) Context Reviewed
Files and flows to inspect end-to-end:
- `src/sidebarProvider.ts`
- `src/cacheSyncService.ts`, `src/cacheSyncService.test.ts`
- `src/cfClient.ts`
- `docs/designs/prototypes/assets/prototype.js`
- `docs/designs/prototypes/assets/prototype.css`
- `docs/designs/prototypes/assets/design-catalog.js`
- `e2e/tests/region-selector.e2e.spec.ts`
- `package.json`

## 3) Root-Cause Hypotheses
### H1 — Region disable regression after sync
- Region access state classification can mark transient auth/server/network failures as inaccessible.
- UI disables regions for inaccessible/error states.
- Sync fallback behavior may erase org/space data on transient failures.

### H2 — Stale apps in workspace
- On space selection, cached apps are returned and flow exits before live CF fetch.
- If cache is stale, UI and logs panel remain stale until next sync.

### H3 — Export safety
- Export operations write sensitive content (`default-env.json`, SQLTools credentials) without explicit user confirmation.

## 4) Implementation Steps
### Step A — Fix UI requirements
1. `Choose Region`:
   - remove cloud vendor suffix (`- AWS`, `- Azure`, etc.) from region labels (already partially changed in catalog; verify complete).
   - render region name smaller and non-bold.
   - render region code (`br-10`) larger and bold.
2. `Settings`:
   - make `Sync now` and `Logout` equal height.
   - remove `Last start` line under `Sync Status`.

### Step B — Fix cache-sync access reliability
1. Review `resolveAccessStateFromMessage()` to avoid classifying transient backend failures as inaccessible.
2. Preserve cached org/space/apps only for transient `error` state, not for true `inaccessible` state.
3. Ensure `br-10` remains selectable when latest sync error is transient and cached data exists.

### Step C — Fix stale app list (issue #2)
1. In space selection flow:
   - if cached apps exist, render immediately for responsiveness.
   - continue a non-blocking live CF fetch and refresh apps when live data returns.
   - only show fatal UI error when both cache and live fetch are unavailable.
2. Keep request-id guards to prevent out-of-order updates.

### Step D — Fix issue #3 and #4
1. Fix main webview theme CSS path to existing file.
2. Remove forced Output panel focus from region selection logging.

### Step E — Fix issue #5 (export safety guardrail)
1. Add explicit confirmation dialog before sensitive exports.
2. Include clear warning that files may contain secrets and should not be committed.
3. Keep E2E mode non-blocking by bypassing confirmation in test mode.

### Step F — Tests
1. Update/add unit tests in `cacheSyncService.test.ts` for:
   - transient auth/server failure mapping,
   - fallback org preservation behavior.
2. Update/add E2E tests in `region-selector.e2e.spec.ts` for:
   - region label format (code first, vendor removed),
   - settings sync-status content and button sizing behavior,
   - no regression in scope selection flow.
3. Validate naming quality for test titles (behavior-driven, no “bug”).

### Step G — Prototype + visual check
1. Keep prototype aligned with extension webview UI.
2. Use MCP Playwright to verify updated prototype interactions and visuals.

### Step H — Verification gates
Run in order, fix until all green:
1. `npm run typecheck`
2. `npm run lint`
3. `npm run cspell`
4. `npm run test:unit`
5. `npm --prefix e2e run validate`
6. `npm --prefix e2e test`

### Step I — Release hygiene
1. If extension code changed, bump patch version in `package.json`.
2. Re-run validation after version bump.
3. Commit and push.
4. Re-check CI/GitHub Actions; if failed, root-cause and fix-forward until green.

## 5) Done Criteria
1. UI changes match requested typography/layout exactly.
2. `br-10` is not incorrectly disabled by transient sync failures.
3. Space app list is refreshed live even when cached data is present.
4. Sensitive exports require explicit confirmation.
5. All lint/typecheck/cspell/unit/e2e checks pass.
6. Version bump + commit + push completed after successful verification.
