import { test, expect } from '@playwright/test';

import {
  AREA_TO_SELECT,
  REGION_TO_SELECT,
  cleanupExtensionHost,
  clickWithFallback,
  findCfLogsPanelFrame,
  launchExtensionHost,
  openCfLogsPanel,
  openSapToolsSidebar,
  selectDefaultScope,
} from './support/sapToolsHarness';

test.describe('SAP Tools CF logs panel', () => {
  test('CF logs panel renders log table and filter controls', async () => {
    const session = await launchExtensionHost();

    try {
      await openSapToolsSidebar(session.window);
      const frame = await openCfLogsPanel(session.window);

      // Log table should be rendered.
      await expect(frame.locator('.cf-log-table')).toBeVisible({ timeout: 10000 });

      // All three filter controls should be visible.
      await expect(frame.getByLabel('Search logs')).toBeVisible();
      await expect(frame.getByLabel('Filter by level')).toBeVisible();
      await expect(frame.getByLabel('Select app')).toBeVisible();

      // Initially no scope selected: empty-state row should be shown.
      await expect(
        frame.locator('#log-table-body td.empty-row')
      ).toBeVisible({ timeout: 5000 });
    } finally {
      await cleanupExtensionHost(session);
    }
  });

  test('CF logs panel keeps app selector empty until user starts app logging', async () => {
    const session = await launchExtensionHost();

    try {
      const sidebarFrame = await openSapToolsSidebar(session.window);
      const logsFrame = await openCfLogsPanel(session.window);

      // Select a scope so the extension sends apps catalog to the panel.
      await selectDefaultScope(sidebarFrame);

      // Until Start App Logging is triggered from sidebar workspace,
      // panel app selector should remain disabled.
      const appSelect = logsFrame.getByLabel('Select app');
      await expect(appSelect).toBeDisabled({ timeout: 10000 });
      await expect(logsFrame.locator('#log-table-body td.empty-row')).toBeVisible({
        timeout: 10000,
      });
      await expect(logsFrame.locator('#log-table-body td.empty-row')).toContainText(
        /Start App Logging/i
      );
    } finally {
      await cleanupExtensionHost(session);
    }
  });

  test('CF logs panel dropdown includes only apps started for logging', async () => {
    const session = await launchExtensionHost();

    try {
      const sidebarFrame = await openSapToolsSidebar(session.window);
      const logsFrame = await openCfLogsPanel(session.window);
      await selectDefaultScope(sidebarFrame);

      const confirmButton = sidebarFrame.getByRole('button', { name: 'Confirm Scope' });
      await expect(confirmButton).toBeEnabled({ timeout: 10000 });
      await clickWithFallback(confirmButton);

      await expect(
        sidebarFrame.getByRole('heading', { name: 'Monitoring Workspace' })
      ).toBeVisible({ timeout: 10000 });

      await clickWithFallback(sidebarFrame.getByLabel('Select finance-uat-api'));
      await clickWithFallback(sidebarFrame.getByLabel('Select finance-uat-worker'));
      await clickWithFallback(
        sidebarFrame.getByRole('button', { name: 'Start App Logging' })
      );

      const appSelect = logsFrame.getByLabel('Select app');
      await expect(appSelect).toBeEnabled({ timeout: 10000 });
      await expect
        .poll(
          async () => appSelect.locator('option').count(),
          { timeout: 15000 }
        ).toBe(2);

      const optionTexts = await appSelect.locator('option').allTextContents();
      expect(optionTexts.some((text) => text.includes('finance-uat-api'))).toBe(true);
      expect(optionTexts.some((text) => text.includes('finance-uat-worker'))).toBe(true);
      expect(optionTexts.some((text) => text.includes('finance-uat-audit'))).toBe(false);

      // Logs should be loaded for one of the selected active apps.
      await expect(
        logsFrame.locator('#log-table-body td.empty-row')
      ).toBeHidden({ timeout: 10000 });
    } finally {
      await cleanupExtensionHost(session);
    }
  });

  test('CF logs panel message column uses wrapped text layout', async () => {
    const session = await launchExtensionHost();

    try {
      const sidebarFrame = await openSapToolsSidebar(session.window);
      const logsFrame = await openCfLogsPanel(session.window);
      await selectDefaultScope(sidebarFrame);

      const confirmButton = sidebarFrame.getByRole('button', { name: 'Confirm Scope' });
      await expect(confirmButton).toBeEnabled({ timeout: 10000 });
      await clickWithFallback(confirmButton);

      await clickWithFallback(sidebarFrame.getByLabel('Select finance-uat-api'));
      await clickWithFallback(
        sidebarFrame.getByRole('button', { name: 'Start App Logging' })
      );

      await expect(logsFrame.locator('#log-table-body td.empty-row')).toHaveCount(0, {
        timeout: 10000,
      });

      const messageCell = logsFrame.locator('#log-table-body td.cell-message .cell-message-text').first();
      await expect(messageCell).toBeVisible({ timeout: 10000 });

      const messageCellStyle = await messageCell.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          whiteSpace: style.whiteSpace,
          textOverflow: style.textOverflow,
          overflowWrap: style.overflowWrap,
          wordBreak: style.wordBreak,
        };
      });

      expect(messageCellStyle.whiteSpace).toBe('pre-wrap');
      expect(messageCellStyle.textOverflow).toBe('clip');
      expect(messageCellStyle.overflowWrap).toBe('anywhere');
      expect(messageCellStyle.wordBreak).toBe('break-word');
    } finally {
      await cleanupExtensionHost(session);
    }
  });

  test('CF logs panel time column shows only clock time', async () => {
    const session = await launchExtensionHost();

    try {
      const sidebarFrame = await openSapToolsSidebar(session.window);
      const logsFrame = await openCfLogsPanel(session.window);
      await selectDefaultScope(sidebarFrame);

      const confirmButton = sidebarFrame.getByRole('button', { name: 'Confirm Scope' });
      await expect(confirmButton).toBeEnabled({ timeout: 10000 });
      await clickWithFallback(confirmButton);

      await clickWithFallback(sidebarFrame.getByLabel('Select finance-uat-api'));
      await clickWithFallback(
        sidebarFrame.getByRole('button', { name: 'Start App Logging' })
      );

      await expect(logsFrame.locator('#log-table-body td.empty-row')).toHaveCount(0, {
        timeout: 10000,
      });

      const firstTimeCell = logsFrame.locator('#log-table-body tr td').first();
      await expect(firstTimeCell).toBeVisible({ timeout: 10000 });
      await expect(firstTimeCell).toHaveText(/^\d{2}:\d{2}:\d{2}$/);
    } finally {
      await cleanupExtensionHost(session);
    }
  });

  test('CF logs panel copies row message on click and shows Copied toast', async () => {
    const session = await launchExtensionHost();

    try {
      const sidebarFrame = await openSapToolsSidebar(session.window);
      const logsFrame = await openCfLogsPanel(session.window);
      await selectDefaultScope(sidebarFrame);

      const confirmButton = sidebarFrame.getByRole('button', { name: 'Confirm Scope' });
      await expect(confirmButton).toBeEnabled({ timeout: 10000 });
      await clickWithFallback(confirmButton);

      await clickWithFallback(sidebarFrame.getByLabel('Select finance-uat-api'));
      await clickWithFallback(
        sidebarFrame.getByRole('button', { name: 'Start App Logging' })
      );

      await expect(logsFrame.locator('#log-table-body td.empty-row')).toHaveCount(0, {
        timeout: 10000,
      });

      // There should be no copy buttons — row-click-to-copy replaced them.
      await expect(logsFrame.locator('#log-table-body .copy-message-button')).toHaveCount(0);

      // Click the second row — it should select that row and show the toast.
      const secondRow = logsFrame.locator('#log-table-body tr').nth(1);
      await expect(secondRow).toBeVisible({ timeout: 10000 });
      await clickWithFallback(secondRow);

      // The clicked row should become selected.
      await expect(secondRow).toHaveClass(/is-selected/);

      // The copy toast should appear briefly.
      const toast = logsFrame.locator('#copy-toast');
      await expect(toast).toHaveClass(/is-visible/, { timeout: 5000 });
    } finally {
      await cleanupExtensionHost(session);
    }
  });

  test('CF logs panel keeps message column dominant and logger narrower than time', async () => {
    const session = await launchExtensionHost();

    try {
      const sidebarFrame = await openSapToolsSidebar(session.window);
      const logsFrame = await openCfLogsPanel(session.window);
      await selectDefaultScope(sidebarFrame);

      const confirmButton = sidebarFrame.getByRole('button', { name: 'Confirm Scope' });
      await expect(confirmButton).toBeEnabled({ timeout: 10000 });
      await clickWithFallback(confirmButton);

      await clickWithFallback(sidebarFrame.getByLabel('Select finance-uat-api'));
      await clickWithFallback(
        sidebarFrame.getByRole('button', { name: 'Start App Logging' })
      );

      await expect(logsFrame.locator('#log-table-body td.empty-row')).toHaveCount(0, {
        timeout: 10000,
      });

      const gearButton = logsFrame.getByLabel('Column settings');
      await clickWithFallback(gearButton);

      const sourceCheckbox = logsFrame
        .locator('#settings-column-toggles .settings-column-item')
        .filter({ hasText: 'Source' })
        .locator('input[type="checkbox"]');
      const streamCheckbox = logsFrame
        .locator('#settings-column-toggles .settings-column-item')
        .filter({ hasText: 'Stream' })
        .locator('input[type="checkbox"]');
      const levelCheckbox = logsFrame
        .locator('#settings-column-toggles .settings-column-item')
        .filter({ hasText: 'Level' })
        .locator('input[type="checkbox"]');
      const loggerCheckbox = logsFrame
        .locator('#settings-column-toggles .settings-column-item')
        .filter({ hasText: 'Logger' })
        .locator('input[type="checkbox"]');

      if (await sourceCheckbox.isChecked()) {
        await clickWithFallback(sourceCheckbox);
      }
      if (await streamCheckbox.isChecked()) {
        await clickWithFallback(streamCheckbox);
      }
      if (!(await levelCheckbox.isChecked())) {
        await clickWithFallback(levelCheckbox);
      }
      if (!(await loggerCheckbox.isChecked())) {
        await clickWithFallback(loggerCheckbox);
      }

      await expect(sourceCheckbox).not.toBeChecked();
      await expect(streamCheckbox).not.toBeChecked();
      await expect(levelCheckbox).toBeChecked();
      await expect(loggerCheckbox).toBeChecked();

      const widthSnapshot = await logsFrame.evaluate(() => {
        const headers = Array.from(document.querySelectorAll('.cf-log-table thead th'));
        const widths = headers.map((header) => Math.round(header.getBoundingClientRect().width));
        const total = widths.reduce((sum, width) => sum + width, 0);
        const getHeaderWidth = (selector: string): number => {
          const header = document.querySelector(selector);
          return header instanceof HTMLElement ? header.getBoundingClientRect().width : 0;
        };
        const messageWidth = getHeaderWidth('.cf-log-table thead th.col-message');
        const loggerWidth = getHeaderWidth('.cf-log-table thead th.col-logger');
        const timeWidth = getHeaderWidth('.cf-log-table thead th.col-time');
        const nonMessageWidths = headers
          .filter((header) => !header.classList.contains('col-message'))
          .map((header) => Math.round(header.getBoundingClientRect().width));
        return {
          widths,
          total,
          messageWidth: Math.round(messageWidth),
          loggerWidth: Math.round(loggerWidth),
          timeWidth: Math.round(timeWidth),
          widestNonMessageColumn: nonMessageWidths.length > 0 ? Math.max(...nonMessageWidths) : 0,
        };
      });

      const messageRatio = widthSnapshot.total > 0
        ? widthSnapshot.messageWidth / widthSnapshot.total
        : 0;

      expect(widthSnapshot.messageWidth).toBeGreaterThan(0);
      expect(widthSnapshot.loggerWidth).toBeGreaterThan(0);
      expect(widthSnapshot.timeWidth).toBeGreaterThan(0);
      expect(messageRatio).toBeGreaterThan(0.4);
      expect(widthSnapshot.messageWidth).toBeGreaterThan(widthSnapshot.widestNonMessageColumn);
      expect(widthSnapshot.loggerWidth).toBeGreaterThanOrEqual(52);
      expect(widthSnapshot.loggerWidth).toBeLessThan(widthSnapshot.timeWidth);
      expect(widthSnapshot.timeWidth).toBeLessThan(70);
    } finally {
      await cleanupExtensionHost(session);
    }
  });

  test('CF logs panel lets user filter logs by level and search text', async () => {
    const session = await launchExtensionHost();

    try {
      const sidebarFrame = await openSapToolsSidebar(session.window);
      const logsFrame = await openCfLogsPanel(session.window);
      await selectDefaultScope(sidebarFrame);

      const confirmButton = sidebarFrame.getByRole('button', { name: 'Confirm Scope' });
      await expect(confirmButton).toBeEnabled({ timeout: 10000 });
      await clickWithFallback(confirmButton);

      await clickWithFallback(sidebarFrame.getByLabel('Select finance-uat-api'));
      await clickWithFallback(
        sidebarFrame.getByRole('button', { name: 'Start App Logging' })
      );

      await expect(logsFrame.locator('#log-table-body td.empty-row')).toHaveCount(0, {
        timeout: 10000,
      });

      const levelFilter = logsFrame.getByLabel('Filter by level');
      await levelFilter.selectOption('error');
      await expect(logsFrame.locator('#log-table-body td.empty-row')).toHaveCount(0);

      const levelBadges = logsFrame.locator('#log-table-body tr td.col-level .badge');
      const levelBadgeCount = await levelBadges.count();
      expect(levelBadgeCount).toBeGreaterThan(0);

      const levelBadgeTexts = await levelBadges.allTextContents();
      for (const levelText of levelBadgeTexts) {
        expect(levelText.trim()).toBe('ERROR');
      }

      const searchBox = logsFrame.getByLabel('Search logs');
      await searchBox.fill('database retry exhausted');
      await expect(logsFrame.locator('#log-table-body td.empty-row')).toHaveCount(0);

      const visibleRows = logsFrame.locator('#log-table-body tr');
      await expect(visibleRows).toHaveCount(1);
      await expect(logsFrame.locator('#log-table-body td.cell-message').first()).toContainText(
        'database retry exhausted'
      );
    } finally {
      await cleanupExtensionHost(session);
    }
  });

  test('CF logs panel classifies RTR access logs by HTTP status code', async () => {
    const session = await launchExtensionHost();

    try {
      const sidebarFrame = await openSapToolsSidebar(session.window);
      const logsFrame = await openCfLogsPanel(session.window);
      await selectDefaultScope(sidebarFrame);

      const confirmButton = sidebarFrame.getByRole('button', { name: 'Confirm Scope' });
      await expect(confirmButton).toBeEnabled({ timeout: 10000 });
      await clickWithFallback(confirmButton);

      await clickWithFallback(sidebarFrame.getByLabel('Select finance-uat-api'));
      await clickWithFallback(
        sidebarFrame.getByRole('button', { name: 'Start App Logging' })
      );

      await expect(logsFrame.locator('#log-table-body td.empty-row')).toHaveCount(0, {
        timeout: 10000,
      });

      const searchBox = logsFrame.getByLabel('Search logs');

      await searchBox.fill('rtr-health-check');
      await expect(logsFrame.locator('#log-table-body tr')).toHaveCount(1, { timeout: 5000 });
      await expect(
        logsFrame.locator('#log-table-body tr').first().locator('td.col-level .badge')
      ).toHaveText('INFO');

      await searchBox.fill('rtr-not-found');
      await expect(logsFrame.locator('#log-table-body tr')).toHaveCount(1, { timeout: 5000 });
      await expect(
        logsFrame.locator('#log-table-body tr').first().locator('td.col-level .badge')
      ).toHaveText('WARN');

      await searchBox.fill('rtr-upstream-fail');
      await expect(logsFrame.locator('#log-table-body tr')).toHaveCount(1, { timeout: 5000 });
      await expect(
        logsFrame.locator('#log-table-body tr').first().locator('td.col-level .badge')
      ).toHaveText('ERROR');
    } finally {
      await cleanupExtensionHost(session);
    }
  });

  test('CF logs panel escalates multiline stack traces to error level', async () => {
    const session = await launchExtensionHost();

    try {
      const sidebarFrame = await openSapToolsSidebar(session.window);
      const logsFrame = await openCfLogsPanel(session.window);
      await selectDefaultScope(sidebarFrame);

      const confirmButton = sidebarFrame.getByRole('button', { name: 'Confirm Scope' });
      await expect(confirmButton).toBeEnabled({ timeout: 10000 });
      await clickWithFallback(confirmButton);

      await clickWithFallback(sidebarFrame.getByLabel('Select finance-uat-api'));
      await clickWithFallback(
        sidebarFrame.getByRole('button', { name: 'Start App Logging' })
      );

      await expect(logsFrame.locator('#log-table-body td.empty-row')).toHaveCount(0, {
        timeout: 10000,
      });

      const activeAppName = await logsFrame
        .getByLabel('Select app')
        .evaluate((element) => (element instanceof HTMLSelectElement ? element.value : ''));
      expect(activeAppName.length).toBeGreaterThan(0);

      await logsFrame.evaluate((appName) => {
        const lines = [
          '2026-04-15T19:12:40.00+0700 [APP/PROC/WEB/0] OUT Warning while calling MainService/getMaterialMulesoftData',
          '400 - Error: No Valid Data Found. Please check key combination Material and/or Base UoM',
          '    at ActionGetMaterialMulesoftDataHandler.getMaterialMulesoftData (/srv/functions/Main/ActionGetMaterialMulesoftDataHandler.ts:41:20)',
        ];

        window.dispatchEvent(
          new MessageEvent('message', {
            data: {
              type: 'sapTools.logsAppend',
              appName,
              lines,
            },
          })
        );
      }, activeAppName);

      const searchBox = logsFrame.getByLabel('Search logs');
      await searchBox.fill('No Valid Data Found');
      await expect(logsFrame.locator('#log-table-body tr')).toHaveCount(1, { timeout: 5000 });
      await expect(
        logsFrame.locator('#log-table-body tr').first().locator('td.col-level .badge')
      ).toHaveText('ERROR');
    } finally {
      await cleanupExtensionHost(session);
    }
  });

  test('CF logs panel silently drops CF CLI infrastructure messages from the log table', async () => {
    const session = await launchExtensionHost();

    try {
      const sidebarFrame = await openSapToolsSidebar(session.window);
      const logsFrame = await openCfLogsPanel(session.window);
      await selectDefaultScope(sidebarFrame);

      const confirmButton = sidebarFrame.getByRole('button', { name: 'Confirm Scope' });
      await expect(confirmButton).toBeEnabled({ timeout: 10000 });
      await clickWithFallback(confirmButton);

      await clickWithFallback(sidebarFrame.getByLabel('Select finance-uat-api'));
      await clickWithFallback(
        sidebarFrame.getByRole('button', { name: 'Start App Logging' })
      );

      await expect(logsFrame.locator('#log-table-body td.empty-row')).toHaveCount(0, {
        timeout: 10000,
      });

      const searchBox = logsFrame.getByLabel('Search logs');
      await searchBox.fill('Failed to retrieve logs from Log Cache');
      await expect(logsFrame.locator('#log-table-body tr td.empty-row')).toBeVisible({
        timeout: 5000,
      });
    } finally {
      await cleanupExtensionHost(session);
    }
  });

  test('CF logs panel dropdown removes app after stop logging from sidebar', async () => {
    const session = await launchExtensionHost();

    try {
      const sidebarFrame = await openSapToolsSidebar(session.window);
      const logsFrame = await openCfLogsPanel(session.window);
      await selectDefaultScope(sidebarFrame);

      const confirmButton = sidebarFrame.getByRole('button', { name: 'Confirm Scope' });
      await expect(confirmButton).toBeEnabled({ timeout: 10000 });
      await clickWithFallback(confirmButton);

      await clickWithFallback(sidebarFrame.getByLabel('Select finance-uat-api'));
      await clickWithFallback(sidebarFrame.getByLabel('Select finance-uat-worker'));
      await clickWithFallback(
        sidebarFrame.getByRole('button', { name: 'Start App Logging' })
      );

      const appSelect = logsFrame.getByLabel('Select app');
      await expect
        .poll(
          async () => appSelect.locator('option').count(),
          { timeout: 15000 }
        ).toBe(2);

      const apiRow = sidebarFrame.locator('.active-app-row', {
        hasText: 'finance-uat-api',
      });
      await expect(apiRow).toBeVisible({ timeout: 10000 });
      await clickWithFallback(apiRow.getByRole('button', { name: 'Stop' }));

      await expect
        .poll(
          async () => appSelect.locator('option').count(),
          { timeout: 15000 }
        ).toBe(1);

      const optionTexts = await appSelect.locator('option').allTextContents();
      expect(optionTexts.some((text) => text.includes('finance-uat-api'))).toBe(false);
      expect(optionTexts.some((text) => text.includes('finance-uat-worker'))).toBe(true);
    } finally {
      await cleanupExtensionHost(session);
    }
  });

  test('CF logs panel shows empty state when selected space has no running apps', async () => {
    const session = await launchExtensionHost();
    const DATA_FOUNDATION_ORG = /data-foundation-prod/i;
    const NOAPPS_SPACE = /^noapps$/i;

    try {
      const sidebarFrame = await openSapToolsSidebar(session.window);
      const logsFrame = await openCfLogsPanel(session.window);

      // Navigate: area → region → data-foundation-prod → noapps (space with zero apps).
      await clickWithFallback(sidebarFrame.getByRole('button', { name: AREA_TO_SELECT }));
      await clickWithFallback(sidebarFrame.getByRole('button', { name: REGION_TO_SELECT }));
      await expect(
        sidebarFrame.getByRole('button', { name: DATA_FOUNDATION_ORG })
      ).toBeVisible({ timeout: 10000 });
      await clickWithFallback(sidebarFrame.getByRole('button', { name: DATA_FOUNDATION_ORG }));
      await expect(
        sidebarFrame.getByRole('button', { name: NOAPPS_SPACE })
      ).toBeVisible({ timeout: 10000 });
      await clickWithFallback(sidebarFrame.getByRole('button', { name: NOAPPS_SPACE }));

      // App selector should be disabled with no-apps placeholder text.
      const appSelect = logsFrame.getByLabel('Select app');
      await expect(appSelect).toBeDisabled({ timeout: 10000 });

      // Log table should show exactly one empty-state row — no data rows.
      await expect
        .poll(
          async () => logsFrame.locator('#log-table-body td.empty-row').isVisible(),
          { timeout: 15000 }
        )
        .toBe(true);

      const dataRowCount = await logsFrame
        .locator('#log-table-body tr td:not(.empty-row)')
        .count();
      expect(dataRowCount).toBe(0);
    } finally {
      await cleanupExtensionHost(session);
    }
  });

  test('CF logs panel resets to empty state when apps fetch fails for selected space', async () => {
    const session = await launchExtensionHost();

    try {
      const sidebarFrame = await openSapToolsSidebar(session.window);
      const logsFrame = await openCfLogsPanel(session.window);
      await selectDefaultScope(sidebarFrame);

      const confirmButton = sidebarFrame.getByRole('button', { name: 'Confirm Scope' });
      await expect(confirmButton).toBeEnabled({ timeout: 10000 });
      await clickWithFallback(confirmButton);

      await clickWithFallback(sidebarFrame.getByLabel('Select finance-uat-api'));
      await clickWithFallback(
        sidebarFrame.getByRole('button', { name: 'Start App Logging' })
      );

      await expect(logsFrame.locator('#log-table-body td.empty-row')).toHaveCount(0, {
        timeout: 10000,
      });

      await logsFrame.evaluate(() => {
        window.dispatchEvent(
          new MessageEvent('message', {
            data: {
              type: 'sapTools.appsUpdate',
              apps: [],
              selectedApp: '',
            },
          })
        );
        window.dispatchEvent(
          new MessageEvent('message', {
            data: {
              type: 'sapTools.activeAppsUpdate',
              appNames: [],
            },
          })
        );
      });

      const appSelect = logsFrame.getByLabel('Select app');
      await expect(appSelect).toBeDisabled({ timeout: 10000 });

      await expect
        .poll(
          async () => logsFrame.locator('#log-table-body td.empty-row').isVisible(),
          { timeout: 15000 }
        )
        .toBe(true);

      const dataRowCount = await logsFrame
        .locator('#log-table-body tr td:not(.empty-row)')
        .count();
      expect(dataRowCount).toBe(0);
    } finally {
      await cleanupExtensionHost(session);
    }
  });

  test('CF logs panel gear button opens settings panel with correct default column state', async () => {
    const session = await launchExtensionHost();

    try {
      await openSapToolsSidebar(session.window);
      const logsFrame = await openCfLogsPanel(session.window);

      // Settings panel is hidden by default.
      await expect(logsFrame.locator('#settings-panel')).toBeHidden({ timeout: 10000 });

      // Gear button should be visible.
      const gearButton = logsFrame.getByLabel('Column settings');
      await expect(gearButton).toBeVisible({ timeout: 10000 });

      // Click gear to open settings panel.
      await clickWithFallback(gearButton);
      await expect(logsFrame.locator('#settings-panel')).toBeVisible({ timeout: 5000 });
      await expect(gearButton).toHaveClass(/is-active/);

      // Default checked: Time, Level, Logger, Message.
      // Default unchecked: Source, Stream.
      const checkboxState = await logsFrame.evaluate(() => {
        const items = Array.from(
          document.querySelectorAll('#settings-column-toggles .settings-column-item')
        );
        return items.map((item) => {
          const cb = item.querySelector('input[type="checkbox"]');
          const span = item.querySelector('span');
          return {
            label: span?.textContent ?? '',
            checked: cb instanceof HTMLInputElement ? cb.checked : false,
          };
        });
      });

      const byLabel = Object.fromEntries(checkboxState.map((s) => [s.label, s.checked]));
      expect(byLabel['Time']).toBe(true);
      expect(byLabel['Level']).toBe(true);
      expect(byLabel['Logger']).toBe(true);
      expect(byLabel['Message']).toBe(true);
      expect(byLabel['Source']).toBe(false);
      expect(byLabel['Stream']).toBe(false);

      // Clicking gear again should close the panel.
      await clickWithFallback(gearButton);
      await expect(logsFrame.locator('#settings-panel')).toBeHidden({ timeout: 5000 });
      await expect(gearButton).not.toHaveClass(/is-active/);
    } finally {
      await cleanupExtensionHost(session);
    }
  });

  test('CF logs panel keeps canonical header order when Level column is toggled', async () => {
    const session = await launchExtensionHost();

    try {
      await openSapToolsSidebar(session.window);
      const logsFrame = await openCfLogsPanel(session.window);

      const readHeaderOrder = async (): Promise<string[]> => {
        const texts = await logsFrame.locator('#log-table-head th').allTextContents();
        return texts.map((text) => text.trim()).filter((text) => text.length > 0);
      };

      await expect
        .poll(readHeaderOrder, { timeout: 10000 })
        .toEqual(['Time', 'Level', 'Logger', 'Message']);

      const gearButton = logsFrame.getByLabel('Column settings');
      await clickWithFallback(gearButton);

      const levelCheckbox = logsFrame
        .locator('#settings-column-toggles .settings-column-item')
        .filter({ hasText: 'Level' })
        .locator('input[type="checkbox"]');

      await expect(levelCheckbox).toBeChecked();

      await clickWithFallback(levelCheckbox);
      await expect(levelCheckbox).not.toBeChecked();
      await expect
        .poll(readHeaderOrder, { timeout: 5000 })
        .toEqual(['Time', 'Logger', 'Message']);

      await clickWithFallback(levelCheckbox);
      await expect(levelCheckbox).toBeChecked();
      await expect
        .poll(readHeaderOrder, { timeout: 5000 })
        .toEqual(['Time', 'Level', 'Logger', 'Message']);
    } finally {
      await cleanupExtensionHost(session);
    }
  });

  test('CF logs panel settings toggle Source and Stream columns in table header', async () => {
    const session = await launchExtensionHost();

    try {
      await openSapToolsSidebar(session.window);
      const logsFrame = await openCfLogsPanel(session.window);
      const gearButton = logsFrame.getByLabel('Column settings');
      await clickWithFallback(gearButton);

      const sourceCheckbox = logsFrame
        .locator('#settings-column-toggles .settings-column-item')
        .filter({ hasText: 'Source' })
        .locator('input[type="checkbox"]');
      const streamCheckbox = logsFrame
        .locator('#settings-column-toggles .settings-column-item')
        .filter({ hasText: 'Stream' })
        .locator('input[type="checkbox"]');

      if (await sourceCheckbox.isChecked()) {
        await clickWithFallback(sourceCheckbox);
      }
      if (await streamCheckbox.isChecked()) {
        await clickWithFallback(streamCheckbox);
      }

      await expect(sourceCheckbox).not.toBeChecked();
      await expect(streamCheckbox).not.toBeChecked();
      const baselineHeaders = await logsFrame
        .locator('#log-table-head th')
        .allTextContents();
      expect(baselineHeaders.includes('Source')).toBe(false);
      expect(baselineHeaders.includes('Stream')).toBe(false);

      await clickWithFallback(sourceCheckbox);
      await expect(sourceCheckbox).toBeChecked();
      const withSourceHeaders = await logsFrame.locator('#log-table-head th').allTextContents();
      expect(withSourceHeaders.includes('Source')).toBe(true);
      expect(withSourceHeaders.length).toBe(baselineHeaders.length + 1);

      await clickWithFallback(streamCheckbox);
      await expect(streamCheckbox).toBeChecked();
      const withSourceAndStreamHeaders = await logsFrame
        .locator('#log-table-head th')
        .allTextContents();
      expect(withSourceAndStreamHeaders.includes('Source')).toBe(true);
      expect(withSourceAndStreamHeaders.includes('Stream')).toBe(true);
      expect(withSourceAndStreamHeaders.length).toBe(baselineHeaders.length + 2);

      await clickWithFallback(sourceCheckbox);
      await clickWithFallback(streamCheckbox);
      await expect(sourceCheckbox).not.toBeChecked();
      await expect(streamCheckbox).not.toBeChecked();
      const restoredHeaders = await logsFrame.locator('#log-table-head th').allTextContents();
      const restoredSorted = [...restoredHeaders].sort();
      const baselineSorted = [...baselineHeaders].sort();
      expect(restoredSorted).toEqual(baselineSorted);
      expect(restoredHeaders.includes('Source')).toBe(false);
      expect(restoredHeaders.includes('Stream')).toBe(false);
    } finally {
      await cleanupExtensionHost(session);
    }
  });

  test('CF logs panel shows concise row count summary', async () => {
    const session = await launchExtensionHost();

    try {
      const sidebarFrame = await openSapToolsSidebar(session.window);
      const logsFrame = await openCfLogsPanel(session.window);
      await selectDefaultScope(sidebarFrame);

      const confirmButton = sidebarFrame.getByRole('button', { name: 'Confirm Scope' });
      await expect(confirmButton).toBeEnabled({ timeout: 10000 });
      await clickWithFallback(confirmButton);

      await clickWithFallback(sidebarFrame.getByLabel('Select finance-uat-api'));
      await clickWithFallback(
        sidebarFrame.getByRole('button', { name: 'Start App Logging' })
      );

      await expect(logsFrame.locator('#log-table-body td.empty-row')).toHaveCount(0, {
        timeout: 10000,
      });

      const summary = logsFrame.locator('#table-summary');
      await expect(summary).toHaveText(/^\d+ of \d+ rows$/, { timeout: 10000 });
      await expect(summary).not.toContainText('visible');
      await expect(summary).not.toContainText('stream=');
    } finally {
      await cleanupExtensionHost(session);
    }
  });

  test('CF logs panel settings include font size options and update table typography', async () => {
    const session = await launchExtensionHost();

    try {
      const sidebarFrame = await openSapToolsSidebar(session.window);
      const logsFrame = await openCfLogsPanel(session.window);
      await selectDefaultScope(sidebarFrame);

      const confirmButton = sidebarFrame.getByRole('button', { name: 'Confirm Scope' });
      await expect(confirmButton).toBeEnabled({ timeout: 10000 });
      await clickWithFallback(confirmButton);

      await clickWithFallback(sidebarFrame.getByLabel('Select finance-uat-api'));
      await clickWithFallback(
        sidebarFrame.getByRole('button', { name: 'Start App Logging' })
      );

      await expect(logsFrame.locator('#log-table-body td.empty-row')).toHaveCount(0, {
        timeout: 10000,
      });

      const gearButton = logsFrame.getByLabel('Column settings');
      await clickWithFallback(gearButton);
      await expect(logsFrame.locator('#settings-panel')).toBeVisible({ timeout: 5000 });

      const fontSizeSelect = logsFrame.getByLabel('Log table font size');
      await expect(fontSizeSelect).toBeVisible({ timeout: 5000 });
      await expect(fontSizeSelect).toHaveValue('default');

      const optionLabels = await fontSizeSelect.locator('option').allTextContents();
      expect(optionLabels).toEqual(['Smaller', 'Default', 'Large', 'Extra Large']);

      const getTableFontSize = async (): Promise<number> => {
        const size = await logsFrame.locator('.cf-log-table').evaluate((element) => {
          const parsed = Number.parseFloat(getComputedStyle(element).fontSize);
          return Number.isFinite(parsed) ? parsed : 0;
        });
        return size;
      };

      const defaultFontSize = await getTableFontSize();
      await fontSizeSelect.selectOption('large');
      const largeFontSize = await getTableFontSize();
      await fontSizeSelect.selectOption('smaller');
      const smallerFontSize = await getTableFontSize();

      expect(defaultFontSize).toBeGreaterThan(0);
      expect(largeFontSize).toBeGreaterThan(defaultFontSize);
      expect(smallerFontSize).toBeLessThan(defaultFontSize);
    } finally {
      await cleanupExtensionHost(session);
    }
  });

  test('CF logs panel settings include log limit options and enforce selected row cap', async () => {
    const session = await launchExtensionHost();

    try {
      const sidebarFrame = await openSapToolsSidebar(session.window);
      const logsFrame = await openCfLogsPanel(session.window);
      await selectDefaultScope(sidebarFrame);

      const confirmButton = sidebarFrame.getByRole('button', { name: 'Confirm Scope' });
      await expect(confirmButton).toBeEnabled({ timeout: 10000 });
      await clickWithFallback(confirmButton);

      await clickWithFallback(sidebarFrame.getByLabel('Select finance-uat-api'));
      await clickWithFallback(
        sidebarFrame.getByRole('button', { name: 'Start App Logging' })
      );

      await expect(logsFrame.locator('#log-table-body td.empty-row')).toHaveCount(0, {
        timeout: 10000,
      });

      const gearButton = logsFrame.getByLabel('Column settings');
      await clickWithFallback(gearButton);
      await expect(logsFrame.locator('#settings-panel')).toBeVisible({ timeout: 5000 });

      const logLimitSelect = logsFrame.getByLabel('Log row limit');
      await expect(logLimitSelect).toBeVisible({ timeout: 5000 });
      await expect(logLimitSelect).toHaveValue('300');
      await expect(logLimitSelect.locator('option')).toHaveText(['300', '500', '1000', '3000']);

      const activeAppName = await logsFrame
        .getByLabel('Select app')
        .evaluate((element) => (element instanceof HTMLSelectElement ? element.value : ''));
      expect(activeAppName.length).toBeGreaterThan(0);

      await logsFrame.evaluate((appName) => {
        const lines: string[] = [];
        for (let index = 0; index < 360; index += 1) {
          const second = String(index % 60).padStart(2, '0');
          lines.push(
            `2026-04-12T10:10:${second}.00+0700 [APP/PROC/WEB/0] OUT synthetic burst row ${String(index)}`
          );
        }
        window.dispatchEvent(
          new MessageEvent('message', {
            data: {
              type: 'sapTools.logsAppend',
              appName,
              lines,
            },
          })
        );
      }, activeAppName);

      await expect(logsFrame.locator('#table-summary')).toHaveText('300 of 300 rows', {
        timeout: 10000,
      });

      await logLimitSelect.selectOption('500');

      await logsFrame.evaluate((appName) => {
        const lines: string[] = [];
        for (let index = 0; index < 260; index += 1) {
          const second = String(index % 60).padStart(2, '0');
          lines.push(
            `2026-04-12T10:20:${second}.00+0700 [APP/PROC/WEB/0] OUT synthetic follow-up row ${String(index)}`
          );
        }
        window.dispatchEvent(
          new MessageEvent('message', {
            data: {
              type: 'sapTools.logsAppend',
              appName,
              lines,
            },
          })
        );
      }, activeAppName);

      await expect(logsFrame.locator('#table-summary')).toHaveText('500 of 500 rows', {
        timeout: 10000,
      });
    } finally {
      await cleanupExtensionHost(session);
    }
  });

  test('CF logs panel keeps 6px horizontal padding and expected filter layout order', async () => {
    const session = await launchExtensionHost();

    try {
      await openSapToolsSidebar(session.window);
      const logsFrame = await openCfLogsPanel(session.window);

      const layoutSnapshot = await logsFrame.evaluate(() => {
        const panel = document.querySelector('.cf-logs-panel');
        const app = document.querySelector('#filter-app');
        const search = document.querySelector('#filter-search');
        const level = document.querySelector('#filter-level');
        const settings = document.querySelector('#settings-toggle');

        if (
          !(panel instanceof HTMLElement) ||
          !(app instanceof HTMLElement) ||
          !(search instanceof HTMLElement) ||
          !(level instanceof HTMLElement) ||
          !(settings instanceof HTMLElement)
        ) {
          return null;
        }

        const panelStyles = getComputedStyle(panel);
        const bodyStyles = getComputedStyle(document.body);
        const appBox = app.getBoundingClientRect();
        const searchBox = search.getBoundingClientRect();
        const levelBox = level.getBoundingClientRect();
        const settingsBox = settings.getBoundingClientRect();

        return {
          viewportWidth: window.innerWidth,
          bodyPaddingLeft: Number.parseFloat(bodyStyles.paddingLeft),
          bodyPaddingRight: Number.parseFloat(bodyStyles.paddingRight),
          paddingLeft: Number.parseFloat(panelStyles.paddingLeft),
          paddingRight: Number.parseFloat(panelStyles.paddingRight),
          app: { x: appBox.x, y: appBox.y },
          search: { x: searchBox.x, y: searchBox.y },
          level: { x: levelBox.x, y: levelBox.y },
          settings: { x: settingsBox.x, y: settingsBox.y },
        };
      });

      expect(layoutSnapshot).not.toBeNull();
      if (layoutSnapshot === null) {
        return;
      }

      expect(layoutSnapshot.bodyPaddingLeft).toBeLessThanOrEqual(0.5);
      expect(layoutSnapshot.bodyPaddingRight).toBeLessThanOrEqual(0.5);
      expect(layoutSnapshot.paddingLeft).toBeGreaterThanOrEqual(5.5);
      expect(layoutSnapshot.paddingLeft).toBeLessThanOrEqual(6.5);
      expect(layoutSnapshot.paddingRight).toBeGreaterThanOrEqual(5.5);
      expect(layoutSnapshot.paddingRight).toBeLessThanOrEqual(6.5);

      if (layoutSnapshot.viewportWidth <= 900) {
        expect(layoutSnapshot.app.y).toBeCloseTo(layoutSnapshot.level.y, 0);
        expect(layoutSnapshot.level.y).toBeCloseTo(layoutSnapshot.settings.y, 0);
        expect(layoutSnapshot.search.y).toBeGreaterThan(layoutSnapshot.app.y);
      } else {
        expect(layoutSnapshot.app.y).toBeCloseTo(layoutSnapshot.search.y, 0);
        expect(layoutSnapshot.search.y).toBeCloseTo(layoutSnapshot.level.y, 0);
        expect(layoutSnapshot.level.y).toBeCloseTo(layoutSnapshot.settings.y, 0);
        expect(layoutSnapshot.app.x).toBeLessThan(layoutSnapshot.search.x);
        expect(layoutSnapshot.search.x).toBeLessThan(layoutSnapshot.level.x);
        expect(layoutSnapshot.level.x).toBeLessThan(layoutSnapshot.settings.x);
      }
    } finally {
      await cleanupExtensionHost(session);
    }
  });

  test('CF logs panel switches filters into two rows on narrow window width', async () => {
    const session = await launchExtensionHost();

    try {
      await session.window.setViewportSize({ width: 860, height: 900 });
      await openSapToolsSidebar(session.window);
      const logsFrame = await openCfLogsPanel(session.window);

      const layoutSnapshot = await logsFrame.evaluate(() => {
        const app = document.querySelector('#filter-app');
        const search = document.querySelector('#filter-search');
        const level = document.querySelector('#filter-level');
        const settings = document.querySelector('#settings-toggle');

        if (
          !(app instanceof HTMLElement) ||
          !(search instanceof HTMLElement) ||
          !(level instanceof HTMLElement) ||
          !(settings instanceof HTMLElement)
        ) {
          return null;
        }

        const appBox = app.getBoundingClientRect();
        const searchBox = search.getBoundingClientRect();
        const levelBox = level.getBoundingClientRect();
        const settingsBox = settings.getBoundingClientRect();

        return {
          viewportWidth: window.innerWidth,
          app: { x: appBox.x, y: appBox.y },
          search: { x: searchBox.x, y: searchBox.y },
          level: { x: levelBox.x, y: levelBox.y },
          settings: { x: settingsBox.x, y: settingsBox.y },
        };
      });

      expect(layoutSnapshot).not.toBeNull();
      if (layoutSnapshot === null) {
        return;
      }

      expect(layoutSnapshot.viewportWidth).toBeLessThanOrEqual(900);
      expect(layoutSnapshot.app.y).toBeCloseTo(layoutSnapshot.level.y, 0);
      expect(layoutSnapshot.level.y).toBeCloseTo(layoutSnapshot.settings.y, 0);
      expect(layoutSnapshot.search.y).toBeGreaterThan(layoutSnapshot.app.y);
    } finally {
      await cleanupExtensionHost(session);
    }
  });

  test('CF logs panel coalesces stream burst rerenders during live updates', async () => {
    const session = await launchExtensionHost();

    try {
      const sidebarFrame = await openSapToolsSidebar(session.window);
      const logsFrame = await openCfLogsPanel(session.window);
      await selectDefaultScope(sidebarFrame);

      const confirmButton = sidebarFrame.getByRole('button', { name: 'Confirm Scope' });
      await expect(confirmButton).toBeEnabled({ timeout: 10000 });
      await clickWithFallback(confirmButton);

      await clickWithFallback(sidebarFrame.getByLabel('Select finance-uat-api'));
      await clickWithFallback(
        sidebarFrame.getByRole('button', { name: 'Start App Logging' })
      );

      await expect(logsFrame.locator('#log-table-body td.empty-row')).toHaveCount(0, {
        timeout: 10000,
      });

      const rerenderCount = await logsFrame.evaluate(async () => {
        const tableBody = document.querySelector('#log-table-body');
        const appSelect = document.querySelector('#filter-app');

        if (!(tableBody instanceof HTMLTableSectionElement)) {
          return -1;
        }
        if (!(appSelect instanceof HTMLSelectElement) || appSelect.value.length === 0) {
          return -2;
        }

        const targetApp = appSelect.value;
        const originalReplaceChildren = tableBody.replaceChildren.bind(tableBody);
        let replaceCount = 0;

        tableBody.replaceChildren = (
          ...args: Parameters<typeof tableBody.replaceChildren>
        ): void => {
          replaceCount += 1;
          originalReplaceChildren(...args);
        };

        for (let index = 0; index < 80; index += 1) {
          const second = String(index % 60).padStart(2, '0');
          window.dispatchEvent(
            new MessageEvent('message', {
              data: {
                type: 'sapTools.logsAppend',
                appName: targetApp,
                lines: [
                  `2026-04-12T10:45:${second}.00+0700 [APP/PROC/WEB/0] OUT synthetic burst row ${String(index)}`,
                ],
              },
            })
          );
        }

        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => {
            resolve();
          });
        });
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => {
            resolve();
          });
        });

        tableBody.replaceChildren = originalReplaceChildren;
        return replaceCount;
      });

      expect(rerenderCount).toBeGreaterThan(0);
      expect(rerenderCount).toBeLessThanOrEqual(20);
    } finally {
      await cleanupExtensionHost(session);
    }
  });

  test('CF logs panel table fills remaining height on first open and stays stable after settings close', async () => {
    const session = await launchExtensionHost();

    try {
      await openSapToolsSidebar(session.window);
      const logsFrame = await openCfLogsPanel(session.window);

      const measureHeights = async (): Promise<{
        panelHeight: number;
        tableHeight: number;
        ratio: number;
      } | null> => {
        return logsFrame.evaluate(() => {
          const panel = document.querySelector('.cf-logs-panel');
          const tableShell = document.querySelector('.table-shell');
          if (!(panel instanceof HTMLElement) || !(tableShell instanceof HTMLElement)) {
            return null;
          }

          const panelRect = panel.getBoundingClientRect();
          const tableRect = tableShell.getBoundingClientRect();
          return {
            panelHeight: Math.round(panelRect.height),
            tableHeight: Math.round(tableRect.height),
            ratio: tableRect.height / panelRect.height,
          };
        });
      };

      const beforeOpenSettings = await measureHeights();
      expect(beforeOpenSettings).not.toBeNull();
      if (beforeOpenSettings === null) {
        return;
      }

      expect(beforeOpenSettings.panelHeight).toBeGreaterThan(220);
      expect(beforeOpenSettings.tableHeight).toBeGreaterThan(
        Math.round(beforeOpenSettings.panelHeight * 0.55)
      );
      expect(beforeOpenSettings.ratio).toBeGreaterThan(0.55);

      await clickWithFallback(logsFrame.getByLabel('Column settings'));
      const whileSettingsOpen = await measureHeights();
      expect(whileSettingsOpen).not.toBeNull();
      if (whileSettingsOpen === null) {
        return;
      }
      expect(whileSettingsOpen.tableHeight).toBeLessThan(beforeOpenSettings.tableHeight - 40);

      await clickWithFallback(logsFrame.getByLabel('Column settings'));
      const afterCloseSettings = await measureHeights();
      expect(afterCloseSettings).not.toBeNull();
      if (afterCloseSettings === null) {
        return;
      }

      expect(Math.abs(afterCloseSettings.tableHeight - beforeOpenSettings.tableHeight)).toBeLessThanOrEqual(6);
      expect(afterCloseSettings.ratio).toBeGreaterThan(0.55);
    } finally {
      await cleanupExtensionHost(session);
    }
  });

  test('CF logs panel table area is not capped to legacy half-height limit', async () => {
    const session = await launchExtensionHost();

    try {
      await openSapToolsSidebar(session.window);
      const logsFrame = await openCfLogsPanel(session.window);

      const tableShellStyle = await logsFrame.locator('.table-shell').evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          maxHeight: style.maxHeight,
          overflowY: style.overflowY,
        };
      });

      expect(tableShellStyle.maxHeight).toBe('none');
      expect(tableShellStyle.overflowY).toBe('auto');
    } finally {
      await cleanupExtensionHost(session);
    }
  });

  test('CF logs panel preserves row selection when streaming append does not affect the active filtered view', async () => {
    const session = await launchExtensionHost();

    try {
      const sidebarFrame = await openSapToolsSidebar(session.window);
      const logsFrame = await openCfLogsPanel(session.window);
      await selectDefaultScope(sidebarFrame);

      const confirmButton = sidebarFrame.getByRole('button', { name: 'Confirm Scope' });
      await expect(confirmButton).toBeEnabled({ timeout: 10000 });
      await clickWithFallback(confirmButton);

      await clickWithFallback(sidebarFrame.getByLabel('Select finance-uat-api'));
      await clickWithFallback(
        sidebarFrame.getByRole('button', { name: 'Start App Logging' })
      );

      await expect(logsFrame.locator('#log-table-body td.empty-row')).toHaveCount(0, {
        timeout: 10000,
      });

      const levelFilter = logsFrame.getByLabel('Filter by level');
      await levelFilter.selectOption('error');
      await expect(logsFrame.locator('#log-table-body tr')).toHaveCount(2, { timeout: 5000 });

      const firstRow = logsFrame.locator('#log-table-body tr').first();
      const secondRow = logsFrame.locator('#log-table-body tr').nth(1);

      await clickWithFallback(secondRow);
      await expect(secondRow).toHaveClass(/is-selected/);
      await expect(firstRow).not.toHaveClass(/is-selected/);

      const activeAppName = await logsFrame
        .getByLabel('Select app')
        .evaluate((element) => (element instanceof HTMLSelectElement ? element.value : ''));
      expect(activeAppName.length).toBeGreaterThan(0);

      await logsFrame.evaluate((appName) => {
        window.dispatchEvent(
          new MessageEvent('message', {
            data: {
              type: 'sapTools.logsAppend',
              appName,
              lines: [
                '2026-04-12T10:00:01.00+0700 [APP/PROC/WEB/0] OUT {"level":"info","logger":"cds","msg":"routine ping","type":"log"}',
                '2026-04-12T10:00:02.00+0700 [APP/PROC/WEB/0] OUT {"level":"info","logger":"cds","msg":"routine ping","type":"log"}',
              ],
            },
          })
        );
      }, activeAppName);

      await logsFrame.evaluate(
        () => new Promise<void>((resolve) => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              resolve();
            });
          });
        })
      );

      await expect(logsFrame.locator('#log-table-body tr')).toHaveCount(2);
      await expect(secondRow).toHaveClass(/is-selected/);
      await expect(firstRow).not.toHaveClass(/is-selected/);
    } finally {
      await cleanupExtensionHost(session);
    }
  });

  test('CF logs panel scope updates when sidebar workspace is confirmed', async () => {
    const session = await launchExtensionHost();

    try {
      const sidebarFrame = await openSapToolsSidebar(session.window);
      await openCfLogsPanel(session.window);
      await selectDefaultScope(sidebarFrame);
      const confirmButton = sidebarFrame.getByRole('button', { name: /Confirm Scope/i });
      await expect(confirmButton).toBeEnabled();
      await clickWithFallback(confirmButton);

      // Scope should reflect region → org → space selected in the sidebar.
      await expect
        .poll(async () => {
          const frame = await findCfLogsPanelFrame(session.window);
          if (frame === undefined) return '';
          const scopeEl = frame.locator('#workspace-scope');
          return scopeEl.textContent();
        }, { timeout: 15000 })
        .toContain('us-10');
      await expect
        .poll(async () => {
          const frame = await findCfLogsPanelFrame(session.window);
          if (frame === undefined) return '';
          return frame.locator('#workspace-scope').textContent();
        }, { timeout: 15000 })
        .toContain('finance-services-prod');
      await expect
        .poll(async () => {
          const frame = await findCfLogsPanelFrame(session.window);
          if (frame === undefined) return '';
          return frame.locator('#workspace-scope').textContent();
        }, { timeout: 15000 })
        .toContain('uat');
    } finally {
      await cleanupExtensionHost(session);
    }
  });
});
