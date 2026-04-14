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

      const messageCell = logsFrame.locator('#log-table-body td.cell-message').first();
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

      const widthSnapshot = await logsFrame.evaluate(() => {
        const headers = Array.from(document.querySelectorAll('.cf-log-table thead th'));
        const widths = headers.map((header) => Math.round(header.getBoundingClientRect().width));
        const total = widths.reduce((sum, width) => sum + width, 0);
        return {
          widths,
          total,
          messageWidth: widths[5] ?? 0,
          loggerWidth: widths[4] ?? 0,
          timeWidth: widths[0] ?? 0,
        };
      });

      const messageRatio = widthSnapshot.total > 0
        ? widthSnapshot.messageWidth / widthSnapshot.total
        : 0;
      const widestNonMessageColumn = Math.max(...widthSnapshot.widths.slice(0, 5));

      expect(messageRatio).toBeGreaterThan(0.55);
      expect(widthSnapshot.messageWidth).toBeGreaterThan(widestNonMessageColumn);
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

      const levelBadges = logsFrame.locator('#log-table-body tr td:nth-child(4) .badge');
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
    const DATA_FOUNDATION_ORG = /data-foundation-prod/i;
    const FAILSPACE = /^failspace$/i;

    try {
      const sidebarFrame = await openSapToolsSidebar(session.window);
      const logsFrame = await openCfLogsPanel(session.window);

      // Navigate: area → region → data-foundation-prod → failspace (simulated CF CLI error).
      await clickWithFallback(sidebarFrame.getByRole('button', { name: AREA_TO_SELECT }));
      await clickWithFallback(sidebarFrame.getByRole('button', { name: REGION_TO_SELECT }));
      await expect(
        sidebarFrame.getByRole('button', { name: DATA_FOUNDATION_ORG })
      ).toBeVisible({ timeout: 10000 });
      await clickWithFallback(sidebarFrame.getByRole('button', { name: DATA_FOUNDATION_ORG }));
      await expect(
        sidebarFrame.getByRole('button', { name: FAILSPACE })
      ).toBeVisible({ timeout: 10000 });
      await clickWithFallback(sidebarFrame.getByRole('button', { name: FAILSPACE }));

      // The extension posts an apps-error to the sidebar and resets the logs panel.
      // App selector should be disabled (panel was reset via updateApps([], null)).
      const appSelect = logsFrame.getByLabel('Select app');
      await expect(appSelect).toBeDisabled({ timeout: 10000 });

      // Log table should show the empty-state row — no data rows left over.
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
