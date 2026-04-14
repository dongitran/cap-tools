# Implementation Plan — CFLogs Copy Message Action

## 1) Goal
Add a per-row copy action in the CFLogs table so users can copy each log message quickly without losing row selection context.

## 2) Scope
- `docs/designs/prototypes/assets/cf-logs-panel.js`
- `docs/designs/prototypes/assets/cf-logs-panel.css`
- `docs/designs/prototypes/variants/cf-logs-panel.html`
- `docs/designs/prototypes/assets/gallery.js`
- `docs/designs/prototypes/index.html`
- `src/cfLogsPanel.ts`
- `e2e/tests/cf-logs-panel.e2e.spec.ts`

## 3) Delivery Steps
1. Prototype-first UI update in `docs/designs/prototypes`:
   - Render `Copy` button inside each message cell.
   - Keep message wrapping behavior intact.
   - Keep row selection stable when clicking copy.
2. Verify prototype with MCP Playwright:
   - Confirm buttons appear per row.
   - Confirm click transitions button state (`Copying` → `Copied`).
   - Confirm old header text removal remains correct.
3. TDD for extension behavior:
   - Add/update E2E test for copy action and selection stability.
   - Run targeted test and confirm failure before host-side implementation.
4. Implement extension host clipboard bridge:
   - Handle `sapTools.copyLogMessage` in `src/cfLogsPanel.ts`.
   - Call `vscode.env.clipboard.writeText` and return copy result message.
5. Re-run tests and refine until green.

## 4) Verification Gates
- `npm run typecheck`
- `npm run lint`
- `npm run cspell`
- `npm run test:unit`
- `npm --prefix e2e run validate`
- `npm --prefix e2e test -- --grep "copy a log message"`
- `npm --prefix e2e test`
- `npm run validate:root`

## 5) Release Steps
1. Bump patch version in `package.json` if extension code changed.
2. Re-run quick regression after bump:
   - `npm run typecheck`
   - `npm run lint`
   - `npm run test:unit`
3. Commit with clear scope.
4. Push to `main` and monitor GitHub Actions with `gh` until final status is clear.

## 6) Done Criteria
- Each CFLogs row has a working copy action for message content.
- Copy action does not change selected row unexpectedly.
- Prototype and extension behavior are aligned.
- Full validation and e2e suite pass.
