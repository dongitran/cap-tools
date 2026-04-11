# Implementation Plan: Full-Bleed UI + 20 Distinct CSS Files

## Goal
1. Region selector prototype must render edge-to-edge (no outer rounded frame, no outer margin/padding).
2. 20 designs must be genuinely different.
3. Each design must use its own dedicated CSS file (20 CSS files total).

## Problems in Current State
- A shared `prototype-themes.css` drives all designs, causing repetitive visual patterns.
- Base shell uses card-like framing, creating non-fullscreen sidebar feel.

## Change Strategy
1. Refactor base stylesheet (`prototype.css`)
- Convert to full-bleed shell (`width: 100%`, `min-height: 100dvh`).
- Remove outer frame radius/border/shadow from the shell container.
- Keep reusable, neutral component primitives only.

2. Introduce per-design theme files
- Create `docs/designs/prototypes/assets/themes/design-01.css` ... `design-20.css`.
- Each file will define a distinct visual language (typography, spacing rhythm, card geometry, region option behavior, output style, interaction mood).
- No theme file reintroduces outer shell rounding/padding to maintain edge-to-edge layout.

3. Wire each variant to its own CSS
- Update `docs/designs/prototypes/variants/design-01.html` ... `design-20.html`.
- Replace shared `prototype-themes.css` with the corresponding theme file.

4. Cleanup
- Remove unused `prototype-themes.css` once all variants are migrated.

## Verification
1. `npm run lint`
2. `npm run typecheck`
3. `npm run cspell`
4. Visual spot checks:
- no outer frame around shell,
- each design visibly different,
- mobile viewport still readable.
