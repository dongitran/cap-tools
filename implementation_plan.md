# Implementation Plan: 30 Distinct Designs + Cleaner Area-First Region Flow

## Goals
1. Expand prototype gallery from 20 to 30 designs.
2. Keep full-bleed edge-to-edge layout.
3. Improve clarity: show regions only after selecting a high-level area/group.
4. Maintain strong visual differentiation with dedicated CSS per design.

## Current Findings
- Design count is driven by `DESIGN_CATALOG` in `design-catalog.js`.
- `prototype.js` currently renders all groups and regions at once.
- Variant HTML files are one-file-per-design and can map directly to per-design CSS.

## Planned Changes
1. Refactor interaction flow (`prototype.js`)
- Add explicit area selection state.
- Render area selector first.
- Render region list only for selected area.
- Keep output log behavior for selected area and selected region.

2. Extend base UI styles (`prototype.css`)
- Add area selector styles (`area-picker`, `area-option`).
- Add clean empty-state panel when no area is selected.
- Preserve full-bleed shell without outer frame.

3. Expand catalog to 30 entries (`design-catalog.js`)
- Add 10 new design definitions (id 21..30) with distinct naming, typography, and token profiles.

4. Add 10 dedicated design CSS files
- Create `assets/themes/design-21.css` ... `design-30.css`.
- Each file defines a distinct visual style (layout rhythm, geometry, interaction accents, hierarchy treatment).

5. Add 10 new variant HTML files
- Create `variants/design-21.html` ... `design-30.html`.
- Each variant links to `prototype.css` and corresponding per-design CSS.

## Verification
1. `npm run lint`
2. `npm run typecheck`
3. `npm run cspell`
4. Spot-check behavior:
- Initial state shows only area choices and no region list.
- Regions appear only after area selection.
- 30 designs are navigable via next/previous.
