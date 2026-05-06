import { test, expect, type Frame } from '@playwright/test';

import {
  cleanupExtensionHost,
  clickWithFallback,
  launchExtensionHost,
  openSapToolsSidebar,
  selectDefaultScope,
} from './support/sapToolsHarness';

async function openConfirmedWorkspace(): Promise<{
  readonly session: Awaited<ReturnType<typeof launchExtensionHost>>;
  readonly webviewFrame: Frame;
}> {
  const session = await launchExtensionHost();
  const webviewFrame = await openSapToolsSidebar(session.window);
  await selectDefaultScope(webviewFrame);
  await clickWithFallback(
    webviewFrame.getByRole('button', { name: 'Confirm Scope' })
  );
  await expect(
    webviewFrame.getByRole('heading', { name: 'Monitoring Workspace' })
  ).toBeVisible();
  return { session, webviewFrame };
}

test.describe('SAP Tools workspace tabs', () => {
  test('User can open the workspace with only the supported tabs', async () => {
    const { session, webviewFrame } = await openConfirmedWorkspace();

    try {
      const tabs = webviewFrame.getByRole('tab');
      await expect(tabs).toHaveCount(3);
      await expect(tabs.nth(0)).toHaveText('Logs');
      await expect(tabs.nth(1)).toHaveText('Apps');
      await expect(tabs.nth(2)).toHaveText('SQL');
      await expect(
        webviewFrame.getByRole('tab', { name: 'Debug' })
      ).toHaveCount(0);

      const removedSurface = await webviewFrame.evaluate(() => {
        const selectors = [
          '[data-tab-id="debug"]',
          '.debug-tab',
          '[data-role="debug-row"]',
          '[data-role="debug-status-note"]',
          '[data-action*="debug"]',
          '[data-role*="debug"]',
        ];
        const elementCount = selectors.reduce((count, selector) => {
          return count + document.querySelectorAll(selector).length;
        }, 0);
        const visibleDebugTextCount = Array.from(document.body.querySelectorAll('*')).filter(
          (node) => {
            if (!(node instanceof HTMLElement)) {
              return false;
            }
            if (node.offsetParent === null) {
              return false;
            }
            return /\bDebug\b/.test(node.innerText);
          }
        ).length;
        return { elementCount, visibleDebugTextCount };
      });

      expect(removedSurface).toEqual({
        elementCount: 0,
        visibleDebugTextCount: 0,
      });
    } finally {
      await cleanupExtensionHost(session);
    }
  });

  test('User can switch between Logs Apps and SQL without removed workspace controls appearing', async () => {
    const { session, webviewFrame } = await openConfirmedWorkspace();

    try {
      await clickWithFallback(webviewFrame.getByRole('tab', { name: 'Apps' }));
      await expect(
        webviewFrame.getByRole('heading', { name: 'Service Artifacts' })
      ).toBeVisible();
      await expect(
        webviewFrame.getByRole('tab', { name: 'Debug' })
      ).toHaveCount(0);

      await clickWithFallback(webviewFrame.getByRole('tab', { name: 'SQL' }));
      await expect(
        webviewFrame.getByRole('heading', { name: 'HANA SQL Workbench' })
      ).toBeVisible();
      await expect(
        webviewFrame.getByRole('tab', { name: 'Debug' })
      ).toHaveCount(0);

      await clickWithFallback(webviewFrame.getByRole('tab', { name: 'Logs' }));
      await expect(
        webviewFrame.getByRole('heading', { name: 'Apps Log Control' })
      ).toBeVisible();
      await expect(
        webviewFrame.getByRole('tab', { name: 'Debug' })
      ).toHaveCount(0);
    } finally {
      await cleanupExtensionHost(session);
    }
  });
});
