# Implementation Plan: Add 10 More Modern Designs (31-40)

## Goals
1. Expand prototype gallery from 30 to 40 designs.
2. Keep the current area-first interaction flow intact.
3. Make the 10 new designs visually more modern and clearly different from previous ones.
4. Preserve full-bleed edge-to-edge sidebar presentation and mobile compatibility.

## Current Findings
- Design count is controlled by `DESIGN_CATALOG` in `docs/designs/prototypes/assets/design-catalog.js`.
- Gallery navigation (`docs/designs/prototypes/assets/gallery.js`) automatically follows `DESIGN_CATALOG.length`.
- Each variant page is mapped one-to-one to `assets/themes/design-XX.css`.
- Area-first logic already exists in `docs/designs/prototypes/assets/prototype.js`; no behavior regression should be introduced.

## Planned Changes
1. Extend design catalog to 40 entries
- Update `docs/designs/prototypes/assets/design-catalog.js`.
- Add 10 records with ids `31..40`.
- Provide modern naming, subtitles, typography, color tokens, layout/pattern/selectStyle combinations.

2. Add 10 dedicated modern theme files
- Create `docs/designs/prototypes/assets/themes/design-31.css` ... `design-40.css`.
- Each file will contain distinct structural/stylistic rules:
  - varied header treatments
  - different area selector geometry
  - distinct region card/chip behavior
  - custom output panel accents

3. Add 10 variant pages
- Create `docs/designs/prototypes/variants/design-31.html` ... `design-40.html`.
- Link each page to `../assets/prototype.css`, its theme css, and `../assets/prototype.js`.

4. Validate after each implementation phase
- After catalog update: run `npm run lint`, `npm run typecheck`, `npm run cspell`.
- After theme files + variants: run `npm run lint`, `npm run typecheck`, `npm run cspell`.
- Final quick functional check: verify hash navigation supports `#design-40` and area-first rendering still works.

## Verification Checklist
1. `npm run lint`
2. `npm run typecheck`
3. `npm run cspell`
4. Spot checks:
- `index.html#design-31` and `index.html#design-40` load correct variants.
- Regions stay hidden until area selection.
- Next/previous cycles through all 40 designs.

---

# Follow-up Plan: Remove "Extension Output Preview" Heading

## Goal
1. Remove the "Extension Output Preview" text from all prototype designs while keeping output log lines intact.

## Planned Changes
1. Update shared renderer
- Edit `docs/designs/prototypes/assets/prototype.js`.
- Remove the `<p class="output-title">Extension Output Preview</p>` node from footer markup.

2. Optional style cleanup
- Keep existing styles for now to avoid unnecessary scope expansion.
- If required later, remove `.output-title` rule from `prototype.css` in a dedicated cleanup pass.

## Verification
1. `npm run lint`
2. `npm run typecheck`
3. `npm run cspell`
4. Visual check:
- Any `design-XX.html` no longer shows the heading text above output messages.

---

# Follow-up Plan: Region Name Abbreviation Format

## Goal
1. Replace location names in parentheses with short region abbreviations across all region entries.
2. Keep naming consistent between displayed region name and region code.

## Planned Changes
1. Update region records in `docs/designs/prototypes/assets/design-catalog.js`.
- Convert each `name` from format like `US East (Virginia)` to format like `US East (us-10)`.
- Update corresponding `code` to the same short abbreviation token.
- Apply this to all groups: Americas, Europe, Asia Pacific, Middle East & Africa.

## Verification
1. `npm run lint`
2. `npm run typecheck`
3. `npm run cspell`
4. Sanity check:
- No remaining `(<city>)` region names in `REGION_GROUPS`.
- UI labels and code chips now both use abbreviation-style region codes.

---

# Follow-up Plan: Remove Inline Code Duplication in Region Names

## Goal
1. Remove the abbreviation text in parentheses from each region `name`.
2. Keep the `code` field unchanged so code chips still show values like `EU-10`.

## Planned Changes
1. Edit `docs/designs/prototypes/assets/design-catalog.js`.
- Convert `name` values from `West Europe (eu-10)` to `West Europe`.
- Apply the same transformation to all regions in all groups.

## Verification
1. `npm run lint`
2. `npm run typecheck`
3. `npm run cspell`
4. Confirm there is no `(<abbr>)` in `REGION_GROUPS` names and UI still shows `region-code` chip.

---

# Follow-up Plan: Remove Prototype Log Panel

## Goal
1. Stop showing any selection logs in the prototype UI footer area.

## Planned Changes
1. Update `docs/designs/prototypes/assets/prototype.js`.
- Remove `outputMessages` state and all append/trim/timestamp log logic.
- Remove footer log markup (`output-box` / `output-stream`) from `renderPrototype`.
- Keep area selection + single region selection behavior unchanged.

## Verification
1. `npm run lint`
2. `npm run typecheck`
3. `npm run cspell`
4. Visual check:
- No log panel appears under the region selection UI in any design variant.

---

# Follow-up Plan: Keep Only Design 34

## Goal
1. Keep only Design 34 and remove all other prototype designs.
2. Remove `Design 34` badge text from the UI.
3. Remove the subtitle line (`Warm modern orange with premium spacing rhythm...`) from the UI.

## Planned Changes
1. Reduce catalog to one design
- Edit `docs/designs/prototypes/assets/design-catalog.js`.
- Keep `REGION_GROUPS` as-is.
- Keep only design object with `id: 34` in `DESIGN_CATALOG`.

2. Update shared prototype renderer
- Edit `docs/designs/prototypes/assets/prototype.js`.
- Remove design-pill rendering from header.
- Remove subtitle paragraph rendering from meta strip.
- Default fallback design id to `34`.

3. Delete unused assets/pages
- Delete all `docs/designs/prototypes/assets/themes/design-XX.css` except `design-34.css`.
- Delete all `docs/designs/prototypes/variants/design-XX.html` except `design-34.html`.
- Update `docs/designs/prototypes/index.html` iframe source to `./variants/design-34.html`.

## Verification
1. `npm run lint`
2. `npm run typecheck`
3. `npm run cspell`
4. Sanity checks:
- Theme count is `1`, variant count is `1`.
- No `Design 34` text in rendered header.
- No subtitle text line shown in UI.

---

# Follow-up Plan: Remove Previous/Next Buttons

## Goal
1. Remove `Previous` and `Next` buttons from prototype page UI.
2. Keep single-design page functional without navigation controls.

## Planned Changes
1. Edit `docs/designs/prototypes/index.html`.
- Remove floating navigation `<nav>` block.
- Remove `gallery.js` script include because navigation logic is no longer needed.

## Verification
1. `npm run lint`
2. `npm run typecheck`
3. `npm run cspell`
4. Visual check:
- No `Previous` / `Next` buttons rendered in prototype page.

---

# Follow-up Plan: Remove "Solar Frame" Label

## Goal
1. Remove the `Solar Frame` text from prototype UI.

## Planned Changes
1. Edit `docs/designs/prototypes/assets/prototype.js`.
- Remove the `meta-strip` block that renders `${activeDesign.name}`.
- Keep header + area/region selection UI unchanged.

## Verification
1. `npm run lint`
2. `npm run typecheck`
3. `npm run cspell`
4. Visual check:
- No `Solar Frame` text appears in the prototype interface.

---

# Follow-up Plan: Remove Region Count Line

## Goal
1. Remove the header line showing `${TOTAL_REGION_COUNT} regions in this prototype`.

## Planned Changes
1. Edit `docs/designs/prototypes/assets/prototype.js`.
- Remove the `shell-subline` block from header markup.
- Remove unused `TOTAL_REGION_COUNT` import.

## Verification
1. `npm run lint`
2. `npm run typecheck`
3. `npm run cspell`
4. Visual check:
- No `regions in this prototype` text appears in header.

---

# Follow-up Plan: Progressive Selection UX (Area -> Region -> Org -> Space -> Confirm)

## Goal
1. Improve selection flow into clear progressive steps:
- Step 1: Select area and collapse to the chosen area only.
- Step 2: Show regions for selected area.
- Step 3: Select region and collapse region list to the chosen region only.
- Step 4: Show org list and require org selection.
- Step 5: Show space list and require space selection before confirm.
2. Add special behavior:
- When a selected region is clicked again, re-expand full region list for that area.

## Planned Changes
1. Update interaction state and actions in `docs/designs/prototypes/assets/prototype.js`.
- Add org selection state and org dataset.
- Add space selection state and space dataset (scoped by selected org).
- Add action to reset area selection.
- Make confirm require selected region + selected org + selected space.
- Keep workspace screen after confirm and display selected org/space context.

2. Update selection rendering in `prototype.js`.
- Area stage renders all areas initially, then only selected area after selection.
- Region stage renders full list initially, then selected item only when chosen.
- Add org stage that appears only after region is selected.
- Add space stage that appears only after org is selected.
- Update confirm panel messaging to reflect progressive completion.

3. Extend styles in `docs/designs/prototypes/assets/prototype.css`.
- Add UI styles for collapsed stages and helper text.
- Add org picker styles and selected state.
- Add space picker styles and selected state.
- Keep sidebar-friendly compact spacing and mobile behavior.

## Verification
1. `npm run lint`
2. `npm run typecheck`
3. `npm run cspell`
4. Manual behavior checks:
- Selecting area collapses area list to selected item.
- Selecting region collapses region list to selected item.
- Clicking selected region again expands full region list.
- Org list appears only after region is selected.
- Space list appears only after org is selected.
- Confirm button remains disabled until space is selected.

---

# Follow-up Plan: Refine Progressive Selection UI Controls

## Goal
1. Make Region selection interaction match Organization selection behavior.
2. Remove redundant helper text lines in Region/Org/Space stages.
3. Replace count badges with `Change` controls in:
- `Choose Region`
- `Choose Organization`
- `Choose Space`
4. Ensure selecting organization does not collapse/hide other org options.

## Planned Changes
1. Update selection behavior in `prototype.js`.
- Keep all region options visible after selection (no region list collapse).
- Keep org options fully visible (selected state only).
- Add stage reset actions:
  - `reset-region-selection`
  - `reset-org-selection`
  - `reset-space-selection`

2. Update selection stage headers in `prototype.js`.
- Remove count pills for Region/Org/Space stages.
- Render `Change` button in each stage header (disabled when that stage has no selection).

3. Remove lines requested in `prototype.js`.
- Remove `Click selected region again to reveal full region list.`
- Remove org helper line starting with `Scope for`.
- Remove space helper line starting with `Spaces in`.

4. Keep CSS aligned in `prototype.css`.
- Reuse existing `stage-reset` button style.
- Ensure no collapse-only CSS assumptions for region stage.

## Verification
1. `npm run lint`
2. `npm run typecheck`
3. `npm run cspell`
4. Manual checks:
- Region options stay visible after region selection.
- Org options stay visible after org selection.
- `Change` buttons exist in Region/Org/Space headers and reset their step state.

---

# Follow-up Plan: Smooth Area Collapse Animation

## Goal
1. Keep current UX intent where only `Choose Area` collapses selected choice.
2. Hide non-selected area options immediately.
3. Animate only the selected area option moving to its new position after selection.

## Planned Changes
1. Update `renderAreaPicker` in `prototype.js`.
- Always render all area options.
- Mark non-selected options with an immediate hidden-state class when area is collapsed.
- Add FLIP-style animation for selected area button:
  - capture pre-render position
  - render new layout
  - animate selected item from old position to new position

2. Update area option styles in `prototype.css`.
- Hidden state uses immediate hide (`display: none`).
- Keep normal hover/active transitions for visible item.

## Verification
1. `npm run lint`
2. `npm run typecheck`
3. `npm run cspell`
4. Manual check:
- Selecting area hides other options immediately.
- Selected area visibly moves to new position with smooth animation.

---

# Follow-up Plan: Region Selected Visual Consistency

## Goal
1. Replace the current orange underline effect in `Choose Region` selected state.
2. Make selected region card highlight style consistent with `Choose Organization`.

## Planned Changes
1. Update `prototype.css` selected rule for `.prototype-shell.select-style-underline .region-option.is-selected`.
- Remove underline-gradient background.
- Apply full-card highlight (`accentSoft`) and selected border tone used by organization options.
- Ensure text remains readable with selected chip text color.

## Verification
1. `npm run lint`
2. `npm run typecheck`
3. `npm run cspell`
4. Manual check:
- Picking a region shows a full highlighted card, not a bottom orange line.

---

# Follow-up Plan: Region Collapse Specificity Fix

## Goal
1. Ensure non-selected regions are hidden immediately after selecting a region.
2. Keep selected-region move animation visible (FLIP) by forcing layout collapse.

## Planned Changes
1. Update hidden selector specificity in `prototype.css` for region items used in `chips` layout.
- Replace low-specificity `.region-option.is-hidden` behavior with a selector that overrides `.region-layout.chips .region-option`.

## Verification
1. `npm run lint`
2. `npm run typecheck`
3. `npm run cspell`
4. Playwright local check on `docs/designs/prototypes/index.html`:
- after selecting a region, only one region option remains visible
- selected region has active move animation behavior when collapsing

---

# Follow-up Plan: Stage Container Height Animation

## Goal
1. Keep selected-item FLIP movement as-is.
2. Add smooth container collapse/expand for each selection stage:
- `Choose Area`
- `Choose Region`
- `Choose Organization`
- `Choose Space`
3. Keep hidden items instant-hide while the selected item and stage container animate.

## Planned Changes
1. Update `prototype.js` motion pipeline.
- Add stage-height motion queue with pre-render measurements.
- Trigger stage measurement before state transitions on selection actions and reset actions.
- Play stage height animation after re-render, alongside existing selected-item FLIP motion.

2. Update stage markup in `prototype.js`.
- Add stable stage identifiers to each stage container for reliable pre/post render targeting.

3. Update `prototype.css`.
- Add safe overflow behavior for animated stage containers.
- Add reduced-motion fallback to disable heavy motion when user prefers reduced motion.

## Verification
1. `npm run lint`
2. `npm run typecheck`
3. `npm run cspell`
4. Playwright local check:
- selecting an option collapses same stage container with smooth height change
- selected option still moves toward its new position
- reset (`Change`) re-expands stage with smooth container height animation

---

# Follow-up Plan: Region Shape + Selected Click Guard

## Goal
1. Remove clipped right-edge look in `Choose Region` items and use rounded shape.
2. Disable re-handle behavior when clicking already-selected options:
- `Region`
- `Organization`
- `Space`
3. Keep reset behavior only on `Change` button.

## Planned Changes
1. Update interaction guards in `prototype.js`.
- Short-circuit click handlers when clicked option id equals current selected id.
- Remove toggle-off logic in selection handlers for region/org/space.

2. Update `design-34.css` for region option visual shape.
- Remove the clipped polygon shape on region items.
- Keep rounded corners and regular right padding.

## Verification
1. `npm run lint`
2. `npm run typecheck`
3. `npm run cspell`
4. Playwright local checks:
- clicking already-selected region/org/space does nothing
- only `Change` triggers reset
- region options render with rounded right edge (no clip cut)

---

# Follow-up Plan: Rebuild Extension UI to Match Prototype

## Goal
1. Replace current tree-based sidebar UI with a webview UI that matches `docs/designs/prototypes` design and interactions.
2. Keep current scope as UI-only (no CF login/API integration yet).
3. Preserve extension output logging for selected region via webview-to-extension messaging.

## Planned Changes
1. Migrate sidebar provider architecture in `src/sidebarProvider.ts`.
- Replace `TreeDataProvider` implementation with `WebviewViewProvider`.
- Serve webview HTML that loads existing prototype assets (`prototype.css`, `design-34.css`, `prototype.js`) from `docs/designs/prototypes/assets`.
- Add strict CSP + nonce and local resource roots for webview security.
- Add typed message handler for region selection messages from webview and write logs to extension output channel.

2. Update extension activation wiring in `src/extension.ts`.
- Register webview view provider instead of creating `TreeView`.
- Keep command `sapTools.selectSapBtpRegion` to focus the sidebar view.
- Keep output channel lifecycle management.

3. Enable webview view contribution in `package.json`.
- Set view entry `sapTools.regionView` to `"type": "webview"`.
- Keep activity bar container and command metadata intact.

4. Add webview bridge message from prototype script.
- Update `docs/designs/prototypes/assets/prototype.js` to post selected region metadata when region selection changes.
- Keep behavior unchanged for browser prototype (graceful no-op if `acquireVsCodeApi` is unavailable).

5. Update E2E to test new webview UI flow.
- Replace tree-item click assertions with webview button interactions.
- Verify selecting region in webview emits output log visible in VS Code UI.

6. Refresh docs that describe current feature behavior.
- Update `README.md` and `e2e/README.md` to describe interactive webview selection flow.

7. Release hygiene.
- Increase `package.json` version after successful completion.

## Verification
1. `npm run lint`
2. `npm run typecheck`
3. `npm run cspell`
4. `npm run test:unit`
5. `npm run validate`
6. `npm --prefix e2e test`

---

# Follow-up Plan: Dark Theme Alignment for VS Code Webview

## Goal
1. Fix dark-theme mismatch in the extension sidebar UI.
2. Ensure the webview respects VS Code host theme classes (`vscode-dark`, `vscode-light`, `vscode-high-contrast`).
3. Improve visual consistency and accessibility in dark/high-contrast without changing selection flow behavior.

## Root Cause Findings
1. `docs/designs/prototypes/assets/prototype.js` currently sets `document.body.className = ...` in `applyDesignTokens()`, which removes VS Code host theme classes.
2. `docs/designs/prototypes/assets/prototype.css` uses light-leaning palette assumptions and strong background pattern opacity, which looks noisy in dark mode.

## Planned Changes
1. Preserve VS Code theme classes in runtime class handling.
- File: `docs/designs/prototypes/assets/prototype.js`
- Replace destructive `className` assignment with class-list based updates that only swap design-specific classes (`pattern-*`, `theme-*`) and keep existing host classes.

2. Add theme-aware token overrides for host themes.
- File: `docs/designs/prototypes/assets/prototype.css`
- Introduce `body.vscode-light.prototype-page`, `body.vscode-dark.prototype-page`, and `body.vscode-high-contrast.prototype-page` token overrides.
- Map core tokens to VS Code webview variables (`--vscode-editor-background`, `--vscode-foreground`, `--vscode-button-background`, etc.) with safe fallbacks.

3. Improve dark/high-contrast readability and focus behavior.
- File: `docs/designs/prototypes/assets/prototype.css`
- Reduce decorative pattern opacity for dark/high-contrast modes.
- Add clear `:focus-visible` ring based on `--vscode-focusBorder`.
- Switch hard-coded connection state colors to semantic CSS variables so they adapt per theme.

4. Keep existing structure and test selectors stable.
- Do not rename existing role labels or data attributes used by E2E tests.
- Limit scope to presentation/theming changes.

## Verification
1. `npm run lint`
2. `npm run typecheck`
3. `npm run cspell`
4. `npm run test:unit`
5. `npm --prefix e2e test -- --grep "User can select one SAP BTP region in webview and output log is emitted"`
6. `npm --prefix e2e test -- --grep "User can complete selection flow and reset via Change buttons only"`
7. `npm --prefix e2e test -- --grep "User can confirm scope, view monitoring workspace, and switch back to selection"`

---

# Follow-up Plan: Prototype Gallery Theme Picker

## Goal
1. Add bottom navigation controls in `docs/designs/prototypes/index.html` with:
- `Previous`
- `Theme` switch button
- `Next`
2. Keep the prototype gallery synchronized with theme behavior equivalent to the extension webview (`vscode-light`, `vscode-dark`, `vscode-high-contrast`).

## Planned Changes
1. Update gallery template structure.
- File: `docs/designs/prototypes/index.html`
- Add floating nav controls and include `assets/gallery.js` as module script.

2. Add theme-switch runtime logic.
- File: `docs/designs/prototypes/assets/gallery.js`
- Add theme scenarios and cycle logic for the new theme button.
- Apply selected theme class to iframe document body after each load and after design navigation.
- Keep previous/next behavior intact.

3. Style nav and page chrome by selected theme.
- File: `docs/designs/prototypes/assets/gallery.css`
- Add theme-aware variables for gallery host (dark/light/high-contrast).
- Ensure mobile layout remains usable.

## Verification
1. `npm run lint`
2. `npm run typecheck`
3. `npm run cspell`
4. Manual check:
- `Previous`/`Next` still switch designs.
- Theme button cycles dark/light/high-contrast.
- Iframe prototype updates theme class and visual palette immediately.

---

# Follow-up Plan: Partial Stage Rendering for Selection UX

## Goal
1. Eliminate full-page webview rerender on each selection click.
2. Update only affected parent stage components (`Choose Area`, `Choose Region`, `Choose Organization`, `Choose Space`, `Confirm`) during selection flow.
3. Preserve existing interaction behavior, animations, and VS Code message logging.

## Root Cause
- `docs/designs/prototypes/assets/prototype.js` currently calls `renderPrototype()` (full `appElement.innerHTML` replacement) for every selection action and many workspace actions.
- Full replacement recreates all DOM nodes, causing visible flicker and unnecessary layout churn.

## Planned Changes
1. Introduce stable selection shell with stage slots.
- Keep top-level shell/header and `.groups` container persistent while in selection mode.
- Add dedicated slot hosts for each stage and render stage content into slots.

2. Add targeted stage rerender pipeline.
- Create stage-id constants and rerender helpers that update only requested slots.
- Map each selection action to an explicit impacted stage list.
- Keep existing FLIP/height animation pipeline, but execute after targeted stage updates.

3. Keep full-shell render only for mode transitions.
- Use full render when switching between `selection` and `workspace` modes.
- Keep workspace rendering behavior unchanged for now.

4. Expand E2E coverage for partial rendering behavior.
- Add a regression test that verifies shell/header/group container nodes are preserved across selection interactions.
- Keep existing flow and theme tests.

5. Validate and release hygiene.
- Run strict checks and E2E suite.
- Bump extension version if extension-facing behavior changed.

## Verification
1. `npm run lint`
2. `npm run typecheck`
3. `npm run cspell`
4. `npm run test:unit`
5. `npm --prefix e2e run validate`
6. Run E2E tests individually (`--grep`) and full suite.
7. `npm run validate`

---

# Follow-up Plan: Edge-to-Edge Sidebar Width in Extension

## Goal
1. Remove horizontal chrome padding/margin in the extension webview so content uses full sidebar width.
2. Keep prototype gallery styling unaffected unless explicitly needed.
3. Add regression coverage for horizontal layout constraints in extension E2E.

## Root Cause
- Shared stylesheet applies horizontal container paddings at shell/content layers (`.shell-header`, `.groups`, `.meta-strip`, `.workspace-*`, `.output-box`).
- Extension webview currently uses the same classes as prototype, so this creates visible left/right gutters in narrow sidebar widths.

## Planned Changes
1. Mark extension runtime with a dedicated body class.
- File: `src/sidebarProvider.ts`
- Add a stable class (e.g. `saptools-extension`) to webview body for extension-only overrides.

2. Add extension-only edge-to-edge CSS overrides.
- File: `docs/designs/prototypes/assets/prototype.css`
- Override horizontal paddings to `0` for key shell containers when `body.saptools-extension` is present.
- Keep vertical rhythm and internal element paddings where possible for readability.

3. Add E2E assertion for shell horizontal paddings.
- File: `e2e/tests/region-selector.e2e.spec.ts`
- Validate computed `padding-left` and `padding-right` are `0px` on primary shell containers in extension webview.

## Verification
1. `npm run lint`
2. `npm run typecheck`
3. `npm run cspell`
4. `npm --prefix e2e run validate`
5. `npm --prefix e2e test -- --grep "open selector and pick region"`
6. `npm --prefix e2e test -- --grep "without recreating selection shell nodes"`

---

# Follow-up Plan: Remove Confirm Summary and Eliminate Remaining Horizontal Gutter

## Goal
1. Remove confirm summary text line above `Confirm Scope`.
2. Remove remaining left/right whitespace in extension selection stages.
3. Re-run E2E to validate selection flow remains stable.

## Root Cause
- Confirm panel still renders a summary `<p>` block even though selected scope is already visible in prior stages.
- Stage cards retain internal horizontal padding (`.group-card`, `.area-stage`) which still appears as side gutter in narrow sidebar mode.

## Planned Changes
1. Update confirm stage markup.
- File: `docs/designs/prototypes/assets/prototype.js`
- Remove summary string generation and `<p class="confirm-summary">...` node from `renderConfirmPanel()`.

2. Tighten extension-only edge-to-edge overrides.
- File: `docs/designs/prototypes/assets/prototype.css`
- Under `body.saptools-extension`, set `padding-inline: 0` for `.group-card` and `.area-stage`.

3. Validate regression scope.
- Run full E2E suite after changes.

## Verification
1. `npm --prefix e2e test`
2. `npm run validate`

---

# Follow-up Plan: Implement Plan 00 Prototype (Credentials Gate + Pro Logs Mock)

## Goal
1. Update prototype to match `docs/plans/00-cf-logs-viewer.md` Step A architecture and UX.
2. Keep extension runtime backward-compatible while host-side CF modules are not wired yet.
3. Ensure prototype is testable in browser/gallery mode with mock state machine.

## Scope
1. Files in scope:
- `docs/designs/prototypes/assets/prototype.js`
- `docs/designs/prototypes/assets/prototype.css`
- `docs/designs/prototypes/assets/themes/design-34.css` (only if required)

2. Out of scope in this step:
- Host-side TypeScript CF integration (`src/cf/*`, `src/messaging/*`)
- SecretStorage wiring in extension host

## Implementation Strategy
1. Introduce dual runtime behavior.
- `isMockRuntime = vscodeApi === null` enables full Step A mock flow.
- VS Code runtime keeps existing selection/log behavior to avoid regressions before Step C wiring.

2. Expand selection stage model.
- Add `signin` slot to `SELECTION_STAGE_SLOT_IDS`.
- Render sign-in stage only when region selected and credentials not valid in mock runtime.
- Preserve partial stage rerender behavior.

3. Add credential gate mock state machine.
- Implement states: `unknown/checking/missing/submitting/valid/error`.
- Implement sources: `env/secret-storage/none` with safe mock behavior.
- Add actions: submit/use/edit/forget/toggle remember/show password.

4. Add org-space-app mock flow.
- Replace static org list rendering in mock path with staged data loading and selection.
- Add apps tab rendering and app selection that drives logs tab context.

5. Upgrade logs prototype UI.
- Parse `LOG_SEED_RICH_RAW` via `parseCfLogLine`.
- Add pro toolbar, filters, buffer state, row selection, JSON tree detail, copy actions.
- Keep compatibility aliases for old actions to avoid breaking transition tests.

6. Add styles for new components.
- Sign-in card/form/skeleton/error states.
- Apps list and app badges.
- Pro logs toolbar/filter/table/detail/json tree.

## Verification
1. `npm run lint`
2. `npm run typecheck`
3. `npm run cspell`
4. Manual browser verification of flow in `docs/designs/prototypes/index.html`.
5. MCP Playwright smoke verification for mock flow.

---

# Follow-up Plan: CFLogs Panel Channel in Extension Host

## Goal
1. Route extension log lines to a dedicated `CFLogs` output channel.
2. Show `CFLogs` channel when log events arrive so users can monitor logs near VS Code panel (`Output`/`Terminal` area).
3. Keep current extension behavior and E2E compatibility.

## Planned Changes
1. Update extension activation wiring.
- File: `src/extension.ts`
- Create dedicated output channel named `CFLogs` in addition to existing channel.
- Inject channel into sidebar provider.

2. Update sidebar provider logging target.
- File: `src/sidebarProvider.ts`
- Accept both channels in constructor.
- On `sapTools.regionSelected`, append line to `CFLogs` and focus it (`show(true)`).
- Keep existing SAP Tools channel append for backward traceability.

3. Validation.
- Run lint/typecheck/cspell/root validate + e2e.

## Verification
1. `npm run lint`
2. `npm run typecheck`
3. `npm run cspell`
4. `npm run validate`
5. `npm --prefix e2e test`
