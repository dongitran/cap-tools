# Implementation Plan — CFLogs Columns Settings + Row Click Copy

## 1) Goal
Complete and harden CFLogs UX changes:
- Default visible columns are `Time`, `Level`, `Logger`, `Message`.
- `Source` and `Stream` are hidden by default and configurable in a settings panel.
- Clicking a log row copies the row message and shows a short `Copied!` toast.
- Column configuration is persisted and restored.

## 2) Scope
- `docs/designs/prototypes/assets/cf-logs-panel.js`
- `docs/designs/prototypes/assets/cf-logs-panel.css`
- `docs/designs/prototypes/variants/cf-logs-panel.html`
- `src/cfLogsPanel.ts`
- `src/extension.ts`
- `e2e/tests/cf-logs-panel.e2e.spec.ts`
- `package.json` (version bump if extension code changes)

## 3) Delivery Steps
1. Review uncommitted diff deeply:
   - Validate data flow for column state, copy flow, toast flow, and host persistence.
   - Identify gaps (validation, persistence normalization, flaky selectors, UX edge cases).
2. Prototype-first fixes in `docs/designs/prototypes`:
   - Ensure columns render dynamically and default state matches requirement.
   - Ensure no copy button in table and row click triggers copy + toast.
   - Ensure settings panel open/close behavior is stable.
3. Verify prototype using MCP Playwright:
   - Confirm default columns are exactly `Time/Level/Logger/Message`.
   - Confirm toggling columns updates header/table instantly.
   - Confirm row click shows `Copied!` toast and keeps UX stable.
4. TDD for extension behavior:
   - Add/update e2e tests for:
     - row-click copy behavior
     - settings panel default states
     - dynamic column selectors in filters/layout assertions
   - Run targeted tests and fix failures first.
5. Extension code hardening:
   - Persist visible columns safely in `globalState`.
   - Validate/normalize incoming column ids before saving and when restoring.
6. Regression pass:
   - Re-run full e2e suite and all project validations.

## 4) Verification Gates
- `npm run typecheck`
- `npm run lint`
- `npm run cspell`
- `npm run test:unit`
- `npm --prefix e2e run validate`
- `npm --prefix e2e test -- --grep "CF logs panel copies row message on click and shows Copied toast|CF logs panel gear button opens settings panel with correct default column state"`
- `npm --prefix e2e test`
- `npm run validate:root`

## 5) Release Steps
1. If extension code changed, bump patch version in `package.json`.
2. Re-run quick regression after version bump:
   - `npm run typecheck`
   - `npm run lint`
   - `npm run test:unit`
3. Commit with clear scope.
4. Push to `main`.
5. Monitor GitHub Actions via `gh` until final result is confirmed.

## 6) Done Criteria
- CFLogs defaults to 4 columns (`Time`, `Level`, `Logger`, `Message`).
- `Source`/`Stream` can be toggled from settings and persist across reload.
- Row click copies message and shows transient `Copied!` toast.
- Prototype behavior and extension behavior match.
- Full validation + e2e are green locally and CI is green after push.
