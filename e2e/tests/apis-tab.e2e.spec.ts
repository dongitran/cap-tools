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
    // Navigate directly to design.html (mirroring VS Code webview environment)
    await page.goto('http://127.0.0.1:4173/variants/design.html');
    
    // In design.html, there is no iframe wrapping it. The content is directly in the page.
    const orgButton = page.locator('button[data-topology-org="core-platform-prod"]').first();
    await expect(orgButton).toBeVisible();
    await orgButton.click();
    
    const spaceButton = page.locator('button[data-quick-space="prod"]');
    await expect(spaceButton).toBeVisible();
    await spaceButton.click();
    
    const confirmButton = page.getByRole('button', { name: 'Confirm Scope' });
    await expect(confirmButton).toBeVisible();
    await confirmButton.click();

    await expect(page.locator('.workspace-tabs')).toBeVisible();
    
    const logsTabButton = page.getByRole('tab', { name: 'Logs/APIs' });
    await logsTabButton.click();
    
    await expect(page.locator('.app-logs-panel')).toBeVisible();
    
    // Hover over the 'demo-app' row
    const appItem = page.locator('.app-log-item').filter({ hasText: 'demo-app' });
    await appItem.hover();
    
    const apisButton = appItem.getByRole('button', { name: 'APIs' });
    await expect(apisButton).toBeVisible();
    await apisButton.click();

    // Verify APIs Workspace is rendered (This will fail because clicking the button does nothing)
    const apisWorkspace = page.locator('.apis-workspace-container');
    await expect(apisWorkspace).toBeVisible({ timeout: 2000 });
    
    // Verify webview loaded and sidebar exists inside the new APIs tab
    const centerIframeElement = await page.waitForSelector('.apis-workspace-container iframe');
    const centerIframe = await centerIframeElement.contentFrame();
    if (centerIframe === null) throw new Error('No center iframe');

    // Search for an endpoint
    const searchInput = centerIframe.locator('input[data-action="api-search-entity"]');
    await searchInput.fill('pro');
    
    // Users should be hidden, Products should be visible
    await expect(centerIframe.locator('.api-entity-item', { hasText: 'Users' })).not.toBeVisible();
    const productsEntity = centerIframe.locator('.api-entity-item', { hasText: 'Products' });
    await expect(productsEntity).toBeVisible();
    
    // Select Products
    await productsEntity.click();
    
    // Modify OData Parameter
    const topParamInput = centerIframe.locator('input[data-param-name="$top"]');
    await topParamInput.fill('10');
    
    // Verify URL updates
    const urlInput = centerIframe.locator('.api-url-input[readonly]');
    await expect(urlInput).toHaveValue(/\$top=10/);
    
    // Execute Request
    const executeBtn = centerIframe.getByRole('button', { name: 'Execute GET' });
    await executeBtn.click();
    
    // Wait for the status badge
    const statusBadge = centerIframe.locator('.api-status-badge');
    await expect(statusBadge).toBeVisible({ timeout: 2000 });
    await expect(statusBadge).toHaveText(/200 OK/);
    
    // Verify JSON View contains mock data
    const jsonView = centerIframe.locator('.api-raw-json');
    await expect(jsonView).toBeVisible();
    await expect(jsonView).toContainText('Laptop');

    // Switch to Grid Data View
    const gridTabBtn = centerIframe.getByRole('button', { name: 'Grid Data' });
    await gridTabBtn.click();
    
    // Verify Grid Table
    const gridTable = centerIframe.locator('.api-grid-table');
    await expect(gridTable).toBeVisible();
    await expect(gridTable).toContainText('title');
    await expect(gridTable).toContainText('price');
    await expect(gridTable).toContainText('Laptop');
    await expect(gridTable).toContainText('999');
  });
});
