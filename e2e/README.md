# SAP Tools E2E

This Playwright project tests the SAP Tools VS Code extension in an isolated
Extension Development Host.

## Covered Flows

- Login gate rendering, validation, credential submit, logout, and session restore.
- Region selector flows, including area/region/org/space cascade, Quick Org
  Search, Change Region, confirmed-scope restore, stale sync recovery, and app
  catalog empty/error/loading states.
- Workspace tabs for Logs, Apps, and SQL.
- CFLogs panel table, filters, settings, row copy, stream updates, empty/error
  states, scope updates, and responsive layout.
- Apps tab service mapping persistence, root-folder cancel/remap flows, service
  search, artifact export controls, and SQLTools config export enablement.
- S/4HANA SQL Workbench app/table loading, SQL editor execution, quick table
  select, result rendering, copy/export menus, clipboard output, and loading
  states.
- SAP Tools Output channel visibility for topology, scope, and SQL UI action
  logs.

## Run

```bash
npm --prefix e2e run validate
npm --prefix e2e test
npm --prefix e2e test -- tests/sql-workbench.e2e.spec.ts
```

The `test` script builds the extension first through `pretest`.

## VS Code Executable

If auto-detection fails, set:

```bash
export VSCODE_EXECUTABLE_PATH="/Applications/Visual Studio Code.app/Contents/MacOS/Electron"
```

## Test Hygiene

- Prefer `getByRole()`, `getByLabel()`, and `getByTestId()` for user
  interactions.
- Use CSS selectors only for VS Code internals, style/layout measurements, or
  extension-owned state where no semantic locator exists.
- Do not use fixed sleeps. Use web-first assertions, `expect.poll`, or specific
  UI state transitions.
- Every test launches its own extension host and cleans up temp workspace,
  user-data, and extensions directories.
