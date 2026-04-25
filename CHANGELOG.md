# Changelog

## 0.7.11 (pre-release)
- Added readable SQL table display names for compact SAP/HANA identifiers, using `wordsninja` for segmentation and `change-case` for PascalCase formatting while preserving raw table names for SQL execution.
- Updated the SQL Tables search to match readable display fragments such as `AddressSection` as well as raw table identifiers.
- Vendored `wordsninja` and `change-case` into the packaged extension so `vsce --no-dependencies` builds remain self-contained.
- Added unit and e2e coverage for readable table names, raw identifier preservation, long-name truncation, and quick SELECT behavior.

## 0.7.10 (pre-release)
- Hid SQL table `Select` buttons by default so table names stay visually quiet; the action now appears on row hover or keyboard focus.
- Removed the post-open `SQL file opened for app...` status line from the SQL workbench while keeping error and quick SELECT statuses visible.
- Updated SQL e2e coverage to verify the hover-only table action and the hidden open-success status.

## 0.7.9 (pre-release)
- Improved the SQL Tables panel UX with middle-truncated HANA/CDS table names, preserving both the app/schema prefix and the business suffix while keeping full names available through metadata and accessible labels.
- Fixed the Tables search input losing focus after the first typed character by updating only the table count/list during filtering instead of re-rendering the full SQL workspace.
- Centered the table-loading state with a spinner inside the bounded Tables panel and added deterministic e2e coverage for the loading state.
- Increased table-name vertical padding to improve scanability without breaking the compact 100+ table layout.

## 0.7.8 (pre-release)
- Matched the extension SQL tab to the prototype: the app workbench and Tables panel now render from the initial SQL view and share the remaining height in a bounded 50/50 split.
- Added a Tables search input with the same inline search styling as Logs, compact table rows, and leading truncation for long HANA/CDS table names while preserving full names in titles and accessibility labels.
- Fixed HANA table discovery to query the resolved binding schema instead of relying on `CURRENT_SCHEMA`, with output-channel logging for SQL editor open, table discovery, quick SELECT, and manual SQL execution.
- Expanded SQL test-mode data and E2E coverage for large app lists, 104-table schemas, long table names, hidden/empty/error states, table search, and quick SELECT.

## 0.7.7 (pre-release)
- Split the S/4HANA SQL Workbench tab into an upper app picker and a lower tables panel that lists the selected app's HANA tables, each with a dedicated `Select` button that runs `SELECT * FROM <schema>.<table> LIMIT 10` and opens the result panel.
- Replaced the legacy `ORDER_ID` / `STATUS` / `CREATED_AT` / `AMOUNT` demo preview in the SQL tab so the workbench only renders real apps and real table names supplied by the extension.
- Compacted the SQL result panel for status and error outcomes by collapsing the `App:` and `Executed:` lines into a single ellipsis-truncated line and reducing the page padding to 6px.
- Wired new sidebar messages (`hanaTablesLoaded`, `runHanaTableSelect`, `hanaTableSelectResult`) and an idempotent per-app workbench context map so quick selects reuse the already-resolved HANA connection.
- Extended the SQL workbench unit tests with `quoteHanaIdentifier`, `buildQuickTableSelectSql`, and result HTML layout assertions, and added two e2e tests covering the tables panel quick SELECT and the single-line meta header.

## 0.7.6 (pre-release)
- Fixed `Cannot find module 'safer-buffer'` at runtime by walking the full `hdb` dependency tree and copying every transitive package (including `iconv-lite`, `safer-buffer`, and the optional `lz4-wasm-nodejs`) into `dist/vendor/hdb/node_modules/` during build.
- Added a build-time smoke test in `scripts/vendor-hdb.mjs` that spawns Node to `require` the vendored `hdb` entry and assert `createClient` resolves, so any future missing transitive dependency fails the build instead of shipping broken to users.

## 0.7.5 (pre-release)
- Replaced the `hdbsql` CLI executor with the SAP-maintained `hdb` Node.js driver so HANA SQL no longer requires installing the SAP HANA Client locally.
- Vendored the `hdb` and `iconv-lite` packages into `dist/vendor/hdb` so the `--no-dependencies` packaged extension keeps a self-contained driver.
- Connections now default to TLS (`encrypt`, `sslValidateCertificate`) which matches BTP HANA Cloud requirements out of the box.
- Removed the `sapTools.hanaSqlClientPath` setting, the install-guidance card, the `Download SAP HANA Client` notification, and the `hdbsqlDiscovery` module along with their tests.
- Extended the SQL service tests to cover the new client lifecycle: column-metadata mapping, row-key fallback, affected-row status messaging, auth/connection/SQL/timeout error classification, and statement cleanup on failure.
- Added an e2e regression that asserts the SQL result webview no longer surfaces any legacy `hdbsql` / `hdbclient` / `hanaSqlClientPath` strings.

## 0.7.4 (pre-release)
- Detected the SAP HANA Client automatically when `hdbsql` was missing from `PATH` by probing the default install locations on macOS, Linux, and Windows.
- Added the `sapTools.hanaSqlClientPath` VS Code setting so users could pin an explicit absolute path to `hdbsql` when the client lived outside of the standard locations.
- Rendered a dedicated install-guidance card in the SQL result webview when the HANA Client was missing, including the searched paths, the download link, and the setting to configure a custom path.
- Surfaced actionable buttons (`Download SAP HANA Client`, `Configure hdbsql Path`) on the error notification shown after an hdbsql-missing failure.
- Extracted the SQL workbench pure helpers into a dedicated support module and expanded unit coverage across the template, result HTML branches (resultset, status, generic error, hdbsql-missing), HTML escaping, table/keyword filtering, and hdbsql path resolution.

## 0.7.3 (pre-release)
- Reworked SQL tab flow to app-first workbench behavior: click one app to open its dedicated `.sql` editor immediately.
- Added `SAP Tools: Run HANA SQL` command with SQLTools-like keybinding chord (`Cmd/Ctrl+E`, `Cmd/Ctrl+E`) and document-bound execution context.
- Added HANA SQL execution pipeline with single-statement guard, mutating-statement confirmation, connection resolution from CF app env, and table name suggestions.
- Redesigned SQL result webview to table-first UX for query runs, opening a fresh result tab per execution.
- Expanded unit and e2e coverage for SQL workbench flow, command invocation reliability, and result rendering.

## 0.7.2 (pre-release)
- Renamed the 4th workspace tab from `Settings` to `SQL` and turned its placeholder into an interactive SQL integration hub with a three-step explainer and two actions (`Go to Apps tab` and `Open SQLTools in VS Code`).
- Added a new `sapTools.openSqlToolsExtension` webview → extension message and handler that activates the `mtxr.sqltools` extension and opens its activity bar, with a Marketplace fallback when SQLTools is not installed or the command is unavailable.
- Kept the header gear icon and Settings screen labeled `Settings` because they still manage Cache Sync Interval, Sync Status, and Logout.
- Synced e2e expectations to the new tab label and fixed an indentation regression in the region-selector layout test.

## 0.7.1 (pre-release)
- Packaged the `@saptools/cf-debugger` runtime inside the extension so Debug works from the installed `.vsix` without relying on an external `node_modules` tree.
- Added loader coverage that prefers the vendored debugger runtime in packaged builds and falls back to the npm package only in local development.
- Tightened Debug tab e2e assertions around hidden status/error elements and responsive port visibility in narrow sidebars.
- Updated the `index.html` prototype so the Debug layout matches the extension more closely on narrow widths and no longer shows a prototype-only success note for per-app start or stop actions.

## 0.7.0 (pre-release)
- Replaced the placeholder `Targets` workspace tab with a `Debug` tab that lists every started Cloud Foundry app in the confirmed scope.
- Integrated `@saptools/cf-debugger` to open an SSH tunnel to a CF app's Node inspector and attach the VS Code Node debugger automatically.
- Added per-app `Start` / `Stop` controls plus a workspace-wide `Stop all` action and a search input for the Debug tab.
- Surfaced live status transitions (`Starting`, `Tunneling`, `Ready`, `Attached`, `Tunnel closed`, `Error`) and the forwarded local port for each session.
- Added `SAP_TOOLS_TEST_MODE=1` debug runner and debug API fakes so the e2e suite can exercise the full Debug tab flow without real CF infrastructure.
- New unit and e2e coverage for debugger lifecycle, status transitions, error and stop paths, and app search filtering.

## 0.4.0
- Promoted 0.3.0 workspace mapping/search improvements to stable release.

## 0.3.0
- Matched `Export SQLTools Config` button height with `Export Artifacts`.
- Hardened restored workspace flow to rescan service-folder mappings when root folder and apps are restored after reload.
- Matched `Active Apps Log` heading size with `Apps Log Control`.
- Added service search inputs in Logs tab (`Apps Log Control`) and Apps tab (`Export Service Artifacts`) with inline search icons.
- Updated service mapping path column to keep path tail visible under constrained width (front-side truncation).
- Expanded E2E coverage for restored mapping persistence, new search behavior, and UI consistency checks.

## 0.1.0
- Initial project bootstrap with strict quality gates.
