# Implementation Plan — CF Logs Message Column UX Improvement

## 1) Goal
Improve the `Message` column in CF Logs panel so long log content is readable in narrow VS Code panel height/width without hurting scan speed.

Target outcomes:
1. Long messages wrap cleanly instead of forcing one-line truncation.
2. Multi-line payloads (including JSON-derived messages with `\n`) remain readable.
3. Table remains usable in compact panel size with no broken layout.
4. Prototype and extension UI behavior stay aligned.
5. E2E checks cover the new rendering behavior.

## 2) Scope & Files Reviewed
Primary UI/logic:
- `src/cfLogsPanel.ts`
- `docs/designs/prototypes/assets/cf-logs-panel.js`
- `docs/designs/prototypes/assets/cf-logs-panel.css`
- `docs/designs/prototypes/variants/cf-logs-panel.html`
- `docs/designs/prototypes/index.html`

Tests:
- `e2e/tests/region-selector.e2e.spec.ts`
- `package.json`
- `e2e/package.json`

## 3) Problem Analysis
Current rendering forces `Message` into one line:
1. JS compacts message text (`compactMessage`) by collapsing whitespace/newlines.
2. CSS sets `.cell-message` to `white-space: nowrap; overflow: hidden; text-overflow: ellipsis;`.
3. Long lines become hard to inspect, especially in monitoring scenarios.

## 4) Implementation Strategy (TDD-first)
### Step A — Add/adjust tests first
1. Add E2E assertion for CF logs panel message-cell wrapping behavior:
   - Ensure selected logs table row message cell uses wrapping (`white-space` not `nowrap`).
   - Ensure `overflow-wrap`/word-breaking behavior prevents horizontal spill.
2. Run targeted E2E to confirm current behavior fails expectation (or validate baseline gap).

### Step B — Prototype-first UI fix
1. Update `cf-logs-panel.css`:
   - Keep high-density table, but allow `.cell-message` wrapping and long-token breaks.
   - Optionally keep `.cell-logger` compact and non-wrapping.
2. Update `cf-logs-panel.js`:
   - Remove forced one-line compaction for message text.
   - Preserve useful line breaks for multi-line logs.
3. Validate prototype manually via Playwright MCP (CF Logs Panel variant and main index entrypoint).

### Step C — Extension alignment
1. Confirm extension uses same shared assets and behavior is identical.
2. Re-run E2E suite for CF logs panel + impacted sidebar flows.

### Step D — Hardening pass
1. Re-read diffs for potential regressions in filtering/search semantics.
2. Ensure no console logging, no security leakage, and no dead/commented code.

## 5) Verification Gates (must run and fix until green)
1. `npm run typecheck`
2. `npm run lint`
3. `npm run cspell`
4. `npm run test:unit`
5. `npm --prefix e2e run validate`
6. `npm --prefix e2e test -- --grep "CF logs panel"`
7. `npm --prefix e2e test`
8. `npm run validate:root`

## 6) Release Steps
1. Bump patch version in `package.json` after all checks pass.
2. Re-run quick regression after version bump:
   - `npm run typecheck`
   - `npm run lint`
   - `npm run test:unit`
3. Commit changes with clear scope.
4. Push and monitor GitHub Actions; if any workflow fails, fix-forward until all green.

## 7) Done Criteria
1. `Message` column is readable for long and multiline logs in CF Logs panel.
2. Prototype and extension visuals match for this behavior.
3. E2E coverage includes wrapping behavior and passes consistently.
4. Full validation pipeline passes.
5. Version is bumped, code reviewed, committed, and pushed.
