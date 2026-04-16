# Implementation Plan — SAP Tools: Workspace UI/UX + Mapping Persistence + Searchability

## 1) Objective
1. Align Apps tab action button sizing so **Export SQLTools Config** has the same visual height as **Export Artifacts**.
2. Fix persisted mapping hydration so, after VS Code window reload with previously confirmed scope and cached root folder, service rows remain correctly mapped without forcing **Select Root Folder** again.
3. Align typography so **Active Apps Log** heading size matches **Apps Log Control** heading size.
4. Add fast search inputs to:
   - **Apps Log Control** (service list in Logs tab)
   - **Export Service Artifacts** (service mapping list in Apps tab)
5. Change service mapping path truncation behavior to prioritize tail visibility (ellipsis at the beginning) when width is constrained.

## 2) Full Context Researched
1. Main extension runtime/UI bridge:
   - `src/sidebarProvider.ts` handles restore flow, scope hydration, root-folder cache restore, mapping scan trigger, and postMessage events.
   - `docs/designs/prototypes/assets/prototype.js` renders entire sidebar webview UI (selection/workspace/settings, logs/apps tabs).
   - `docs/designs/prototypes/assets/prototype.css` controls all sidebar styles (buttons, headings, service map rows).
2. Mapping persistence flow traced end-to-end:
   - Root folder cache persisted via `CacheStore.setExportRootFolder(email, regionCode, orgGuid, rootFolderPath)`.
   - Restored during org selection in `restoreRootFolderForCurrentOrg`.
   - Mapping scan performed via `refreshServiceFolderMappings` in extension and consumed by webview through `sapTools.serviceFolderMappingsLoaded`.
3. Existing e2e coverage reviewed:
   - `e2e/tests/region-selector-ui.e2e.spec.ts` already verifies Apps tab export controls and some mapping workflows.
   - No test currently guarantees mapped-state restoration after extension host relaunch with cached root folder.
   - No test currently verifies new search inputs in Apps Log Control + Export Service Artifacts.
4. Existing prototype behavior reviewed:
   - Logs tab already has generic log search input (`data-role="log-search"`) for log lines, but not service-catalog search in Apps Log Control.
   - Apps tab currently has no dedicated mapping search input.
   - Service path column currently uses end truncation (`text-overflow: ellipsis`).

## 3) Files In Scope
1. `implementation_plan.md`
2. `docs/designs/prototypes/assets/prototype.js`
3. `docs/designs/prototypes/assets/prototype.css`
4. `e2e/tests/region-selector-ui.e2e.spec.ts`
5. `src/sidebarProvider.ts`
6. `package.json` (version bump after all checks pass)
7. `CHANGELOG.md` (if needed to reflect release semantics)

## 4) Mandatory Order (per AGENTS.md)
1. Update prototype files first.
2. Verify prototype via MCP Playwright.
3. Then execute TDD for extension/runtime changes.
4. Implement extension code changes.
5. Re-run all required validations.
6. Bump extension version only after validations pass.

## 5) Detailed Design

### A. UI/UX updates (prototype + extension-rendered webview assets)
1. Button-height parity:
   - Ensure `.service-export-sqltools-button` and `.service-export-button` share identical min-height/padding/line-height tokens.
2. Heading typography parity:
   - Align `.active-apps-log h3` typography scale with Logs section primary heading style used for **Apps Log Control**.
3. Apps Log Control search:
   - Add controlled state for app catalog search term.
   - Add input in Logs tab UI.
   - Filter `renderAppLogCatalogMarkup` list by app name substring (case-insensitive) while preserving selected/active state behaviors.
4. Export Service Artifacts search:
   - Add controlled state for mapping search term.
   - Add input in Apps tab UI above mapping list.
   - Filter rows from `resolveServiceExportRows` + `serviceFolderMappings` using app name and folder path text.
5. Path truncation from front (left ellipsis style):
   - Replace standard right-ellipsis behavior for `.service-map-path` with directionality/layout approach that preserves right-side path segments.
   - Keep readable tooltip/title for full path.

### B. Mapping persistence after reload
1. Strengthen restored-scope hydration sequence in `src/sidebarProvider.ts` to guarantee scan trigger after root-folder restore and app catalog readiness.
2. Eliminate race where stale/early mapping clear events can overwrite restored mapping state.
3. Ensure restored root path and mapping state are posted deterministically after reload using existing cache scope (email + regionCode + orgGuid).
4. Preserve current error safety (missing path cleanup, request-id stale guard, secure error messaging).

## 6) TDD Plan
1. Add/extend e2e tests first (before extension code edits):
   - `User can restore mapped services automatically after reopening with cached root folder`
   - `User can search services in Apps Log Control`
   - `User can search services in Export Service Artifacts`
   - `User sees front-truncated folder path in service mapping list`
   - `User sees matching height between Export Artifacts and Export SQLTools Config`
   - `User sees matching heading font size between Active Apps Log and Apps Log Control`
2. Run targeted e2e to confirm failing behavior before fix.
3. Implement code changes.
4. Re-run targeted e2e and then full e2e.

## 7) Prototype Verification (MCP Playwright)
1. Start prototype server:
   - `python3 -m http.server 4173 --bind 0.0.0.0 --directory docs/designs/prototypes`
2. Validate in browser automation:
   - Logs tab service search behavior.
   - Apps tab mapping search behavior.
   - Button/heading visual parity.
   - Front-side truncation behavior under constrained width.
3. Capture screenshots for confirmation.

## 8) Required Validation Checklist
1. Root:
   - `npm run typecheck`
   - `npm run lint`
   - `npm run cspell`
   - `npm run test:unit`
   - `npm run validate:root`
2. E2E:
   - `npm --prefix e2e run typecheck`
   - `npm --prefix e2e run lint`
   - `npm --prefix e2e run cspell`
   - `npm --prefix e2e run validate`
   - `npm --prefix e2e test`
3. If any step fails:
   - analyze exact failure,
   - fix root cause,
   - rerun failed step,
   - rerun full required validations.

## 9) Versioning and Delivery
1. After all checks pass, bump extension version in `package.json` (patch bump).
2. Research and use VS Code extension **pre-release** publishing flow so users on stable release channel do not auto-upgrade to pre-release unless they opt in.
3. Commit changes with valid hooks (no bypass flags).
4. Push and publish pre-release build command path (subject to repository permissions/auth availability).

## 10) Done Criteria
1. All five requested UI/runtime issues are fixed in prototype and extension behavior.
2. New/updated tests cover restored mapping + search + visual parity + truncation behavior.
3. Required validations pass fully.
4. Version bumped and pre-release delivery guidance/steps executed or clearly reported with blocker details.
