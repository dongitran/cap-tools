# Implementation Plan — Region Access Cache + Background Sync + Settings

## 1) Scope and goals
- Build a production-ready cache system for SAP Tools extension:
1. Cache accessible regions for current SAP account.
2. Cache orgs per region.
3. Cache spaces per org.
4. Cache running apps per space.
- Run sync in background automatically (on extension activation and by interval).
- Update sidebar UX so inaccessible area/region are disabled and sorted to bottom.
- Add top-right gear button in region UI to open Settings page.
- Add Settings options for sync interval: `12h`, `1 day (default)`, `2 days`, `4 days`.
- Preserve per-user cache across logout/login cycles (user A/B scenario).

## 2) Current architecture findings
- Extension host flow is in `src/sidebarProvider.ts` + `src/cfLogsPanel.ts`.
- Region webview UI is driven by `docs/designs/prototypes/assets/prototype.js` + `prototype.css`.
- CF API + CLI helpers are in `src/cfClient.ts`.
- Credentials are in `src/credentialStore.ts` (env first, then secure storage).
- E2E tests are in `e2e/tests/region-selector.e2e.spec.ts`.

## 3) Implementation design

### 3.1 New backend modules
- `src/cacheStore.ts`
1. Persist cache model in `context.globalState`.
2. Keep data per normalized user email.
3. Store sync interval setting and sync status timestamps.

- `src/cacheSyncService.ts`
1. Sequentially process all regions.
2. For each region:
   - CF login discovery (`fetchCfLoginInfo` + `cfLogin`)
   - fetch orgs
   - fetch spaces per org
   - fetch started apps per space via CF CLI
3. Produce access map + full nested cache.
4. Expose `startSyncNow`, `scheduleNext`, `updateInterval`.

- `src/cacheModels.ts`
1. Shared strict types for cache payload and sync status.
2. Region access states: `unknown | accessible | inaccessible | error`.

### 3.2 Sidebar provider integration
- Update `src/sidebarProvider.ts` to:
1. Initialize cache service with effective credentials (if available).
2. Push cache state updates to webview.
3. Use cached orgs/spaces/apps immediately on selection if available.
4. Fall back to live CF fetch when cache node is missing.
5. Handle new webview messages:
   - `sapTools.openSettings`
   - `sapTools.closeSettings`
   - `sapTools.updateSyncInterval`
   - `sapTools.syncNow`
   - `sapTools.logout`
6. On logout:
   - clear secure credentials
   - keep user cache data untouched
   - switch to login gate
7. On login submit:
   - store credentials
   - start/refresh scheduler for that user
   - switch to main view.

### 3.3 Webview protocol additions
- Outbound (extension → webview):
1. `sapTools.cacheState`
2. `sapTools.syncState`
3. `sapTools.authState`

- Inbound (webview → extension):
1. `sapTools.updateSyncInterval`
2. `sapTools.syncNow`
3. `sapTools.logout`

### 3.4 UI updates (`prototype.js` + `prototype.css`)
- Add settings mode and gear action in top-right header.
- Settings screen contains:
1. sync interval segmented options (`12h`, `1 day`, `2 days`, `4 days`)
2. last sync timestamp
3. sync status indicator (`idle`, `running`, `error`)
4. `Sync now` button
5. `Logout` button
6. back button to previous mode

- Area/region rendering behavior:
1. Sort accessible first, then unknown, then inaccessible.
2. Disable inaccessible items (`disabled`, `aria-disabled`).
3. Keep selected item visible in collapsed flow.
4. Inaccessible area (no accessible/unknown region) moved to bottom and disabled.

### 3.5 User cache lifecycle policy
- Cache key: normalized email (`trim().toLowerCase()`).
- User A login:
1. if cache exists, use immediately
2. schedule background sync.
- User A logout: keep cache.
- User B login: use B cache if exists, otherwise sync B.
- User B logout: keep cache.
- User A login again: resume from A cache + schedule next sync.

## 4) File changes (planned)
- Add:
1. `src/cacheModels.ts`
2. `src/cacheStore.ts`
3. `src/cacheSyncService.ts`

- Update:
1. `src/sidebarProvider.ts`
2. `src/extension.ts` (wire service lifecycle if needed)
3. `docs/designs/prototypes/assets/prototype.js`
4. `docs/designs/prototypes/assets/prototype.css`
5. `e2e/tests/region-selector.e2e.spec.ts`
6. unit tests for cache modules and sidebar cache logic
7. `README.md` (behavior docs)
8. `CHANGELOG.md`
9. `package.json` (version bump at final step only)

## 5) Step-by-step execution with mandatory quality gates

### Step A — Add cache domain models + storage
- Implement `cacheModels` + `cacheStore`.
- Add unit tests for serialization, per-user lookup, interval persistence.
- Gate A:
1. `npm run lint`
2. `npm run typecheck`
3. `npm run cspell`
4. `npm run test:unit`

### Step B — Add background sync service
- Implement sequential region/org/space/app sync runner + scheduler.
- Add unit tests with mocked CF client calls.
- Gate B:
1. `npm run lint`
2. `npm run typecheck`
3. `npm run cspell`
4. `npm run test:unit`

### Step C — Integrate sidebar provider
- Wire cache service into login/selection flow.
- Add new message handlers for settings/sync/logout.
- Ensure no secret leakage in logs/messages.
- Gate C:
1. `npm run lint`
2. `npm run typecheck`
3. `npm run cspell`
4. `npm run test:unit`

### Step D — Update prototype UI to match new behavior
- Add gear/settings view + access-disable/sort UX.
- Validate keyboard/focus/ARIA semantics.
- Gate D:
1. `npm run lint`
2. `npm run typecheck`
3. `npm run cspell`

### Step E — E2E expansion and hard validation
- Update/create tests for:
1. settings open/save interval
2. inaccessible region disabled
3. area ordering by access
4. logout/login gate flow
5. cache-based fast list rendering sanity
- Run e2e and fix either code or tests based on root cause.
- Gate E:
1. `npm --prefix e2e run validate`
2. `npm --prefix e2e test`

### Step F — Final polish, release readiness
- Run full validations:
1. `npm run validate`
2. `npm --prefix e2e test`
- Update docs/changelog.
- Bump `package.json` version.
- Final self-review against prototype and runtime behavior.
- Commit and push.
- Watch GitHub Actions and iterate until green.

## 6) Risk handling
- Large org/space trees can make sync long:
1. keep sequential execution (as requested)
2. emit progress state to UI
3. preserve last good cache if current sync partially fails.
- Network/API failures:
1. mark region as `error`/`inaccessible` with safe reason
2. never clear previous successful user cache until full write completes.
- Credentials and privacy:
1. no password in output channel
2. no password in webview messages
3. mask email when displayed in settings if needed.

## 7) Definition of done
- Cache + scheduler implemented and persisted per user.
- Area/region disable + ordering works from cache state.
- Settings screen works with interval update and sync now.
- Logout keeps cache; sign in again restores that user cache.
- All quality gates pass (`lint`, `typecheck`, `cspell`, unit tests, e2e).
- Version bumped, commit pushed, GitHub Actions green.

## 8) Post-implementation hardening plan (review findings)

### H1: Prevent lost updates in cache persistence
- Introduce serialized write queue inside `CacheStore.updateState`.
- Ensure concurrent `setSyncIntervalHours` and `upsertUser` cannot overwrite each other.
- Add/extend unit tests with concurrent write scenario.

### H2: Avoid false-empty app cache snapshots on transient CF CLI errors
- During sync, pass previous cached region/org/space snapshots.
- If app fetch fails for a space:
  - fallback to previous app list for that exact space when available.
  - if no previous app list exists, propagate error so region is marked degraded (not silently empty).

### H3: Eliminate unhandled promise in cache-first region flow
- Wrap background `establishRegionSession(...)` warm-up with `.catch(...)` and output safe diagnostic.

### H4: Remove password from CF CLI process arguments
- Replace `cf auth <email> <password>` with `cf auth` and env variables:
  - `CF_USERNAME`
  - `CF_PASSWORD`
- Keep `CF_HOME` behavior unchanged.

### H5: Fix prototype login fallback navigation consistency
- Update gallery standalone fallback route from deprecated `design-34` path to current `design` path.

### Hardening verification gates
- After each hardening step:
1. `npm run lint`
2. `npm run typecheck`
3. `npm run cspell`
4. `npm run test:unit`
- Final:
1. `npm --prefix e2e run validate`
2. `npm --prefix e2e test`
