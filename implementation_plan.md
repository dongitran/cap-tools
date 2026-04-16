# Implementation Plan — SAP Tools: Export Mapping Restore + Change Region Remap Stability

## 1) Objective
1. Remove transient **Unmapped** flash in `Export Service Artifacts` right after VS Code reload when root folder was already selected previously.
2. Improve perceived load speed by showing previously known mapped services immediately (then refresh in background) instead of waiting several seconds.
3. Fix flow where `Change Region` -> `Confirm Scope` (same scope) leads to all services staying **Unmapped**.
4. Preserve current architecture and avoid broad regressions.
5. Deliver as version `0.5.1` and publish with pre-release channel flow.

## 2) Full Context Researched
1. Extension runtime (`src/sidebarProvider.ts`):
   - Root folder cache restore currently happens in `restoreRootFolderForCurrentOrg`.
   - Mappings are repeatedly reset to `[]` on scope transitions (`handleRegionSelected`, `handleOrgSelected`, `postAppsLoaded`).
   - Mapping scan uses `buildServiceFolderMappings(...)` and can be expensive on large trees.
2. Webview runtime (`docs/designs/prototypes/assets/prototype.js`):
   - `appsLoaded` + `localRootFolderUpdated` call `refreshServiceMappingsAfterAppsLoaded`.
   - `refreshServiceMappingsAfterAppsLoaded` currently clears mappings first (`clearServiceMappingsForScope`), which causes visible unmapped transitions.
   - `change-region` action clears workspace mapping state, but reconfirming same scope does not always trigger fresh scope fetch path, causing stale/unmapped state.
3. Scan performance (`src/serviceFolderMapping.ts`):
   - Full directory walk up to depth 6 with package.json detection; expensive enough to create visible delay.
4. Existing e2e:
   - Has tests for eventual mapped restoration after relaunch.
   - Does not assert “no transient unmapped while refreshing”.
   - Does not assert mapped persistence after `Change Region` -> reconfirm same scope path.

## 3) Files In Scope
1. `implementation_plan.md`
2. `docs/designs/prototypes/assets/prototype.js`
3. `docs/designs/prototypes/variants/design.html` (cache-busting if needed)
4. `docs/designs/prototypes/assets/gallery.js` (cache-busting if needed)
5. `docs/designs/prototypes/index.html` (cache-busting if needed)
6. `src/sidebarProvider.ts`
7. `e2e/tests/region-selector-ui.e2e.spec.ts`
8. `package.json`
9. `package-lock.json`
10. `CHANGELOG.md` (if release notes require update)

## 4) Mandatory Order (per AGENTS.md)
1. Update prototype behavior first.
2. Verify prototype with MCP Playwright + snapshot images.
3. Add/update failing e2e tests first (TDD).
4. Implement extension runtime fix.
5. Re-run targeted e2e, then full required validations.
6. Bump version `0.5.1`, commit, push.
7. Execute pre-release publish flow (or report exact auth blocker).

## 5) Detailed Design

### A. Prototype behavior alignment
1. Adjust `refreshServiceMappingsAfterAppsLoaded` so it does not blindly clear current mappings before refresh request.
2. Keep mapped rows visible while refresh is in progress whenever prior mappings exist.
3. Ensure `confirm-region` path triggers mapping refresh for current scope when root folder + app list are already present (fixes reconfirm path).

### B. Extension runtime fix
1. Preload cached root folder earlier in `handleRequestInitialState` using persisted confirmed scope (email + region + org) so webview receives root path sooner.
2. Add persisted service-mapping snapshot cache per scope in sidebar provider global state:
   - Key dimensions: user + region + org + space + root folder.
   - Payload: normalized `ServiceFolderMapping[]` + timestamp.
3. On `postAppsLoaded`, restore cached mappings immediately when key matches.
4. Still run `refreshServiceFolderMappings` to revalidate in background and overwrite cache with latest scan result.
5. Keep all request-id guards and error handling unchanged; no secret/sensitive payload logging.

### C. Change Region -> Confirm Scope fix
1. Ensure reconfirming same scope forces mapping refresh path even if region/org/space values are unchanged in webview state.
2. Avoid mapping reset that leaves table stuck in unmapped when no new scope events are emitted.

## 6) TDD Plan
1. Add/adjust e2e tests first:
   - `User reopens workspace and keeps mapped services visible while mapping refresh runs`
   - `User can return from Change Region and keep mapped services for same confirmed scope`
2. Run targeted tests and confirm failing state before fix.
3. Implement prototype/runtime changes.
4. Re-run targeted tests to pass.
5. Run full e2e suite and root validations.

## 7) Prototype Verification (MCP Playwright)
1. Serve prototype:
   - `python3 -m http.server 4173 --bind 0.0.0.0 --directory docs/designs/prototypes`
2. Validate via `http://127.0.0.1:4173/index.html`:
   - Reconfirm same scope path does not degrade to unmapped.
   - Mapping list stays stable while refresh happens.
3. Capture before/after screenshots for evidence.

## 8) Required Validation Checklist
1. Root checks:
   - `npm run validate:root`
2. E2E checks:
   - `npm --prefix e2e run validate`
   - `npm --prefix e2e test`
3. If failure occurs:
   - inspect root cause,
   - fix,
   - rerun failed command,
   - rerun full checklist.

## 9) Versioning and Delivery
1. Bump extension version strictly to `0.5.1`.
2. Commit with hooks enabled (no bypass).
3. Push branch `main`.
4. Run pre-release publish flow (`vsce publish --pre-release`) so stable-channel auto update does not pull this build by default.
5. If marketplace auth/token missing, report exact blocker and ready-to-run command.

## 10) Done Criteria
1. No transient unmapped regression on reload for previously mapped scope.
2. `Change Region` reconfirm path preserves/recovers mapped state correctly.
3. New e2e tests cover both behaviors and pass.
4. Full validation checklist passes.
5. Version `0.5.1` committed and pushed; pre-release publish attempted/completed.
