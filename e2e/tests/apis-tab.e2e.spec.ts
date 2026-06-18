import { test, expect, Frame } from '@playwright/test';
import {
  cleanupExtensionHost,
  clickWithFallback,
  ExtensionHostSession,
  launchExtensionHost,
  openSapToolsSidebar,
  selectDefaultScope,
} from './support/sapToolsHarness';

async function openConfirmedWorkspace(): Promise<{ session: ExtensionHostSession; webviewFrame: Frame }> {
  const session = await launchExtensionHost();
  const webviewFrame = await openSapToolsSidebar(session.window);
  await selectDefaultScope(webviewFrame);
  await clickWithFallback(
    webviewFrame.getByRole('button', { name: 'Confirm Scope' })
  );
  await expect(
    webviewFrame.getByRole('heading', { name: 'BTP Workspace' })
  ).toBeVisible();
  return { session, webviewFrame };
}

test.describe('APIs Explorer Workspace Flow', () => {
  test('User can open APIs webview from Log-API-Event tab', async () => {
    const { session, webviewFrame } = await openConfirmedWorkspace();

    try {
      // Click the Log-API-Event tab button
      await clickWithFallback(webviewFrame.getByRole('tab', { name: 'Log-API-Event' }));
      
      // Assert that the app logs panel is visible
      await expect(webviewFrame.locator('.app-logs-panel')).toBeVisible();

      // Find the first app that has an APIs button
      const appItem = webviewFrame.locator('.app-log-item').first();
      await expect(appItem).toBeVisible();

      // Hover over the app item to reveal the APIs button
      await appItem.hover();

      // Click APIs button
      const apisButton = appItem.getByRole('button', { name: 'APIs' });
      await expect(apisButton).toBeVisible();
      await clickWithFallback(apisButton);

      // Wait for the new Webview Panel to open by polling frames
      let centerWebviewFrame: Frame | null = null;
      await expect.poll(async () => {
        const candidateFrames = session.window.frames().filter((f) => f.url().includes('vscode-webview://'));
        for (const f of [...candidateFrames].reverse()) {
          if (await f.getByText('Endpoints', { exact: false }).isVisible().catch(() => false)) {
            centerWebviewFrame = f;
            return true;
          }
        }
        return false;
      }, { timeout: 20000 }).toBe(true);

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (centerWebviewFrame === null) {
        throw new Error('Could not find centerWebviewFrame');
      }
      const frame = centerWebviewFrame as Frame;

      // Verify the sidebar exists inside the new APIs webview panel
      const apiSidebar = frame.locator('.api-webview-sidebar');
      await expect(apiSidebar).toBeVisible();

      // Search for an endpoint
      const searchInput = frame.locator('input[data-action="api-search-entity"]');
      await searchInput.fill('pro');

      // Click on "Products" in the sidebar
      const productItem = frame.locator('button[data-entity-name="Products"]');
      await expect(productItem).toBeVisible();
      await clickWithFallback(productItem);

      // Verify URL bar updates
      const urlBar = frame.locator('input.api-url-input');
      await expect(urlBar).toBeVisible();
      await expect(urlBar).toHaveValue(/products/i);

      // Execute GET request
      const executeBtn = frame.getByRole('button', { name: 'Execute' });
      await expect(executeBtn).toBeVisible();
      await clickWithFallback(executeBtn);

      // Wait for the status badge
      const statusBadge = frame.locator('.api-status-badge');
      await expect(statusBadge).toBeVisible({ timeout: 15000 });

      // The status will likely be an Error since the test environment URL is a mock route
      // that cannot be fetched by the VS Code backend, or 404/500 if it hits a real dead end.
      // We just want to verify the round-trip execution completed and rendered a result.
      const statusText = await statusBadge.textContent();
      expect(statusText).toBeTruthy();

      // Verify JSON View is rendered with Event Mesh-style transparent token highlighting.
      const jsonView = frame.getByLabel('API JSON response');
      await expect(jsonView).toBeVisible();
      const styleSnapshot = await jsonView.evaluate((payload) => {
        const token = (className: string): HTMLElement | null =>
          payload.querySelector(`.${className}`);
        const styleFor = (element: HTMLElement | null): { color: string | null; background: string | null } => {
          if (element === null) return { color: null, background: null };
          const style = getComputedStyle(element);
          return { color: style.color, background: style.backgroundColor };
        };
        const payloadStyle = getComputedStyle(payload);
        const wrapper = payload.closest('.api-view-content');
        return {
          payloadBackground: payloadStyle.backgroundColor,
          wrapperBackground: wrapper instanceof HTMLElement ? getComputedStyle(wrapper).backgroundColor : null,
          codeCount: payload.querySelectorAll('code').length,
          tokenCount: payload.querySelectorAll('.api-json-token').length,
          key: styleFor(token('api-json-key')),
          string: styleFor(token('api-json-string')),
          punctuation: styleFor(token('api-json-punctuation')),
        };
      });

      expect(styleSnapshot.payloadBackground).toBe('rgba(0, 0, 0, 0)');
      expect(styleSnapshot.wrapperBackground).toBe('rgba(0, 0, 0, 0)');
      expect(styleSnapshot.codeCount).toBe(0);
      expect(styleSnapshot.tokenCount).toBeGreaterThan(0);
      expect(styleSnapshot.key.background).toBe('rgba(0, 0, 0, 0)');
      expect(styleSnapshot.string.background).toBe('rgba(0, 0, 0, 0)');
      expect(styleSnapshot.punctuation.background).toBe('rgba(0, 0, 0, 0)');
      expect(new Set([styleSnapshot.key.color, styleSnapshot.string.color, styleSnapshot.punctuation.color]).size).toBe(3);

      await frame.locator('body').screenshot({ path: 'test-results/debug-apis-panel.png' });
      await jsonView.screenshot({ path: 'test-results/api-json-highlight-vscode.png' });
    } finally {
      await cleanupExtensionHost(session);
    }
  });

  test('User can open Event viewer from Log-API-Event tab', async () => {
    const { session, webviewFrame } = await openConfirmedWorkspace();

    try {
      await clickWithFallback(webviewFrame.getByRole('tab', { name: 'Log-API-Event' }));
      await expect(webviewFrame.locator('.app-logs-panel')).toBeVisible();

      const appItem = webviewFrame.locator('.app-log-item').first();
      await expect(appItem).toBeVisible();
      await appItem.hover();

      await expect(appItem.getByText('Ready', { exact: true })).toHaveCount(0);
      await expect(appItem.getByRole('button', { name: 'APIs' })).toBeVisible();
      const eventButton = appItem.getByRole('button', { name: 'Event' });
      await expect(eventButton).toBeVisible();
      await clickWithFallback(eventButton);

      let eventFrame: Frame | null = null;
      await expect.poll(async () => {
        const candidateFrames = session.window.frames().filter((f) => f.url().includes('vscode-webview://'));
        for (const f of [...candidateFrames].reverse()) {
          if (await f.getByText('Event Mesh', { exact: true }).isVisible().catch(() => false)) {
            eventFrame = f;
            return true;
          }
        }
        return false;
      }, { timeout: 20000 }).toBe(true);

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (eventFrame === null) {
        throw new Error('Could not find Event viewer frame');
      }
      const frame = eventFrame as Frame;

      await expect(frame.getByRole('tab', { name: 'Subscribe Simple' })).toHaveAttribute(
        'aria-selected',
        'true'
      );
      await expect(frame.getByText('Client Binding Groups')).toBeVisible();
      await clickWithFallback(frame.getByRole('button', { name: /Start Listening To/i }));
      await expect(frame.getByLabel('Event Mesh results').getByText('Listening', { exact: true })).toBeVisible();
      await expect(frame.getByText('demo/service/app/items/created')).toBeVisible();
      await clickWithFallback(frame.getByRole('button', { name: /#1/i }));

      const jsonPayload = frame.getByLabel('Received JSON payload').first();
      await expect(jsonPayload).toBeVisible();
      const styleSnapshot = await jsonPayload.evaluate((payload) => {
        const token = (className: string): HTMLElement | null =>
          payload.querySelector(`.${className}`);
        const styleFor = (element: HTMLElement | null): { color: string | null; background: string | null } => {
          if (element === null) return { color: null, background: null };
          const style = getComputedStyle(element);
          return { color: style.color, background: style.backgroundColor };
        };
        const payloadStyle = getComputedStyle(payload);
        return {
          payloadBackground: payloadStyle.backgroundColor,
          codeCount: payload.querySelectorAll('code').length,
          tokenCount: payload.querySelectorAll('.event-json-token').length,
          key: styleFor(token('event-json-key')),
          string: styleFor(token('event-json-string')),
          punctuation: styleFor(token('event-json-punctuation')),
        };
      });

      expect(styleSnapshot.payloadBackground).toBe('rgba(0, 0, 0, 0)');
      expect(styleSnapshot.codeCount).toBe(0);
      expect(styleSnapshot.tokenCount).toBeGreaterThan(0);
      expect(styleSnapshot.key.background).toBe('rgba(0, 0, 0, 0)');
      expect(styleSnapshot.string.background).toBe('rgba(0, 0, 0, 0)');
      expect(styleSnapshot.punctuation.background).toBe('rgba(0, 0, 0, 0)');
      expect(new Set([styleSnapshot.key.color, styleSnapshot.string.color, styleSnapshot.punctuation.color]).size).toBe(3);
      await frame.getByLabel('Event Mesh results').screenshot({
        path: 'test-results/event-json-highlight-vscode.png',
      });
    } finally {
      await cleanupExtensionHost(session);
    }
  });
});
