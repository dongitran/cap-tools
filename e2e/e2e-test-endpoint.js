const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  // Go directly to the apis prototype page
  await page.goto('http://127.0.0.1:4173/variants/apis.html');
  
  // Inject light theme class
  await page.evaluate(() => {
    document.body.className = 'vscode-light prototype-page';
  });
  
  // Wait for endpoints to load
  await page.waitForSelector('.api-entity-item', { state: 'visible' });
  
  // Take screenshot of the sidebar
  const sidebar = await page.$('.api-webview-sidebar');
  await sidebar.screenshot({ path: '../screenshot_endpoints_light.png' });
  
  await browser.close();
  console.log('Screenshot saved to screenshot_endpoints_light.png');
})();
