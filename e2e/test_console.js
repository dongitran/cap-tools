const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
  page.on('pageerror', err => console.log('BROWSER ERROR:', err.message));

  console.log('Navigating...');
  await page.goto('http://127.0.0.1:4173/index.html');
  await page.evaluate(() => console.log('HELLO FROM BROWSER!'));
  
  // Wait for iframe
  const frameElement = await page.waitForSelector('#prototype-frame');
  const frame = await frameElement.contentFrame();
  
  console.log('Entering login-gate...');
  await frame.waitForSelector('#sap-email');
  await frame.fill('#sap-email', 'test@demo.com');
  await frame.fill('#sap-password', 'testPassword');
  await frame.click('#submit-login-gate');
  
  console.log('Logged in. Waiting for quick selection...');
  
  console.log('Selecting org and space...');
  const orgButton = await frame.locator('button[data-topology-org="demo-org-prod"]').first();
  await orgButton.click();
  const spaceButton = await frame.locator('button[data-quick-space="prod"]');
  await spaceButton.click();
  const confirmButton = await frame.locator('button:has-text("Confirm Scope")');
  await confirmButton.click();
  
  console.log('Waiting for workspace tabs...');
  await frame.waitForSelector('.workspace-tabs');
  
  console.log('Clicking Log-API-Event tab...');
  const logsTabButton = await frame.locator('button[role="tab"]:has-text("Log-API-Event")');
  await logsTabButton.click();
  
  console.log('Hovering over app and clicking APIs...');
  const appItem = await frame.locator('.app-log-item').filter({ hasText: 'demo-app' });
  await appItem.hover();
  const apisButton = await appItem.locator('button:has-text("APIs")');
  await apisButton.click();
  
  console.log('Waiting 2 seconds to see console output...');
  await page.waitForTimeout(2000);
  
  await browser.close();
  console.log('Done!');
})().catch(err => {
  console.error('TEST ERROR:', err);
  process.exit(1);
});
