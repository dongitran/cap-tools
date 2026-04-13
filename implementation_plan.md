# Implementation Plan — SQLTools Config Export Integration Review & Hardening

## 1) Objective
Validate and complete SQLTools config export in `14-saptools-vscode` so behavior is equivalent to the proven flow in `01-saptools`, then harden correctness via tests and full quality gates.

Requested scope for this cycle:
1. Review existing local diff deeply (user already implemented part of feature).
2. Compare implementation against `01-projects/01-saptools` reference.
3. Fix gaps/bugs if found.
4. Validate prototype UI with Playwright MCP.
5. Run extension checks + e2e and fix failures.
6. If extension code changes, bump `package.json` patch version, commit, push, and re-check CI.

## 2) Verified Current Context
Files currently changed/untracked in this branch:
- `src/sqlToolsConfigExporter.ts` (new)
- `src/sqlToolsConfigExporter.test.ts` (new)
- `src/sidebarProvider.ts`
- `e2e/tests/region-selector.e2e.spec.ts`
- `docs/designs/prototypes/assets/prototype.js`
- `docs/designs/prototypes/variants/design.html`
- `cspell.json`
- `package.json`

Reference implementation read from:
- `/Users/dongtran/Documents/brain/01-projects/01-saptools/src/vscode.ts`
- `/Users/dongtran/Documents/brain/01-projects/01-saptools/src/index.ts`
- `/Users/dongtran/Documents/brain/01-projects/01-saptools/src/__tests__/vscode.test.ts`

## 3) Gap Analysis Checklist
I will verify each item and mark pass/fail during implementation:
1. SQLTools connection shape parity (`driver`, `hanaOptions`, timeout, preview limit, name format).
2. `.vscode/settings.json` handling parity:
- create folder/file when absent
- preserve unrelated settings
- deterministic write formatting (4 spaces)
3. Merge behavior:
- current extension intentionally upserts one selected app by name.
- confirm this is product-correct for extension UX; if unsafe edge-cases exist, harden.
4. Input validation and security:
- reject invalid payloads/empty scope
- no secret leakage in output logs
- robust handling of malformed existing `sqltools.connections`
5. Webview integration:
- button state + messages for SQLTools export
- no regressions to existing Export Artifacts flow.
6. Test coverage adequacy:
- unit tests for parser/upsert/export function
- e2e assertions for UI state transitions in Apps tab
- decide minimal additional test(s) only where signal is missing.

## 4) Execution Plan (Granular)

### Step A — Deep review of modified code (no edits yet)
- Inspect diffs line-by-line for files listed above.
- Cross-compare with `01-saptools` reference behavior.
- Confirm where parity is required vs where extension-specific behavior is expected.

### Step B — Apply targeted fixes (if needed)
Potential files:
- `src/sqlToolsConfigExporter.ts`
- `src/sqlToolsConfigExporter.test.ts`
- `src/sidebarProvider.ts`
- `docs/designs/prototypes/assets/prototype.js` (only if prototype mismatch)
- `e2e/tests/region-selector.e2e.spec.ts` (only if coverage gap or test drift)

Rules:
- Keep functions <= 50 lines and avoid unnecessary abstractions.
- Prefer minimal, safe edits.
- No commented-out code.

### Step C — Prototype verification with Playwright MCP
- Open prototype entry and validate Apps tab:
  - `Export SQLTools Config` button visibility and disabled/enabled state behavior.
  - status messaging and no broken interactions.

### Step D — Full validation loop
Run in order, fixing issues immediately:
1. `npm run typecheck`
2. `npm run lint`
3. `npm run cspell`
4. `npm run test:unit`
5. `npm --prefix e2e run validate`
6. `npm --prefix e2e test`

### Step E — Release prep (if extension code changed)
1. Bump patch version in `package.json`.
2. Commit with clear message.
3. Push branch.
4. Check GitHub Actions via `gh` and resolve failures until green.

## 5) Definition of Done
1. SQLTools export in extension is behaviorally aligned with reference implementation intent.
2. No identified correctness/security regressions in modified paths.
3. Prototype and extension Apps tab behavior consistent for SQLTools export controls.
4. All checks pass locally: typecheck, lint, cspell, unit, e2e validate, e2e tests.
5. Version bumped + commit + push completed (if extension code changed) and CI is green.
