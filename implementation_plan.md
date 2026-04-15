# Implementation Plan — CFLogs: Filter CF CLI Infrastructure Noise

## Goals
1. Eliminate CF CLI infrastructure lines from CFLogs table, especially repeated `Failed to retrieve logs from Log Cache: unexpected status code 404`.
2. Keep real app logs intact, including normal RTR access logs.
3. Ensure filtering works for both initial load (`cf logs --recent`) and streaming append (`cf logs <app>`).
4. Validate with prototype + MCP Playwright, then E2E + full quality gates.

## Root-Cause Analysis
1. CF CLI sometimes emits non-app system text (Log Cache fetch failures) into command output.
2. Current parser treats unmatched lines as fallback/continuation rows, so these infra lines can pollute the table.
3. Streaming path and recent-load path both parse text, so both paths must apply the same skip rules.

## Files To Review
- `docs/designs/prototypes/assets/cf-logs-panel.js`
- `src/cfLogsPanel.ts`
- `e2e/tests/cf-logs-panel.e2e.spec.ts`
- `src/cfClient.ts`

## Planned Changes
1. Harden parser skip logic in prototype/runtime parser (`isCfCliSystemMessage`) and apply it consistently in:
- `parseCfRecentLog`
- `appendParsedLinesForApp`
2. Keep RTR access lines visible (these are valid app/platform logs), but suppress CLI system noise prefixes.
3. Ensure test-mode sample includes Log Cache noise so regression is reproducible.
4. Add/update E2E assertion proving infra noise does not appear in table.

## Verification Plan
1. Prototype-first check:
- Start local prototype server.
- Open `index.html` via MCP Playwright.
- Navigate to CFLogs panel and verify no `Failed to retrieve logs from Log Cache` rows appear.
2. Run required checks:
- `npm run validate:root`
- `npm --prefix e2e run validate`
- `npm --prefix e2e test`
3. If extension/runtime code changed, bump patch version in `package.json`.

## Done Criteria
1. CFLogs table no longer displays Log Cache 404 CLI infrastructure lines.
2. RTR request log rows still appear and are classified by HTTP status (info/warn/error).
3. Prototype + E2E confirm behavior.
4. Full validations pass.
