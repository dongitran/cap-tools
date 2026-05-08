import { test, expect } from '@playwright/test';

import {
  ACTIVITY_BAR_TITLE,
  DEFAULT_THEME_NAME,
  cleanupExtensionHost,
  clickWithFallback,
  launchExtensionHost,
  resolveSapToolsLoginFrame,
  resolveSapToolsRegionFrame,
} from './support/sapToolsHarness';

test.describe('SAP Tools login gate', () => {
  test('User can see login gate when credentials are not set', async () => {
    const session = await launchExtensionHost({ withMockCredentials: false });

    try {
      const sapToolsTab = session.window.getByRole('tab', {
        name: new RegExp(ACTIVITY_BAR_TITLE),
      });
      await expect(sapToolsTab).toBeVisible({ timeout: 20000 });
      await clickWithFallback(sapToolsTab);
      const frame = await resolveSapToolsLoginFrame(session.window);

      await expect(frame.getByRole('heading', { name: 'SAP Tools Login' })).toBeVisible();
      await expect(frame.getByLabel('SAP Email')).toBeVisible();
      await expect(frame.getByLabel('SAP Password')).toBeVisible();
      await expect(
        frame.getByRole('button', { name: 'Save and Continue' })
      ).toBeVisible();
      await expect(frame.getByRole('status')).toHaveText('');

      await expect(
        frame.getByRole('heading', { name: 'Select SAP BTP Region' })
      ).toBeHidden();
    } finally {
      await cleanupExtensionHost(session);
    }
  });

  test('User can submit credentials and reach the region selector', async () => {
    const session = await launchExtensionHost({
      withMockCredentials: false,
      colorTheme: DEFAULT_THEME_NAME,
    });

    try {
      const sapToolsTab = session.window.getByRole('tab', {
        name: new RegExp(ACTIVITY_BAR_TITLE),
      });
      await expect(sapToolsTab).toBeVisible({ timeout: 20000 });
      await clickWithFallback(sapToolsTab);
      const frame = await resolveSapToolsLoginFrame(session.window);

      await expect(frame.getByRole('heading', { name: 'SAP Tools Login' })).toBeVisible();
      await expect(frame.getByRole('status')).toHaveText('');

      await frame.getByLabel('SAP Email').fill('test@example.com');
      await frame.getByLabel('SAP Password').fill('test-password');
      await clickWithFallback(frame.getByRole('button', { name: 'Save and Continue' }));

      await clickWithFallback(sapToolsTab);
      const reloadedFrame = await resolveSapToolsRegionFrame(session.window);
      await expect(
        reloadedFrame.getByRole('heading', { name: 'Select SAP BTP Region' })
      ).toBeVisible({ timeout: 20000 });
    } finally {
      await cleanupExtensionHost(session);
    }
  });

  test('User can see login validation for invalid email', async () => {
    const session = await launchExtensionHost({ withMockCredentials: false });

    try {
      const sapToolsTab = session.window.getByRole('tab', {
        name: new RegExp(ACTIVITY_BAR_TITLE),
      });
      await expect(sapToolsTab).toBeVisible({ timeout: 20000 });
      await clickWithFallback(sapToolsTab);
      const frame = await resolveSapToolsLoginFrame(session.window);

      await frame.getByLabel('SAP Email').fill('not-an-email');
      await frame.getByLabel('SAP Password').fill('some-password');
      await clickWithFallback(frame.getByRole('button', { name: 'Save and Continue' }));

      await expect(
        frame.getByRole('status')
      ).toContainText(/valid SAP email/i, { timeout: 5000 });
      await expect(frame.getByRole('heading', { name: 'SAP Tools Login' })).toBeVisible();
      await expect(
        frame.getByRole('heading', { name: 'Select SAP BTP Region' })
      ).toBeHidden();
    } finally {
      await cleanupExtensionHost(session);
    }
  });
});
