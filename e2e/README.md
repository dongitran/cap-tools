# E2E - Playwright Project

This folder is an isolated Playwright project for testing the SAP Tools VS Code extension.

## Covered flow
- Open VS Code Extension Development Host
- Open `SAP Tools` activity bar container
- Select area and region from the sidebar webview UI
- Verify selection log text is shown in VS Code output context

## Run
```bash
cd e2e
npm install
npm run validate
npm test
```

## VS Code executable path
If auto-detection fails, set:

```bash
export VSCODE_EXECUTABLE_PATH="/Applications/Visual Studio Code.app/Contents/MacOS/Electron"
```
