# SAP Tools VS Code Extension

SAP Tools is a VS Code extension focused on SAP BTP workflow helpers.

## Current Feature
- Activity Bar container: `SAP Tools`
- Sidebar view title: `Select SAP BTP Region`
- Interactive sidebar webview UI matching the latest prototype design
- Progressive flow: `Choose Area` -> `Choose Region` -> `Choose Organization` -> `Choose Space`
- Single-selection behavior per step with `Change` actions for reset
- Selected region is logged to the `SAP Tools` output channel

## Development
```bash
npm install
npm run build
npm run validate
npm run test:unit
```

To debug the extension, press `F5` in VS Code.
