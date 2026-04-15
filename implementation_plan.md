# Implementation Plan — CFLogs Stable Row Selection Under Active Filters

## Goals
1. Fix the selection-jump behavior in CFLogs when new streaming logs arrive while filters are active.
2. Ensure user-selected row remains selected unless that row truly disappears from the filtered dataset.
3. Avoid auto-selecting newest/top row during background updates to reduce UX confusion.
4. Validate prototype, E2E, and full quality gates before release.

## Mandatory Order
1. Review uncommitted diff and trace selection flow end-to-end.
2. Update prototype asset first (`docs/designs/prototypes/assets/cf-logs-panel.js`).
3. Verify behavior in prototype via MCP Playwright.
4. Add/update E2E tests to lock behavior.
5. Run lint/typecheck/unit/cspell and full E2E.
6. Bump extension version, commit, push, then review.

## Scope
- `docs/designs/prototypes/assets/cf-logs-panel.js`
- `e2e/tests/cf-logs-panel.e2e.spec.ts`
- `package.json` (version bump)

## Root Cause Hypothesis
1. `applyFiltersAndRender()` previously auto-selected first visible row whenever `selectedRowId` no longer matched.
2. Stream append updates can invalidate row IDs or selection state, then fallback logic picks top row unexpectedly.
3. Under active filters, appended rows that do not match filter should not alter current selected row.

## Implementation Steps

### Step A — Diff Review and Logic Hardening
1. Verify current changes:
- preserve `selectedRowId` across deferred stream appends,
- remove automatic first-row fallback selection,
- keep row IDs stable when trimming.
2. Confirm no side effect for:
- app switch,
- filter switch,
- selection after no-match states,
- log-limit trimming.

### Step B — Prototype Verification (MCP Playwright)
1. Open CFLogs prototype.
2. Select a filtered row (not first row).
3. Inject new logs that do not match current filter and verify selection remains unchanged.
4. Inject matching logs and verify selection still does not jump to top row automatically.

### Step C — E2E Coverage
1. Review/update E2E test(s) for selection stability under append.
2. Ensure test title is behavior-oriented and precise.
3. Run targeted E2E first, then full E2E suite.

### Step D — Required Validation
- `npm run validate:root`
- `npm --prefix e2e run validate`
- `npm --prefix e2e test`
- If any failure appears: fix root cause and rerun all required checks.

### Step E — Release
1. Increase patch version in `package.json` if extension runtime changed.
2. Commit only task-relevant files.
3. Push and review final git state.

## Done Criteria
1. Selection no longer jumps to first row during background streaming updates.
2. User-selected row remains stable while filtered view still contains that row.
3. No regression in CFLogs rendering/filter interactions.
4. All checks (lint/typecheck/unit/cspell/E2E) pass.
