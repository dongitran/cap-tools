# Implementation Plan — CFLogs Level Classification Accuracy

## Goals
1. Fix false-positive `ERROR` for gorouter access logs (`[RTR/*]`) with HTTP `200`.
2. Fix false-negative multiline stacktrace rows that stay at `WARN` after continuation lines contain `Error`.
3. Keep prototype and extension runtime behavior identical.
4. Validate deeply with E2E and full quality gates before release.

## Mandatory Order
1. Review current uncommitted diff and trace parsing/level flow end-to-end.
2. Update prototype assets first (`docs/designs/prototypes/assets/*`).
3. Verify prototype behavior with MCP Playwright.
4. Add/update E2E tests first for real failure modes.
5. Implement/finalize runtime fix in shared webview asset.
6. Run full validation and only then release steps.

## Scope
- `docs/designs/prototypes/assets/cf-logs-panel.js`
- `docs/designs/prototypes/variants/cf-logs-panel.html` (cache-bust sync)
- `e2e/tests/cf-logs-panel.e2e.spec.ts`
- `src/cfLogsPanel.ts` (sample parity only if needed)

## Root Cause Analysis Focus
1. Keyword-only detection (`error`, `failed`) can misclassify RTR metadata fields like `x_cf_routererror`, `failed_attempts`.
2. Continuation lines (without timestamp/source prefix) are appended to previous row but level was not recomputed.
3. Under continuation, row severity can remain stale (`warn`) even when appended stacktrace clearly includes `Error`.

## Implementation Steps

### Step A — Prototype Fix First
1. Keep RTR special handling by HTTP status extraction:
- `2xx/3xx -> info`
- `4xx -> warn`
- `5xx -> error`
2. Recompute row level every time a continuation line is appended:
- in `parseCfRecentLog(...)`
- in `appendParsedLinesForApp(...)`
3. Preserve JSON-provided level candidate when available; otherwise fallback to message/stream heuristics.

### Step B — Prototype Verification (MCP Playwright)
1. Validate RTR `200` line no longer maps to `ERROR`.
2. Validate multiline stacktrace line containing `Error` maps to `ERROR`.
3. Re-check filter/app dropdown interactions after changes.

### Step C — E2E (TDD)
1. Add/keep tests:
- RTR classification by status code.
- Multiline continuation severity escalation to `ERROR`.
- Burst rerender coalescing responsiveness guard.
2. Run targeted E2E tests first, then full E2E suite.

### Step D — Full Validation
- `npm run validate:root`
- `npm --prefix e2e run validate`
- `npm --prefix e2e test`
- If any failure appears: analyze root cause, fix, and rerun all commands.

### Step E — Release Steps
1. Increase `package.json` version (if extension runtime changed).
2. Re-run validation after final changes.
3. Commit and push.
4. Review again after push and fix-forward if needed.

## Done Criteria
1. RTR `HTTP 200` logs no longer appear as `ERROR`.
2. Multiline stacktrace rows with `Error` are shown as `ERROR`.
3. No regression in dropdown responsiveness and rendering behavior.
4. Lint/typecheck/test/cspell/E2E all pass.
