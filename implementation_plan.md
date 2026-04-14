# Implementation Plan — CFLogs UI Refinement (Summary, Full Height, Gear Icon, Font Size Setting)

## Goal
- Update CFLogs UI/UX with 4 concrete changes:
  1. Summary text becomes `X of Y rows` only.
  2. Log table area uses full available panel height (remove half-height cap behavior).
  3. Settings gear icon is clearer and more recognizable.
  4. Settings panel adds a second row for font-size configuration (default + 3 additional options).

## Scope
- `docs/designs/prototypes/variants/cf-logs-panel.html`
- `docs/designs/prototypes/assets/cf-logs-panel.css`
- `docs/designs/prototypes/assets/cf-logs-panel.js`
- `src/cfLogsPanel.ts`
- `e2e/tests/cf-logs-panel.e2e.spec.ts`
- `package.json` (version bump after completion)

## Deep Analysis Notes
- Current summary is built in `renderSummary()` and appends `visible` + active stream/level metadata.
- Current table height is constrained by `.table-shell { max-height: min(420px, 56dvh) }`, which causes under-utilization when the CFLogs panel is expanded.
- Current settings panel only supports column visibility; no font-size control state is persisted.
- Existing host/webview message channel already persists column settings through `globalState`; the same pattern can be extended for font-size.

## Delivery Steps
1. Prototype-first UI update (mandatory order):
- Redesign settings block to contain:
  - `Columns` row (existing toggles).
  - `Font Size` row (new control with 4 options: default + smaller/larger variants).
- Replace gear SVG with a clearer cog icon.
- Update layout so table area fills available vertical space in panel.
- Update summary output format to `X of Y rows`.

2. Prototype verification via MCP Playwright:
- Open prototype CFLogs page.
- Confirm settings panel opens/closes and icon is visible.
- Confirm font-size options render correctly and switching option changes table typography.
- Confirm summary text format no longer contains `visible` or stream suffix.
- Confirm table area stretches with panel height.

3. TDD for extension (test updates before extension implementation):
- Add/update E2E tests for:
  - summary text strict format.
  - font-size setting control and visual size change.
  - table-shell style no longer hard-limited to old 56dvh cap.
- Run targeted tests to capture current failures first.

4. Extension implementation:
- Mirror prototype changes in `src/cfLogsPanel.ts` webview HTML.
- Extend host/webview messaging to persist and restore font-size setting.
- Ensure default behavior remains backward compatible when no font-size setting exists in storage.

5. Validation and regression:
- Run targeted E2E tests and fix until stable.
- Run full validation stack.
- Re-check prototype and extension behavior consistency.

## Mandatory Validation Commands
- `npm run lint`
- `npm run typecheck`
- `npm run test:unit`
- `npm run cspell`
- `npm --prefix e2e run validate`
- `npm --prefix e2e test -- --grep "CF logs panel shows concise row count summary|CF logs panel settings include font size options and update table typography|CF logs panel table area is not capped to legacy half-height limit"`
- `npm --prefix e2e test`
- `npm run validate:root`

## Release Steps
1. Bump extension patch version in `package.json`.
2. Re-run core checks (`typecheck`, `lint`, `test:unit`).
3. Commit with clear scope.
4. Push and monitor CI/GitHub Actions.

## Done Criteria
- Summary line is exactly `X of Y rows`.
- Table area fills panel height without old 56dvh cap.
- Gear icon is clearer.
- Settings includes font-size config row with default + 3 additional options.
- Font-size setting persists and restores.
- Prototype, extension, and E2E expectations are aligned.
