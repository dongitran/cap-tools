# Implementation Plan — Sidebar Selection UX Stability + Workspace Header + App Row Selection

## 1) Goal
Implement and verify three UX changes end-to-end in the SAP Tools extension:
1. Investigate and fix selection-stage behavior so choosing a region/organization does not trigger unnecessary full-page rerender effects.
2. Move `Change Region` from workspace footer to workspace header, positioned left of the settings gear.
3. In `Apps Log Control`, allow selecting an app by clicking anywhere on the app row (not only the checkbox).

This plan also includes prototype sync, Playwright MCP visual validation, automated quality gates, version bump, commit, push, and post-push CI checks.

## 2) Scope Discovery (Completed Before Editing)
Reviewed files:
- `src/sidebarProvider.ts` (webview host wiring and prototype asset loading)
- `docs/designs/prototypes/assets/prototype.js` (UI state machine + render logic)
- `docs/designs/prototypes/assets/prototype.css` (layout/styling for workspace and app rows)
- `docs/designs/prototypes/index.html`
- `docs/designs/prototypes/assets/gallery.js`
- `e2e/tests/region-selector.e2e.spec.ts`
- `package.json`

Key observations:
- Extension webview directly executes `docs/designs/prototypes/assets/prototype.js`, so prototype updates are production UI updates.
- Selection interactions already use slot-level rerender helpers, but several message paths still call full `renderPrototype()` and can cause whole-shell redraw perception.
- Workspace currently renders `Change Region` in footer.
- App row click behavior is not wired; only checkbox `change` drives state.

## 3) Files Expected to Change
- `docs/designs/prototypes/assets/prototype.js`
- `docs/designs/prototypes/assets/prototype.css`
- `e2e/tests/region-selector.e2e.spec.ts`
- `docs/designs/prototypes/variants/design.html` (cache-bust query string if needed)
- `package.json` (+ `package-lock.json`) for patch version bump
- `implementation_plan.md` (this document)

## 4) Detailed Execution Steps

### Step A — Fix selection rerender behavior
1. Add/adjust refresh helpers in `prototype.js` so selection-mode updates prefer slot-level refresh instead of full `renderPrototype()`.
2. Ensure region/org selection flows only update the relevant stage slots (`region`, `org`, `space`, `confirm`) and preserve shell/header/group containers.
3. Remove or narrow full rerender fallbacks in selection-related inbound message handlers where safe.
4. Keep workspace-specific targeted refresh behavior unchanged for logs/apps tabs.

### Step B — Move `Change Region` control to workspace header
1. Update `renderWorkspaceScreen()` markup to include header actions container:
- left: `Change Region`
- right: settings gear button
2. Remove footer `Change Region` button usage while keeping footer last-sync label.
3. Adjust CSS for header action row alignment and button sizing.
4. Preserve responsive behavior for narrow widths.

### Step C — Enable click-anywhere app row selection
1. Add delegated click handling for `.app-log-item` rows in `prototype.js`.
2. Keep checkbox behavior accessible:
- Clicking checkbox continues to work via native input `change`.
- Clicking row toggles associated checkbox programmatically and dispatches `change`.
3. Respect disabled/locked rows (`is-logging`/disabled checkbox) so row click does not toggle them.

### Step D — Update and strengthen E2E coverage
1. Extend selection-shell stability test to include organization selection and verify shell/header/groups/stage-slot nodes are still stable.
2. Add/adjust a test to verify clicking app row (non-checkbox area) toggles selection and enables `Start App Logging`.
3. Update assertions for new workspace header placement of `Change Region`.
4. Ensure test names remain behavior-based and do not include “bug”.
5. Keep edited tests without inline comments.

### Step E — Prototype sync and visual verification
1. Confirm prototype route (`index.html` -> `design` variant) reflects new behaviors.
2. Use Playwright MCP to open prototype and validate:
- `Change Region` appears in header beside settings, not footer.
- App row click toggles checkbox.
- Selection flow does not visually redraw full shell during region/org picks.
3. Fix any discovered prototype mismatch before final checks.

### Step F — Quality gates
Run and fix until all pass:
1. `npm run typecheck`
2. `npm run lint`
3. `npm run cspell`
4. `npm run test:unit`
5. `npm --prefix e2e run validate`
6. `npm --prefix e2e test`

### Step G — Release steps
1. Bump extension patch version in `package.json` and sync lockfile.
2. Commit all required changes.
3. Push to `main`.
4. Monitor GitHub Actions (`gh` CLI) and fix-forward if any workflow fails.

## 5) Done Criteria
1. Region/org selection no longer causes unnecessary full-shell redraw behavior; slot-level updates remain stable.
2. `Change Region` is in workspace header, to the left of settings.
3. Clicking any app row in `Apps Log Control` toggles selection (except locked rows).
4. Prototype and extension behavior are aligned.
5. Lint, typecheck, unit tests, cspell, e2e validate, and e2e tests all pass.
6. Version is bumped, code committed, pushed, and CI checked green.
