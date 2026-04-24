# Implementation Plan — SAP Tools Debug Packaging Fix + Prototype Parity

## 1. Objective
1. Read the current extension, prototype, and e2e coverage end-to-end for the new Debug feature.
2. Reproduce and fix the runtime failure:
   `Cannot find package '@saptools/cf-debugger' imported from .../dist/cfDebuggerService.js`
3. Update the prototype so the Debug tab matches the actual extension behavior exactly.
4. Strengthen unit/e2e coverage for Debug UI states, packaging/runtime behavior, and any uncovered regressions found during research.
5. Run full validation, bump the extension version, commit, push, and publish as a pre-release only.

## 2. Current Findings From Research
1. `src/cfDebuggerService.ts` dynamically loads `@saptools/cf-debugger` via `import('@saptools/cf-debugger')`.
2. `package.json` publishes with `vsce package --no-dependencies` and `vsce publish --no-dependencies`.
3. The generated `.vsix` currently contains only `dist`, `docs/designs/prototypes/assets`, `resources`, `README.md`, `CHANGELOG.md`, and `package.json`.
4. The packaged `.vsix` does not contain `node_modules/@saptools/cf-debugger`, so the dynamic import cannot resolve on the installed extension host.
5. Local unit/e2e tests do not catch this because:
   - unit tests run against local `node_modules`
   - e2e Debug tests run with `SAP_TOOLS_TEST_MODE=1`, so `CfDebuggerService` uses `buildFakeRunner()` instead of loading the real package
6. The Debug tab prototype already exists, but it must still be verified against current extension behavior and tightened where the real runtime differs.

## 3. Files Researched
1. Runtime and packaging:
   - `package.json`
   - `tsconfig.json`
   - `eslint.config.cjs`
   - `cspell.json`
   - `src/extension.ts`
   - `src/cfDebuggerService.ts`
   - `src/sidebarProvider.ts`
   - `dist/cfDebuggerService.js`
2. Supporting extension modules:
   - `src/credentialStore.ts`
   - `src/cacheStore.ts`
   - `src/cacheSyncRunner.ts`
   - `src/cacheSyncService.ts`
   - `src/cfClient.ts`
   - `src/cfLogsPanel.ts`
   - `src/serviceFolderMapping.ts`
   - `src/serviceArtifactExporter.ts`
   - `src/sqlToolsConfigExporter.ts`
   - `src/regions.ts`
   - `src/testModeData.ts`
3. Unit tests:
   - `src/credentialStore.test.ts`
   - `src/cacheStore.test.ts`
   - `src/cacheSyncService.test.ts`
   - `src/cfClient.test.ts`
   - `src/cfDebuggerService.test.ts`
   - `src/serviceFolderMapping.test.ts`
   - `src/serviceArtifactExporter.test.ts`
   - `src/sqlToolsConfigExporter.test.ts`
   - `src/regions.test.ts`
4. E2E:
   - `e2e/tests/support/sapToolsHarness.ts`
   - `e2e/tests/debug-tab.e2e.spec.ts`
   - `e2e/tests/region-selector-ui.e2e.spec.ts`
   - `e2e/tests/cf-logs-panel.e2e.spec.ts`
   - `e2e/tests/login-gate.e2e.spec.ts`
   - `e2e/src/launchVscode.ts`
   - `e2e/playwright.config.ts`
   - `e2e/package.json`
5. Prototype/design:
   - `docs/designs/prototypes/index.html`
   - `docs/designs/prototypes/variants/design.html`
   - `docs/designs/prototypes/variants/login-gate.html`
   - `docs/designs/prototypes/variants/cf-logs-panel.html`
   - `docs/designs/prototypes/assets/prototype.js`
   - `docs/designs/prototypes/assets/prototype.css`
   - `docs/designs/prototypes/assets/login-gate.js`
   - `docs/designs/prototypes/assets/login-gate.css`
   - `docs/designs/prototypes/assets/cf-logs-panel.js`
   - `docs/designs/prototypes/assets/cf-logs-panel.css`
   - `docs/designs/prototypes/assets/gallery.js`
   - `docs/designs/prototypes/assets/gallery.css`
   - `docs/designs/prototypes/assets/design-catalog.js`

## 4. Scope Of Code Changes
1. `implementation_plan.md`
   - Replace stale plan with this task-specific execution plan.
2. Prototype files in `docs/designs/prototypes/`
   - Align Debug tab layout and states with the real extension before touching extension code.
3. `src/cfDebuggerService.ts`
   - Fix runtime resolution strategy so the debugger runtime exists inside the packaged extension.
   - Add clearer fallback/error handling if the runtime is still unavailable or loaded incorrectly.
4. Packaging metadata
   - `package.json`
   - `package-lock.json`
   - possibly shipped runtime files under `dist/` and/or an included vendor path
   - ensure the package artifact contains everything Debug needs at runtime.
5. Tests
   - `src/cfDebuggerService.test.ts`
   - new or updated packaging/runtime-focused unit tests
   - `e2e/tests/debug-tab.e2e.spec.ts`
   - any harness changes needed to validate all visible and conditional Debug UI elements.
6. Release notes/versioning
   - `CHANGELOG.md`
   - `package.json`
   - `package-lock.json`

## 5. Design Decision To Validate And Then Implement
1. Preferred fix direction:
   - ship the debugger runtime with the extension package instead of expecting the installed extension host to resolve it from a missing external dependency.
2. Candidate implementation options:
   - include a vendored runtime file in the extension package and import it from a relative path
   - or include the dependency folder in the extension package and load it deterministically
3. Decision criteria:
   - must work in packaged `.vsix`
   - must work on remote extension hosts (`.vscode-server`)
   - must not rely on post-install package managers on the user machine
   - must keep Node 20 + VS Code extension runtime compatible
   - should remain testable in unit tests without real CF access
4. Expected chosen approach:
   - vendor the `@saptools/cf-debugger` runtime entry into the extension package because it has no runtime dependency other than Node built-ins for the library entrypoint, which avoids `--no-dependencies` breakage cleanly.

## 6. Mandatory Order
1. Prototype first.
2. Verify prototype with Playwright snapshots and interaction checks.
3. Add/update tests first for the bug and uncovered Debug UI states.
4. Run targeted tests and confirm failing behavior where applicable.
5. Implement extension/runtime/package fix.
6. Re-run targeted tests, then full validation.
7. Bump version and changelog only after the build is green.
8. Commit, push, then publish pre-release.

## 7. Prototype Work
1. Compare the current Debug tab prototype against current extension behavior:
   - tab order and labels
   - empty/loading/error/no-match states
   - badge labels and color variants
   - Start/Stop/Stop all button states
   - forwarded port visibility
   - error code/message rendering
   - narrow-width behavior where meta/port/error code may collapse
2. Update:
   - `docs/designs/prototypes/assets/prototype.js`
   - `docs/designs/prototypes/assets/prototype.css`
   - cache-busting references if required in prototype HTML/gallery files
3. Verify by serving the prototype and checking:
   - desktop layout
   - narrow sidebar width behavior
   - search/filter states
   - start/stop visual transitions

## 8. Test-First Plan
1. Unit tests to add/update first:
   - assert the default runtime loader resolves from the packaged extension path, not a missing external package path
   - assert unavailable runtime surfaces a controlled error state/message instead of an opaque import failure
   - keep existing lifecycle/status/attach/stop tests green
2. E2E tests to add/update first:
   - verify the Debug tab shows all expected visible elements in the normal path
   - verify elements that should be hidden in the normal path remain hidden
   - verify empty/error/search/no-match states explicitly
   - verify Start/Stop/Stop all flows do not leave stale port/message/error UI behind
   - verify tab switch persistence
3. Packaging verification test/check:
   - inspect built `.vsix` contents as part of the workflow and confirm the debugger runtime file is present
   - reproduce the current missing-package failure from the packaged artifact before the fix if possible

## 9. Implementation Steps
1. Prototype parity changes.
2. Playwright validation against the prototype.
3. Add/update failing tests for runtime packaging and Debug UI.
4. Implement runtime loading fix in `src/cfDebuggerService.ts`.
5. Update packaging metadata so the shipped artifact includes the runtime.
6. Rebuild `.vsix` and confirm contents now include the debugger runtime.
7. Re-run unit/e2e validation and inspect logs for suspicious states.
8. Apply any follow-up fixes found during validation.

## 10. Validation Checklist
1. Targeted reproduction checks:
   - build package and inspect `.vsix`
   - reproduce missing-runtime failure from packaged artifact before fix if possible
2. Required project checks:
   - `npm run validate:root`
   - `npm --prefix e2e run validate`
   - `npm --prefix e2e test`
3. Additional checks:
   - `npm run package`
   - inspect `.vsix` file list after the fix
   - prototype verification via local server + Playwright

## 11. Release / Publish Plan
1. Bump to the next pre-release-compatible version within the current odd minor line, unless validation shows a different existing version baseline is required.
2. Update `CHANGELOG.md` with:
   - packaged Debug runtime fix
   - Debug prototype parity update
   - additional tests
3. Commit with hooks enabled.
4. Push to `main`.
5. Publish with the pre-release command path only.
6. Confirm the pre-release strategy against official VS Code docs before publishing so stable users with auto-update are not auto-updated to this test build.

## 12. Done Criteria
1. Packaged extension no longer throws `Cannot find package '@saptools/cf-debugger'`.
2. Debug tab prototype matches the extension behavior.
3. Debug unit/e2e coverage is tighter and passes.
4. Full validation passes.
5. Version bump, commit, push, and pre-release publish are completed or an exact external blocker is documented.
