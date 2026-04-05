<div align="center">

<img src="resources/icon.png" width="128" alt="CAP Tools logo" />

# CAP Tools

**The all-in-one VSCode extension for SAP BTP, CAP/CDS, Cloud Foundry & HANA development**

[![CI](https://github.com/dongitran/cap-tools/actions/workflows/ci.yml/badge.svg)](https://github.com/dongitran/cap-tools/actions/workflows/ci.yml)
[![VS Marketplace](https://img.shields.io/visual-studio-marketplace/v/dongtran.sap-dev-suite?label=VS%20Marketplace&logo=visual-studio-code)](https://marketplace.visualstudio.com/items?itemName=dongtran.sap-dev-suite)
[![Downloads](https://img.shields.io/visual-studio-marketplace/d/dongtran.sap-dev-suite)](https://marketplace.visualstudio.com/items?itemName=dongtran.sap-dev-suite)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

[**Install from Marketplace**](https://marketplace.visualstudio.com/items?itemName=dongtran.sap-dev-suite) · [Report Bug](https://github.com/dongitran/cap-tools/issues) · [Request Feature](https://github.com/dongitran/cap-tools/issues)

</div>

---

## Why CAP Tools?

Working with SAP BTP, CAP/CDS and Cloud Foundry involves a lot of repetitive terminal work — logging in, switching orgs, copy-pasting HANA credentials, setting up debug tunnels for each microservice. **CAP Tools** replaces all of that with a clean VSCode sidebar.

| Before | After |
|--------|-------|
| `cf login` → `cf target` → `cf env my-app` → copy JSON → edit settings.json | **One click** in the Credentials tab |
| `cds debug app-a &` → `cds debug app-b &` → edit launch.json × N | **Multi-select** in the Debug tab → sessions start automatically |
| Manually refresh to know which apps are running | **Live CF Explorer** in your Activity Bar |

---

## Features

### 🐛 Multi-App Debug Launcher
Debug multiple CAP services simultaneously with zero configuration.

- Select any number of started apps from the list
- Extension allocates ports, writes `launch.json`, starts `cds debug` tunnels
- VSCode debugger auto-attaches — no manual steps
- Live session status: `TUNNELING → ATTACHING → ATTACHED`
- Stop individual sessions or kill all at once

### 🔑 HANA Credential Extractor
Extract HANA credentials from `cf env` and deliver them where you need them.

- Browse spaces and apps within your org
- Extract from multiple apps in one shot
- **Three output modes:**
  - Write directly to `.vscode/settings.json` (SQLTools-ready)
  - Download as `hana-credentials.json`
  - Copy to clipboard

### 🌲 CF Explorer (Tree View)
Browse your Cloud Foundry landscape from the Activity Bar.

- Hierarchy: Org → Space → App
- Started apps shown in green, stopped apps dimmed
- Right-click context menu: Debug, Extract Credentials, Open URL, View Environment, Copy Name

### ⚙ Settings & Cache Sync
- Background cache sync across all CF regions (configurable interval)
- Auto-reads `SAP_EMAIL` / `SAP_PASSWORD` from your shell environment
- Persistent org ↔ local folder mappings across restarts
- 17 built-in CF regions + custom endpoint support

---

## Installation

**From VS Marketplace** *(recommended)*
```
ext install dongtran.sap-dev-suite
```

**From VSIX**
```bash
code --install-extension sap-dev-suite-<version>.vsix
```

### Prerequisites

| Tool | Required | Purpose |
|------|----------|---------|
| [CF CLI](https://docs.cloudfoundry.org/cf-cli/install-go-cli.html) | ✅ | Interact with Cloud Foundry |
| [@sap/cds-dk](https://cap.cloud.sap/docs/get-started/) | ✅ For debug | `cds debug` command |
| [SQLTools](https://marketplace.visualstudio.com/items?itemName=mtxr.sqltools) | Optional | Credential auto-sync |

### Shell Environment

Set your SAP credentials in your shell profile (`.zshrc`, `.bashrc`, etc.):

```bash
export SAP_EMAIL="your.email@company.com"
export SAP_PASSWORD="your-password"
```

CAP Tools reads these automatically — no prompts, no copy-pasting.

---

## Quick Start

1. Click the **CAP Tools icon** in the Activity Bar (hexagon ⚡)
2. Select your **CF region** and click **Connect**
3. Pick your **organization** from the list
4. Browse to your **local project folder** (used for debug file mapping)
5. You're in the **Dashboard** — switch between Debug / Credentials / Settings tabs

### Debug: launch all services in 30 seconds

```
Dashboard → Debug tab → check apps → ▶ Start Debug Sessions
```

### Extract HANA credentials

```
Dashboard → Credentials tab → select space → select apps → Extract
```

---

## Extension Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `sapDevSuite.defaultRegion` | `ap11` | Default CF region on startup |
| `sapDevSuite.cacheSyncInterval` | `240` | Background sync interval (minutes) |
| `sapDevSuite.autoSync` | `true` | Auto-sync cache on startup |
| `sapDevSuite.sqlToolsIntegration` | `true` | Write credentials to SQLTools settings |
| `sapDevSuite.debugBasePort` | `9229` | Starting port for debug sessions |
| `sapDevSuite.explorerDepth` | `6` | Max folder depth when scanning for local apps |

---

## Architecture

```
src/
├── extension.ts              # Entry point & message router
├── types/index.ts            # All shared TypeScript types
├── core/
│   ├── cfClient.ts           # CF CLI wrapper
│   ├── cacheManager.ts       # VSCode globalState cache with TTL
│   ├── processManager.ts     # cds debug process lifecycle
│   ├── shellEnv.ts           # Read SAP_EMAIL/SAP_PASSWORD from shell
│   └── regionList.ts         # 17 built-in CF regions
├── features/
│   ├── debug/                # Multi-app debug orchestration
│   ├── credentials/          # HANA credential extraction & delivery
│   └── explorer/             # CF TreeView provider
└── webview/
    ├── mainPanel.ts          # WebviewView provider (state machine)
    ├── mainRenderers.ts      # HTML renderers (XSS-safe via esc())
    └── mainScript.ts         # Client-side JS (event delegation)
```

**Security**: All CF-sourced data (org names, app names, URLs) is HTML-escaped before rendering. Inline event handlers are avoided in favor of data attributes + event delegation. Content Security Policy is enforced on all webview content.

---

## Contributing

```bash
git clone https://github.com/dongitran/cap-tools.git
cd cap-tools
pnpm install

pnpm watch          # build in watch mode
pnpm typecheck      # type check
pnpm lint           # ESLint
pnpm test           # unit tests (vitest)
```

Press `F5` in VSCode to launch the Extension Development Host.

### CI/CD

Every pull request runs:
- Type check (`tsc --noEmit`)
- Lint (`eslint`)
- Unit tests with coverage
- Production build + bundle size check (<5 MB)
- VSIX packaging

Releases are triggered by pushing a version tag (`v*.*.*`) and automatically publish to the VS Marketplace.

---

## License

MIT © [dongitran](https://github.com/dongitran)
