import { test, expect } from '@playwright/test';

test.describe('APIs Explorer Workspace Flow', () => {
  test('User can open APIs Explorer tab and view workspace panel', async ({ page }) => {
    await page.goto('http://127.0.0.1:4173/index.html');
    
    const frameElement = await page.waitForSelector('#prototype-frame');
    const frame = await frameElement.contentFrame();
    if (frame === null) {
      throw new Error('No frame');
    }
    
    await frame.fill('#sap-email', 'test@demo.com');
    await frame.fill('#sap-password', 'testPassword');
    await frame.click('#submit-login-gate');
    
    // Select org in quick selection stage
    const orgButton = frame.locator('button[data-topology-org="core-platform-prod"]').first();
    await orgButton.click();
    
    // Select the space
    const spaceButton = frame.locator('button[data-quick-space="prod"]');
    await spaceButton.click();
    
    // Click Confirm Scope
    const confirmButton = frame.getByRole('button', { name: 'Confirm Scope' });
    await confirmButton.click();

    // Wait for the workspace tabs to load
    await expect(frame.locator('.workspace-tabs')).toBeVisible();
    
    // Click the Logs/APIs tab button
    const logsTabButton = frame.getByRole('tab', { name: 'Logs/APIs' });
    await logsTabButton.click();
    
    // Assert that the app logs panel is visible
    await expect(frame.locator('.app-logs-panel')).toBeVisible();
  });

  test('User can open APIs webview from Logs/APIs tab', async ({ page }) => {
    await page.goto('http://127.0.0.1:4173/index.html');
    
    const frameElement = await page.waitForSelector('#prototype-frame');
    const frame = await frameElement.contentFrame();
    if (frame === null) {
      throw new Error('No frame');
    }
    
    await frame.fill('#sap-email', 'test@demo.com');
    await frame.fill('#sap-password', 'testPassword');
    await frame.click('#submit-login-gate');
    
    const orgButton = frame.locator('button[data-topology-org="core-platform-prod"]').first();
    await orgButton.click();
    
    const spaceButton = frame.locator('button[data-quick-space="prod"]');
    await spaceButton.click();
    
    const confirmButton = frame.getByRole('button', { name: 'Confirm Scope' });
    await confirmButton.click();

    await expect(frame.locator('.workspace-tabs')).toBeVisible();
    
    const logsTabButton = frame.getByRole('tab', { name: 'Logs/APIs' });
    await logsTabButton.click();
    
    await expect(frame.locator('.app-logs-panel')).toBeVisible();
    
    // 5. Hover over the 'demo-app' row
    const appItem = frame.locator('.app-log-item').filter({ hasText: 'demo-app' });
    await appItem.hover();
    
    const apisButton = appItem.getByRole('button', { name: 'APIs' });
    await expect(apisButton).toBeVisible();
    await apisButton.click();

    // Screenshot here
    await page.screenshot({ path: 'test-results/debug-0.png' });

    // Verify center Webview
    const centerIframeElement = await page.waitForSelector('.editor-surface iframe.center-panel-frame');
    const centerIframe = await centerIframeElement.contentFrame();
    if (centerIframe === null) throw new Error('No center iframe');

    // Screenshot here
    await page.screenshot({ path: 'test-results/debug-1.png' });

    // Verify webview loaded and sidebar exists
    await expect(centerIframe.locator('.api-webview-sidebar')).toBeVisible();
    await expect(centerIframe.locator('.api-workbench-panel')).toBeVisible();
    await expect(centerIframe.locator('.api-entity-item', { hasText: 'Users' })).toBeVisible();
    await centerIframe.locator('.api-entity-item', { hasText: 'Users' }).click();
    await expect(centerIframe.getByRole('button', { name: 'Execute GET' })).toBeVisible();
  });
});
