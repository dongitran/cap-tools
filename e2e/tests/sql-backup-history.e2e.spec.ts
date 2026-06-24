import { test, expect, type Frame, type Page } from '@playwright/test';
import {
  cleanupExtensionHost,
  clickWithFallback,
  launchExtensionHost,
  openSapToolsSidebar,
  selectDefaultScope,
} from './support/sapToolsHarness';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

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
    // Generate mock backups to ensure the UI has data to display
    const backupRoot = path.join(os.homedir(), '.saptools', 'sql-backups');
    const ts = new Date();
    const monthFolder = ts.toISOString().slice(0, 7).replace('-', '');
    const backupId = `us10-finance-services-prod-uat-update-employees-${ts.toISOString().replace(/[-:.Z]/g, '').slice(0, 15)}`;
    const backupDir = path.join(backupRoot, monthFolder, backupId);
    fs.mkdirSync(backupDir, { recursive: true });
    // Wide SQL with many columns to demonstrate horizontal table scroll
    const sql = `UPDATE "Employees"\nSET "Salary" = 50000\nWHERE "Department" = 'Sales';`;
    // CSV with many columns to force horizontal scrolling
    const csvHeader = 'EmpID,FirstName,LastName,Email,Department,JobTitle,Manager,OfficeLocation,Country,HireDate,Salary,Currency,Status,Grade,CostCenter';
    const csvRow1   = '101,Alice,Johnson,alice@corp.com,Sales,Account Executive,Bob Smith,New York,USA,2021-03-15,45000,USD,Active,L3,CC-001';
    const csvRow2   = '102,Bob,Williams,bob@corp.com,Sales,Senior AE,Carol Davis,Chicago,USA,2019-07-22,48000,USD,Active,L4,CC-002';
    const csvRow3   = '103,Charlie,Brown,charlie@corp.com,Sales,Sales Manager,Diana Prince,Los Angeles,USA,2018-01-10,72000,USD,Active,L5,CC-003';
    fs.writeFileSync(path.join(backupDir, 'query.sql'), sql, 'utf8');
    fs.writeFileSync(path.join(backupDir, 'backup.csv'), [csvHeader, csvRow1, csvRow2, csvRow3].join('\n'), 'utf8');
    fs.writeFileSync(path.join(backupDir, 'metadata.json'), JSON.stringify({
      id: backupId,
      timestamp: ts.toISOString(),
      timestampLabel: ts.toISOString().replace('T', ' ').slice(0, 16) + ' UTC',
      region: 'us10',
      org: 'finance-services-prod',
      space: 'uat',
      appName: 'finance-uat-worker',
      statementType: 'UPDATE',
      tableName: 'Employees',
      rowCount: 3,
      folderPath: backupDir
    }), 'utf8');

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
      
      // Wait for the history panel to load and display entries
      const firstEntry = historyFrame.locator('.entry-item').first();
      // Wait up to 10 seconds for the first entry to appear (since we have mock data)
      await expect(firstEntry).toBeVisible({ timeout: 10000 });
      
      // Click the first entry
      await firstEntry.click();
      
      // Wait for the detail pane to render the SQL block
      await expect(historyFrame.locator('.detail-pane .sql-block')).toBeVisible({ timeout: 10000 });

      // Wait for stable render of the detail pane layout
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
