# Implementation Plan — CFLogs Readability Upgrade With Safe Raw Fallback

## Objectives
1. Make CFLogs easier to scan for HTTP traffic by adding concise router-focused columns.
2. Keep existing `Message` data available but hidden by default for deep debugging.
3. Guarantee no log loss: if beautification/parsing is not possible, row still renders from raw log text.
4. Preserve existing stream/filter behavior and avoid regressions.

## Research Summary
1. Current table is centered on a wide `Message` column (`time/level/logger/message` default), so Gorouter access logs become hard to read.
2. Parser already classifies RTR rows by status code but does not extract request/status/latency fields.
3. Cloud Foundry docs define Gorouter access log shape as:
   `<host> - [<date>] "<METHOD> <URL> <HTTP>" <status> ... response_time:<seconds> ...` plus optional extra fields.
4. Existing logic already has safe fallback rows for unparsable lines; this behavior must be preserved and strengthened.

## Brainstorm Rounds (Selected Direction)
1. Round 1 (rejected): Keep current columns and only shorten `Message` text.
   - Too little improvement; still mixes signal and metadata.
2. Round 2 (partially accepted): Add a compact `Request` summary column while keeping `Message` visible by default.
   - Better, but still noisy in default view.
3. Round 3 (selected):
   - Add `Request`, `Status`, `Latency` columns.
   - Hide `Message` by default but keep it toggleable in settings.
   - For non-RTR or parse-failure rows, `Request` falls back to original message text.
   - Result: readable defaults + zero data loss.

## Non-Negotiable Safety Rules
1. Never drop a log row because parser cannot beautify it.
2. Never throw from parser/render path for malformed lines; use guarded parsing and fallback values.
3. Keep full raw message in row model and in `Message` column when enabled.
4. Do not change fetch/stream transport behavior (only client-side presentation + safe parsing helpers).

## Files In Scope
1. Prototype/UI first:
   - `docs/designs/prototypes/assets/cf-logs-panel.js`
   - `docs/designs/prototypes/assets/cf-logs-panel.css`
   - `docs/designs/prototypes/variants/cf-logs-panel.html`
2. Extension host defaults:
   - `src/cfLogsPanel.ts`
3. E2E regression coverage:
   - `e2e/tests/cf-logs-panel.e2e.spec.ts`
4. Release metadata (if extension behavior changes):
   - `package.json`

## Execution Plan

### Step 1 — Prototype-first UI/UX update
1. Add new column definitions (`request`, `status`, `latency`) in prototype script.
2. Keep `message` column optional and default hidden.
3. Extend row parsing model:
   - Extract request line + status + response_time for RTR messages.
   - Map `response_time` seconds → readable latency text (ms/s).
   - Fallback to raw message when parsing fails.
4. Adjust table rendering and CSS widths for new compact columns.
5. Update prototype cache-busting query string in variant HTML if needed.

### Step 2 — Verify prototype with MCP Playwright
1. Start prototype server on `http://127.0.0.1:4173/index.html`.
2. Validate:
   - Default header no longer shows `Message`.
   - New columns render and remain readable at common widths.
   - Enabling `Message` from settings still shows raw full text.
   - Malformed/non-RTR lines still appear (fallback request text).
3. Capture evidence via snapshot/screenshot for UI verification.

### Step 3 — TDD for extension behavior (tests first)
1. Update/add E2E tests to assert new default columns and fallback behavior.
2. Run targeted E2E spec to confirm failure before host-default updates.
3. Ensure test titles describe behavior clearly (no `bug` wording).

### Step 4 — Implement extension host default settings
1. Update `src/cfLogsPanel.ts` column constants to include new IDs.
2. Set default visible columns to the new readable set with `Message` hidden.
3. Keep required columns minimal and safe (time remains required).

### Step 5 — Full verification loop
1. Run root validation:
   - `npm run validate:root` (typecheck, lint, cspell, unit tests)
2. Run e2e validation:
   - `npm --prefix e2e run validate`
   - `npm --prefix e2e test`
3. If any check fails, analyze logs, fix root cause, rerun all required checks.

### Step 6 — Versioning, commit, push, post-review
1. Bump patch version in `package.json` (extension behavior changed).
2. Commit with a clear message.
3. Push branch without bypassing hooks.
4. Perform final diff review for regressions/security/data-loss risks; fix and repeat validation if needed.

## Done Criteria
1. Default CFLogs view is significantly easier to scan for HTTP traffic.
2. `Message` is available but off by default.
3. No parsed/unparsed line is silently lost due to beautification logic.
4. All required validations pass.
5. Version bump + commit + push completed.
