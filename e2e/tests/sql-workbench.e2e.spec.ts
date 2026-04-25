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
      await expect(webviewFrame.locator('.sql-result-preview')).toHaveCount(0);
      await expect(webviewFrame.locator('[data-role="hana-result-preview"]')).toHaveCount(0);
      await expect(webviewFrame.locator('[data-role="hana-tables-panel"]')).toHaveCount(0);
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
      expect(bodyText).not.toContain('ORDER_ID');
      expect(bodyText).not.toContain('CREATED_AT');
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
      const toolbarChips = resultFrame.locator('.result-toolbar .result-chip');
      await expect(toolbarChips.filter({ hasText: 'App: finance-uat-api' })).toBeVisible();
      await expect(toolbarChips.filter({ hasText: /^Executed: /i })).toBeVisible();
    } finally {
      await cleanupExtensionHost(session);
    }
  });

  test('User sees the workbench tables panel for the selected app and runs a quick SELECT', async () => {
    const session = await launchExtensionHost();

    try {
      const webviewFrame = await openSapToolsSidebar(session.window);
      await openSqlTabForDefaultScope(webviewFrame);

      await expect(webviewFrame.locator('[data-role="hana-tables-panel"]')).toHaveCount(0);

      const targetAppRow = webviewFrame.locator('.sql-service-row', {
        has: webviewFrame.locator('.sql-service-name', { hasText: 'finance-uat-api' }),
      });
      await clickWithFallback(targetAppRow);

      const tablesPanel = webviewFrame.locator('[data-role="hana-tables-panel"]');
      await expect(tablesPanel).toBeVisible({ timeout: 15000 });
      await expect(tablesPanel.getByRole('heading', { name: /Tables · finance-uat-api/i })).toBeVisible();

      const targetTableRow = webviewFrame.locator('.sql-table-row', {
        has: webviewFrame.locator('.sql-table-name', { hasText: 'FINANCE_UAT_API_ORDERS' }),
      });
      await expect(targetTableRow).toBeVisible({ timeout: 15000 });

      await expect(webviewFrame.locator('.sql-table-row')).toHaveCount(5);
      await expect(webviewFrame.locator('.sql-table-select-btn')).toHaveCount(5);

      const sqlEditorTab = session.window.getByRole('tab', {
        name: /finance-uat-api\.sql/i,
      });
      await expect(sqlEditorTab).toBeVisible({ timeout: 15000 });

      const initialResultTabs = session.window.getByRole('tab', {
        name: /SAP Tools SQL Result/i,
      });
      const initialResultCount = await initialResultTabs.count();

      await clickWithFallback(targetTableRow.locator('.sql-table-select-btn'));

      await expect
        .poll(
          async () => {
            return session.window
              .getByRole('tab', { name: /SAP Tools SQL Result/i })
              .count();
          },
          { timeout: 20000 }
        )
        .toBe(initialResultCount + 1);

      const resultFrame = await resolveSqlResultFrame(session.window, 20000);
      await expect(resultFrame.getByRole('heading', { name: 'SAP Tools SQL Result' })).toBeVisible();
      await expect(resultFrame.getByText('App: finance-uat-api')).toBeVisible();
      await expect(resultFrame.getByRole('table')).toBeVisible();
      await expect(resultFrame.getByRole('cell', { name: 'TEST_SCHEMA' })).toBeVisible();

      await expect(
        webviewFrame.locator('[data-role="hana-query-status"]')
      ).toContainText('Selected first 10 rows of FINANCE_UAT_API_ORDERS.', {
        timeout: 10000,
      });
    } finally {
      await cleanupExtensionHost(session);
    }
  });

});
