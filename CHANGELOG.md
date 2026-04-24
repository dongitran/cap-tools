# Changelog

## 0.7.3-pre.0 (pre-release)
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
