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
