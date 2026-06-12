# SAP Tools Prototypes

This directory contains static HTML/JS prototypes for the SAP Tools VS Code Extension UI.

## Quick Start

1. Start a local HTTP server in this directory. If you are at the project root, run:
   ```bash
   npm run prototype:serve
   ```
   Or manually:
   ```bash
   python3 -m http.server 4173 --bind 0.0.0.0 --directory docs/designs/prototypes
   ```

2. Open the prototype in your browser:
   - **Main UI (Login Gate)**: [http://127.0.0.1:4173/index.html](http://127.0.0.1:4173/index.html)
   - **Direct link to APIs Explorer (Bypass login)**: [http://127.0.0.1:4173/index.html#prototype-apis](http://127.0.0.1:4173/index.html#prototype-apis)
