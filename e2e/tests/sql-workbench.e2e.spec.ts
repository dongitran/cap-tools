import { test, expect, type Frame, type Page } from '@playwright/test';

import {
  cleanupExtensionHost,
  clickWithFallback,
  launchExtensionHost,
  openSapToolsSidebar,
  runWorkbenchCommand,
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

async function findSqlResultFrame(window: Page): Promise<Frame | undefined> {
  const candidateFrames = window
    .frames()
    .filter((frame) => frame.url().includes('vscode-webview://'));

  for (const frame of [...candidateFrames].reverse()) {
    const resultHeading = frame.getByRole('heading', { name: 'SAP Tools SQL Result' });
    const visible = await resultHeading.isVisible().catch(() => false);
    if (visible) {
      return frame;
    }
  }

  return undefined;
}

async function resolveSqlResultFrame(window: Page, timeoutMs = 20000): Promise<Frame> {
  await expect
    .poll(
      async () => {
        const frame = await findSqlResultFrame(window);
        return frame?.url() ?? '';
      },
      { timeout: timeoutMs }
    )
    .toContain('vscode-webview://');

  const frame = await findSqlResultFrame(window);
  if (frame === undefined) {
    throw new Error('SQL result webview frame was not found.');
  }

  return frame;
}

async function focusActiveSqlEditor(window: Page): Promise<void> {
  const editorSurface = window.locator('.monaco-editor .view-lines').first();
  await expect(editorSurface).toBeVisible({ timeout: 10000 });
  await clickWithFallback(editorSurface);
}

test.describe('SAP Tools SQL workbench', () => {
  test('User sees SQL workbench app list without legacy helper elements', async () => {
    const session = await launchExtensionHost();

    try {
      const webviewFrame = await openSapToolsSidebar(session.window);
      await openSqlTabForDefaultScope(webviewFrame);

      await expect(webviewFrame.locator('.sql-service-row')).toHaveCount(3);
      await expect(webviewFrame.locator('.sql-service-open-indicator')).toHaveCount(3);
      await expect(webviewFrame.locator('.sql-service-panel')).toHaveCount(0);
      await expect(webviewFrame.locator('[data-role="hana-service-meta"]')).toHaveCount(0);
      await expect(webviewFrame.locator('[data-role="hana-service-select"]')).toHaveCount(0);
      await expect(webviewFrame.locator('[data-action="open-hana-sql-file"]')).toHaveCount(0);
      await expect(webviewFrame.locator('[data-action="refresh-hana-services"]')).toHaveCount(0);
      await expect(webviewFrame.locator('[data-action="open-sqltools-extension"]')).toHaveCount(0);
      await expect(webviewFrame.locator('[data-role="hana-query-status"]')).toBeHidden();

      const bodyText = await webviewFrame.locator('body').innerText();
      expect(bodyText).not.toContain('Scope: uat');
      expect(bodyText).not.toContain('running instance');
      expect(bodyText).not.toContain('Click to open SQL file for this app');
      expect(bodyText).not.toContain('Click one app below to open SQL file for that app.');
    } finally {
      await cleanupExtensionHost(session);
    }
  });

  test('User can open app SQL editor and run SQL command to open result tab', async () => {
    const session = await launchExtensionHost();

    try {
      const webviewFrame = await openSapToolsSidebar(session.window);
      await openSqlTabForDefaultScope(webviewFrame);

      const targetAppRow = webviewFrame.locator('.sql-service-row', {
        has: webviewFrame.locator('.sql-service-name', { hasText: 'finance-uat-api' }),
      });
      await clickWithFallback(targetAppRow);
      await expect(
        webviewFrame.locator('[data-role="hana-query-status"]')
      ).toContainText('SQL file opened for app finance-uat-api.', {
        timeout: 10000,
      });

      const sqlEditorTab = session.window.getByRole('tab', {
        name: /finance-uat-api\.sql/i,
      });
      await expect(sqlEditorTab).toBeVisible({ timeout: 15000 });
      await clickWithFallback(sqlEditorTab);
      await focusActiveSqlEditor(session.window);

      const chordKey = process.platform === 'darwin' ? 'Meta+E' : 'Control+E';
      await session.window.keyboard.press(chordKey);
      await session.window.keyboard.press(chordKey);
      const resultFrame = await resolveSqlResultFrame(session.window, 7000).catch(async () => {
        await runWorkbenchCommand(session.window, 'SAP Tools: Run HANA SQL');
        return resolveSqlResultFrame(session.window, 30000);
      });
      await expect(
        resultFrame.getByRole('heading', { name: 'SAP Tools SQL Result' })
      ).toBeVisible();
      await expect(resultFrame.getByText(/^App:\s*finance-uat-api$/)).toBeVisible();
      await expect(resultFrame.getByRole('table')).toBeVisible();
      await expect(resultFrame.getByRole('columnheader', { name: '#' })).toBeVisible();
      await expect(resultFrame.getByRole('cell', { name: 'TEST_SCHEMA' })).toBeVisible();

      const resultHtml = await resultFrame.locator('body').innerHTML();
      expect(resultHtml).not.toContain('SAP HANA Client Not Found');
      expect(resultHtml).not.toContain('Install the SAP HANA Client');
      expect(resultHtml).not.toMatch(/hdbsql/i);
      expect(resultHtml).not.toMatch(/hdbclient/i);
      expect(resultHtml).not.toContain('hanaSqlClientPath');
    } finally {
      await cleanupExtensionHost(session);
    }
  });
});
