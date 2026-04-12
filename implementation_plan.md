# Optimization Plan — SAP Tools CF Logs (Latency + Reliability)

## 1) Goal
- Reduce log latency after `Start App Logging` and improve stream stability.
- Keep UI consistent: CFLogs dropdown shows only active logging apps.
- Preserve strict quality gates and release workflow discipline.

## 2) Current Bottlenecks (already identified)
1. Polling model (`cf logs --recent`) is not true streaming, so latency is bounded by poll interval + CLI execution time.
2. Repeated CLI process spawn still costs time even after session-prep optimization.
3. UI receives periodic snapshots, not incremental log deltas.
4. No persistent stream process per active app yet.

## 3) Target Architecture (Stream-first, fallback-safe)

### 3.1 Stream engine
- Add a dedicated stream manager in extension host:
  - one process per active app: `cf logs <app>`
  - incremental line parsing and batched push to webview
  - per-app state: `starting | streaming | reconnecting | stopped | error`

### 3.2 Scope/session lifecycle
- On scope change:
  - stop all running streams
  - clear active app states
  - prepare CF target once for new scope
- On `activeAppsChanged`:
  - start streams for newly active apps
  - stop streams for removed apps

### 3.3 Fallback strategy
- If stream process crashes:
  - retry with bounded exponential backoff
  - fallback to `--recent` polling mode per app while reconnecting

### 3.4 Webview protocol
- Keep existing messages for compatibility.
- Add delta protocol for better UX:
  - `sapTools.logsAppend` (new lines)
  - `sapTools.logsStreamState` (status per app)
  - optional `sapTools.logsReset` on scope/app switch

## 4) UX/Performance Improvements
- Dropdown in CFLogs panel remains filtered to active apps only.
- Auto-select first active app when none selected.
- In-flight request guard remains (no concurrent duplicate fetch).
- Adaptive refresh (if fallback mode):
  - active visible app: fast interval
  - hidden/inactive: paused

## 5) Security/Robustness Constraints
- Never log secrets (`password`, tokens, auth headers).
- Sanitize streamed lines before forwarding to webview.
- Enforce max payload size per message batch.
- Kill child processes on scope reset, deactivate, and dispose.

## 6) Step-by-Step Execution (with gate after each step)

### Step A — Baseline metrics
- Measure:
  - time from click `Start App Logging` to first visible line
  - update frequency and staleness under app restart scenario
- Gate:
  - `npm run lint`
  - `npm run typecheck`
  - `npm run cspell`

### Step B — Introduce stream manager
- Implement stream lifecycle (start/stop/retry/dispose).
- Wire from `activeAppsChanged`.
- Keep existing polling path as temporary fallback.
- Gate:
  - `npm run lint`
  - `npm run typecheck`
  - `npm run cspell`
  - `npm run test:unit`

### Step C — Webview delta rendering
- Consume append events and update table incrementally.
- Maintain filter/search behavior and selection stability.
- Gate:
  - `npm run lint`
  - `npm run typecheck`
  - `npm run cspell`

### Step D — E2E upgrade
- Add/adjust E2E for:
  - active-app-only dropdown
  - stream starts quickly after `Start App Logging`
  - stream state on stop/scope change
- Gate:
  - `npm --prefix e2e run validate`
  - `npm --prefix e2e test`

### Step E — Full validation + release prep
- Run full pipeline:
  - `npm run validate`
  - `npm --prefix e2e test`
- Fix issues until fully green.
- Bump extension version in `package.json`.
- Commit and push.
- Monitor GitHub Actions and iterate until green.

## 7) Success Criteria
- First log appears quickly after start (target: near-real-time experience).
- No duplicate polling bursts or stale overwrite races.
- Dropdown always matches active app set.
- All gates pass locally and on GitHub Actions.

## 8) Completion Checklist
- [x] lint passed
- [x] typecheck passed
- [x] cspell passed
- [x] unit tests passed
- [x] e2e validate passed
- [x] e2e run passed
- [x] package version bumped
- [ ] commit done
- [ ] push done
- [ ] actions green
