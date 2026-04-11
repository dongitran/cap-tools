# Implementation Plan - Rework Prototype Gallery UX

## Objective
Refactor `docs/designs/prototypes/index.html` to mimic a VSCode-like left sidebar preview, remove all non-essential title/description text, keep only floating `Previous` and `Next` controls, ensure strong mobile behavior, and make 20 designs visually distinct (not just color swaps).

## Requirements From User
1. Sidebar simulation must sit flush on the left like VSCode.
2. No page title/description text, no `Sidebar Simulation` label.
3. Keep only 2 floating controls above sidebar preview: `Previous`, `Next`.
4. Mobile rendering must remain usable.
5. 20 design variants need stronger visual differences.

## Design & Technical Approach
1. Replace gallery page structure with a two-pane workspace:
   - left: sidebar iframe preview (fixed ~30% viewport width)
   - right: editor-area mock panel for spatial context
2. Remove old control panel and metadata UI.
3. Rebuild gallery controller script for simple navigation:
   - hash-based design state
   - button + keyboard arrow navigation
4. Add dedicated theme layer file (`prototype-themes.css`) containing per-design overrides (`theme-01` ... `theme-20`) affecting:
   - panel geometry (radius, border style, shadows)
   - typography mood
   - group card treatment
   - region button shape/interaction style
   - output panel style
5. Keep existing data catalog and variant files to preserve extensibility.

## Step Plan
1. Update `index.html`, `gallery.css`, `gallery.js` for the new minimal layout and controls.
2. Run checks: `typecheck`, `lint`, `cspell`.
3. Add and wire `prototype-themes.css` + update `prototype.js`/variant template loading for theme classes.
4. Run checks: `typecheck`, `lint`, `cspell`.
5. Validate via MCP Playwright on local HTTP server:
   - load page
   - switch with `Previous/Next`
   - verify iframe updates and mobile layout behavior
6. If new words appear, update `cspell.json`.

## Files To Change
- `implementation_plan.md`
- `docs/designs/prototypes/index.html`
- `docs/designs/prototypes/assets/gallery.css`
- `docs/designs/prototypes/assets/gallery.js`
- `docs/designs/prototypes/assets/prototype.js`
- `docs/designs/prototypes/assets/prototype-themes.css` (new)
- `docs/designs/prototypes/variants/design-01.html` ... `design-20.html` (link new theme CSS)

## Risks
- Overly heavy style overrides can reduce readability in some themes.
- Mobile viewport might clip floating controls if top spacing is too small.

## Mitigation
- Keep contrast-safe typography defaults in base CSS and only override selectively.
- Use explicit mobile breakpoints for sidebar width, height, and control placement.
