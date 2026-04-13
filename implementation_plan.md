# Implementation Plan — Consolidate Service Export Action

## Objective
Update both prototype and extension UI so `Apps` tab has one export action only (no per-file export buttons), with improved naming and button color, then validate with E2E and Playwright.

## Verified Context
- Current UI still renders 3 export actions in `docs/designs/prototypes/assets/prototype.js`:
  - `Export Both`
  - `Export default-env.json`
  - `Export pnpm-lock.yaml`
- Extension host still accepts 3 inbound messages in `src/sidebarProvider.ts`:
  - `sapTools.exportDefaultEnv`
  - `sapTools.exportPnpmLock`
  - `sapTools.exportServiceArtifacts`
- E2E currently asserts the old heading/button set in `e2e/tests/region-selector.e2e.spec.ts`.

## Scope
### In scope
- Keep only one export trigger (`sapTools.exportServiceArtifacts`) end-to-end.
- Rename service export section title to clearer wording.
- Adjust export button visual style for better contrast and intent.
- Update E2E expectations to match new UI behavior.
- Re-run lint/typecheck/unit/cspell/e2e.

### Out of scope
- Changing export payload format or output files (`default-env.json`, `pnpm-lock.yaml` remain both exported together).
- Refactoring unrelated tabs and CF logs panel architecture.

## Design Decisions
1. Message contract simplification:
   - Remove unused per-file export message constants and handlers.
   - Keep one path with `includeDefaultEnv: true` and `includePnpmLock: true`.
2. UI copy:
   - Title becomes `Export Service Artifacts` (clear action-oriented grammar).
   - Button becomes a single primary action (no duplicate choices).
3. Visual update:
   - Dedicated `service-export-button` palette distinct from generic primary buttons.
   - Keep disabled state behavior unchanged.

## Files To Modify
- `docs/designs/prototypes/assets/prototype.js`
  - Remove per-file export constants/actions.
  - Render one export button.
  - Simplify `triggerServiceExport` to single mode.
- `docs/designs/prototypes/assets/prototype.css`
  - Tune `service-export-button` color/hover/disabled style.
- `src/sidebarProvider.ts`
  - Remove `MSG_EXPORT_DEFAULT_ENV` and `MSG_EXPORT_PNPM_LOCK`.
  - Keep single handler path for `MSG_EXPORT_SERVICE_ARTIFACTS`.
- `e2e/tests/region-selector.e2e.spec.ts`
  - Replace old heading/button assertions with new single-button assertion.
- `package.json`
  - Bump patch version after all checks pass.

## Step-by-Step
1. Update prototype `Apps` tab markup and action handler to one export button.
2. Update extension message dispatcher to single export entrypoint.
3. Update heading text and button label in shared webview UI.
4. Apply color improvements in prototype CSS.
5. Update E2E tests to assert:
   - new heading text
   - one export button visible/disabled state
   - removed old buttons are absent.
6. Run validations:
   - `npm run lint`
   - `npm run typecheck`
   - `npm run cspell`
   - `npm run test:unit`
   - `npm --prefix e2e run validate`
   - `npm --prefix e2e test`
7. Use Playwright MCP to open prototype and verify visuals + action layout.
8. Bump `package.json` patch version.
9. Commit and push.

## Risks & Mitigations
- Risk: stale references to removed message types break compile.
  - Mitigation: grep for removed constants and run strict typecheck.
- Risk: E2E flakes due to text rename timing.
  - Mitigation: use role-based assertions with updated exact names and existing waits.
- Risk: button color low contrast in dark theme.
  - Mitigation: add theme-specific override for dark/high-contrast selectors.

## Definition of Done
- `Apps` tab shows one export action only.
- No per-file export buttons/messages remain in extension/prototype code.
- Updated title/copy and improved button color are visible in prototype and extension webview.
- All validation and E2E checks pass.
- Version is bumped, changes committed, and pushed.
