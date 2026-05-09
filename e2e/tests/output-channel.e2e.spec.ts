import { test, expect } from '@playwright/test';

import {
  cleanupExtensionHost,
  clickWithFallback,
  launchExtensionHost,
  openSapToolsOutputChannel,
  openSapToolsSidebar,
  readVisibleOutputChannelText,
  selectDefaultScope,
} from './support/sapToolsHarness';

test.describe('SAP Tools output channel', () => {
  test('User can inspect topology scope and SQL actions in the output channel', async () => {
    const session = await launchExtensionHost();

    try {
      const webviewFrame = await openSapToolsSidebar(session.window);
      await selectDefaultScope(webviewFrame);
      await clickWithFallback(webviewFrame.getByRole('button', { name: 'Confirm Scope' }));
      await expect(
        webviewFrame.getByRole('heading', { name: 'Monitoring Workspace' })
      ).toBeVisible({ timeout: 10000 });

      await clickWithFallback(webviewFrame.getByRole('tab', { name: 'SQL' }));
      await clickWithFallback(webviewFrame.getByRole('button', { name: 'finance-uat-api' }));
      await expect(webviewFrame.locator('[data-role="hana-tables-count"]')).toHaveText('105', {
        timeout: 15000,
      });

      await openSapToolsOutputChannel(session.window);
      await expect
        .poll(
          async () => readVisibleOutputChannelText(session.window),
          { timeout: 15000 }
        )
        .toContain('[topology] Pushed snapshot ready=true');
      const outputText = await readVisibleOutputChannelText(session.window);
      const normalizedOutputText = outputText.replace(/\s+/g, ' ');

      expect(normalizedOutputText).toContain(
        '[scope] Confirmed scope region=us-10 org=finance-services-prod space=uat'
      );
      expect(normalizedOutputText).toContain(
        '[sql-ui] open sql file requested app=finance-uat-api'
      );
      expect(normalizedOutputText).toContain(
        '[sql-ui] load tables succeeded app=finance-uat-api count=105'
      );
      expect(outputText).not.toContain('test-password');
    } finally {
      await cleanupExtensionHost(session);
    }
  });
});
