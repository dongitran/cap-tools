import fs from 'node:fs';

import { test, expect, _electron as electron, type Page } from '@playwright/test';

import {
  getExtensionRootDir,
  getTemporaryUserDataDir,
  getTemporaryWorkspaceDir,
  resolveVscodeExecutablePath,
} from '../src/launchVscode';

const ACTIVITY_BAR_TITLE = 'SAP Tools';
const REGION_TO_SELECT = 'US East (VA)';

async function dismissAiSignInModalIfNeeded(window: Page): Promise<void> {
  const signInPrompt = window.getByText('Sign in to use AI Features');
  const appeared = await signInPrompt
    .waitFor({ state: 'visible', timeout: 1500 })
    .then(() => true)
    .catch(() => false);

  if (!appeared) {
    return;
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await window.keyboard.press('Escape');
    const hidden = await signInPrompt.isHidden().catch(() => true);
    if (hidden) {
      return;
    }
  }

  const closeButton = window.getByRole('button', { name: /close/i });
  if (await closeButton.isVisible().catch(() => false)) {
    await closeButton.click();
  }

  await expect(signInPrompt).toBeHidden({ timeout: 10000 });
}

test.describe('SAP Tools region selector', () => {
  test('User can select one SAP BTP region from left sidebar and see output log', async () => {
    const extensionPath = getExtensionRootDir();
    const workspaceDir = getTemporaryWorkspaceDir();
    const userDataDir = getTemporaryUserDataDir();

    const electronApp = await electron.launch({
      executablePath: resolveVscodeExecutablePath(),
      args: [
        workspaceDir,
        `--extensionDevelopmentPath=${extensionPath}`,
        `--user-data-dir=${userDataDir}`,
        '--skip-welcome',
        '--skip-release-notes',
        '--disable-workspace-trust',
        '--new-window',
      ],
      timeout: 180000,
    });

    try {
      const window = await electronApp.firstWindow();
      await window.waitForLoadState('domcontentloaded');
      await dismissAiSignInModalIfNeeded(window);

      const sapToolsTab = window.getByRole('tab', {
        name: new RegExp(ACTIVITY_BAR_TITLE),
      });
      await expect(sapToolsTab).toBeVisible({ timeout: 20000 });
      await sapToolsTab.click();

      const regionItem = window.getByText(REGION_TO_SELECT, { exact: false }).first();
      await expect(regionItem).toBeVisible({ timeout: 20000 });
      await regionItem.click();

      const outputLogLine = window
        .getByText(/Selected SAP BTP region: .*us10/i)
        .first();
      await expect(outputLogLine).toBeVisible({ timeout: 20000 });
    } finally {
      await electronApp.close();
      fs.rmSync(workspaceDir, { recursive: true, force: true });
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }
  });
});
