# Implementation Plan — CFLogs Full-Height + Confirm Scope Persistence + Region Tile Visual Fixes

## Goals
1. Fix CFLogs initial layout so the log table area always fills remaining panel height immediately on first open (without requiring settings toggle or incoming logs).
2. Persist the last **confirmed** scope (area/region/org/space) and restore it after VS Code reload/reopen.
3. Fix region tile visuals in selector UI:
   - remove/avoid right-edge cut visual artifact (white corner look),
   - keep top border visible during hover lift animation for first-row tiles.

## Scope (files expected)
- Prototype (must update first)
  - `docs/designs/prototypes/assets/cf-logs-panel.css`
  - `docs/designs/prototypes/assets/prototype.css`
  - `docs/designs/prototypes/assets/themes/design.css` (if needed for theme-34 overrides)
  - `docs/designs/prototypes/assets/prototype.js` (if behavior/state flow preview changes)
  - `docs/designs/prototypes/variants/cf-logs-panel.html` (if structure changes)
  - `docs/designs/prototypes/variants/design.html` (cache-bust only if needed)
- Extension implementation
  - `src/cfLogsPanel.ts`
  - `src/sidebarProvider.ts`
  - `docs/designs/prototypes/assets/prototype.js` (shared webview logic used by extension)
  - `docs/designs/prototypes/assets/prototype.css` (shared webview styles used by extension)
- Tests
  - `e2e/tests/cf-logs-panel.e2e.spec.ts`
  - `e2e/tests/region-selector-ui.e2e.spec.ts`
  - unit tests if needed for persistence helpers in `src/**/*.test.ts`
- Release metadata
  - `package.json` (version bump after all validations pass)

## Deep Analysis Notes
- `RegionSidebarProvider.resolveWebviewView()` currently resets selection fields (`selectedRegionCode`, `selectedOrgGuid`, etc.) on every webview resolve; no persisted confirmed scope is replayed.
- Webview selection mode in `prototype.js` is runtime-only state (`selectedRegionId`, `selectedOrgId`, `selectedSpaceId`, `mode`) and is lost after reload.
- CFLogs layout relies on CSS grid with `.cf-logs-panel { grid-template-rows: auto auto minmax(0,1fr) auto; height: 100%; }`; initial short table behavior indicates missing/unstable definite parent height on first paint in extension context.
- Region hover clipping is consistent with upward transform inside a scroll container (`.region-layout` with overflow), where first-row upward movement can be clipped.

## Mandatory Order
1. Prototype-first changes.
2. Verify prototype with MCP Playwright.
3. TDD: add/update tests first, run and confirm failing expectations for new requirements.
4. Implement extension code.
5. Re-run tests/validation and fix regressions.
6. Final review, bump version, commit, push, monitor Actions.

## Detailed Steps

### Step A — Prototype update (UI-first)
1. CFLogs prototype full-height behavior
- Ensure root containers (`html`, `body`, panel wrapper, `.cf-logs-panel`) establish definite height chain.
- Ensure `.table-shell` consumes the `1fr` track immediately on first render.
- Ensure no overflow pushes content outside panel; scrolling must stay inside table shell.

2. Region tile visual fixes
- Remove notch/cut artifact for region/area tiles where needed.
- Keep hover motion but prevent top border clipping in first row (padding/overflow strategy or hover strategy refinement).
- Preserve current selected/collapsed behavior.

3. (If needed) small behavior updates in prototype JS
- Keep existing stage rerender optimization intact.
- No regressions for collapsed flows and Change buttons.

### Step B — Prototype verification via MCP Playwright
1. Open `docs/designs/prototypes/index.html`.
2. Verify main menu variant:
- region tiles show full border (no right-edge white cut),
- first-row hover keeps top border visible,
- selection flow still works.
3. Verify CFLogs variant:
- on first load, table shell fills remaining panel height,
- opening/closing settings does not cause drastic height jump.

### Step C — TDD updates before extension fix
1. Add/update E2E tests for CFLogs full-height on initial load:
- assert `table-shell` height occupies expected proportion of panel immediately before toggling settings and before log streaming.
- assert settings toggle does not significantly change layout height baseline.

2. Add/update E2E tests for confirmed scope persistence:
- select area/region/org/space + confirm,
- reload window (or reopen session preserving user data),
- assert workspace screen remains on confirmed scope and does not force re-selection.

3. Add/update E2E tests for region visual stability (DOM-based where possible):
- check style constraints relevant to notch/clip/hover container behavior.

### Step D — Extension implementation
1. Persist confirmed scope (host side)
- Add a persisted key in extension storage, scoped by active user email.
- Save scope only when user performs Confirm Scope action (not just partial selections).
- On webview startup, restore scope by replaying region/org/space flow and sending UI restore signal.
- Keep safe guards for missing/deleted org/space and stale cache.

2. Webview message contract
- Add new message type for Confirm Scope from webview → extension.
- Add new message type(s) for restore state from extension → webview.
- Preserve strict payload validation/type guards.

3. CFLogs full-height in extension
- Apply same proven prototype CSS layout chain fixes to extension webview assets.
- Confirm no regressions on filters/settings/table scrolling.

4. Region visual fixes in extension
- Apply same prototype style updates used by extension webview.

### Step E — Validation and hardening
- `npm run validate:root`
- `npm --prefix e2e run validate`
- `npm --prefix e2e test`
- If failures appear: analyze root cause (code vs test), fix, and rerun all required commands.

### Step F — Release steps
1. Bump `package.json` patch version after all checks pass.
2. Rerun required validations if any post-bump files changed.
3. Commit with clear scope.
4. Push and monitor GitHub Actions; fix-forward until green.

## Done Criteria
- CFLogs table uses full remaining height at first open (no settings-toggle workaround needed).
- Last confirmed scope is restored after reload/reopen for the same account.
- Region tiles no longer show right-edge white-cut artifact; top border stays visually intact on hover.
- Prototype, extension UI, and E2E tests are aligned.
- Lint/typecheck/unit/cspell/E2E all pass.
