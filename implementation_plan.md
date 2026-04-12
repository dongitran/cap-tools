# Implementation Plan — Extension + E2E Hardening

## Scope
- Review all current code changes in this repo.
- Analyze full current source and prototype behavior.
- Commit all current code (local only, no push).
- Run E2E deeply, classify failures (code vs test), fix all.
- Re-check extension UI parity against prototype and improve parity gaps.
- Reference `/Users/dongtran/Documents/brain/01-projects/13-cds-debug` for CF app list parsing/filtering:
  - show only apps in `started` state
  - hide apps with started state but `instances == 0`

## Execution Steps

1. Baseline review and source analysis
- Inspect `git diff` for all modified/untracked code files.
- Read full source in `src/`, `docs/designs/prototypes/assets/`, `e2e/`.
- Identify mismatch risks between:
  - extension message contracts (`src/*`)
  - prototype runtime contracts (`prototype.js`, `login-gate.js`, `cf-logs-panel.js`)
  - E2E expectations.

2. First local commit (checkpoint)
- Stage all relevant current code changes in this repo (exclude transient debug artifacts).
- Run required checks needed by hooks; fix only blocking issues for a clean commit.
- Create commit #1 locally (do not push).

3. E2E verification phase
- Run E2E suite in isolation.
- For every failing case:
  - capture exact failing assertion/log
  - determine if root cause is product code or test expectation drift
  - fix with minimal but correct change.

4. CF apps parsing + filtering implementation (code parity with reference)
- Add/adjust CF app parsing in `src/cfClient.ts`:
  - parse `cf apps` output robustly for both `instances` and `processes` style output.
  - derive app state with an `empty` equivalent when requested state is started but running instances are zero.
- Add extension-side filtering before sending app options to webview:
  - include only apps effectively running (`started` with running instances > 0).
- Wire message flow from extension host to webview for app list updates.

5. UI/UX parity pass (extension vs prototype)
- Compare current extension runtime UI against prototype behavior:
  - login gate flow
  - progressive selection flow
  - workspace/app log control interactions.
- Patch extension/prototype integration gaps to match intended UX.
- Keep CSP-safe event delegation (no inline handlers).

6. E2E updates and final verification
- Update E2E tests only where behavior intentionally changed.
- Re-run:
  - root validation commands
  - E2E suite.
- Ensure no failing tests, lint, typecheck, cspell issues.

7. Final local commit(s)
- If code/test changes were made after checkpoint commit:
  - create commit #2 (and additional atomic commits if needed), local only.
- No push.

## Validation Checklist
- `npm run typecheck`
- `npm run lint`
- `npm run cspell`
- `npm run test:unit`
- `npm --prefix e2e run validate`
- `npm --prefix e2e test`

