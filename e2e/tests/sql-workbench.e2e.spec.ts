import { test, expect, type Frame, type Locator, type Page } from '@playwright/test';

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

async function selectSqlApp(webviewFrame: Frame, appName: string): Promise<void> {
  await clickWithFallback(webviewFrame.getByRole('button', { name: appName }));
}

function tableRows(tablesPanel: Locator): Locator {
  return tablesPanel.locator('[data-role="hana-table-row"]');
}

test.describe('SAP Tools SQL workbench', () => {
  test('User can review SQL app list with initial tables panel state', async () => {
    const session = await launchExtensionHost();

    try {
      const webviewFrame = await openSapToolsSidebar(session.window);
      await openSqlTabForDefaultScope(webviewFrame);

      await expect(webviewFrame.locator('.sql-service-row')).toHaveCount(3);
      await expect(webviewFrame.locator('.sql-service-open-indicator')).toHaveCount(3);
      await expect(webviewFrame.locator('.sql-service-panel')).toHaveCount(0);
      await expect(webviewFrame.locator('.sql-result-preview')).toHaveCount(0);
      await expect(webviewFrame.locator('[data-role="hana-result-preview"]')).toHaveCount(0);
      await expect(webviewFrame.locator('[data-role="hana-service-meta"]')).toHaveCount(0);
      await expect(webviewFrame.locator('[data-role="hana-service-select"]')).toHaveCount(0);
      await expect(webviewFrame.locator('[data-action="open-hana-sql-file"]')).toHaveCount(0);
      await expect(webviewFrame.locator('[data-action="refresh-hana-services"]')).toHaveCount(0);
      await expect(webviewFrame.locator('[data-action="open-sqltools-extension"]')).toHaveCount(0);
      await expect(webviewFrame.locator('[data-role="hana-query-status"]')).toBeHidden();

      const tablesPanel = webviewFrame.locator('[data-role="hana-tables-panel"]');
      await expect(tablesPanel).toBeVisible();
      await expect(tablesPanel.getByRole('heading', { name: 'Tables' })).toBeVisible();
      await expect(tablesPanel.locator('[data-role="hana-tables-count"]')).toHaveText('0');
      await expect(tablesPanel.getByRole('searchbox', { name: 'Search tables' })).toBeDisabled();
      await expect(tablesPanel.locator('[data-role="hana-tables-empty"]')).toHaveText(
        'Select an app above to load tables.'
      );
      await expect(tableRows(tablesPanel)).toHaveCount(0);
      await expect(tablesPanel.locator('[data-role="hana-tables-error"]')).toHaveCount(0);

      const bodyText = await webviewFrame.locator('body').innerText();
      expect(bodyText).not.toContain('Scope: uat');
      expect(bodyText).not.toContain('running instance');
      expect(bodyText).not.toContain('Click to open SQL file for this app');
      expect(bodyText).not.toContain('Click one app below to open SQL file for that app.');
      expect(bodyText).not.toContain('ORDER_ID');
      expect(bodyText).not.toContain('CREATED_AT');
      expect(bodyText).not.toContain('Failed to load tables.');
    } finally {
      await cleanupExtensionHost(session);
    }
  });

  test('User can open app SQL editor and run SQL command to open result tab', async () => {
    const session = await launchExtensionHost();

    try {
      const webviewFrame = await openSapToolsSidebar(session.window);
      await openSqlTabForDefaultScope(webviewFrame);

      await selectSqlApp(webviewFrame, 'finance-uat-api');
      await expect(webviewFrame.locator('[data-role="hana-query-status"]')).toBeHidden({
        timeout: 10000,
      });
      await expect(webviewFrame.locator('body')).not.toContainText('SQL file opened for app');

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

  test('User can search selected app tables and run a quick SELECT', async () => {
    const session = await launchExtensionHost();

    try {
      const webviewFrame = await openSapToolsSidebar(session.window);
      await openSqlTabForDefaultScope(webviewFrame);

      await selectSqlApp(webviewFrame, 'finance-uat-api');

      const tablesPanel = webviewFrame.locator('[data-role="hana-tables-panel"]');
      await expect(tablesPanel).toBeVisible({ timeout: 15000 });
      await expect(tablesPanel.getByRole('heading', { name: /Tables · finance-uat-api/i })).toBeVisible();
      await expect(tablesPanel.locator('[data-role="hana-tables-error"]')).toHaveCount(0);
      await expect(tablesPanel.locator('[data-role="hana-tables-empty"]')).toHaveCount(0);
      await expect(tablesPanel.locator('[data-role="hana-tables-count"]')).toHaveText('104');

      const searchInput = tablesPanel.getByRole('searchbox', { name: 'Search tables' });
      await expect(searchInput).toBeEnabled();
      await expect(tableRows(tablesPanel)).toHaveCount(104, { timeout: 15000 });
      await expect(tablesPanel.getByRole('button', { name: /^Select first 10 rows of / })).toHaveCount(104);

      const readableTableName = 'CORE_ADDRESSSECTIONINPUTMAPPING';
      await searchInput.click();
      await searchInput.pressSequentially('AddressSection');
      await expect(searchInput).toHaveValue('AddressSection');
      await expect(tablesPanel.locator('[data-role="hana-tables-count"]')).toHaveText('1/104');
      await expect(tableRows(tablesPanel)).toHaveCount(1);

      const readableTableRow = tablesPanel.locator(`[data-full-table-name="${readableTableName}"]`);
      await expect(readableTableRow).toBeVisible();
      await expect(readableTableRow).toHaveAttribute('title', readableTableName);
      await expect(readableTableRow).toHaveAttribute('data-table-name', readableTableName);
      await expect(readableTableRow.locator('.sql-table-name')).toHaveText(
        'Core_AddressSectionInputMapping'
      );
      await expect(searchInput).toBeFocused();

      const longTableName =
        'FINANCE_UAT_API_I_BUSINESSPARTNERBANK_0001_TO_SUPPLIERINVOICEPAYMENTBLOCKREASON';
      await searchInput.fill('');
      await searchInput.pressSequentially('BusinessPartnerBank');
      await expect(searchInput).toHaveValue('BusinessPartnerBank');
      await expect(tablesPanel.locator('[data-role="hana-tables-count"]')).toHaveText('1/104');
      await expect(tableRows(tablesPanel)).toHaveCount(1);

      const longTableRow = tablesPanel.locator(`[data-full-table-name="${longTableName}"]`);
      await expect(longTableRow).toBeVisible();
      await expect(longTableRow).toHaveAttribute('title', longTableName);
      await expect(longTableRow).toHaveAttribute('aria-label', `Table ${longTableName}`);
      const longTableDisplayName = await longTableRow.locator('.sql-table-name').innerText();
      expect(longTableDisplayName.startsWith('Finance_UAT_API_I_')).toBe(true);
      expect(longTableDisplayName).toContain('…');
      expect(longTableDisplayName.endsWith('SupplierInvoicePaymentBlockReason')).toBe(true);
      await expect(searchInput).toBeFocused();

      await searchInput.fill('ORDERS');
      await expect(tablesPanel.locator('[data-role="hana-tables-count"]')).toHaveText('1/104');
      const targetTableRow = tablesPanel.locator(
        '[data-role="hana-table-row"][data-table-name="FINANCE_UAT_API_ORDERS"]'
      );
      await expect(targetTableRow).toBeVisible();
      const targetSelectButton = targetTableRow.getByRole('button', {
        name: 'Select first 10 rows of FINANCE_UAT_API_ORDERS',
      });
      await expect(targetSelectButton).toHaveCSS('opacity', '0');
      await expect(targetSelectButton).toHaveCSS('pointer-events', 'none');

      const sqlEditorTab = session.window.getByRole('tab', {
        name: /finance-uat-api\.sql/i,
      });
      await expect(sqlEditorTab).toBeVisible({ timeout: 15000 });

      const initialResultTabs = session.window.getByRole('tab', {
        name: /SAP Tools SQL Result/i,
      });
      const initialResultCount = await initialResultTabs.count();

      await targetTableRow.hover();
      await expect(targetSelectButton).toHaveCSS('opacity', '1');
      await expect(targetSelectButton).toHaveCSS('pointer-events', 'auto');
      await clickWithFallback(targetSelectButton);

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

  test('User can use SQL workbench with bounded app and table lists', async () => {
    const session = await launchExtensionHost({
      extraEnv: { SAP_TOOLS_E2E_SQL_MANY_APPS: '1' },
    });

    try {
      const webviewFrame = await openSapToolsSidebar(session.window);
      await openSqlTabForDefaultScope(webviewFrame);
      await expect(webviewFrame.locator('.sql-service-row')).toHaveCount(12);

      await selectSqlApp(webviewFrame, 'finance-uat-api');

      const tablesPanel = webviewFrame.locator('[data-role="hana-tables-panel"]');
      await expect(tableRows(tablesPanel)).toHaveCount(104, { timeout: 15000 });

      const layoutSnapshot = await webviewFrame.locator('body').evaluate(() => {
        const readElement = (selector: string): HTMLElement => {
          const element = document.querySelector<HTMLElement>(selector);
          if (element === null) {
            throw new Error(`${selector} is missing`);
          }
          return element;
        };
        const workbench = readElement('.sql-workbench');
        const serviceList = readElement('[data-role="hana-service-list"]');
        const tablesPanelElement = readElement('[data-role="hana-tables-panel"]');
        const tablesList = readElement('[data-role="hana-tables-list"]');
        const firstTableRow = readElement('[data-role="hana-table-row"]');
        const tableSearch = readElement('[data-role="sql-table-search"]');
        const searchIcon = readElement('.sql-table-search-row .search-input-icon');
        const searchStyles = window.getComputedStyle(tableSearch);
        const iconStyles = window.getComputedStyle(searchIcon);

        return {
          firstTableRowHeight: firstTableRow.getBoundingClientRect().height,
          heightRatio: workbench.getBoundingClientRect().height /
            tablesPanelElement.getBoundingClientRect().height,
          tableNamePaddingBottom: window.getComputedStyle(
            firstTableRow.querySelector('.sql-table-name') ?? firstTableRow
          ).paddingBottom,
          tableNamePaddingTop: window.getComputedStyle(
            firstTableRow.querySelector('.sql-table-name') ?? firstTableRow
          ).paddingTop,
          serviceListCanScroll: serviceList.scrollHeight > serviceList.clientHeight,
          tableSearchHeight: tableSearch.getBoundingClientRect().height,
          tableSearchPaddingLeft: searchStyles.paddingLeft,
          tablesListCanScroll: tablesList.scrollHeight > tablesList.clientHeight,
          workbenchHeight: workbench.getBoundingClientRect().height,
          tablesPanelHeight: tablesPanelElement.getBoundingClientRect().height,
          iconLeft: iconStyles.left,
        };
      });

      expect(layoutSnapshot.workbenchHeight).toBeGreaterThan(100);
      expect(layoutSnapshot.tablesPanelHeight).toBeGreaterThan(100);
      expect(layoutSnapshot.heightRatio).toBeGreaterThan(0.95);
      expect(layoutSnapshot.heightRatio).toBeLessThan(1.05);
      expect(layoutSnapshot.serviceListCanScroll).toBe(true);
      expect(layoutSnapshot.tablesListCanScroll).toBe(true);
      expect(layoutSnapshot.firstTableRowHeight).toBeLessThanOrEqual(30);
      expect(layoutSnapshot.tableNamePaddingTop).toBe('3px');
      expect(layoutSnapshot.tableNamePaddingBottom).toBe('3px');
      expect(layoutSnapshot.tableSearchHeight).toBeGreaterThanOrEqual(30);
      expect(layoutSnapshot.tableSearchHeight).toBeLessThanOrEqual(32);
      expect(layoutSnapshot.tableSearchPaddingLeft).toBe('31px');
      expect(layoutSnapshot.iconLeft).toBe('12px');
      await expect(tablesPanel.locator('[data-role="hana-tables-error"]')).toHaveCount(0);
      await expect(tablesPanel.locator('[data-role="hana-tables-empty"]')).toHaveCount(0);
    } finally {
      await cleanupExtensionHost(session);
    }
  });

  test('User sees centered loading state while selected app tables load', async () => {
    const session = await launchExtensionHost({
      extraEnv: { SAP_TOOLS_E2E_TESTMODE_TABLES_DELAY_MS: '1200' },
    });

    try {
      const webviewFrame = await openSapToolsSidebar(session.window);
      await openSqlTabForDefaultScope(webviewFrame);

      await selectSqlApp(webviewFrame, 'finance-uat-api');

      const tablesPanel = webviewFrame.locator('[data-role="hana-tables-panel"]');
      const loadingState = tablesPanel.locator('[data-role="hana-tables-loading"]');
      await expect(loadingState).toBeVisible();
      await expect(loadingState).toHaveText('Loading tables…');
      await expect(tablesPanel.locator('[data-role="hana-tables-empty"]')).toHaveCount(0);

      const loadingSnapshot = await loadingState.evaluate((element) => {
        const list = element.closest('[data-role="hana-tables-list"]');
        if (!(list instanceof HTMLElement)) {
          throw new Error('Tables list is missing.');
        }
        const listBox = list.getBoundingClientRect();
        const loadingBox = element.getBoundingClientRect();
        return {
          centerDelta: Math.abs(
            loadingBox.top + loadingBox.height / 2 - (listBox.top + listBox.height / 2)
          ),
          listClass: list.className,
        };
      });
      expect(loadingSnapshot.centerDelta).toBeLessThanOrEqual(2);
      expect(loadingSnapshot.listClass).toContain('is-loading');

      await expect(tableRows(tablesPanel)).toHaveCount(104, { timeout: 15000 });
      await expect(loadingState).toHaveCount(0);
    } finally {
      await cleanupExtensionHost(session);
    }
  });
});
