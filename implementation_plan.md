# Implementation Plan — Fast Scope Restore + Org/Space Hover Border Integrity

## Objectives
1. Remove perceived startup lag when reopening SAP Tools with a previously confirmed scope so UI reaches **Monitoring Workspace** quickly.
2. Fix hover clipping artifact on first-row items in **Choose Organization** and **Choose Space** where top border appears cut when item shifts up.
3. Add deterministic tests that reproduce/guard both behaviors.

## Root-Cause Hypotheses

### A. Slow restore to Monitoring Workspace
- Current restore path in `src/sidebarProvider.ts` runs sequentially:
  1) `handleRegionSelected`
  2) `handleOrgSelected`
  3) `handleSpaceSelected`
  then posts `sapTools.restoreConfirmedScope`.
- `handleSpaceSelected` can perform slow app-fetch work (CF CLI/network), so webview remains on selection screen until that finishes.
- Result: delayed redirect to Monitoring Workspace (~seconds).

### B. Hover top-border clipping (org/space)
- `.org-picker` / `.space-picker` are scroll containers with `overflow-y:auto` and no top breathing room.
- `.org-option:hover` / `.space-option:hover` applies `transform: translateY(-1px)`.
- First row moves upward into container edge and top border gets visually clipped.

## Files In Scope
- Prototype/UI first:
  - `docs/designs/prototypes/assets/prototype.css`
- Extension runtime:
  - `src/sidebarProvider.ts`
- E2E coverage:
  - `e2e/tests/region-selector-ui.e2e.spec.ts`

## Execution Steps

### Step 1 — Prototype-first UI fix
1. Update prototype CSS to add top breathing space for org/space pickers so hover lift does not clip border.
2. Verify in prototype via MCP Playwright (main menu flow).

### Step 2 — TDD: add regression tests before behavioral fix
1. Add E2E test for fast restore behavior under deterministic delayed app-load in test mode.
2. Add E2E test/assertions for org/space hover border integrity (top border not transparent, first-row lift remains visible).
3. Run target E2E tests and confirm failing case for startup-lag scenario.

### Step 3 — Runtime fix for fast restore
1. Refactor restore flow in `src/sidebarProvider.ts` so webview receives `sapTools.restoreConfirmedScope` before slow app hydration completes.
2. Keep region/org validation in place; move expensive space/apps hydration to background task.
3. Add test-only delayed app-load hook (env-driven) to keep regression reproducible without impacting production behavior.

### Step 4 — Verification
1. Run required checks:
   - `npm run validate:root`
   - `npm --prefix e2e run validate`
   - `npm --prefix e2e test`
2. Review diff for side effects and ensure no unrelated files are touched.

### Step 5 — Release
1. Bump extension patch version in `package.json` if extension code changed.
2. Commit and push.
3. Monitor GitHub Actions (`gh run list` / `gh run watch`) and fix if needed.

## Done Criteria
1. Reopen flow reaches Monitoring Workspace quickly even when app loading is delayed.
2. Org/space first-row hover no longer clips top border.
3. New/updated E2E tests pass and prevent regressions.
4. Full validation pipeline passes locally and in CI.
