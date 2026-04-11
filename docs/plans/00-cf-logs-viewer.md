# Plan 00 — Cloud Foundry Logs Viewer (with Credentials Gate)

> **Mục tiêu**: bổ sung tính năng hoàn chỉnh đầu tiên cho extension SAP Tools — **xem log
> của service đang chạy trên SAP Cloud Foundry** — kèm cấu hình `SAP_EMAIL` / `SAP_PASSWORD`
> ngay lần đầu mở. Log JSON được parse, hiển thị dạng table có filter, search, live-stream
> và detail panel với JSON tree.
>
> Plan này tuân thủ thứ tự: **Update prototype → MCP Playwright kiểm tra → Code extension
> → Self code review → E2E test → Run e2e + phân tích → Validate → Version bump → Commit
> & push**.
>
> _Phiên bản plan: v2 (đã rà soát critical, fix 23 gap so với draft v1)_

---

## 0. Hiện trạng (đã đọc full code, prototype, e2e, CI workflows, dist, configs)

### 0.1 Source code (`src/`)

| File | Mục đích thực tế |
|---|---|
| `extension.ts` | Activate function: tạo `OutputChannel "SAP Tools"`, instantiate `RegionSidebarProvider`, register webview view, register command `sapTools.selectSapBtpRegion` |
| `sidebarProvider.ts` | `WebviewViewProvider`. Build HTML có CSP `default-src 'none'` + `script-src 'nonce-<random24>'`. Load thẳng `prototype.js` / `prototype.css` / `themes/design-34.css` từ `docs/designs/prototypes/assets/`. Handler 1 message duy nhất: `sapTools.regionSelected` → log ra OutputChannel |
| `regions.ts` | 25 SAP BTP region cứng, mỗi region có `id`, `displayName`, `area`, `provider` |
| `regions.test.ts` | 2 vitest test: total = 25, đếm theo area |

> ⚠️ **Lưu ý quan trọng**: `regions.ts` chỉ được dùng trong **unit test**, UI chạy thực tế dùng `REGION_GROUPS` định nghĩa trong `docs/designs/prototypes/assets/design-catalog.js`. Hai dataset KHÔNG đồng bộ nhau. Plan này không hợp nhất 2 dataset (out of scope), nhưng sẽ thêm hàm `mapRegionIdToCfApi(regionId)` ở `src/regions.ts` dùng template `https://api.cf.<regionId>.hana.ondemand.com` (mặc định) + override cho region biết là khác.

### 0.2 Dist (`dist/`) — DRIFT WARNING

- `dist/extension.js`, `dist/regions.js`, `dist/sidebarProvider.js` được build từ `tsc -p tsconfig.json` (không phải esbuild — memory cũ ghi sai).
- **`dist/quickPickItems.js`** tồn tại nhưng KHÔNG có `src/quickPickItems.ts` tương ứng → dead file leftover. `tsc` không tự xoá. **Plan này sẽ xoá nó trong commit cuối.**
- **`dist/sidebarProvider.js` lệch với `src/sidebarProvider.ts`**: dist line 91 có `body class="prototype-page saptools-extension"`, src line 98 chỉ có `body class="prototype-page"`. Source mới hơn → dist stale. Phải `npm run build` lại sau khi merge plan.

### 0.3 Prototype (`docs/designs/prototypes/`)

| File | Vai trò |
|---|---|
| `index.html` | Gallery host, iframe vào `variants/design-34.html`, có nav prev/next/theme cycle |
| `variants/design-34.html` | Page minimal: link CSS + theme + script |
| `assets/design-catalog.js` | `REGION_GROUPS` (4 area, 25 region) + `DESIGN_CATALOG` (chỉ giữ 1 design id=34 sau khi cleanup) |
| `assets/prototype.js` | 1237 dòng JS thuần (no TS). State machine chính, render, event delegation. **CHỉ duy nhất 1 message ra ngoài**: `sapTools.regionSelected` |
| `assets/prototype.css` | 1090 dòng. Theme tokens + theme overrides cho `vscode-light` / `vscode-dark` / `vscode-high-contrast` |
| `assets/themes/design-34.css` | 48 dòng override nhỏ cho theme 34 |
| `assets/gallery.js` | Gallery navigation + theme cycler |
| `assets/gallery.css` | Style cho gallery host |

**Hiện trạng state machine prototype.js (`mode === 'selection'`):**

```
SELECTION_STAGE_SLOT_IDS = ['area','region','org','space','confirm']
   ↓ pick area
   ↓ pick region   → vscode.postMessage(sapTools.regionSelected)
   ↓ pick org      (mock data ORG_OPTIONS, không gọi cf)
   ↓ pick space    (mock data từ org.spaces)
   ↓ confirm-region → mode = 'workspace', activeTabId='logs'
```

**Hiện trạng workspace tabs:**
- `logs`: nút Connect CF (mock), Fetch Recent (reset mock), Toggle Live (toggle flag), Clear, Export (mock toast), level chip single-select, search keyword, table 4 cột, single-line detail panel
- `apps` / `targets` / `settings`: placeholder

**Action `data-action` đã có** (đếm từ grep):
- `reset-area-selection`, `reset-region-selection`, `reset-org-selection`, `reset-space-selection`
- `confirm-region`, `change-region`
- `switch-tab`, `connect-cf`, `fetch-recent`, `toggle-live`, `clear-logs`, `export-logs`
- `set-level`, `select-log`

**vscodeApi bridge**: `prototype.js` line 86–87 gọi `acquireVsCodeApi()` (no-op nếu chạy ngoài VS Code).

**LƯU Ý CSP**: từ memory `feedback_csp_inline_handlers.md` — webview CSP cấm inline handler (`oninput`, `onchange`, `onclick`). **Bắt buộc dùng event delegation** trên `appElement` cho mọi component mới.

### 0.4 E2E (`e2e/`)

- Playwright + Electron (`@playwright/test ^1.52`).
- `playwright.config.ts`: `fullyParallel: false, workers: 1, retries: 1, timeout: 180000`. Trace `on-first-retry`, video `retain-on-failure`, screenshot `only-on-failure`.
- `launchVscode.ts`: helper resolve VS Code executable, tạo workspace + user-data temp dir, theme settings injection.
- `region-selector.e2e.spec.ts`: 6 test, chạy 3 theme (dark/light/high-contrast). Cover: area+region pick → output log, theme classes preserved, partial-rerender shell node stability, full flow đến confirm scope, switch về selection.
- `pretest`: `npm --prefix .. run build` — build extension trước khi chạy.

### 0.5 Configuration / quality gates

- `tsconfig.json`: ES2022 + Node16 + **strict + alwaysStrict + noImplicitAny + noUncheckedIndexedAccess + noPropertyAccessFromIndexSignature + exactOptionalPropertyTypes + noImplicitReturns + noFallthroughCasesInSwitch + skipLibCheck:false**. Exclude `e2e/` và `*.test.ts`.
- `eslint.config.cjs`: tseslint **strict-type-checked + stylistic-type-checked** + custom rules:
  - `no-console: error`
  - `@typescript-eslint/explicit-function-return-type: error`
  - `@typescript-eslint/consistent-type-imports`
  - `@typescript-eslint/no-floating-promises: error`
  - `@typescript-eslint/no-misused-promises` (checksVoidReturn.attributes: false)
  - `@typescript-eslint/strict-boolean-expressions` với **mọi allowNullable* = false, allowNumber=false, allowString=false**
- `vitest.config.ts`: env=node, include `src/**/*.test.ts`, `globals: false`.
- `cspell.json`: từ ngữ region + saptools, ignorePaths chuẩn.
- `.husky/pre-commit`: chạy `npm run validate`.
- `package.json` `files`: ship `dist`, `docs/designs/prototypes/assets`, `resources`, `README.md`, `CHANGELOG.md`, `package.json`. **Không ship `docs/designs/prototypes/variants` hay `index.html`** — webview chỉ cần `assets/`.

### 0.6 GitHub workflows (`.github/workflows/`)

| Workflow | Trigger | Việc làm |
|---|---|---|
| `ci.yml` | push main/develop, PR vào main | typecheck/lint/cspell, vitest, build (verify size < 5MB), e2e validate, install VS Code via apt + xvfb-run e2e test, package VSIX dry-run, upload artifact 7 days |
| `release.yml` | push tag `v*.*.*` HOẶC push main filter `paths: ['src/**','resources/**','package.json','package-lock.json','.github/workflows/{ci,release}.yml']` | validate root + e2e + xvfb-run e2e + build → create tag release + publish to VS Marketplace via `VSCE_PAT` |
| `deploy-prototypes.yml` | push main filter `docs/designs/prototypes/**` | upload prototype folder to GitHub Pages |

> ⚠️ **Critical hệ quả**: `release.yml` KHÔNG bị trigger nếu chỉ sửa `docs/`. Nghĩa là một commit chỉ chứa prototype change sẽ ship asset prototype mới qua GitHub Pages nhưng KHÔNG release VSIX. Plan này phải chắc chắn version bump + `src/` changes nằm cùng commit (hoặc cùng tag) để release đúng nhịp.
>
> ⚠️ **Privacy**: `deploy-prototypes.yml` deploy public lên GitHub Pages. **Mọi mock email/password trong seed phải dùng `@example.test` rõ ràng là fake** (RFC 6761).

### 0.7 Memory + feedback đã ghi nhận

- `feedback_csp_inline_handlers.md` — luôn dùng event delegation, CSP block inline handler.
- `project_overview.md` — đã out of date (mô tả CacheManager/ProcessManager/LogsManager — chưa có), sẽ cập nhật sau khi triển khai.

---

## 1. 23 gap đã rà soát so với plan v1 → đã fix trong plan v2 này

| # | Gap | Cách fix |
|---|---|---|
| G1 | Plan v1 chỉ đọc SecretStorage, không kiểm `process.env.SAP_EMAIL` / `SAP_PASSWORD` đúng yêu cầu user | §2.2 thêm credential lookup order: env-var → SecretStorage → prompt |
| G2 | Không cách ly `~/.cf` của user | §2.4 isolate qua `CF_HOME = context.globalStorageUri.fsPath/cf` |
| G3 | Không discovery cf binary cross-platform | §2.4 helper `discoverCfBinary()` xử lý cf, cf.exe, cf.cmd + setting `sapTools.cf.binaryPath` |
| G4 | Không có timeout cho cf command | §2.4 default 30s cho api/auth/orgs/spaces/apps; `cf logs` không timeout |
| G5 | CF CLI v7 fallback chỉ ở risk register | §2.4 detect bằng `cf version`, parse table fallback |
| G6 | Không có VS Code configuration schema | §3.C9 thêm `contributes.configuration` trong `package.json` |
| G7 | Stale `dist/quickPickItems.js` | §4.4 xoá trong commit cuối |
| G8 | Source/dist drift | §4 yêu cầu `npm run build` trước commit + verify diff |
| G9 | `release.yml` paths không cover `docs/` | §5 plan commit strategy: prototype-only commit không bump version, src commit cuối mới bump |
| G10 | Mock email lộ ra GitHub Pages | §3.A3 dùng `@example.test` |
| G11 | Không nhắc bundle size limit | §4.5 confirm < 5MB sau build |
| G12 | Không list ESLint trap | §3.D1 thêm trap list `strict-boolean-expressions` etc |
| G13 | `noUncheckedIndexedAccess` & co | §3.D1 cảnh báo |
| G14 | Type giữa JS prototype và TS extension không sync | §3.C6 strategy: TS định nghĩa, JS dùng JSDoc `@typedef` import qua `// @ts-check` ở top |
| G15 | Unit test plan thin | §3.C5–C9 mỗi module có bullet test cases, target ≥ 30 unit tests |
| G16 | `redactSecrets` không có test | §3.C5 thêm test case riêng |
| G17 | Stub portability | §3.E1 dùng Node script + shebang `#!/usr/bin/env node`, file `cf` không extension trên Linux/Mac, kèm `cf.cmd` shim cho Windows |
| G18 | Sign-in stage không khớp slot system | §2.1 mở rộng `SELECTION_STAGE_SLOT_IDS` thêm `signin`, render-conditional theo `credentialState` |
| G19 | Webview state restoration trên reload | §3.C7 persist + restore qua `context.globalState` |
| G20 | Không enumerate loading skeleton | §2.5 list từng skeleton |
| G21 | Concurrent click handling vague | §3.C2 `RequestQueue` per-slot với AbortController |
| G22 | JSON tree thiếu copy button | §2.6 spec DOM structure + delegated handler |
| G23 | Single mega-commit | §5 split 7 commit nhỏ |

---

## 2. Architecture quyết định (đã rà soát)

### 2.1 State machine mới (extension webview)

```
Selection mode
┌─────────────────────────────────────────────────────────┐
│  area → region → [signin?] → org → space → confirm     │
│                       │                                  │
│         credentialState ∈                                │
│           unknown → checking → missing → submitting     │
│                                       ↓                  │
│                                  valid | error           │
│         (valid bỏ qua signin slot, vào org luôn)         │
└─────────────────────────────────────────────────────────┘
                          ↓ confirm
Workspace mode
┌─────────────────────────────────────────────────────────┐
│  Tabs: [Logs] [Apps] [Targets] [Settings]                │
│  selectedAppId chuyển từ Apps tab sang Logs tab          │
│  logStreamState ∈ idle | recent | live | paused | crashed│
└─────────────────────────────────────────────────────────┘
```

`SELECTION_STAGE_SLOT_IDS` mở rộng thành `['area','region','signin','org','space','confirm']`. Slot `signin` chỉ render khi:
- `credentialState !== 'valid'` AND
- `selectedRegionId.length > 0`

Khi `credentialState === 'valid'`, slot `signin` render markup rỗng `''` (giữ DOM node để partial rerender ổn định).

### 2.2 Credential lookup ORDER (đúng yêu cầu user)

```
on render(signin slot):
  if credentialState === 'unknown':
    post('sapTools.requestCredentialStatus')
    credentialState = 'checking'

extension host xử lý requestCredentialStatus:
  envEmail    = process.env.SAP_EMAIL
  envPassword = process.env.SAP_PASSWORD

  if envEmail && envPassword:
    return { source: 'env', email: envEmail, hasPassword: true }
    // → dùng luôn, KHÔNG ghi vào SecretStorage trừ khi user explicit

  stored = await secretsStore.read()
  if stored:
    return { source: 'secret-storage', email: stored.email, hasPassword: true }

  return { source: 'none' }
```

UI render theo `source`:

| source | Render slot signin |
|---|---|
| `env` | Card "Đã nhận từ shell environment". Button **Use & Continue**. Optional checkbox "Save to keychain for future windows" (default OFF) |
| `secret-storage` | Card "Đang dùng credentials đã lưu cho `<masked email>`". Button **Use & Continue** + link **Edit** + link **Forget** |
| `none` | Form sign-in đầy đủ (email + password + remember + Sign in) |
| (sau khi user nhấn Use/Sign in) | Spinner "Authenticating with SAP BTP…" |
| (lỗi auth) | Card đỏ với error message + retry button |

> ⚠️ **Bảo mật**: response của host **không bao giờ trả password** xuống webview. Webview chỉ biết `hasPassword: true|false` và `email` (đã masked nếu cần).

### 2.3 Org → Space → App data flow

```
[Webview]                          [Extension host]
   │  requestOrgs                     │
   │ ──────────────────────────────→  │ runCfCommand(['orgs','--json'], {timeoutMs:30000})
   │  orgsLoaded(orgs[])              │
   │ ←──────────────────────────────  │
   │  selectOrg(orgName)              │
   │ ──────────────────────────────→  │ runCfCommand(['spaces','-o',orgName,'--json'])
   │  spacesLoaded(spaces[])          │
   │ ←──────────────────────────────  │
   │  confirmSpace(orgName,spaceName) │
   │ ──────────────────────────────→  │ runCfCommand(['target','-o',orgName,'-s',spaceName])
   │                                   │ → runCfCommand(['apps','--json'])
   │  appsLoaded(apps[])              │
   │ ←──────────────────────────────  │
   │  selectApp(appName)              │
   │ ──────────────────────────────→  │ logStream.start(appName, mode='recent')
   │  logBatch(entries[])             │ batched 100ms / 50 entries
   │ ←──────────────────────────────  │
```

Mỗi message `runCfCommand` chạy qua `RequestQueue` slot tương ứng (`auth | orgs | spaces | apps | logs`). New click cùng slot → abort previous via `AbortController.signal` → kill child process.

### 2.4 CF CLI integration chi tiết

**Discovery (`cfRunner.discoverCfBinary`):**
```
1. Read setting sapTools.cf.binaryPath  → if exists & isFile() → use it
2. process.platform === 'win32':
     try `where cf.exe`, then `where cf.cmd`, then `where cf`
3. else:
     try `which cf` (env PATH already includes user shell PATH on extension host? — actually not always; need to spawn `process.env.SHELL -lc 'which cf'` on macOS to honor zshrc PATH)
4. If still missing → throw CfBinaryNotFoundError → webview shows install link
```

**Isolated CF_HOME:**
```
const cfHome = path.join(context.globalStorageUri.fsPath, 'cf');
fs.mkdirSync(cfHome, { recursive: true });
spawnEnv = { ...process.env, CF_HOME: cfHome, CF_COLOR: 'false' };
```

> Tách user `~/.cf/config.json` khỏi extension target. User vẫn `cf login` ở terminal mà không bị extension can thiệp.

**Per-command timeouts:**
| Command | Timeout |
|---|---|
| `cf api <url>` | 15s |
| `cf auth <email> <password>` | 30s |
| `cf orgs --json` | 30s |
| `cf spaces -o <org> --json` | 30s |
| `cf target -o <org> -s <space>` | 15s |
| `cf apps --json` | 30s |
| `cf logs <app> --recent` | 30s |
| `cf logs <app>` (live) | **no timeout**, kill on stop |
| `cf version` | 5s |

**CF CLI version detection:**
```
async function detectCfFlavor(): Promise<{major: number, supportsJson: boolean}>
  → run `cf version`
  → parse "cf version 8.7.10+abcdef..."
  → supportsJson = major >= 8
  → cache result lifetime of session
```

Nếu `supportsJson === false` → fallback parser bằng `cf orgs` (table text). Out of scope phase 1: chỉ throw `CfVersionTooOldError` nếu < 8 trong v0.2.0, fallback parser delayed sang v0.3.0. (Risk register R1.)

**Argument validation:**
```
const SAFE_NAME_REGEX = /^[A-Za-z0-9_.\-]{1,128}$/;
function ensureSafeName(value: string, label: string): void {
  if (!SAFE_NAME_REGEX.test(value)) throw new CfArgValidationError(label, value);
}
```

Áp dụng cho mọi org/space/app name nhận từ webview hoặc cf JSON output. Email & password được pass qua argv (không qua shell, không qua env), nhưng password vẫn phải `SAFE_PASSWORD_REGEX = /^[\x20-\x7E]{1,256}$/` để chặn null byte / control char injection.

**Output sanitization:**
```
function redactSecrets(line: string, knownSecrets: readonly string[]): string {
  let output = line;
  for (const secret of knownSecrets) {
    if (secret.length > 0) output = output.replaceAll(secret, '***');
  }
  return output;
}
```

Apply trước mọi `outputChannel.appendLine` và mọi log streaming entry trước khi gửi qua webview.

### 2.5 UI loading skeletons (đã bỏ sót ở v1)

| Stage | Skeleton |
|---|---|
| `requestCredentialStatus` đang chạy | Slot signin: 3 dòng grey shimmer, label "Checking credentials…" |
| `saveCredentials` submitting | Form sign-in disabled, button thành spinner "Authenticating…" |
| `requestOrgs` đang chạy | Slot org: 4 placeholder rectangle 32px |
| `requestSpaces` đang chạy | Slot space: 3 placeholder rectangle 32px |
| `requestApps` đang chạy | Apps tab: 5 placeholder row |
| `startLogStream` chờ entry đầu | Logs tab: thanh trạng thái "Awaiting log lines…" + spinner nhỏ |
| Khi `cf logs` crash | Crash banner đỏ "Stream stopped — last error: <message>" + button Retry |

Skeleton dùng `aria-busy="true"` + `role="status"` để screen reader friendly.

### 2.6 Logs tab — pro version (chi tiết)

**Layout:**

```
┌─ Cloud Foundry Logs ─ billing-api ─ STARTED ───────────────────┐
│ ┌── Toolbar ─────────────────────────────────────────────────┐ │
│ │ [⏵ Start Live] [⏸ Pause] [↻ Fetch Recent] [⌫ Clear]        │ │
│ │ [⤓ Export ▾]   • LIVE   Buffer 1283/5000 ▮▮▮▮▯▯▯▯▯▯       │ │
│ └──────────────────────────────────────────────────────────────┘│
│ ┌── Filters ─────────────────────────────────────────────────┐ │
│ │ Level:  [trace][debug][info][warn][err][fatal] (multi)    │ │
│ │ Source: [APP][CELL][RTR][STG] (multi)                      │ │
│ │ Inst:   [all▾]  Range: [1m][5m][15m][1h][all]              │ │
│ │ 🔍 [search keyword or /regex/i______________] [⊙ regex]   │ │
│ └──────────────────────────────────────────────────────────────┘│
│ ┌── Virtual table (max 200 visible rows) ──────────────────┐  │
│ │ Time      Lvl  Source/Inst  Message                ReqID│  │
│ │ 11:25:18  INFO APP/0        GET /invoices 200      a1b2c│  │
│ │ 11:25:22  WARN APP/1        Retry destination      a1b2d│  │
│ │ 11:25:30  ERR  APP/0        Failed bind queue      a1b2e│ ← │
│ └──────────────────────────────────────────────────────────┘  │
│ ┌── Detail panel (when row selected) ───────────────────────┐ │
│ │ Selected: 11:25:30.132Z  ERR  APP/PROC/WEB/0   req=a1b2e │ │
│ │ ▾ JSON                                          [📋 Copy] │ │
│ │   ▸ time: 2026-04-11T11:25:30.132Z                       │ │
│ │   ▸ level: error                                          │ │
│ │   ▸ logger: payments.queue                                │ │
│ │   ▾ err: { name, message, cause }                         │ │
│ │       ▸ name: AmqpError                                   │ │
│ │       ▸ message: AMQP authorization error                 │ │
│ │       ▸ cause: { message: 401 unauthorized }              │ │
│ │   ▾ stack:                                                │ │
│ │     AmqpError: AMQP authorization error                   │ │
│ │       at bindConsumer (queue.js:42:11)  …                 │ │
│ │ ▾ Raw line                                       [📋 Copy]│ │
│ │   2026-04-11T11:25:30.132Z [APP/PROC/WEB/0] ERR {...}    │ │
│ └──────────────────────────────────────────────────────────┘  │
│ Last sync 11:25:31  •  Stream: live  •  Filtered 24/1283    │
└────────────────────────────────────────────────────────────────┘
```

**Parser pseudo-code (port to TS in `cfLogParser.ts`):**

```ts
const CF_PREFIX = /^(?<ts>\S+)\s+\[(?<src>[^\]]+)\]\s+(?<stream>OUT|ERR)\s+(?<body>[\s\S]*)$/;

function parseCfLogLine(line: string, idGen: () => string): CfLogEntry {
  const safe = line.length > 8192 ? line.slice(0, 8192) + ' …[truncated]' : line;
  const match = CF_PREFIX.exec(safe);
  if (match === null) {
    return { id: idGen(), timestamp: new Date().toISOString(), level: 'info',
             source: 'STG', role: '', instance: '', stream: 'OUT',
             message: safe, parsed: null, raw: safe };
  }
  const { ts, src, stream, body } = match.groups!;
  const { source, role, instance } = splitSource(src);          // 'APP/PROC/WEB/0' → ...
  const trimmed = body.trim();
  const looksJson = trimmed.startsWith('{') || trimmed.startsWith('[');
  if (!looksJson) {
    return { id: idGen(), timestamp: ts, level: stream === 'ERR' ? 'err' : 'info',
             source, role, instance, stream, message: trimmed, parsed: null, raw: safe };
  }
  let parsed: unknown;
  try { parsed = JSON.parse(trimmed); } catch { parsed = null; }
  if (parsed === null || typeof parsed !== 'object') {
    return { ...non-json fallback };
  }
  const obj = parsed as Record<string, unknown>;
  const level = normalizeLevel(obj.level ?? obj.severity ?? (stream === 'ERR' ? 'err' : 'info'));
  const message = String(obj.msg ?? obj.message ?? obj.message_text ?? '');
  const reqId = pickString(obj.req_id, obj.reqId, obj.correlation_id, obj.trace_id, obj.vcap_request_id);
  const logger = pickString(obj.logger, obj.component);
  return { id: idGen(), timestamp: ts, level, source, role, instance, stream,
           message, parsed: obj, raw: safe, reqId, logger };
}
```

Test cases bắt buộc (§3.C5):
1. Plain text raw line.
2. CF prefix sai → fallback raw.
3. JSON object body với `level=info`.
4. JSON với `severity=FATAL` (uppercase) → normalize `fatal`.
5. JSON với `err.cause.message` nested → preserved trong `parsed`.
6. JSON với `stack` multiline → preserved.
7. Source `CELL/0` (no role).
8. Source `APP/TASK/migrate/0` (role=`TASK/migrate`).
9. Line dài 9000 ký tự → truncate.
10. Body bắt đầu `[1,2,3]` (array) → parsed thành `{values: [...]}`.
11. JSON với `time` ISO khác với prefix `ts` → ưu tiên prefix `ts` (CF authoritative).
12. Body trống.
13. Stream `ERR` không phải JSON → level mặc định `err`.
14. JSON có `vcap_request_id` (RTR access log) → reqId lift đúng.

**Filter pipeline:**
```ts
function applyFilters(buffer: CfLogEntry[], f: LogFilters): CfLogEntry[] {
  return buffer.filter((e) => {
    if (!f.levels.has(e.level)) return false;
    if (!f.sources.has(e.source)) return false;
    if (f.instance !== 'all' && e.instance !== f.instance) return false;
    if (f.range !== 'all' && Date.now() - Date.parse(e.timestamp) > rangeToMs(f.range)) return false;
    if (f.search === '') return true;
    const haystack = `${e.message} ${e.logger ?? ''} ${e.reqId ?? ''} ${e.raw}`;
    if (f.useRegex) {
      try { return f.compiledRegex.test(haystack); } catch { return true; }
    }
    return haystack.toLowerCase().includes(f.search.toLowerCase());
  });
}
```

**Virtual scroll:**
- Tổng filtered list `N` entries.
- DOM render `~120` row (60 trên + 60 dưới `selectedLogIndex`).
- Top spacer height = `(visibleStart) * ROW_HEIGHT_PX`.
- Bottom spacer = `(N - visibleEnd) * ROW_HEIGHT_PX`.
- Scroll listener throttle 16ms (rAF).
- ROW_HEIGHT_PX = 24 (đo từ CSS).

**JSON tree (DOM structure):**
```html
<div class="json-tree" role="tree" data-role="json-tree">
  <details class="json-node" open>
    <summary class="json-key">err <span class="json-meta">{3}</span></summary>
    <div class="json-children" role="group">
      <details class="json-node">
        <summary class="json-key">name <span class="json-value">"AmqpError"</span></summary>
      </details>
      ...
    </div>
  </details>
  <button type="button" class="json-copy" data-action="copy-json" aria-label="Copy JSON">📋 Copy JSON</button>
  <button type="button" class="json-copy" data-action="copy-raw" aria-label="Copy raw line">📋 Copy raw</button>
</div>
```

`<details>` element không cần JS để toggle. Copy buttons handler delegated trên `appElement`. Vì CSP `default-src 'none'` không chặn `navigator.clipboard.writeText` (trong webview cho phép). Fallback: `vscode.env.clipboard.writeText` qua message host.

---

## 3. Triển khai từng bước (đúng thứ tự user yêu cầu)

> **Quy ước**: mỗi sub-step có **gate**: phải pass mới qua step kế tiếp.

### Step A — Cập nhật prototype (UI mock + JSDoc types)

> Mục tiêu: prototype chạy trong browser thật + iframe gallery + extension host (mock mode khi không có vscodeApi). Tất cả logic UI cần thiết được viết một lần, port qua extension chỉ là wiring message.

**Files modified:** `prototype.js`, `prototype.css`, `themes/design-34.css` (chỉ nếu cần).

#### A.1 Mở rộng state model
```js
// thêm vào prototype.js sau dòng const SELECTION_STAGE_SLOT_IDS
const SELECTION_STAGE_SLOT_IDS = ['area','region','signin','org','space','confirm'];

// Credential state
let credentialState   = 'unknown';   // 'unknown'|'checking'|'missing'|'submitting'|'valid'|'error'
let credentialSource  = 'none';      // 'env'|'secret-storage'|'none'
let credentialEmail   = '';          // masked email (vd: d***@sap.com)
let credentialError   = null;        // {code, message}
let signInForm = { email: '', password: '', remember: true, showPassword: false };

// CF data
let orgsData    = null;     // CfOrg[] | null (null = chưa load)
let spacesData  = null;
let appsData    = null;
let selectedAppName = '';

// Logs pro
const LOG_BUFFER_DEFAULT_LIMIT = 5000;
let logBuffer = [];
let logBufferLimit = LOG_BUFFER_DEFAULT_LIMIT;
let logBufferTrimmedCount = 0;
let logFilters = {
  levels: new Set(['trace','debug','info','warn','err','fatal']),
  sources: new Set(['APP','CELL','RTR','STG']),
  instance: 'all',
  range: '15m',
  search: '',
  useRegex: false,
};
let selectedLogIndex = -1;
let logStreamState = 'idle';   // 'idle'|'recent'|'live'|'paused'|'crashed'
let logStreamError = null;
```

#### A.2 JSDoc typedef + protocol constants
Đầu file `prototype.js` thêm `// @ts-check` và:

```js
/**
 * @typedef {Object} CfLogEntry
 * @property {string} id
 * @property {string} timestamp
 * @property {'trace'|'debug'|'info'|'warn'|'err'|'fatal'} level
 * @property {'APP'|'CELL'|'RTR'|'STG'} source
 * @property {string} role
 * @property {string} instance
 * @property {'OUT'|'ERR'} stream
 * @property {string} message
 * @property {Record<string, unknown>|null} parsed
 * @property {string} raw
 * @property {string} [reqId]
 * @property {string} [logger]
 */
```

Khi port qua extension, file `src/messaging/webviewProtocol.ts` định nghĩa cùng shape (single source of truth ở TS, JSDoc copy lại để IDE help check). Có script `npm run check:proto` so sánh 2 schema (out of scope phase 1, ghi vào TODO).

#### A.3 Mock seed JSON-rich (`LOG_SEED_RICH`)
Thay `LOG_SEED` cũ. **Email phải dùng `@example.test`** vì prototype deploy GitHub Pages public.

```js
const LOG_SEED_RICH_RAW = [
  '2026-04-11T11:25:18.452Z [APP/PROC/WEB/0] OUT {"time":"2026-04-11T11:25:18.452Z","level":"info","logger":"billing.invoice","msg":"GET /invoices/INV-123 200 in 38ms","req_id":"a1b2c3","route":"/invoices/:id","user":"d***@example.test"}',
  '2026-04-11T11:25:22.701Z [APP/PROC/WEB/1] OUT {"time":"2026-04-11T11:25:22.701Z","level":"warn","logger":"destination","msg":"Retry 1/3 to S/4HANA destination after timeout","destination":"s4-prod","req_id":"a1b2c4"}',
  '2026-04-11T11:25:30.132Z [APP/PROC/WEB/0] ERR {"time":"2026-04-11T11:25:30.132Z","level":"error","logger":"payments.queue","msg":"Failed to bind queue consumer","err":{"name":"AmqpError","message":"AMQP authorization error","cause":{"message":"401 unauthorized"}},"stack":"AmqpError: AMQP authorization error\\n    at bindConsumer (/srv/payments/queue.js:42:11)","req_id":"a1b2c5"}',
  '2026-04-11T11:25:31.000Z [CELL/0] OUT Container started',
  '2026-04-11T11:25:31.500Z [CELL/0] OUT Healthcheck passed',
  '2026-04-11T11:25:32.880Z [APP/TASK/migrate/0] OUT {"time":"2026-04-11T11:25:32.880Z","severity":"FATAL","logger":"db.migrator","msg":"Schema mismatch on table audit_event","schema":"audit","table":"audit_event"}',
  '2026-04-11T11:25:35.000Z [RTR/2] OUT {"vcap_request_id":"d4e5f6","status":200,"path":"/invoices/INV-124","method":"GET","app_id":"billing-api","duration_ms":18}',
];
```

Trong prototype mock mode (vscodeApi === null), chạy `parseCfLogLine` (port từ §2.6) trên mỗi raw line để mỗi entry là CfLogEntry chuẩn.

#### A.4 Render mới
Thêm các function:
- `renderSignInSlot(credentialState, credentialSource, credentialEmail, credentialError, signInForm)`
- `renderOrgsSlot(orgsData)` — null → skeleton, [] → empty state, có data → list
- `renderSpacesSlot(spacesData)` — tương tự
- `renderAppsTab(appsData, selectedAppName)`
- `renderLogsTabPro(logBuffer, logFilters, selectedLogIndex, logStreamState, logBufferTrimmedCount, logBufferLimit)`
- `renderLogsToolbarPro(logStreamState, logBufferUsage)`
- `renderLogsFiltersPro(logFilters, instances)`
- `renderLogsTableVirtual(filteredEntries, selectedLogIndex)`
- `renderLogsDetailPanel(selectedEntry)`
- `renderJsonTree(value, depth, path)` — đệ quy, depth limit 8, dùng `<details>`
- `renderSettingsTab(credentialEmail, logBufferLimit, useRegex)`

#### A.5 Event delegation thêm
Bổ sung trên `appElement`:
- `'click'` các action mới: `submit-credentials`, `cancel-credentials`, `toggle-password-visibility`, `toggle-remember`, `use-env-credentials`, `clear-credentials`, `edit-credentials`, `select-org`, `select-space`, `confirm-space`, `select-app`, `start-stream`, `pause-stream`, `stop-stream`, `clear-buffer`, `export-jsonl`, `export-log`, `restart-stream`, `select-log-row` (data-log-index), `toggle-level`, `toggle-source`, `set-range`, `toggle-regex-search`, `copy-json`, `copy-raw`
- `'input'` cho `data-role="sign-in-email"`, `sign-in-password`, `log-search`
- `'change'` cho `<select data-role="instance-filter">`, `<input type="checkbox" data-role="remember-credentials">`, `<input type="checkbox" data-role="use-regex">`
- `'keydown'` global trong app: `Escape` đóng detail panel, `ArrowUp`/`ArrowDown` di chuyển `selectedLogIndex`, `Enter` toggle JSON tree top-level
- `'scroll'` trên `.logs-table` để cập nhật virtual window (rAF throttle)

#### A.6 Mock state machine (browser/gallery mode)
```js
function mockHandleAction(action, element) {
  if (vscodeApi !== null) return false; // production mode delegated to host
  switch (action) {
    case 'submit-credentials':
      credentialState = 'submitting';
      setTimeout(() => {
        if (signInForm.email === 'fail@example.test') {
          credentialState = 'error';
          credentialError = { code: 'AUTH_FAILED', message: 'Authentication failed' };
        } else {
          credentialState = 'valid';
          credentialSource = 'secret-storage';
          credentialEmail = maskEmail(signInForm.email);
          orgsData = MOCK_ORGS;
        }
        renderPrototype();
      }, 600);
      return true;
    case 'select-app':
      selectedAppName = element.dataset.appName ?? '';
      logBuffer = LOG_SEED_RICH_RAW.map((line) => parseCfLogLine(line, makeIdGen()));
      logStreamState = 'recent';
      return true;
    case 'start-stream':
      logStreamState = 'live';
      // mock injection 1 entry/second
      mockLiveTimer = setInterval(() => {
        logBuffer.push(parseCfLogLine(generateMockLine(), makeIdGen()));
        trimBuffer();
        renderPrototype();
      }, 1000);
      return true;
    // ...
  }
}
```

Trong gallery mode, hidden devtools button (`data-action="dev-force-auth-fail"`) cho phép test branch error.

#### A.7 CSS thêm (`prototype.css`)
Thêm khoảng 280–340 dòng:
- `.signin-card`, `.signin-form`, `.signin-input`, `.signin-row`, `.signin-row-action`, `.signin-error`, `.signin-success`, `.signin-skeleton`
- `.password-input-wrap`, `.password-toggle`
- `.creds-source-pill`
- `.logs-toolbar-pro`, `.logs-stream-state`, `.buffer-bar`, `.buffer-bar-fill`
- `.filter-row-pro`, `.level-chip[data-active]`, `.source-chip`, `.range-chip`, `.regex-toggle`
- `.logs-table-virtual`, `.logs-table-spacer`, `.log-row-pro`, `.log-row-pro.is-error`, `.log-row-pro.is-warn`, `.log-row-pro.is-fatal`
- `.logs-detail-panel`, `.json-tree`, `.json-node`, `.json-key`, `.json-value`, `.json-meta`, `.json-children`, `.json-copy`
- `.crash-banner`, `.skeleton-row`, `.skeleton-shimmer` (animation)
- `.apps-tab-list`, `.app-row`, `.app-state-badge`
- `.settings-section`, `.settings-row`

Tất cả dùng `var(--vscode-*)` token đã có. Skeleton shimmer dùng `@keyframes shimmer` linear-gradient. Với `@media (prefers-reduced-motion: reduce)` vô hiệu hoá animation.

#### A.8 Backwards compatibility
- Action `connect-cf`/`fetch-recent`/`toggle-live`/`clear-logs`/`export-logs`/`set-level`/`select-log` cũ vẫn handle (chuyển hướng sang action mới hoặc no-op) để không phá test e2e cũ trong period transition.
- Tab IDs: thêm "apps" trước "settings". `activeTabId` khởi tạo `'logs'` như cũ.
- Message ra ngoài `sapTools.regionSelected` GIỮ NGUYÊN để test region selector cũ pass.

#### Gate A
- Chạy `python3 -m http.server 5500` từ `docs/designs/prototypes/` (hoặc dùng MCP playwright)
- Kiểm tra `index.html?theme=dark#design-34` mở được, không lỗi console
- Kiểm tra flow mock: pick area → region → signin form xuất hiện → nhập creds → orgs hiện → space → confirm → workspace → Apps → click app → Logs hiện 7 dòng JSON-rich

### Step B — MCP Playwright verification

**Mục tiêu**: kiểm thử UI prototype độc lập trong browser thật trước khi viết TS code.

| # | Test | Expected |
|---|---|---|
| B1 | `mcp__playwright__browser_navigate` to `file://.../docs/designs/prototypes/index.html?theme=dark#design-34` | Page load OK |
| B2 | `browser_snapshot` initial | Khớp `Choose Area` heading, 4 area card |
| B3 | Click area "Europe" → `browser_snapshot` | 1 area visible, Choose Region hiện 7 region |
| B4 | Click region "Germany West Central" → `browser_snapshot` | Sign-in card xuất hiện thay org slot, có email + password input |
| B5 | Fill email `dev@example.test`, password `secret`, click Sign in | Spinner → orgs load 4 row mock |
| B6 | Click org → 3 space → Confirm → workspace mode | Tab Logs active, banner "No app selected" hoặc auto-select |
| B7 | Click tab Apps → click app `billing-api` | Quay về Logs tab, 7 row hiện đủ |
| B8 | Click row 3 (ERR) → JSON tree mở `err.cause.message`, có Copy JSON button | Detail panel render đúng |
| B9 | Toggle level chip "info" off | Còn 4 row (warn/err/fatal/info=0) |
| B10 | Switch to regex search `/queue/i` | Còn 1 row ERR |
| B11 | Click `Start Live` | Mỗi 1s thêm 1 row, buffer bar tăng |
| B12 | Click `Pause` → row stop tăng | logStreamState='paused' |
| B13 | Click `Clear` | buffer = 0, table empty state |
| B14 | Test 3 theme: `?theme=light`, `?theme=high-contrast` | Color readable, không flicker |
| B15 | Test responsive viewport: 320px, 480px, 720px | Layout không vỡ |
| B16 | Test reduced motion: `prefers-reduced-motion: reduce` | Animation tắt |
| B17 | Test sign-in error path: email = `fail@example.test` | Card đỏ, password cleared |
| B18 | Test keyboard: ↑/↓ navigate row, Enter expand JSON, Esc đóng detail | Pass |
| B19 | Inspect console log via `browser_console_messages` | Không error/warning |
| B20 | Inspect page snapshot ARIA | Mỗi button có aria-label, table có role |

**Loop**: nếu bug → quay lại Step A sửa, chạy lại từ B1.

### Step C — Code extension TS

> **Branching**: nếu có thể, mỗi module 1 commit nhỏ. Nhưng nếu khối lượng nhỏ, gộp dưới step C cũng được. Không gộp Step C với Step A/E vào 1 commit.

#### C.1 New folder layout
```
src/
├── extension.ts                        (cập nhật: instantiate manager mới + dispose chain)
├── sidebarProvider.ts                  (cập nhật: discriminated union handler)
├── credentials/
│   ├── credentialsStore.ts
│   ├── credentialsStore.test.ts
│   └── envCredentials.ts               (đọc process.env.SAP_EMAIL/SAP_PASSWORD)
├── cf/
│   ├── cfBinary.ts                     (discoverCfBinary cross-platform)
│   ├── cfBinary.test.ts
│   ├── cfRunner.ts                     (spawn + timeout + abort)
│   ├── cfRunner.test.ts                (mock spawn — dùng vitest mock của child_process)
│   ├── cfApi.ts                        (login/orgs/spaces/apps/target)
│   ├── cfApi.test.ts
│   ├── cfLogParser.ts                  (port từ §2.6 pseudocode)
│   ├── cfLogParser.test.ts             (≥14 case)
│   ├── cfLogStream.ts                  (long-running cf logs + ring buffer + batch)
│   └── cfLogStream.test.ts
├── messaging/
│   ├── webviewProtocol.ts              (discriminated union types + type guards)
│   ├── webviewProtocol.test.ts
│   └── validation.ts                   (isRecord, isNonEmptyString, isStringArray, ...)
├── secrets/
│   └── redact.ts                       (redactSecrets + test)
├── state/
│   ├── sessionState.ts                 (in-memory snapshot)
│   └── sessionStore.ts                 (persist tới context.globalState)
└── regions.ts                          (thêm mapRegionIdToCfApi)
```

#### C.2 `cfRunner.ts` API
```ts
export interface RunCfOptions {
  readonly args: readonly string[];
  readonly timeoutMs: number;
  readonly signal?: AbortSignal;
  readonly env?: NodeJS.ProcessEnv;
  readonly redactArgs?: readonly number[];
  readonly knownSecrets?: readonly string[];
}

export interface RunCfResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

export class CfRunner {
  constructor(
    private readonly binary: string,
    private readonly cfHome: string,
    private readonly logger: Logger,
  ) {}

  async run(options: RunCfOptions): Promise<RunCfResult>;
  spawnStream(
    args: readonly string[],
    onLine: (line: string) => void,
    onClose: (code: number | null, signal: NodeJS.Signals | null) => void,
    signal: AbortSignal,
  ): { kill(): void };
}
```

Implementation notes:
- `child_process.spawn(this.binary, args, { shell: false, env: { ...process.env, CF_HOME: this.cfHome, CF_COLOR: 'false', ...options.env } })`
- Setup `setTimeout` cho timeout, kill `SIGTERM` nếu hết time.
- AbortSignal listener: kill khi abort.
- Catch ENOENT → throw `CfBinaryNotFoundError`.
- Stream mode: `readline.createInterface({ input: child.stdout })` + `child.stderr`.
- Logger: ghi vào OutputChannel với redact.

#### C.3 `cfApi.ts` API
```ts
export interface CfOrg { readonly name: string; readonly guid: string; }
export interface CfSpace { readonly name: string; readonly guid: string; }
export interface CfApp {
  readonly name: string;
  readonly guid: string;
  readonly state: 'STARTED'|'STOPPED'|'CRASHED'|'STAGING'|'STOPPING'|'STARTING';
  readonly instances: number;
  readonly memory: string;
  readonly disk: string;
  readonly route?: string;
}

export class CfApi {
  constructor(private readonly runner: CfRunner) {}
  async detectVersion(): Promise<{ major: number; full: string }>;
  async setApi(regionId: string, signal?: AbortSignal): Promise<void>;
  async authenticate(email: string, password: string, signal?: AbortSignal): Promise<void>;
  async listOrgs(signal?: AbortSignal): Promise<readonly CfOrg[]>;
  async listSpaces(orgName: string, signal?: AbortSignal): Promise<readonly CfSpace[]>;
  async target(orgName: string, spaceName: string, signal?: AbortSignal): Promise<void>;
  async listApps(signal?: AbortSignal): Promise<readonly CfApp[]>;
}
```

JSON parse với schema guard: viết function `parseCfOrgsJsonV3(raw: string): readonly CfOrg[]`. Throw `CfJsonShapeError` nếu shape sai.

#### C.4 `cfLogStream.ts`
```ts
export type LogStreamMode = 'recent' | 'live';
export interface LogStreamSink {
  onBatch(entries: readonly CfLogEntry[]): void;
  onStatus(status: LogStreamStatus): void;
}
export type LogStreamStatus =
  | { state: 'idle' }
  | { state: 'starting'; mode: LogStreamMode }
  | { state: 'running'; mode: LogStreamMode }
  | { state: 'stopped' }
  | { state: 'crashed'; code: number | null; signal: NodeJS.Signals | null; lastError: string };

export class CfLogStreamManager {
  constructor(
    private readonly runner: CfRunner,
    private readonly parser: (line: string) => CfLogEntry,
    private readonly outputChannel: OutputChannel,
  ) {}

  start(appName: string, mode: LogStreamMode, sink: LogStreamSink): void;
  stop(): void;
  isRunning(): boolean;
  dispose(): void;
}
```

Internal:
- `pendingBatch: CfLogEntry[]`, `flushTimer: NodeJS.Timeout | null`.
- `flushIfReady` khi `length >= 50` hoặc 100ms.
- `kill()` → child.kill('SIGTERM') → if sau 500ms vẫn alive → SIGKILL.

#### C.5 `cfLogParser.ts` test cases (mở rộng từ §2.6)
14 case tối thiểu, mỗi case 1 `it()`. Coverage 100% branch. Sử dụng table-driven test.

#### C.6 `webviewProtocol.ts`
```ts
export type WebviewToHostMessage =
  | { readonly type: 'sapTools.regionSelected'; readonly region: RegionSelectionPayload }
  | { readonly type: 'sapTools.requestCredentialStatus' }
  | { readonly type: 'sapTools.saveCredentials'; readonly email: string; readonly password: string; readonly persist: boolean; readonly regionId: string }
  | { readonly type: 'sapTools.useEnvCredentials'; readonly regionId: string }
  | { readonly type: 'sapTools.clearCredentials' }
  | { readonly type: 'sapTools.requestOrgs' }
  | { readonly type: 'sapTools.requestSpaces'; readonly orgName: string }
  | { readonly type: 'sapTools.confirmSpace'; readonly orgName: string; readonly spaceName: string }
  | { readonly type: 'sapTools.requestApps' }
  | { readonly type: 'sapTools.startLogStream'; readonly appName: string; readonly mode: 'recent'|'live' }
  | { readonly type: 'sapTools.stopLogStream' }
  | { readonly type: 'sapTools.exportLogs'; readonly entries: readonly CfLogEntry[]; readonly format: 'jsonl'|'log' }
  | { readonly type: 'sapTools.copyToClipboard'; readonly text: string };

export type HostToWebviewMessage =
  | { readonly type: 'sapTools.credentialStatus'; readonly source: 'env'|'secret-storage'|'none'; readonly email?: string }
  | { readonly type: 'sapTools.credentialResult'; readonly ok: boolean; readonly errorCode?: 'AUTH_FAILED'|'CF_MISSING'|'NETWORK'|'TIMEOUT'|'INVALID_INPUT'; readonly errorMessage?: string }
  | { readonly type: 'sapTools.orgsLoaded'; readonly orgs: readonly CfOrg[] }
  | { readonly type: 'sapTools.spacesLoaded'; readonly orgName: string; readonly spaces: readonly CfSpace[] }
  | { readonly type: 'sapTools.appsLoaded'; readonly apps: readonly CfApp[] }
  | { readonly type: 'sapTools.logBatch'; readonly entries: readonly CfLogEntry[] }
  | { readonly type: 'sapTools.logStreamStatus'; readonly status: LogStreamStatus }
  | { readonly type: 'sapTools.cfError'; readonly slot: 'auth'|'orgs'|'spaces'|'apps'|'logs'; readonly errorCode: string; readonly errorMessage: string };

export function isWebviewToHostMessage(value: unknown): value is WebviewToHostMessage { /* exhaustive check */ }
```

Tests: 1 happy + 1 sad case mỗi message type.

#### C.7 `sessionStore.ts`
```ts
export interface PersistedSession {
  readonly regionId: string;
  readonly orgName: string;
  readonly spaceName: string;
  readonly appName: string;
}

export class SessionStore {
  constructor(private readonly globalState: vscode.Memento) {}
  read(): PersistedSession | null;
  async write(state: Partial<PersistedSession>): Promise<void>;
  async clear(): Promise<void>;
}
```

Storage key: `sapTools.session.v1`.

#### C.8 `extension.ts` updated
```ts
export function activate(context: vscode.ExtensionContext): void {
  const outputChannel = vscode.window.createOutputChannel('SAP Tools');
  const logger = new OutputChannelLogger(outputChannel);
  const config = vscode.workspace.getConfiguration('sapTools');
  const cfBinary = await discoverCfBinary(config.get<string>('cf.binaryPath'));
  // ... init managers
  const credentialsStore = new CredentialsStore(context.secrets);
  const sessionStore = new SessionStore(context.globalState);
  const cfHome = path.join(context.globalStorageUri.fsPath, 'cf');
  const cfRunner = new CfRunner(cfBinary, cfHome, logger);
  const cfApi = new CfApi(cfRunner);
  const logStream = new CfLogStreamManager(cfRunner, parseCfLogLine, outputChannel);
  const provider = new SapToolsSidebarProvider({
    extensionUri: context.extensionUri,
    outputChannel, credentialsStore, sessionStore, cfApi, logStream, logger,
  });
  context.subscriptions.push(outputChannel, provider, logStream, cfRunner, ...);
  vscode.window.registerWebviewViewProvider(REGION_VIEW_ID, provider, { webviewOptions: { retainContextWhenHidden: true } });
}
```

> Lưu ý: vì `discoverCfBinary` async và `activate` sync, có thể chạy lazy — discover khi user submit credentials lần đầu, không phải tại activate time.

#### C.9 `package.json` updates
```jsonc
{
  "version": "0.2.0",
  "activationEvents": [
    "onView:sapTools.regionView",
    "onCommand:sapTools.selectSapBtpRegion",
    "onCommand:sapTools.editCredentials",
    "onCommand:sapTools.clearCredentials"
  ],
  "contributes": {
    "commands": [
      { "command": "sapTools.selectSapBtpRegion", "title": "SAP Tools: Open Region Menu", "category": "SAP Tools" },
      { "command": "sapTools.editCredentials",  "title": "SAP Tools: Edit BTP Credentials", "category": "SAP Tools" },
      { "command": "sapTools.clearCredentials", "title": "SAP Tools: Clear Stored BTP Credentials", "category": "SAP Tools" }
    ],
    "configuration": {
      "title": "SAP Tools",
      "properties": {
        "sapTools.cf.binaryPath": {
          "type": "string",
          "default": "",
          "markdownDescription": "Absolute path to the `cf` CLI binary. Leave empty for auto-discovery."
        },
        "sapTools.cf.commandTimeoutMs": {
          "type": "number",
          "default": 30000,
          "minimum": 5000,
          "maximum": 120000,
          "description": "Timeout in milliseconds for non-streaming `cf` commands."
        },
        "sapTools.logs.maxBuffer": {
          "type": "number",
          "default": 5000,
          "minimum": 100,
          "maximum": 50000,
          "description": "Maximum number of log entries kept in memory before dropping the oldest."
        },
        "sapTools.logs.useRegexSearch": {
          "type": "boolean",
          "default": false,
          "description": "Default to regex matching in the log search box."
        }
      }
    }
  }
}
```

Cspell wordlist phải bổ sung: `vcap`, `pino`, `Memento`, `lcrlf`, `oklab` đã có?, `keychain`, `dpapi`, `libsecret`.

### Step D — Self code review

Trước khi sang Step E (e2e), self review theo checklist sau:

#### D.1 ESLint trap list (do project rất nghiêm ngặt)
- ❌ KHÔNG `if (value)` với string/number/nullable → DÙNG `if (value !== '')`, `if (value !== undefined)`, `if (value !== null)`, `if (value > 0)`.
- ❌ KHÔNG `console.log/.warn/.error` → dùng `outputChannel.appendLine`.
- ❌ KHÔNG `arr[i]` không check → `const item = arr[i]; if (item === undefined) return;`.
- ❌ KHÔNG `obj.bracketKey` → `obj['bracketKey']`.
- ❌ KHÔNG `import {X}` cho type → `import type {X}`.
- ❌ KHÔNG floating promise → `void asyncFn()` hoặc `await`.
- ❌ KHÔNG function thiếu return type explicit.
- ❌ KHÔNG `as` cast trừ phi sau type guard.
- ❌ KHÔNG `any`.
- ❌ KHÔNG dùng `JSON.parse` không catch + không validate shape.

#### D.2 Security review
- [x] Không log password/email vào output channel chưa redact.
- [x] Mọi org/space/app name validate `SAFE_NAME_REGEX`.
- [x] CSP webview unchanged.
- [x] SecretStorage chỉ write khi `persist === true`.
- [x] CF_HOME isolated.
- [x] `cf` spawn dùng `shell: false`.
- [x] Không `eval`, không `Function()`.
- [x] Không inline event handler trong webview HTML.
- [x] Webview message validation max length per field.

#### D.3 Performance
- [x] Log batch flush 100ms hoặc 50 entries.
- [x] Virtual scroll DOM ≤ ~200.
- [x] Filter pipeline O(n).
- [x] Ring buffer drop oldest O(1).
- [x] No closure leak trong setInterval.

#### D.4 Cleanup
- [x] Disposable chain đầy đủ: `extension.ts` push tất cả vào `context.subscriptions`.
- [x] `dispose()` của provider gọi `logStream.stop()` + abort all in-flight.
- [x] `dist/quickPickItems.js` deleted.

#### D.5 Accessibility
- [x] Form input có `<label>` hoặc `aria-label`.
- [x] Live log table có `aria-live="polite"` hoặc `role="log"`.
- [x] Focus trap không chặn keyboard navigation cơ bản.
- [x] Skeleton states có `aria-busy="true"`.

### Step E — E2E tests

#### E.1 cf stub
File: `e2e/fixtures/cf-stub.js` (Node script).

```js
#!/usr/bin/env node
const args = process.argv.slice(2);
function out(s) { process.stdout.write(s + '\n'); }
function err(s) { process.stderr.write(s + '\n'); }
function exit(c) { process.exit(c); }

if (args[0] === 'version') { out('cf version 8.7.10+abcdef.2024-01-01'); exit(0); }
if (args[0] === 'api') { out('Setting api endpoint to ' + args[1] + '...\nOK'); exit(0); }
if (args[0] === 'auth') {
  const email = args[1]; const password = args[2];
  if (email === 'happy@example.test' && password === 'correct') { out('Authenticating...\nOK'); exit(0); }
  err('Authentication has failed.'); exit(1);
}
if (args[0] === 'orgs' && args[1] === '--json') { out(JSON.stringify({ resources: [...] })); exit(0); }
// ... spaces, target, apps, logs --recent, logs (live)
```

Cho `cf logs <app>` (live mode): mỗi 200ms `out` 1 dòng từ `LOG_SEED_RICH_RAW`, loop. Process tự exit khi nhận `SIGTERM`.

Cross-platform shim cho Windows: `e2e/fixtures/cf.cmd`:
```cmd
@echo off
node "%~dp0cf-stub.js" %*
```

Linux/Mac: symlink `e2e/fixtures/cf` → `cf-stub.js` (chmod +x).

#### E.2 launchVscode.ts updates
Thêm option:
```ts
export interface ExtensionHostLaunchOptions {
  readonly colorTheme?: string;
  readonly cfStubMode?: 'happy'|'auth-fail'|'crash'|'none';
}
```

Khi `cfStubMode !== 'none'`: prepend `e2e/fixtures/` vào PATH env truyền vào electron.launch + set env `SAP_TOOLS_CF_STUB_MODE` để stub đọc.

#### E.3 Test cases mới (`e2e/tests/cf-logs.e2e.spec.ts`)
1. **Sign-in card on first launch (no env, no stored)** — flow đến region → expect `[data-role="sign-in-email"]`.
2. **Sign-in success persists creds** — happy creds → orgs hiện → relaunch → expect skip sign-in.
3. **Sign-in error** — bad creds → expect `.signin-error` text "Authentication failed".
4. **Use env credentials path** — set `SAP_EMAIL`/`SAP_PASSWORD` → expect "From shell" pill, button Use & Continue.
5. **Edit credentials command** — palette `SAP Tools: Edit BTP Credentials` → expect signin form.
6. **Clear credentials** — Settings → Clear → confirm → expect signin form quay lại.
7. **Org → space → apps load** — expect 2 org, 2 space, 3 app.
8. **Start live log stream** — click app → click Start Live → wait 600ms → expect ≥3 row.
9. **Filter by level multi** — uncheck info → row count chỉ chứa warn/err/fatal.
10. **Regex search** — bật regex `/queue/i` → expect 1 row.
11. **JSON tree** — click ERR row → expand `err.cause` → expect "401 unauthorized".
12. **Copy JSON button** — click → assert `vscode.env.clipboard` (mock qua spy injected).
13. **Export jsonl** — click Export → mock save dialog → file đúng nội dung.
14. **Crash banner** — `cfStubMode='crash'` (stub exits 1 after 500ms) → expect `.crash-banner`.
15. **Buffer trim indicator** — set `sapTools.logs.maxBuffer=10`, push 30 line → expect badge "trimmed 20".

Chạy 15 test này ở 1 theme (dark) để kiểm soát thời gian; smoke test 1 happy path ở light + high-contrast.

#### E.4 Update existing tests
Region selector flow giữ nguyên — `selectDefaultScope` cần update vì sau khi pick region sẽ gặp signin card thay vì org. Set env `SAP_EMAIL`/`SAP_PASSWORD` cho test cũ để bypass signin.

### Step F — Run e2e + phân tích

```
cd e2e
npm test               # full suite, 1 worker, sequential
```

Nếu fail:
1. Xem `e2e/playwright-report/index.html` (đã `reporter: ['list','html']`).
2. Xem trace `.zip` (do `trace: 'on-first-retry'`).
3. Xem video / screenshot `e2e/test-results/<spec>/`.
4. Identify root cause:
   - Stub không trả đúng JSON → fix stub.
   - Message protocol mismatch → fix `webviewProtocol.ts` hoặc prototype.
   - Selector sai → fix prototype DOM hoặc test selector.
   - Race timing → tăng `expect.poll` timeout.
5. Re-run lẻ test bằng `npm test -- --grep "<test>"`.
6. Headed mode debug: `npm run test:headed -- --grep "<test>"`.

**Phân tích output sau khi pass:**
- Số test pass, thời gian tổng, thời gian từng test.
- Coverage screenshot key UX scenarios.
- Ghi insight vào CHANGELOG bullet.

---

## 4. Validation pipeline (bắt buộc trước commit cuối)

Theo đúng order; nếu fail → fix → re-run TỪ ĐẦU bước fail (không skip).

```
# 0. Clean dist (xoá file leftover quickPickItems.js)
rm -rf dist

# 1. Root validate
npm run typecheck
npm run lint
npm run cspell
npm run test:unit

# 2. Build extension
npm run build

# 3. Verify build
ls dist                                            # confirm 4 file: extension.js, regions.js, sidebarProvider.js + folder mới (credentials, cf, messaging, secrets, state)
stat -f%z dist/extension.js                        # < 5 MB

# 4. Validate cả root + e2e
npm run validate                                   # = validate:root + validate:e2e

# 5. E2E
npm --prefix e2e test
```

Edge cases trong validate:
- `cspell` báo từ mới → thêm vào `cspell.json` words array (KHÔNG vào e2e/cspell.json riêng trừ phi từ chỉ xuất hiện trong e2e folder).
- `eslint` báo `strict-boolean-expressions` → sửa expression rõ kiểu.
- `vitest` flake → kiểm assertions deterministic.
- E2E `expect.poll` timeout → tăng timeout, KHÔNG tăng retry mặc định.
- Nếu Playwright trace thấy CSP error → kiểm CSS src, không thêm inline style/script.

---

## 5. Commit strategy + version bump + push

> Plan v2 chia thành 7 commit nhỏ. Mỗi commit pre-commit hook tự chạy `npm run validate` (husky). KHÔNG `--no-verify`.

| # | Commit | Files | Validate gate |
|---|---|---|---|
| 1 | `feat(prototype): credentials gate + pro logs UI mock` | `docs/designs/prototypes/assets/{prototype.js,prototype.css,themes/design-34.css}` | `npm run validate` (vẫn pass vì root files không đổi); MCP playwright manual verify |
| 2 | `feat(secrets): credentialsStore + envCredentials + redact` | `src/credentials/`, `src/secrets/`, `package.json` (config schema partial) | `npm run validate` |
| 3 | `feat(cf): cfBinary discovery + cfRunner with timeout` | `src/cf/{cfBinary,cfRunner}.ts(.test.ts)` | `npm run validate` |
| 4 | `feat(cf): cfApi (login/orgs/spaces/apps) + cfLogParser` | `src/cf/{cfApi,cfLogParser}.ts(.test.ts)` | `npm run validate` |
| 5 | `feat(cf): cfLogStream live + ring buffer + batch` | `src/cf/cfLogStream.ts(.test.ts)`, `src/state/` | `npm run validate` |
| 6 | `feat(extension): wire sidebar provider with cf modules` | `src/extension.ts`, `src/sidebarProvider.ts`, `src/messaging/` | `npm run validate` (full + e2e) |
| 7 | `chore(release): bump 0.2.0 + remove dead dist + docs` | `package.json` (bump 0.1.15→0.2.0), `CHANGELOG.md`, `README.md`, **delete `dist/quickPickItems.js`**, `e2e/fixtures/`, `e2e/tests/cf-logs.e2e.spec.ts`, `e2e/src/launchVscode.ts` | `npm run validate` + `npm --prefix e2e test` |

> Lưu ý: bump version + e2e fixture + e2e test có thể bóc thành commit 6.5 và 7 nếu commit quá lớn — judgment call dựa trên diff thực tế.

### 5.2 CHANGELOG.md
```
## 0.2.0

### Added
- Credentials gate: detect SAP_EMAIL/SAP_PASSWORD in shell env, fall back to VS Code SecretStorage, otherwise prompt with sign-in card.
- Cloud Foundry integration via `cf` CLI with isolated `CF_HOME`, cross-platform binary discovery, command timeouts.
- Org / Space / App listing replacing previous mock data.
- Logs viewer: live `cf logs` streaming, JSON line parser, multi-filter (level / source / instance / range / search/regex), virtual scroll table, JSON tree detail panel with copy, ring buffer, export to JSONL.
- Settings tab additions: max buffer, regex default, edit/clear credentials, edit cf binary path.
- Commands: `SAP Tools: Edit BTP Credentials`, `SAP Tools: Clear Stored BTP Credentials`.
- VS Code configuration schema (`sapTools.cf.binaryPath`, `sapTools.cf.commandTimeoutMs`, `sapTools.logs.maxBuffer`, `sapTools.logs.useRegexSearch`).

### Changed
- Webview body class always include `saptools-extension` (was missing in src vs dist drift).
- Region selector flow now passes through credentials check before showing org list.

### Fixed
- Removed dead `dist/quickPickItems.js` left over from a previous refactor.

### Tests
- 30+ unit tests across credentials, cf, parser, validation, state modules.
- 15 e2e tests for cf logs viewer flow with platform-portable `cf` stub.
```

### 5.3 README.md
Thêm mục **Logs Viewer** dưới Current Feature, kèm screenshot từ MCP playwright snapshot.

### 5.4 Memory updates (cuối)
Cập nhật `project_overview.md`:
- Tech stack: vẫn 0 dep runtime.
- Architecture mới: list 6 namespace `credentials/`, `cf/`, `messaging/`, `secrets/`, `state/`, `regions.ts`.
- Core flows: thêm "credentials gate" và "cf logs streaming with JSON parser".

### 5.5 Push
- `git push origin <branch>` (nếu trên feature branch) hoặc `git push origin main` (nếu user explicit cho phép).
- KHÔNG `--no-verify`, KHÔNG `--force`, KHÔNG `--force-with-lease` trừ phi user yêu cầu.
- Sau push: confirm CI workflow xanh trên GitHub.

---

## 6. Risk register (sau rà soát)

| # | Rủi ro | Likelihood | Impact | Mitigation | Quyết định |
|---|---|---|---|---|---|
| R1 | CF CLI v7 user gặp lỗi parse JSON | Medium | High | Detect version → throw `CfVersionTooOldError` với link upgrade trong v0.2.0; v0.3.0 fallback parser | Documented, accept |
| R2 | Endpoint `cf api` mỗi region khác | Low | Medium | Map template `https://api.cf.<id>.hana.ondemand.com` + override per-region | Implement |
| R3 | SSO passcode flow không hỗ trợ | Low | Low | Phase 2 | Out of scope |
| R4 | Multi-app log stream | Low | Low | Phase 2 | Out of scope |
| R5 | E2E cf stub vô tình chạy cf thật | Low | High | Prepend stub PATH; assert `which cf` returns stub path trước test | Implement |
| R6 | Extension chạy không có cf trên máy CI | High | Medium | E2E luôn dùng stub; local user phải có cf (đã ghi README) | Documented |
| R7 | Webview reload mất state | Medium | Low | `sessionStore` persist + restore; `retainContextWhenHidden:true` | Implement |
| R8 | Race condition click spam | Medium | Medium | Per-slot AbortController + `RequestQueue` | Implement |
| R9 | Stack trace log dài → render chậm | Medium | Low | Truncate display 8KB, full text trong detail panel | Implement |
| R10 | i18n tương lai | Low | Low | EN-only phase 1; namespace string ready | Out of scope |
| R11 | macOS `cf` cài qua brew không trong PATH của extension host | Medium | High | Discovery dùng `process.env.SHELL -lc 'which cf'` trên macOS | Implement |
| R12 | Windows path có space | Medium | Medium | `cfBinary` luôn resolve absolute path qua `path.normalize` | Implement |
| R13 | User clear credentials giữa khi log đang stream | Low | Medium | Stop log stream → quay về signin slot | Implement |
| R14 | `prefers-reduced-motion` không tôn trọng | Low | Low | CSS `@media (prefers-reduced-motion: reduce)` đã có pattern | Implement |
| R15 | GitHub Pages prototype lộ mock email | Low | Low | `@example.test` (RFC 6761) | Implement |
| R16 | Bundle > 5MB | Very Low | High | Confirm sau build (hiện ~3KB → còn rất nhiều room) | Verify in §4 |

---

## 7. Definition of Done

Plan này hoàn thành khi tất cả các điểm sau pass:

1. **Prototype**: 20 step MCP Playwright (§3.B) đều xanh, không console error.
2. **Source code**: 6 module mới + cập nhật `extension.ts`, `sidebarProvider.ts`, `regions.ts`.
3. **Tests**:
   - Unit ≥ 30 test, tất cả pass với `npm run test:unit`.
   - E2E 15 test mới + 6 test cũ pass với `npm --prefix e2e test`.
4. **Lint/typecheck/cspell**: `npm run validate` xanh.
5. **Build**: `dist/` rebuild, `dist/quickPickItems.js` đã xoá, `dist/extension.js` < 5MB.
6. **Configuration**: `package.json` có `contributes.configuration` với 4 setting.
7. **Activation**: `activationEvents` thêm command edit/clear credentials.
8. **Version bump**: `package.json.version = "0.2.0"`.
9. **Docs**: `CHANGELOG.md`, `README.md`, `e2e/README.md` cập nhật.
10. **Memory**: `project_overview.md` cập nhật.
11. **Commits**: 7 commit theo §5.1 (hoặc gộp đến 5 commit nếu hợp lý), không skip hooks.
12. **Push**: branch / main đã push, CI workflow xanh.
13. **Plan rename**: file này có thể đổi tên thành `01-cf-logs-viewer-completed.md` hoặc giữ làm reference (user quyết).

---

## 8. Phụ lục — Test catalog tóm tắt

| Module | Unit tests target | Critical scenarios |
|---|---|---|
| `cfLogParser` | 14 | raw, prefix-fail, JSON-info, severity-uppercase, err-cause-nested, stack, CELL, APP/TASK, truncate, JSON-array, body-empty, ERR-stream-non-json, vcap-rtr, time-mismatch |
| `cfRunner` | 6 | success, timeout, abort, ENOENT, exit-code-non-zero, stream-line-split |
| `cfBinary` | 5 | setting override, win where, mac shell-which, linux which, not found |
| `cfApi` | 8 | detectVersion, setApi, authenticate-ok, authenticate-fail, listOrgs, listSpaces, target, listApps |
| `cfLogStream` | 5 | start-stop, batch-flush-100ms, batch-flush-50, crash-detect, dispose-during-stream |
| `credentialsStore` | 5 | read-empty, write-read, clear, mask, schema-version |
| `envCredentials` | 3 | both-set, only-email, neither |
| `redact` | 4 | password-in-text, multiple-secrets, empty-secret, no-replacement |
| `validation` | 6 | isRecord, isNonEmptyString, isStringArray, isLevelString, isSourceString, isWebviewToHostMessage |
| `webviewProtocol` | 12 | mỗi message type 1 happy + 1 sad |
| `sessionStore` | 4 | read-empty, write-partial, write-full, clear |
| **Total** | **72** | (vượt target 30) |

| E2E suite | Tests | Theme |
|---|---|---|
| `region-selector.e2e.spec.ts` (existing) | 6 | dark/light/HC |
| `cf-logs.e2e.spec.ts` (new) | 15 (14 ở dark + 1 smoke ở light + 1 smoke ở HC) | mostly dark |

---

## 9. Phụ lục — Map prototype DOM action ↔ webview message ↔ host handler

| `data-action` | Message gửi từ webview | Host handler |
|---|---|---|
| `submit-credentials` | `sapTools.saveCredentials` | `credentialsStore.write` (nếu persist) → `cfApi.setApi` → `cfApi.authenticate` → `requestOrgs` |
| `use-env-credentials` | `sapTools.useEnvCredentials` | đọc `process.env`, `cfApi.setApi`, `cfApi.authenticate` |
| `clear-credentials` | `sapTools.clearCredentials` | `credentialsStore.clear` |
| `edit-credentials` | `sapTools.editCredentials` (force show form) | local UI state, không gửi message |
| `select-org` (button) | `sapTools.requestSpaces({orgName})` | `cfApi.listSpaces` |
| `select-space` + `confirm-space` | `sapTools.confirmSpace({orgName,spaceName})` + `sapTools.requestApps` | `cfApi.target` + `cfApi.listApps` |
| `select-app` | `sapTools.startLogStream({appName,mode:'recent'})` | `cfLogStream.start` |
| `start-stream` | `sapTools.startLogStream({appName,mode:'live'})` | `cfLogStream.start` (live) |
| `pause-stream` | (local only, không kill cf) | n/a |
| `stop-stream` | `sapTools.stopLogStream` | `cfLogStream.stop` |
| `clear-buffer` | (local) | n/a |
| `export-jsonl` | `sapTools.exportLogs({format:'jsonl', entries: filtered})` | `vscode.window.showSaveDialog` + `fs.write` |
| `copy-json` / `copy-raw` | `sapTools.copyToClipboard({text})` (fallback nếu navigator.clipboard fail) | `vscode.env.clipboard.writeText` |
| `toggle-level` / `toggle-source` / `set-range` / `toggle-regex-search` | (local) | n/a |

---

## 10. Tổng kết workflow

```
[1] Update prototype (signin slot + pro logs UI mock + JSDoc types)
       │
       ▼
[2] MCP Playwright kiểm tra (20 bước, fix loop nếu fail)
       │
       ▼
[3] Code extension TS:
    ├─ credentials/ + secrets/
    ├─ cf/cfBinary + cfRunner
    ├─ cf/cfApi + cfLogParser
    ├─ cf/cfLogStream + state/
    └─ messaging/ + extension.ts + sidebarProvider.ts
       │
       ▼
[4] Self code review (D1–D5 checklist)
       │
       ▼
[5] Tạo cf stub + 15 e2e test mới + sửa launchVscode
       │
       ▼
[6] Run e2e + phân tích trace/screenshot/video (fix loop nếu fail)
       │
       ▼
[7] npm run validate (typecheck + lint + cspell + vitest + e2e validate)
       │
       ▼
[8] npm --prefix e2e test (full suite, 1 worker)
       │
       ▼
[9] Clean dist (rm -rf), npm run build, verify size < 5MB, delete dist/quickPickItems.js
       │
       ▼
[10] Bump 0.1.15 → 0.2.0, CHANGELOG, README, memory
       │
       ▼
[11] 7 commit nhỏ (husky pre-commit chạy validate mỗi commit)
       │
       ▼
[12] Push (no-force) + xác nhận CI workflow xanh
```

---

_End of plan v2._
