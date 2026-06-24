import { test, expect, type Frame, type Page } from '@playwright/test';
import {
  cleanupExtensionHost,
  clickWithFallback,
  launchExtensionHost,
  openSapToolsSidebar,
  selectDefaultScope,
} from './support/sapToolsHarness';

async function openSqlTabForDefaultScope(webviewFrame: Frame): Promise<void> {
  await selectDefaultScope(webviewFrame);
  await clickWithFallback(webviewFrame.getByRole('button', { name: 'Confirm Scope' }));
  await clickWithFallback(webviewFrame.getByRole('tab', { name: 'SQL' }));
  await expect(
    webviewFrame.getByRole('heading', { name: 'S/4HANA SQL Workbench' })
  ).toBeVisible({ timeout: 10000 });
}

async function findSqlHistoryFrame(window: Page): Promise<Frame | undefined> {
  const candidateFrames = window
    .frames()
    .filter((frame) => frame.url().includes('vscode-webview://'));

  for (const frame of [...candidateFrames].reverse()) {
    const layout = frame.locator('.app-layout').first();
    const visible = await layout.isVisible().catch(() => false);
    if (visible) {
      return frame;
    }
  }

  return undefined;
}

test.describe('SAP Tools SQL Backup History', () => {
  test('User can open the SQL Backup History panel and view UI layout', async () => {
    const session = await launchExtensionHost();

    try {
      const webviewFrame = await openSapToolsSidebar(session.window);
      await openSqlTabForDefaultScope(webviewFrame);

      // Click the history button
      const historyBtn = webviewFrame.locator('[data-action="open-sql-backup-history"]');
      await expect(historyBtn).toBeVisible();
      await clickWithFallback(historyBtn);

      // Wait for the history panel frame to open
      await expect
        .poll(
          async () => {
            const frame = await findSqlHistoryFrame(session.window);
            return frame !== undefined;
          },
          { timeout: 20000 }
        )
        .toBe(true);

      const historyFrame = await findSqlHistoryFrame(session.window);
      if (historyFrame === undefined) throw new Error('History frame not found');

      // Assert basic UI elements
      await expect(historyFrame.getByRole('heading', { name: 'SQL Backup History' })).toBeVisible();
      
      // Wait for stable render
      await session.window.waitForTimeout(1000);

      // Take a screenshot of the entire VS Code window to capture the layout
      await expect(session.window).toHaveScreenshot('sql-history-panel.png', {
        maxDiffPixelRatio: 0.1,
      });

    } finally {
      await cleanupExtensionHost(session);
    }
  });
});
