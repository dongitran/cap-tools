# Changelog

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
