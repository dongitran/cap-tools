# Implementation Plan — Org-Scoped Root Folder Cache for Service Export

## 1) Objective
Implement cache for `Select Root Folder` by org scope so users do not need to pick the folder repeatedly:
- Cache key: `userEmail + regionCode + orgGuid`
- No `workspaceId`
- Keep cache across logout/login
- Do **not** cache `app -> folder` mappings (only root folder path)

Also apply requested UI/UX updates in `Apps` tab:
1. Remove `Refresh Mapping` button.
2. Put root folder display and `Select Root Folder` in one row.
3. `Select Root Folder` button stays on the right side.

## 2) Full-Code Findings (Verified)
After reading the whole project (`src/*`, `docs/designs/prototypes/*`, `e2e/tests/*`):

1. Current root folder state is memory-only:
   - `selectedLocalRootFolderPath` in `src/sidebarProvider.ts`.
   - Lost when extension host reloads.

2. Mapping refresh behavior already supports auto flow:
   - On apps loaded, if root exists, `refreshServiceFolderMappings()` runs automatically.
   - This means removing manual `Refresh Mapping` is feasible.

3. Current UI still depends on manual refresh affordance in prototype/extension webview:
   - `prototype.js` renders `Select Root Folder` + `Refresh Mapping`.
   - `prototype.css` has layout for two controls.

4. Existing cache system (`CacheStore` + `CacheSyncService`) stores user sync data and region/org/space/app tree, but does not store export folder preference.

5. E2E currently validates service export section UI text and button behavior, but has no explicit cache restore scenario for root folder.

## 3) Product Decision (Final)
1. Persist only root folder path per org scope.
2. Do not persist fine-grained mapping results.
3. Remove manual refresh action from UI.
4. Re-scan mappings automatically on:
   - org change (after cached path restore),
   - space/apps loaded,
   - root folder picked/changed.

## 4) Data Model Design
### 4.1 Cache key
- `scopeKey = ${normalizedEmail}::${normalizedRegionCode}::${orgGuid}`

### 4.2 Cache value
- `rootFolderPath: string`
- `updatedAt: string` (ISO)

### 4.3 Persistence location
- Use `globalState` via `CacheStore` (same persistence layer currently used).
- Separate key namespace from sync snapshot to avoid accidental overwrite by sync updates.

## 5) UI/UX Design Changes
### 5.1 Apps tab controls
1. Remove `Refresh Mapping` button entirely.
2. Replace current two-block root section with one horizontal row:
   - Left: root folder value (`Root: <path or Not selected>`)
   - Right: `Select Root Folder` button
3. Keep responsive behavior:
   - On narrow width, row can wrap but button remains visually after root text (still right-aligned when possible).

### 5.2 Interaction behavior
1. When org is selected:
   - Try load cached root folder for that org scope.
   - If found and path exists: auto-apply and auto-trigger mapping scan.
   - If found but path missing: clear cache entry, show soft status.
2. When user picks folder:
   - Save cache for current scope.
   - Trigger mapping scan immediately.
3. No explicit “refresh” click path.

## 6) Technical Change Plan (Granular, Ordered)
Execution order is strict:
1. Prototype first
2. MCP Playwright check prototype
3. Extension implementation
4. E2E update + rerun

## Step A — Prototype update first (UI contract)
Files:
- `docs/designs/prototypes/assets/prototype.js`
- `docs/designs/prototypes/assets/prototype.css`

Changes:
1. Remove `Refresh Mapping` button and handler.
2. Build single-row root section:
   - root display left
   - `Select Root Folder` button right
3. Keep auto-refresh behavior only via:
   - `sapTools.localRootFolderUpdated`
   - apps-loaded lifecycle.

Validation after Step A:
- `npm run lint`
- `npm run typecheck`
- `npm run cspell`

## Step B — Check prototype with MCP Playwright
Targets:
- `docs/designs/prototypes/index.html`

Checks:
1. Navigate to Main Menu variant.
2. Confirm Apps tab has no `Refresh Mapping`.
3. Confirm root path and select button are in same row (visual + DOM structure).
4. Confirm button appears on right side in desktop width.
5. Confirm mobile wrap still usable.

## Step C — Extension implementation
### C1) Cache model + store APIs
Files:
- `src/cacheModels.ts`
- `src/cacheStore.ts`
- `src/cacheStore.test.ts`

Changes:
1. Add export-root-folder cache interfaces/types.
2. Add `CacheStore` APIs:
   - `getExportRootFolder(email, regionCode, orgGuid)`
   - `setExportRootFolder(email, regionCode, orgGuid, rootFolderPath)`
   - `deleteExportRootFolder(email, regionCode, orgGuid)`
3. Add normalization + migration-safe parsing for the new cache state.

Validation after Step A:
- `npm run lint`
- `npm run typecheck`
- `npm run cspell`
- `npm run test:unit`

### C2) Sidebar scope state wiring
Files:
- `src/sidebarProvider.ts`

Changes:
1. Track current org scope explicitly in provider state:
   - current org guid/name for cache lookup.
2. On org selection:
   - Load cached root folder by `(email, regionCode, orgGuid)`.
   - Apply/clear `selectedLocalRootFolderPath` accordingly.
   - Post `sapTools.localRootFolderUpdated` to webview.
3. On `Select Root Folder` success:
   - Persist cache for current scope.
4. Add path existence check before applying cached value.
5. Keep logout behavior: credentials cleared, cache retained.

Validation after Step B:
- `npm run lint`
- `npm run typecheck`
- `npm run cspell`
- `npm run test:unit`

## Step D — Update E2E after extension changes
Files:
- `e2e/tests/region-selector.e2e.spec.ts`

Changes:
1. Update assertions:
   - `Refresh Mapping` not present.
   - `Select Root Folder` present.
   - root row layout expectations (role/text-level, non-flaky).
2. Keep existing export-button state checks valid.

Validation after Step D:
- `npm --prefix e2e run validate`
- `npm --prefix e2e test`

## Step F — Final quality gate and release prep
1. `npm run validate:root`
2. `npm --prefix e2e run validate`
3. `npm --prefix e2e test`
4. Bump `package.json` version (patch).
5. Commit and push.
6. Check Actions (`CI`, `Release`, `Deploy Prototypes`) via `gh`.

## 7) Risks and Mitigations
1. Risk: stale cached path after folder moved/deleted.
   - Mitigation: validate path existence before applying; auto-delete invalid cache entry.

2. Risk: wrong cache scope when org changes quickly.
   - Mitigation: bind cache restore to current request/scope id in sidebar flow.

3. Risk: layout breaks in narrow sidebar.
   - Mitigation: CSS row with responsive wrap and right-aligned button fallback.

4. Risk: Sidebar provider file already large.
   - Mitigation: keep added logic minimal and extract pure helper functions if needed.

## 8) Definition of Done
1. Root folder is restored automatically per `(userEmail, regionCode, orgGuid)`.
2. `Refresh Mapping` button removed from Apps tab.
3. Root display + `Select Root Folder` shown in same row; button on right.
4. Mapping scan still works via automatic triggers.
5. All checks pass: lint/typecheck/cspell/unit/e2e.
6. Version bumped, committed, pushed, actions green.
