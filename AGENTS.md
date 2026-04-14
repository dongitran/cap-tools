# AGENTS.md

## Mandatory Order
1. If there is any UI/UX change, update prototype files in `docs/designs/prototypes/` first.
2. Verify prototype with MCP Playwright.
3. Only after prototype is correct, start TDD and implement extension code.

## Prototype Server (Quick Start)
- Start: `python3 -m http.server 4173 --bind 0.0.0.0 --directory docs/designs/prototypes`
- Open: `http://127.0.0.1:4173/index.html`

## MCP Troubleshooting (Short)
- If `ERR_CONNECTION_REFUSED`: check server first  
  `lsof -i :4173 -sTCP:LISTEN -n -P` and `curl -I http://127.0.0.1:4173/index.html`
- If server dies after background start: run server in a long-lived terminal session.
- If MCP is unstable/crashed: restart Codex/MCP session, then retry with local index URL.

## Mandatory TDD
1. Add or update tests first.
2. Run tests and confirm failing case.
3. Implement code change.
4. Re-run tests and confirm pass.
5. Run full validation before commit.

## Required Validation
- `npm run validate:root`
- `npm --prefix e2e run validate`
- `npm --prefix e2e test`
