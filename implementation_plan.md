# Implementation Plan — CF Service Artifact Export (default-env + pnpm-lock)

## Objective
Add a new SAP Tools feature that lets users:
1. Select a local root folder (group folder).
2. Auto-scan and map Cloud Foundry app names to local service folders.
3. Select one mapped service.
4. Export `default-env.json` and `pnpm-lock.yaml` into that local service folder.

This follows user-required sequence:
1. Prototype first.
2. Validate prototype with MCP Playwright.
3. Implement extension feature.
4. Add/update tests and run full quality gates.
5. Commit/push and create dedicated feature branch.

## Context Verified
- Project 14 current architecture:
  - Sidebar webview: `src/sidebarProvider.ts` + `docs/designs/prototypes/assets/prototype.js`.
  - CF logs panel: `src/cfLogsPanel.ts`.
  - CF integration: `src/cfClient.ts`.
  - Space apps currently loaded from CF CLI and passed to webview.
- Project 13 reusable pattern confirmed:
  - Recursive folder scan by repo name with `package.json` guard.
  - Service-folder name candidates from app name (`-` and `_` variants).
  - Group folder selection through VS Code `showOpenDialog`.

## Scope
### In scope
- Prototype UX for service export flow.
- New webview actions/messages for folder selection, mapping, export.
- Extension host logic for:
  - folder selection
  - app-folder scanning/matching
  - export `default-env.json`
  - export `pnpm-lock.yaml`
- Unit tests + E2E updates.

### Out of scope
- Running `cf login` command redesign (reuse existing auth/session flow).
- Refactor of unrelated tabs/features.

## High-Level Design
### 1) UI/UX (Prototype + actual extension webview)
- Reuse `Apps` tab as “Service Artifact Export” workspace.
- Components:
  - `Select Root Folder` button + selected folder path display.
  - Mapping table: app name, match status, matched folder path.
  - Service selection (single-select).
  - Action buttons:
    - `Export default-env.json`
    - `Export pnpm-lock.yaml`
    - `Export Both`
  - Inline status area (success/error/progress).
- Behavior:
  - After root folder selected, auto-scan and map current space apps.
  - Export buttons enabled only when one mapped service is selected.

### 2) Extension message contract
- New inbound messages (webview -> extension):
  - `sapTools.selectLocalRootFolder`
  - `sapTools.refreshServiceFolderMappings`
  - `sapTools.exportDefaultEnv`
  - `sapTools.exportPnpmLock`
  - `sapTools.exportServiceArtifacts`
- New outbound messages (extension -> webview):
  - `sapTools.localRootFolderUpdated`
  - `sapTools.serviceFolderMappingsLoaded`
  - `sapTools.serviceFolderMappingsError`
  - `sapTools.exportArtifactResult`
  - `sapTools.exportArtifactProgress`

### 3) Folder scanning & mapping
- Add dedicated module (project 14) based on project 13 pattern:
  - recursive directory scan with depth limit
  - `package.json` check
  - candidate mapping for app name: exact + underscore variant
- Optimize by scanning once and indexing basenames.

### 4) Artifact export strategy
- `default-env.json`:
  - Build from CF app environment (machine-readable API/CLI output).
  - Write pretty JSON to selected mapped local folder.
- `pnpm-lock.yaml`:
  - Retrieve from running app context using CF CLI command path.
  - Validate non-empty content before writing.
- Both exports must use existing targeted CF session/cf home context from current scope.

### 5) State handling
- Track in `RegionSidebarProvider`:
  - current apps list for selected scope
  - selected local root folder
  - latest mapping results
  - export-in-progress guard
- Clear mapping state when scope changes.

## Files To Modify
### Prototype/UI
- `docs/designs/prototypes/assets/prototype.js`
- `docs/designs/prototypes/assets/prototype.css`
- (if needed) `docs/designs/prototypes/assets/design-catalog.js`

### Extension host + backend
- `src/sidebarProvider.ts`
- `src/cfClient.ts`
- New module(s):
  - `src/folderScan.ts` (or equivalent)
  - `src/serviceArtifactExport.ts` (or equivalent)

### Tests
- `src/cfClient.test.ts`
- new/updated unit tests for scanning/export helpers
- `e2e/tests/region-selector.e2e.spec.ts`

### Metadata
- `package.json` (version bump only after all checks pass)
- `CHANGELOG.md` (if release notes are maintained in repo flow)

## Step-by-Step Execution Plan
1. Implement prototype UI flow in `prototype.js/.css`.
2. Validate prototype locally using MCP Playwright and fix UX issues.
3. Add extension message types + state wiring in `sidebarProvider.ts`.
4. Implement folder scan module and integrate with selected scope apps.
5. Implement CF artifact export functions in backend client/service layer.
6. Wire export actions to UI status updates and success/error reporting.
7. Add/adjust unit tests for:
   - folder matching logic
   - export pipeline behavior
   - failure handling
8. Update E2E:
   - verify mapping UI appears in `Apps` tab
   - verify select folder + mapping rendering
   - verify export action button state transitions
9. Run full validation:
   - `npm run typecheck`
   - `npm run lint`
   - `npm run cspell`
   - `npm run test:unit`
   - `npm --prefix e2e run validate`
   - `npm --prefix e2e test`
10. If all pass:
   - bump version in `package.json`
   - commit with clear message
   - push
   - create/push feature branch for this capability.

## Risks and Mitigations
- CF CLI output/permissions differences:
  - Mitigation: strict error handling + user-visible actionable messages.
- Large/slow folder trees:
  - Mitigation: scan depth cap + directory skip list.
- Race conditions when scope changes while exporting:
  - Mitigation: request token guard + export lock.
- Webview full rerender regressions:
  - Mitigation: preserve existing slot rerender strategy and add targeted updates.

## Definition of Done
- User can complete full flow:
  - select area/region/org/space
  - open `Apps` tab
  - choose local root folder
  - see mapped services
  - select service
  - export `default-env.json` and `pnpm-lock.yaml`
- No regression in logs flow.
- All quality gates and e2e pass.
- Version bumped and code committed/pushed on dedicated feature branch.
