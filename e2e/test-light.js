const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  // Create an HTML file that renders the UI with light theme
  const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <link rel="stylesheet" href="file://${path.resolve('../docs/designs/prototypes/assets/prototype.css')}">
        <style>
            :root {
                --vscode-foreground: #333333;
                --vscode-sideBar-background: #f3f3f3;
                --vscode-sideBar-foreground: #616161;
                --vscode-list-hoverBackground: #e8e8e8;
                --vscode-list-activeSelectionBackground: #007acc;
                --vscode-list-activeSelectionForeground: #ffffff;
                --vscode-badge-background: #c4c4c4;
                --vscode-badge-foreground: #333333;
            }
        </style>
    </head>
    <body class="vscode-light" style="background-color: white;">
        <aside class="api-webview-sidebar" style="width: 250px; background-color: var(--vscode-sideBar-background); display: flex; flex-direction: column;">
            <div style="padding: 12px 0 0 0; background: var(--vscode-sideBar-background); z-index: 10;">
                <div class="api-entities-list-title" style="margin-bottom: 8px; padding: 0 12px; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; opacity: 1; color: var(--vscode-sideBarTitle-foreground, var(--vscode-foreground));">Endpoints (2)</div>
            </div>
            <div class="api-entities-list-container" style="padding: 0; display: flex; flex-direction: column; flex: 1; color: var(--vscode-foreground);">
                <button type="button" class="api-entity-item" data-action="api-select-entity" data-entity-name="CatalogService.Books">
                    <span class="entity-icon" aria-hidden="true">&#128196;</span>
                    <span class="entity-name" title="CatalogService.Books" style="display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; word-break: break-word; white-space: normal; line-height: 1.2;">CatalogService.Books</span>
                    <span class="entity-count-badge">5</span>
                </button>
                <button type="button" class="api-entity-item is-active" data-action="api-select-entity" data-entity-name="CatalogService.Authors">
                    <span class="entity-icon" aria-hidden="true">&#128196;</span>
                    <span class="entity-name" title="CatalogService.Authors" style="display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; word-break: break-word; white-space: normal; line-height: 1.2;">CatalogService.Authors</span>
                    <span class="entity-count-badge">3</span>
                </button>
            </div>
        </aside>
    </body>
    </html>
  `;
  const htmlPath = path.resolve('test-light.html');
  fs.writeFileSync(htmlPath, htmlContent);
  
  await page.goto(`file://${htmlPath}`);
  
  // Wait a bit
  await page.waitForTimeout(500);
  
  // Take screenshot
  await page.screenshot({ path: '../screenshot-light.png' });
  
  await browser.close();
  console.log('Screenshot saved');
})();
