const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <link rel="stylesheet" href="file://${path.resolve('../docs/designs/prototypes/assets/prototype.css')}">
        <style>
            :root {
                --vscode-foreground: #3b3b3b;
                --vscode-sideBar-background: #f3f3f3;
                --vscode-sideBar-foreground: #3b3b3b;
                --vscode-list-hoverBackground: #e8e8e8;
                --vscode-list-activeSelectionBackground: #e4e6f1; /* Light theme active selection */
                /* Notice we omit activeSelectionForeground to simulate light themes that inherit black text! */
            }
        </style>
    </head>
    <body class="vscode-light" style="background-color: white;">
        <aside class="api-webview-sidebar" style="width: 250px; background-color: var(--vscode-sideBar-background); display: flex; flex-direction: column;">
            <div class="api-entities-list-container" style="padding: 10px; display: flex; flex-direction: column; flex: 1; color: var(--vscode-foreground);">
                <button type="button" class="api-entity-item is-active" data-action="api-select-entity" data-entity-name="CatalogService.Authors">
                    <span class="entity-icon" aria-hidden="true">&#128196;</span>
                    <span class="entity-name" title="CatalogService.Authors" style="display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; word-break: break-word; white-space: normal; line-height: 1.2;">CatalogService.Authors (ACTIVE ITEM)</span>
                </button>
            </div>
        </aside>
    </body>
    </html>
  `;
  const htmlPath = path.resolve('test-light2.html');
  fs.writeFileSync(htmlPath, htmlContent);
  
  await page.goto(`file://${htmlPath}`);
  await page.waitForTimeout(500);
  await page.screenshot({ path: '../screenshot-light2.png' });
  await browser.close();
  console.log('Screenshot saved to screenshot-light2.png');
})();
