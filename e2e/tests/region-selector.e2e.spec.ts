import fs from 'node:fs';

import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Frame,
  type Page,
} from '@playwright/test';

import {
  getExtensionRootDir,
  getTemporaryUserDataDir,
  getTemporaryWorkspaceDir,
  resolveVscodeExecutablePath,
} from '../src/launchVscode';

const ACTIVITY_BAR_TITLE = 'SAP Tools';
const AREA_TO_SELECT = /Americas 7 regions/i;
const REGION_TO_SELECT = /US East us-10/i;
const ORG_TO_SELECT = /finance-services-prod/i;
const SPACE_TO_SELECT = /^uat$/i;

interface ExtensionHostSession {
  readonly electronApp: ElectronApplication;
  readonly window: Page;
  readonly workspaceDir: string;
  readonly userDataDir: string;
}

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

async function launchExtensionHost(): Promise<ExtensionHostSession> {
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
    env: {
      ...process.env,
      SAP_TOOLS_E2E: '1',
    },
    timeout: 180000,
  });

  const window = await electronApp.firstWindow();
  await window.waitForLoadState('domcontentloaded');
  await dismissAiSignInModalIfNeeded(window);

  return {
    electronApp,
    window,
    workspaceDir,
    userDataDir,
  };
}

async function cleanupExtensionHost(session: ExtensionHostSession): Promise<void> {
  await session.electronApp.close();
  fs.rmSync(session.workspaceDir, { recursive: true, force: true });
  fs.rmSync(session.userDataDir, { recursive: true, force: true });
}

async function findSapToolsWebviewFrame(window: Page): Promise<Frame | undefined> {
  const candidateFrames = window
    .frames()
    .filter((frame) => frame.url().includes('vscode-webview://'));

  for (const frame of candidateFrames) {
    const title = frame.getByRole('heading', {
      name: 'Select SAP BTP Region',
    });
    const isVisible = await title.isVisible().catch(() => false);
    if (isVisible) {
      return frame;
    }
  }

  return undefined;
}

async function resolveSapToolsWebviewFrame(window: Page): Promise<Frame> {
  await expect
    .poll(async () => {
      const frame = await findSapToolsWebviewFrame(window);
      return frame?.url() ?? '';
    })
    .toContain('vscode-webview://');

  const frame = await findSapToolsWebviewFrame(window);
  if (frame === undefined) {
    throw new Error('SAP Tools webview frame was not found.');
  }

  return frame;
}

async function openSapToolsSidebar(window: Page): Promise<Frame> {
  const sapToolsTab = window.getByRole('tab', {
    name: new RegExp(ACTIVITY_BAR_TITLE),
  });
  await expect(sapToolsTab).toBeVisible({ timeout: 20000 });
  await sapToolsTab.click();

  return resolveSapToolsWebviewFrame(window);
}

async function selectDefaultScope(webviewFrame: Frame): Promise<void> {
  await webviewFrame.getByRole('button', { name: AREA_TO_SELECT }).click();
  await webviewFrame.getByRole('button', { name: REGION_TO_SELECT }).click();
  await webviewFrame.getByRole('button', { name: ORG_TO_SELECT }).click();
  await webviewFrame.getByRole('button', { name: SPACE_TO_SELECT }).click();
}

test.describe('SAP Tools region selector', () => {
  test('User can select one SAP BTP region in webview and output log is emitted', async () => {
    const session = await launchExtensionHost();

    try {
      const webviewFrame = await openSapToolsSidebar(session.window);
      await webviewFrame.getByRole('button', { name: AREA_TO_SELECT }).click();
      await webviewFrame.getByRole('button', { name: REGION_TO_SELECT }).click();

      const selectionNotification = session.window
        .getByText(/Selected SAP BTP region: US East \(us-10\)/i)
        .first();
      await expect(selectionNotification).toBeVisible({ timeout: 20000 });
    } finally {
      await cleanupExtensionHost(session);
    }
  });

  test('User can complete selection flow and reset via Change buttons only', async () => {
    const session = await launchExtensionHost();

    try {
      const webviewFrame = await openSapToolsSidebar(session.window);

      await webviewFrame.getByRole('button', { name: AREA_TO_SELECT }).click();
      await webviewFrame.getByRole('button', { name: REGION_TO_SELECT }).click();

      const regionStateAfterSelect = await webviewFrame.evaluate(() => {
        return {
          selectedRegionId:
            document
              .querySelector('.region-option.is-selected')
              ?.getAttribute('data-region-id') ?? '',
          hiddenRegionCount: document.querySelectorAll('.region-option.is-hidden')
            .length,
          visibleRegionCount: document.querySelectorAll(
            '.region-option:not(.is-hidden)'
          ).length,
        };
      });
      expect(regionStateAfterSelect.selectedRegionId).toBe('eastus');
      expect(regionStateAfterSelect.hiddenRegionCount).toBeGreaterThan(0);
      expect(regionStateAfterSelect.visibleRegionCount).toBe(1);

      await webviewFrame.getByRole('button', { name: REGION_TO_SELECT }).click();
      const regionStateAfterSecondClick = await webviewFrame.evaluate(() => {
        return {
          selectedRegionId:
            document
              .querySelector('.region-option.is-selected')
              ?.getAttribute('data-region-id') ?? '',
          hiddenRegionCount: document.querySelectorAll('.region-option.is-hidden')
            .length,
        };
      });
      expect(regionStateAfterSecondClick.selectedRegionId).toBe('eastus');
      expect(regionStateAfterSecondClick.hiddenRegionCount).toBe(
        regionStateAfterSelect.hiddenRegionCount
      );

      await webviewFrame.getByRole('button', { name: ORG_TO_SELECT }).click();
      await webviewFrame.getByRole('button', { name: SPACE_TO_SELECT }).click();

      const confirmButton = webviewFrame.getByRole('button', {
        name: 'Confirm Scope',
      });
      await expect(confirmButton).toBeEnabled();

      await webviewFrame
        .getByRole('button', { name: 'Change', exact: true })
        .nth(1)
        .click();

      const stateAfterRegionReset = await webviewFrame.evaluate(() => {
        return {
          selectedRegionId:
            document
              .querySelector('.region-option.is-selected')
              ?.getAttribute('data-region-id') ?? '',
          orgStageVisible:
            document.querySelector('[data-stage-id="org"]') !== null,
          spaceStageVisible:
            document.querySelector('[data-stage-id="space"]') !== null,
          visibleRegionCount: document.querySelectorAll(
            '.region-option:not(.is-hidden)'
          ).length,
        };
      });

      expect(stateAfterRegionReset.selectedRegionId).toBe('');
      expect(stateAfterRegionReset.orgStageVisible).toBe(false);
      expect(stateAfterRegionReset.spaceStageVisible).toBe(false);
      expect(stateAfterRegionReset.visibleRegionCount).toBeGreaterThan(1);
      await expect(confirmButton).toBeDisabled();
    } finally {
      await cleanupExtensionHost(session);
    }
  });

  test('User can confirm scope, view monitoring workspace, and switch back to selection', async () => {
    const session = await launchExtensionHost();

    try {
      const webviewFrame = await openSapToolsSidebar(session.window);
      await selectDefaultScope(webviewFrame);

      const confirmButton = webviewFrame.getByRole('button', {
        name: 'Confirm Scope',
      });
      await expect(confirmButton).toBeEnabled();
      await confirmButton.click();

      await expect(
        webviewFrame.getByRole('heading', { name: 'Monitoring Workspace' })
      ).toBeVisible();
      await expect(
        webviewFrame.getByRole('button', { name: 'Connect Cloud Foundry' })
      ).toBeVisible();
      await expect(webviewFrame.getByRole('tab', { name: 'Logs' })).toBeVisible();
      await expect(webviewFrame.getByRole('tab', { name: 'Apps' })).toBeVisible();
      await expect(
        webviewFrame.getByRole('tab', { name: 'Targets' })
      ).toBeVisible();
      await expect(
        webviewFrame.getByRole('tab', { name: 'Settings' })
      ).toBeVisible();

      await webviewFrame.getByRole('button', { name: 'Change Region' }).click();
      await expect(
        webviewFrame.getByRole('heading', { name: 'Select SAP BTP Region' })
      ).toBeVisible();
      await expect(confirmButton).toBeEnabled();
    } finally {
      await cleanupExtensionHost(session);
    }
  });
});
