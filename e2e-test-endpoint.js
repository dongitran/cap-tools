const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  // Go to prototype server
  await page.goto('http://127.0.0.1:4173/index.html');
  
  // Inject light theme class
  await page.evaluate(() => {
    document.body.className = 'vscode-light prototype-page';
  });
  
  // Wait for APIs tab and click
  await page.waitForSelector('[data-tab="apis"]', { state: 'visible' });
  await page.click('[data-tab="apis"]');
  
  // Wait for endpoints to load
  await page.waitForSelector('.api-entity-item', { state: 'visible' });
  
  // Take screenshot of the sidebar
  const sidebar = await page.$('.api-webview-sidebar');
  await sidebar.screenshot({ path: 'endpoint-sidebar-light.png' });
  
  await browser.close();
  console.log('Screenshot saved to endpoint-sidebar-light.png');
})();
