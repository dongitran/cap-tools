import { test, expect, type Frame } from '@playwright/test';

import {
  cleanupExtensionHost,
  clickWithFallback,
  launchExtensionHost,
  openSapToolsSidebar,
  selectDefaultScope,
  type ExtensionHostSession,
} from './support/sapToolsHarness';

const EXPECTED_UAT_APP_NAMES: readonly string[] = [
  'finance-uat-api',
  'finance-uat-worker',
  'finance-uat-audit',
];

const FAKE_RUNNER_LOCAL_PORT = 39229;

async function openWorkspaceAndDebugTab(
  session: ExtensionHostSession
): Promise<Frame> {
  const webviewFrame = await openSapToolsSidebar(session.window);
  await selectDefaultScope(webviewFrame);
  await clickWithFallback(
    webviewFrame.getByRole('button', { name: 'Confirm Scope' })
  );
  await clickWithFallback(
    webviewFrame.locator('.workspace-tabs .tab-button[data-tab-id="debug"]')
  );
  await expect(webviewFrame.locator('.debug-tab')).toBeVisible();
  await expect(
    webviewFrame.locator('.debug-app-row').first()
  ).toBeVisible({ timeout: 15000 });
  return webviewFrame;
}

test.describe('SAP Tools Debug tab', () => {
  test('User opens the workspace and sees the four workspace tabs in order with Debug replacing the previous Targets tab', async () => {
    const session = await launchExtensionHost();

    try {
      const webviewFrame = await openSapToolsSidebar(session.window);
      await selectDefaultScope(webviewFrame);
      await clickWithFallback(
        webviewFrame.getByRole('button', { name: 'Confirm Scope' })
      );

      const tabs = webviewFrame.locator('.workspace-tabs .tab-button');
      await expect(tabs).toHaveCount(4);
      const tabIds = await tabs.evaluateAll((nodes) =>
        nodes.map((node) => (node as HTMLElement).dataset['tabId'] ?? '')
      );
      expect(tabIds).toEqual(['logs', 'apps', 'debug', 'settings']);
      const tabLabels = await tabs.allInnerTexts();
      expect(tabLabels.map((label) => label.trim())).toEqual([
        'Logs',
        'Apps',
        'Debug',
        'Settings',
      ]);

      await expect(
        webviewFrame.locator('.workspace-tabs .tab-button[data-tab-id="targets"]')
      ).toHaveCount(0);
    } finally {
      await cleanupExtensionHost(session);
    }
  });

  test('User opens the Debug tab for the confirmed scope and sees every started app rendered as an idle row with the Stop all control disabled', async () => {
    const session = await launchExtensionHost();

    try {
      const webviewFrame = await openWorkspaceAndDebugTab(session);

      await expect(
        webviewFrame.getByRole('heading', { name: 'Debug Sessions' })
      ).toBeVisible();
      await expect(
        webviewFrame.locator('input[data-role="debug-search"]')
      ).toBeVisible();

      const rows = webviewFrame.locator('.debug-app-row');
      await expect(rows).toHaveCount(EXPECTED_UAT_APP_NAMES.length);
      const appNames = await rows.evaluateAll((nodes) =>
        nodes.map((node) => (node as HTMLElement).dataset['appName'] ?? '')
      );
      expect(appNames).toEqual([...EXPECTED_UAT_APP_NAMES]);

      const badges = webviewFrame.locator(
        '.debug-app-row [data-role="debug-status"]'
      );
      await expect(badges).toHaveCount(EXPECTED_UAT_APP_NAMES.length);
      const statuses = await badges.evaluateAll((nodes) =>
        nodes.map((node) => (node as HTMLElement).dataset['status'] ?? '')
      );
      expect(new Set(statuses)).toEqual(new Set(['idle']));

      await expect(
        webviewFrame.locator('.debug-app-row [data-role="debug-port"]')
      ).toHaveCount(0);
      await expect(
        webviewFrame.locator(
          '.debug-app-row button[data-action="start-debug-app"]'
        )
      ).toHaveCount(EXPECTED_UAT_APP_NAMES.length);
      await expect(
        webviewFrame.locator(
          '.debug-app-row button[data-action="stop-debug-app"]'
        )
      ).toHaveCount(0);

      const metaTexts = await webviewFrame
        .locator('.debug-app-row [data-role="debug-app-meta"]')
        .allInnerTexts();
      expect(metaTexts).toHaveLength(EXPECTED_UAT_APP_NAMES.length);
      for (const metaText of metaTexts) {
        expect(metaText.trim()).toMatch(/^\d+ running$/);
        expect(metaText.toLowerCase()).not.toContain('undefined');
        expect(metaText.toLowerCase()).not.toContain('nan');
      }

      const stopAll = webviewFrame.locator(
        'button[data-action="stop-all-debug-apps"]'
      );
      await expect(stopAll).toBeVisible();
      await expect(stopAll).toBeDisabled();
      await expect(stopAll).toHaveText('Stop all');
    } finally {
      await cleanupExtensionHost(session);
    }
  });

  test('User starts a debug session and the row transitions through the busy and ready states before settling at attached with the forwarded port exposed', async () => {
    const session = await launchExtensionHost();

    try {
      const webviewFrame = await openWorkspaceAndDebugTab(session);

      const targetAppName = EXPECTED_UAT_APP_NAMES[0] ?? '';
      expect(targetAppName.length).toBeGreaterThan(0);
      const targetRow = webviewFrame.locator(
        `.debug-app-row[data-app-name="${targetAppName}"]`
      );
      await expect(targetRow).toBeVisible();

      const observedStatuses: string[] = [];
      await webviewFrame.evaluate(
        ({ appName, key }: { appName: string; key: string }) => {
          (window as unknown as Record<string, string[]>)[key] = [];
          const observer = new MutationObserver(() => {
            const badge = document.querySelector(
              `.debug-app-row[data-app-name="${appName}"] [data-role="debug-status"]`
            );
            if (badge instanceof HTMLElement) {
              const status = badge.dataset['status'] ?? '';
              const log = (window as unknown as Record<string, string[]>)[key];
              if (
                Array.isArray(log) &&
                (log.length === 0 || log[log.length - 1] !== status)
              ) {
                log.push(status);
              }
            }
          });
          observer.observe(document.body, {
            subtree: true,
            childList: true,
            attributes: true,
            attributeFilter: ['data-status'],
          });
          (
            window as unknown as Record<string, MutationObserver>
          )[`${key}-observer`] = observer;
        },
        { appName: targetAppName, key: '__sapToolsDebugStatusLog' }
      );

      await clickWithFallback(
        targetRow.locator('button[data-action="start-debug-app"]')
      );

      const badge = targetRow.locator('[data-role="debug-status"]');
      await expect(badge).toHaveAttribute('data-status', 'attached', {
        timeout: 20000,
      });

      observedStatuses.push(
        ...(await webviewFrame.evaluate((key: string) => {
          const log =
            (window as unknown as Record<string, string[]>)[key] ?? [];
          return [...log];
        }, '__sapToolsDebugStatusLog'))
      );

      expect(observedStatuses[0]).toBe('starting');
      expect(observedStatuses).toContain('tunneling');
      expect(observedStatuses).toContain('ready');
      expect(observedStatuses[observedStatuses.length - 1]).toBe('attached');

      await expect(
        targetRow.locator('button[data-action="stop-debug-app"]')
      ).toBeVisible();
      await expect(
        targetRow.locator('button[data-action="start-debug-app"]')
      ).toHaveCount(0);

      const portLabel = targetRow.locator('[data-role="debug-port"]');
      await expect(portLabel).toBeVisible();
      await expect(portLabel).toHaveText(`:${String(FAKE_RUNNER_LOCAL_PORT)}`);

      const targetMeta = await targetRow
        .locator('[data-role="debug-app-meta"]')
        .innerText();
      expect(targetMeta.trim()).toMatch(/^\d+ running$/);
      expect(targetMeta.toLowerCase()).not.toContain('undefined');

      const stopAll = webviewFrame.locator(
        'button[data-action="stop-all-debug-apps"]'
      );
      await expect(stopAll).toBeEnabled();
      await expect(stopAll).toHaveText('Stop all (1)');
    } finally {
      await cleanupExtensionHost(session);
    }
  });

  test('User stops a running debug session and the row returns to the stopped state with a Start control restored and no forwarded port shown', async () => {
    const session = await launchExtensionHost();

    try {
      const webviewFrame = await openWorkspaceAndDebugTab(session);

      const targetAppName = EXPECTED_UAT_APP_NAMES[0] ?? '';
      const targetRow = webviewFrame.locator(
        `.debug-app-row[data-app-name="${targetAppName}"]`
      );
      const badge = targetRow.locator('[data-role="debug-status"]');

      await clickWithFallback(
        targetRow.locator('button[data-action="start-debug-app"]')
      );
      await expect(badge).toHaveAttribute('data-status', 'attached', {
        timeout: 20000,
      });

      await clickWithFallback(
        targetRow.locator('button[data-action="stop-debug-app"]')
      );
      await expect(badge).toHaveAttribute('data-status', 'stopped', {
        timeout: 15000,
      });

      await expect(
        targetRow.locator('button[data-action="start-debug-app"]')
      ).toBeVisible();
      await expect(
        targetRow.locator('button[data-action="stop-debug-app"]')
      ).toHaveCount(0);
      await expect(
        targetRow.locator('[data-role="debug-port"]')
      ).toHaveCount(0);
      await expect(
        webviewFrame.locator('button[data-action="stop-all-debug-apps"]')
      ).toBeDisabled();
    } finally {
      await cleanupExtensionHost(session);
    }
  });

  test('User restarts a previously stopped debug session and the row reaches attached again with the forwarded port exposed', async () => {
    const session = await launchExtensionHost();

    try {
      const webviewFrame = await openWorkspaceAndDebugTab(session);

      const targetAppName = EXPECTED_UAT_APP_NAMES[0] ?? '';
      const targetRow = webviewFrame.locator(
        `.debug-app-row[data-app-name="${targetAppName}"]`
      );
      const badge = targetRow.locator('[data-role="debug-status"]');

      await clickWithFallback(
        targetRow.locator('button[data-action="start-debug-app"]')
      );
      await expect(badge).toHaveAttribute('data-status', 'attached', {
        timeout: 20000,
      });

      await clickWithFallback(
        targetRow.locator('button[data-action="stop-debug-app"]')
      );
      await expect(badge).toHaveAttribute('data-status', 'stopped', {
        timeout: 15000,
      });

      await clickWithFallback(
        targetRow.locator('button[data-action="start-debug-app"]')
      );
      await expect(badge).toHaveAttribute('data-status', 'attached', {
        timeout: 20000,
      });
      await expect(
        targetRow.locator('[data-role="debug-port"]')
      ).toHaveText(`:${String(FAKE_RUNNER_LOCAL_PORT)}`);
    } finally {
      await cleanupExtensionHost(session);
    }
  });

  test('User starts two debug sessions and both rows reach the attached state independently while Stop all reflects the active count', async () => {
    const session = await launchExtensionHost();

    try {
      const webviewFrame = await openWorkspaceAndDebugTab(session);

      const firstApp = EXPECTED_UAT_APP_NAMES[0] ?? '';
      const secondApp = EXPECTED_UAT_APP_NAMES[1] ?? '';
      expect(firstApp.length).toBeGreaterThan(0);
      expect(secondApp.length).toBeGreaterThan(0);

      const firstRow = webviewFrame.locator(
        `.debug-app-row[data-app-name="${firstApp}"]`
      );
      const secondRow = webviewFrame.locator(
        `.debug-app-row[data-app-name="${secondApp}"]`
      );

      await clickWithFallback(
        firstRow.locator('button[data-action="start-debug-app"]')
      );
      await clickWithFallback(
        secondRow.locator('button[data-action="start-debug-app"]')
      );

      await expect(
        firstRow.locator('[data-role="debug-status"]')
      ).toHaveAttribute('data-status', 'attached', { timeout: 20000 });
      await expect(
        secondRow.locator('[data-role="debug-status"]')
      ).toHaveAttribute('data-status', 'attached', { timeout: 20000 });

      await expect(
        firstRow.locator('[data-role="debug-port"]')
      ).toHaveText(`:${String(FAKE_RUNNER_LOCAL_PORT)}`);
      await expect(
        secondRow.locator('[data-role="debug-port"]')
      ).toHaveText(`:${String(FAKE_RUNNER_LOCAL_PORT)}`);

      const stopAll = webviewFrame.locator(
        'button[data-action="stop-all-debug-apps"]'
      );
      await expect(stopAll).toBeEnabled();
      await expect(stopAll).toHaveText('Stop all (2)');
    } finally {
      await cleanupExtensionHost(session);
    }
  });

  test('User clicks Stop all while two debug sessions are attached and both rows return to the stopped state with the Stop all control disabled', async () => {
    const session = await launchExtensionHost();

    try {
      const webviewFrame = await openWorkspaceAndDebugTab(session);

      const firstApp = EXPECTED_UAT_APP_NAMES[0] ?? '';
      const secondApp = EXPECTED_UAT_APP_NAMES[1] ?? '';
      const firstRow = webviewFrame.locator(
        `.debug-app-row[data-app-name="${firstApp}"]`
      );
      const secondRow = webviewFrame.locator(
        `.debug-app-row[data-app-name="${secondApp}"]`
      );

      await clickWithFallback(
        firstRow.locator('button[data-action="start-debug-app"]')
      );
      await clickWithFallback(
        secondRow.locator('button[data-action="start-debug-app"]')
      );

      await expect(
        firstRow.locator('[data-role="debug-status"]')
      ).toHaveAttribute('data-status', 'attached', { timeout: 20000 });
      await expect(
        secondRow.locator('[data-role="debug-status"]')
      ).toHaveAttribute('data-status', 'attached', { timeout: 20000 });

      const stopAll = webviewFrame.locator(
        'button[data-action="stop-all-debug-apps"]'
      );
      await expect(stopAll).toBeEnabled();
      await clickWithFallback(stopAll);

      await expect(
        firstRow.locator('[data-role="debug-status"]')
      ).toHaveAttribute('data-status', 'stopped', { timeout: 15000 });
      await expect(
        secondRow.locator('[data-role="debug-status"]')
      ).toHaveAttribute('data-status', 'stopped', { timeout: 15000 });

      await expect(stopAll).toBeDisabled();
      await expect(stopAll).toHaveText('Stop all');
      await expect(
        webviewFrame.locator('.debug-app-row [data-role="debug-port"]')
      ).toHaveCount(0);
    } finally {
      await cleanupExtensionHost(session);
    }
  });

  test('User filters the debug app list using a matching prefix and only matching rows remain visible', async () => {
    const session = await launchExtensionHost();

    try {
      const webviewFrame = await openWorkspaceAndDebugTab(session);

      const search = webviewFrame.locator('input[data-role="debug-search"]');
      const rows = webviewFrame.locator('.debug-app-row');

      await expect(rows).toHaveCount(EXPECTED_UAT_APP_NAMES.length);

      await search.fill('worker');
      await expect(rows).toHaveCount(1);
      await expect(rows.first()).toHaveAttribute(
        'data-app-name',
        'finance-uat-worker'
      );

      await search.fill('');
      await expect(rows).toHaveCount(EXPECTED_UAT_APP_NAMES.length);
    } finally {
      await cleanupExtensionHost(session);
    }
  });

  test('User filters the debug app list with a search term that matches no apps and an empty-state hint is displayed', async () => {
    const session = await launchExtensionHost();

    try {
      const webviewFrame = await openWorkspaceAndDebugTab(session);

      const search = webviewFrame.locator('input[data-role="debug-search"]');
      await search.fill('zzz-no-such-app-zzz');

      await expect(webviewFrame.locator('.debug-app-row')).toHaveCount(0);
      await expect(
        webviewFrame.locator('.debug-tab .debug-empty-note')
      ).toContainText('No apps match');
    } finally {
      await cleanupExtensionHost(session);
    }
  });

  test('User leaves the Debug tab while a session is attached and on returning the row still reports the attached status with the forwarded port', async () => {
    const session = await launchExtensionHost();

    try {
      const webviewFrame = await openWorkspaceAndDebugTab(session);

      const targetAppName = EXPECTED_UAT_APP_NAMES[0] ?? '';
      const targetRow = webviewFrame.locator(
        `.debug-app-row[data-app-name="${targetAppName}"]`
      );

      await clickWithFallback(
        targetRow.locator('button[data-action="start-debug-app"]')
      );
      await expect(
        targetRow.locator('[data-role="debug-status"]')
      ).toHaveAttribute('data-status', 'attached', { timeout: 20000 });

      await clickWithFallback(
        webviewFrame.locator('.workspace-tabs .tab-button[data-tab-id="logs"]')
      );
      await expect(webviewFrame.locator('.app-logs-panel')).toBeVisible();

      await clickWithFallback(
        webviewFrame.locator('.workspace-tabs .tab-button[data-tab-id="debug"]')
      );

      const restoredRow = webviewFrame.locator(
        `.debug-app-row[data-app-name="${targetAppName}"]`
      );
      await expect(
        restoredRow.locator('[data-role="debug-status"]')
      ).toHaveAttribute('data-status', 'attached', { timeout: 10000 });
      await expect(
        restoredRow.locator('[data-role="debug-port"]')
      ).toHaveText(`:${String(FAKE_RUNNER_LOCAL_PORT)}`);
      await expect(
        restoredRow.locator('button[data-action="stop-debug-app"]')
      ).toBeVisible();
    } finally {
      await cleanupExtensionHost(session);
    }
  });
});
