import fs from 'node:fs';
import path from 'node:path';

import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Frame,
  type Locator,
  type Page,
} from '@playwright/test';

import {
  getExtensionRootDir,
  getTemporaryUserDataDir,
  getTemporaryWorkspaceDir,
  resolveVscodeExecutablePath,
} from '../src/launchVscode';

const ACTIVITY_BAR_TITLE = 'SAP Tools';
const AREA_TO_SELECT = /Americas\s+br - ca - us/i;
const REGION_TO_SELECT = /US East \(VA\) - AWS us-10/i;
const BR10_REGION_TO_SELECT = /Brazil \(Sao Paulo\) - AWS br-10/i;
const ORG_TO_SELECT = /finance-services-prod/i;
const PROOF_ORG_TO_SELECT = /apps-proof-prod/i;
const SPACE_TO_SELECT = /^uat$/i;
const DEFAULT_THEME_NAME = 'Default Dark Modern';

interface ThemeScenario {
  readonly id: string;
  readonly colorTheme: string;
  readonly expectedBodyThemeClass: string;
  readonly maxShellBrightness?: number;
  readonly minShellBrightness?: number;
}

const THEME_SCENARIOS: readonly ThemeScenario[] = [
  {
    id: 'dark',
    colorTheme: 'Default Dark Modern',
    expectedBodyThemeClass: 'vscode-dark',
    maxShellBrightness: 0.2,
  },
  {
    id: 'light',
    colorTheme: 'Default Light Modern',
    expectedBodyThemeClass: 'vscode-light',
    minShellBrightness: 0.45,
  },
  {
    id: 'high-contrast',
    colorTheme: 'Default High Contrast',
    expectedBodyThemeClass: 'vscode-high-contrast',
    maxShellBrightness: 0.15,
  },
];

interface ExtensionHostSession {
  readonly electronApp: ElectronApplication;
  readonly window: Page;
  readonly workspaceDir: string;
  readonly userDataDir: string;
}

interface PaletteSnapshot {
  readonly bodyBackgroundColor: string;
  readonly shellBackgroundColor: string;
  readonly bodyBrightness: number;
  readonly shellBrightness: number;
}

interface ShellNodeStabilitySnapshot {
  readonly sameShellNode: boolean;
  readonly sameHeaderNode: boolean;
  readonly sameGroupsNode: boolean;
  readonly sameAreaSlotNode: boolean;
  readonly sameRegionSlotNode: boolean;
}

interface ViewportGutterSnapshot {
  readonly viewportWidth: number;
  readonly appLeft: number;
  readonly appRight: number;
  readonly appWidth: number;
  readonly bodyPaddingLeft: number;
  readonly bodyPaddingRight: number;
}

interface ExtensionHostLaunchOptions {
  readonly colorTheme?: string;
  readonly extraEnv?: Readonly<Record<string, string>>;
  /**
   * When true, passes SAP_EMAIL and SAP_PASSWORD so the extension skips the
   * login gate and renders the main region selector immediately.
   * Also sets SAP_TOOLS_TEST_MODE=1 to use mock CF org/space data.
   * Default: true (most tests need to reach the region selector).
   */
  readonly withMockCredentials?: boolean;
}

function buildExtensionHostEnv(
  withMockCredentials: boolean,
  extraEnv: Readonly<Record<string, string>>
): Record<string, string> {
  const env = toLaunchEnv(process.env);
  env['SAP_TOOLS_E2E'] = '1';

  if (withMockCredentials) {
    env['SAP_EMAIL'] = 'test@example.com';
    env['SAP_PASSWORD'] = 'test-password';
    env['SAP_TOOLS_TEST_MODE'] = '1';
    delete env['SAP_TOOLS_FORCE_LOGIN_GATE'];
    for (const [key, value] of Object.entries(extraEnv)) {
      env[key] = value;
    }
    return env;
  }

  delete env['SAP_EMAIL'];
  delete env['SAP_PASSWORD'];
  delete env['SAP_TOOLS_TEST_MODE'];
  env['SAP_TOOLS_FORCE_LOGIN_GATE'] = '1';
  for (const [key, value] of Object.entries(extraEnv)) {
    env[key] = value;
  }
  return env;
}

function toLaunchEnv(source: NodeJS.ProcessEnv): Record<string, string> {
  const env: Record<string, string> = {};

  for (const [key, value] of Object.entries(source)) {
    if (typeof value === 'string') {
      env[key] = value;
    }
  }

  return env;
}

function ensureThemeSettings(userDataDir: string, colorTheme: string): void {
  const userConfigDir = path.join(userDataDir, 'User');
  fs.mkdirSync(userConfigDir, { recursive: true });
  const settingsPath = path.join(userConfigDir, 'settings.json');
  const settings = {
    'workbench.colorTheme': colorTheme,
  };
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
}

function createServiceRootMappingFixture(): string {
  const fixtureRoot = fs.mkdtempSync(path.join('/tmp', 'sap-tools-e2e-root-'));
  const folderNames = ['finance_uat_api', 'finance_uat_worker', 'finance_uat_audit'];

  for (const folderName of folderNames) {
    const serviceFolder = path.join(fixtureRoot, folderName);
    fs.mkdirSync(serviceFolder, { recursive: true });
    fs.writeFileSync(path.join(serviceFolder, 'package.json'), '{ "name": "fixture" }\n', 'utf8');
  }

  return fixtureRoot;
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

async function launchExtensionHost(
  options: ExtensionHostLaunchOptions = {}
): Promise<ExtensionHostSession> {
  const extensionPath = getExtensionRootDir();
  const workspaceDir = getTemporaryWorkspaceDir();
  const userDataDir = getTemporaryUserDataDir();
  ensureThemeSettings(userDataDir, options.colorTheme ?? DEFAULT_THEME_NAME);

  const withMockCredentials = options.withMockCredentials !== false;

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
    env: buildExtensionHostEnv(withMockCredentials, options.extraEnv ?? {}),
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
    // Match either the main region selector or the login gate heading.
    const regionTitle = frame.getByRole('heading', { name: 'Select SAP BTP Region' });
    const loginTitle = frame.getByRole('heading', { name: 'SAP Tools Login' });
    const isRegionVisible = await regionTitle.isVisible().catch(() => false);
    const isLoginVisible = await loginTitle.isVisible().catch(() => false);
    if (isRegionVisible || isLoginVisible) {
      return frame;
    }
  }

  return undefined;
}

async function findSapToolsRegionFrame(window: Page): Promise<Frame | undefined> {
  const candidateFrames = window
    .frames()
    .filter((frame) => frame.url().includes('vscode-webview://'));

  for (const frame of candidateFrames) {
    const regionTitle = frame.getByRole('heading', { name: 'Select SAP BTP Region' });
    const isRegionVisible = await regionTitle.isVisible().catch(() => false);
    if (isRegionVisible) {
      return frame;
    }
  }

  return undefined;
}

async function findSapToolsLoginFrame(window: Page): Promise<Frame | undefined> {
  const candidateFrames = window
    .frames()
    .filter((frame) => frame.url().includes('vscode-webview://'));

  for (const frame of candidateFrames) {
    const loginTitle = frame.getByRole('heading', { name: 'SAP Tools Login' });
    const isLoginVisible = await loginTitle.isVisible().catch(() => false);
    if (isLoginVisible) {
      return frame;
    }
  }

  return undefined;
}

async function findCfLogsPanelFrame(window: Page): Promise<Frame | undefined> {
  const candidateFrames = window
    .frames()
    .filter((frame) => frame.url().includes('vscode-webview://'));

  for (const frame of candidateFrames) {
    const heading = frame.getByRole('heading', { name: 'Monitoring Workspace' });
    const isVisible = await heading.isVisible().catch(() => false);
    const hasLogTable = (await frame.locator('.cf-log-table').count()) > 0;
    if (isVisible && hasLogTable) {
      return frame;
    }
  }

  return undefined;
}

async function resolveSapToolsWebviewFrame(window: Page): Promise<Frame> {
  await expect
    .poll(
      async () => {
        const frame = await findSapToolsWebviewFrame(window);
        return frame?.url() ?? '';
      },
      { timeout: 20000 }
    )
    .toContain('vscode-webview://');

  const frame = await findSapToolsWebviewFrame(window);
  if (frame === undefined) {
    throw new Error('SAP Tools webview frame was not found.');
  }

  return frame;
}

async function resolveSapToolsRegionFrame(window: Page): Promise<Frame> {
  await expect
    .poll(
      async () => {
        const frame = await findSapToolsRegionFrame(window);
        return frame?.url() ?? '';
      },
      { timeout: 20000 }
    )
    .toContain('vscode-webview://');

  const frame = await findSapToolsRegionFrame(window);
  if (frame === undefined) {
    throw new Error('SAP Tools region frame was not found.');
  }

  return frame;
}

async function resolveSapToolsLoginFrame(window: Page): Promise<Frame> {
  await expect
    .poll(
      async () => {
        const frame = await findSapToolsLoginFrame(window);
        return frame?.url() ?? '';
      },
      { timeout: 20000 }
    )
    .toContain('vscode-webview://');

  const frame = await findSapToolsLoginFrame(window);
  if (frame === undefined) {
    throw new Error('SAP Tools login frame was not found.');
  }

  return frame;
}

async function openSapToolsSidebar(window: Page): Promise<Frame> {
  const sapToolsTab = window.getByRole('tab', {
    name: new RegExp(ACTIVITY_BAR_TITLE),
  });
  await expect(sapToolsTab).toBeVisible({ timeout: 20000 });
  await clickWithFallback(sapToolsTab);

  return resolveSapToolsWebviewFrame(window);
}

async function selectDefaultScope(webviewFrame: Frame): Promise<void> {
  await clickWithFallback(webviewFrame.getByRole('button', { name: AREA_TO_SELECT }));
  await clickWithFallback(webviewFrame.getByRole('button', { name: REGION_TO_SELECT }));
  // In test mode, orgs are fetched asynchronously via the extension; wait for them.
  await expect(
    webviewFrame.getByRole('button', { name: ORG_TO_SELECT })
  ).toBeVisible({ timeout: 10000 });
  await clickWithFallback(webviewFrame.getByRole('button', { name: ORG_TO_SELECT }));
  // Spaces are also fetched asynchronously; wait before clicking.
  await expect(
    webviewFrame.getByRole('button', { name: SPACE_TO_SELECT })
  ).toBeVisible({ timeout: 10000 });
  await clickWithFallback(webviewFrame.getByRole('button', { name: SPACE_TO_SELECT }));
}

async function clickWithFallback(locator: Locator): Promise<void> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await locator.click({ timeout: 10000 });
      return;
    } catch (error) {
      lastError = error;
      const errorMessage = error instanceof Error ? error.message : String(error);
      const pointerIntercepted = errorMessage.includes('intercepts pointer events');
      if (pointerIntercepted) {
        await locator.click({ force: true, timeout: 10000 });
        return;
      }

      const detachedFromDom =
        errorMessage.includes('Element is not attached to the DOM') ||
        errorMessage.includes('element is not attached');
      if (detachedFromDom) {
        continue;
      }

      throw error;
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }

  throw new Error('Failed to click locator after retries.');
}

async function resolveCfLogsPanelFrame(
  window: Page,
  timeoutMs: number
): Promise<Frame | undefined> {
  try {
    await expect
      .poll(
        async () => {
          const frame = await findCfLogsPanelFrame(window);
          return frame?.url() ?? '';
        },
        { timeout: timeoutMs }
      )
      .toContain('vscode-webview://');
  } catch {
    return undefined;
  }

  return findCfLogsPanelFrame(window);
}

async function openCfLogsPanel(window: Page): Promise<Frame> {
  await window.keyboard.press(process.platform === 'darwin' ? 'Meta+Alt+L' : 'Control+Alt+L');
  const frameFromShortcut = await resolveCfLogsPanelFrame(window, 10000);
  if (frameFromShortcut !== undefined) {
    return frameFromShortcut;
  }

  await runWorkbenchCommand(window, 'SAP Tools: Open CFLogs Panel');

  const frameFromCommand = await resolveCfLogsPanelFrame(window, 15000);
  if (frameFromCommand !== undefined) {
    return frameFromCommand;
  }

  await window.keyboard.press(process.platform === 'darwin' ? 'Meta+J' : 'Control+J');
  const panelPart = window.locator('[id="workbench.parts.panel"]');
  const panelTab = panelPart.getByRole('tab', { name: /SAP TOOLS|CFLogs/i });
  const panelTabVisible = await panelTab
    .isVisible()
    .catch((): false => false);
  if (panelTabVisible) {
    await clickWithFallback(panelTab);
  }

  const frame = await resolveCfLogsPanelFrame(window, 15000);
  if (frame !== undefined) {
    return frame;
  }

  throw new Error('CF logs panel frame was not found.');
}

async function runWorkbenchCommand(window: Page, commandTitle: string): Promise<void> {
  await window.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+P' : 'Control+Shift+P');

  const quickInput = window.getByPlaceholder('Type the name of a command to run.');
  try {
    await expect(quickInput).toBeVisible({ timeout: 10000 });
    await quickInput.fill(commandTitle);
    await quickInput.press('Enter');
    return;
  } catch {
    await window.keyboard.type(commandTitle);
    await window.keyboard.press('Enter');
  }
}

async function readWebviewBodyClasses(webviewFrame: Frame): Promise<string[]> {
  return webviewFrame.evaluate(() => {
    return Array.from(document.body.classList);
  });
}

async function readPaletteSnapshot(webviewFrame: Frame): Promise<PaletteSnapshot> {
  return webviewFrame.evaluate(() => {
    const shellElement = document.querySelector('.prototype-shell');
    if (!(shellElement instanceof HTMLElement)) {
      throw new Error('Prototype shell not found.');
    }

    const convertColorToBrightness = (color: string): number => {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;

      const context = canvas.getContext('2d');
      if (context === null) {
        throw new Error('Canvas context not available for color conversion.');
      }

      context.clearRect(0, 0, 1, 1);
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);

      const pixel = context.getImageData(0, 0, 1, 1).data;
      const red = pixel[0] ?? 0;
      const green = pixel[1] ?? 0;
      const blue = pixel[2] ?? 0;

      return (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
    };

    const bodyBackgroundColor = getComputedStyle(document.body).backgroundColor;
    const shellBackgroundColor = getComputedStyle(shellElement).backgroundColor;

    return {
      bodyBackgroundColor,
      shellBackgroundColor,
      bodyBrightness: convertColorToBrightness(bodyBackgroundColor),
      shellBrightness: convertColorToBrightness(shellBackgroundColor),
    };
  });
}

async function readViewportGutterSnapshot(
  webviewFrame: Frame
): Promise<ViewportGutterSnapshot> {
  return webviewFrame.evaluate(() => {
    const appElement = document.querySelector('#app');
    if (!(appElement instanceof HTMLElement)) {
      throw new Error('App element (#app) was not found.');
    }

    const appRect = appElement.getBoundingClientRect();
    const bodyStyles = getComputedStyle(document.body);

    return {
      viewportWidth: document.documentElement.clientWidth,
      appLeft: appRect.left,
      appRight: appRect.right,
      appWidth: appRect.width,
      bodyPaddingLeft: Number.parseFloat(bodyStyles.paddingLeft),
      bodyPaddingRight: Number.parseFloat(bodyStyles.paddingRight),
    };
  });
}

function expectNoOuterGutter(
  snapshot: ViewportGutterSnapshot
): void {
  expect(snapshot.bodyPaddingLeft).toBe(0);
  expect(snapshot.bodyPaddingRight).toBe(0);
  expect(snapshot.appLeft).toBeLessThanOrEqual(0.5);
  expect(snapshot.viewportWidth - snapshot.appRight).toBeLessThanOrEqual(0.5);
  expect(snapshot.appWidth).toBeGreaterThan(0);
}

test.describe('SAP Tools region selector', () => {
  for (const scenario of THEME_SCENARIOS) {
    test(`User can open selector and pick region in ${scenario.id} theme`, async () => {
      const session = await launchExtensionHost({ colorTheme: scenario.colorTheme });

      try {
        const webviewFrame = await openSapToolsSidebar(session.window);
        const bodyClasses = await readWebviewBodyClasses(webviewFrame);
        expect(bodyClasses).toEqual(
          expect.arrayContaining([
            scenario.expectedBodyThemeClass,
            'prototype-page',
            'pattern-bars',
            'theme-34',
          ])
        );

        const gutterSnapshot = await readViewportGutterSnapshot(webviewFrame);
        expectNoOuterGutter(gutterSnapshot);

        const palette = await readPaletteSnapshot(webviewFrame);
        if (scenario.maxShellBrightness !== undefined) {
          expect(palette.shellBrightness).toBeLessThan(scenario.maxShellBrightness);
        }
        if (scenario.minShellBrightness !== undefined) {
          expect(palette.shellBrightness).toBeGreaterThan(scenario.minShellBrightness);
        }

        await clickWithFallback(webviewFrame.getByRole('button', { name: AREA_TO_SELECT }));
        await clickWithFallback(webviewFrame.getByRole('button', { name: REGION_TO_SELECT }));
        await expect(
          webviewFrame.getByRole('button', { name: ORG_TO_SELECT })
        ).toBeVisible({ timeout: 10000 });
      } finally {
        await cleanupExtensionHost(session);
      }
    });
  }

  test('User keeps VS Code webview theme classes during interactions', async () => {
    const session = await launchExtensionHost();

    try {
      const webviewFrame = await openSapToolsSidebar(session.window);
      const initialClasses = await readWebviewBodyClasses(webviewFrame);
      const initialThemeClasses = initialClasses.filter((className) =>
        className.startsWith('vscode-')
      );

      expect(initialThemeClasses.length).toBeGreaterThan(0);
      expect(initialThemeClasses).toContain('vscode-dark');
      expect(initialClasses).toEqual(
        expect.arrayContaining(['prototype-page', 'pattern-bars', 'theme-34'])
      );

      const initialPalette = await readPaletteSnapshot(webviewFrame);
      expect(initialPalette.bodyBrightness).toBeLessThan(0.2);
      expect(initialPalette.shellBrightness).toBeLessThan(0.2);

      await webviewFrame.getByRole('button', { name: AREA_TO_SELECT }).click();
      await webviewFrame.getByRole('button', { name: REGION_TO_SELECT }).click();

      const classesAfterSelection = await readWebviewBodyClasses(webviewFrame);
      expect(classesAfterSelection).toEqual(
        expect.arrayContaining(['prototype-page', 'pattern-bars', 'theme-34'])
      );
      expect(classesAfterSelection).toEqual(
        expect.arrayContaining(initialThemeClasses)
      );
    } finally {
      await cleanupExtensionHost(session);
    }
  });

  test('User can select area and region without recreating selection shell nodes', async () => {
    const session = await launchExtensionHost();

    try {
      const webviewFrame = await openSapToolsSidebar(session.window);
      const hasInitialStageSlots = await webviewFrame.evaluate(() => {
        const shellElement = document.querySelector('.prototype-shell');
        const headerElement = document.querySelector('.shell-header');
        const groupsElement = document.querySelector('.groups');
        const areaSlotElement = document.querySelector('[data-stage-slot="area"]');
        const regionSlotElement = document.querySelector(
          '[data-stage-slot="region"]'
        );

        if (
          !(shellElement instanceof HTMLElement) ||
          !(headerElement instanceof HTMLElement) ||
          !(groupsElement instanceof HTMLElement) ||
          !(areaSlotElement instanceof HTMLElement) ||
          !(regionSlotElement instanceof HTMLElement)
        ) {
          return false;
        }

        const runtimeWindow = window as Window & {
          __sapToolsSelectionRefs?: {
            shell: HTMLElement;
            header: HTMLElement;
            groups: HTMLElement;
            areaSlot: HTMLElement;
            regionSlot: HTMLElement;
          };
        };

        runtimeWindow.__sapToolsSelectionRefs = {
          shell: shellElement,
          header: headerElement,
          groups: groupsElement,
          areaSlot: areaSlotElement,
          regionSlot: regionSlotElement,
        };

        return true;
      });
      expect(hasInitialStageSlots).toBe(true);

      await webviewFrame.getByRole('button', { name: AREA_TO_SELECT }).click();
      await webviewFrame.getByRole('button', { name: REGION_TO_SELECT }).click();

      const shellNodeStability = await webviewFrame.evaluate(() => {
        const runtimeWindow = window as Window & {
          __sapToolsSelectionRefs?: {
            shell: HTMLElement;
            header: HTMLElement;
            groups: HTMLElement;
            areaSlot: HTMLElement;
            regionSlot: HTMLElement;
          };
        };

        const refs = runtimeWindow.__sapToolsSelectionRefs;
        if (refs === undefined) {
          throw new Error('Selection shell references are missing.');
        }

        const shellElement = document.querySelector('.prototype-shell');
        const headerElement = document.querySelector('.shell-header');
        const groupsElement = document.querySelector('.groups');
        const areaSlotElement = document.querySelector('[data-stage-slot="area"]');
        const regionSlotElement = document.querySelector(
          '[data-stage-slot="region"]'
        );

        return {
          sameShellNode: shellElement === refs.shell,
          sameHeaderNode: headerElement === refs.header,
          sameGroupsNode: groupsElement === refs.groups,
          sameAreaSlotNode: areaSlotElement === refs.areaSlot,
          sameRegionSlotNode: regionSlotElement === refs.regionSlot,
        };
      });

      const expectedStabilitySnapshot: ShellNodeStabilitySnapshot = {
        sameShellNode: true,
        sameHeaderNode: true,
        sameGroupsNode: true,
        sameAreaSlotNode: true,
        sameRegionSlotNode: true,
      };
      expect(shellNodeStability).toEqual(expectedStabilitySnapshot);
    } finally {
      await cleanupExtensionHost(session);
    }
  });

  test('User can load fourteen organizations when selecting br-10 in test mode', async () => {
    const session = await launchExtensionHost();

    try {
      const webviewFrame = await openSapToolsSidebar(session.window);
      await clickWithFallback(webviewFrame.getByRole('button', { name: AREA_TO_SELECT }));
      await clickWithFallback(webviewFrame.getByRole('button', { name: BR10_REGION_TO_SELECT }));

      await expect
        .poll(
          async () => {
            return webviewFrame.locator('.org-picker .org-option').count();
          },
          { timeout: 10000 }
        )
        .toBe(14);
    } finally {
      await cleanupExtensionHost(session);
    }
  });

  test('User sees app catalog from extension host data for selected space', async () => {
    const session = await launchExtensionHost();

    try {
      const webviewFrame = await openSapToolsSidebar(session.window);
      await clickWithFallback(webviewFrame.getByRole('button', { name: AREA_TO_SELECT }));
      await clickWithFallback(webviewFrame.getByRole('button', { name: REGION_TO_SELECT }));
      await expect(
        webviewFrame.getByRole('button', { name: PROOF_ORG_TO_SELECT })
      ).toBeVisible({ timeout: 10000 });
      await clickWithFallback(
        webviewFrame.getByRole('button', { name: PROOF_ORG_TO_SELECT })
      );

      const confirmButton = webviewFrame.getByRole('button', {
        name: 'Confirm Scope',
      });
      await expect(confirmButton).toBeEnabled({ timeout: 10000 });
      await clickWithFallback(confirmButton);

      await expect(
        webviewFrame.getByRole('heading', { name: 'Monitoring Workspace' })
      ).toBeVisible();
      await expect(webviewFrame.getByText('proof-gateway')).toBeVisible({
        timeout: 10000,
      });
      await expect(
        webviewFrame.getByText('apps-proof-prod-proofspace-api')
      ).toHaveCount(0);
      await expect(
        webviewFrame.getByText('apps-proof-prod-proofspace-worker')
      ).toHaveCount(0);
      await expect(
        webviewFrame.getByText('apps-proof-prod-proofspace-jobs')
      ).toHaveCount(0);
    } finally {
      await cleanupExtensionHost(session);
    }
  });

  test('User can select one SAP BTP region in webview and output log is emitted', async () => {
    const session = await launchExtensionHost();

    try {
      const webviewFrame = await openSapToolsSidebar(session.window);
      await webviewFrame.getByRole('button', { name: AREA_TO_SELECT }).click();
      await webviewFrame.getByRole('button', { name: REGION_TO_SELECT }).click();

      const selectionNotification = session.window
        .getByText(/Selected SAP BTP region: .*\(us-10\)/i)
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
      expect(regionStateAfterSelect.selectedRegionId).toBe('us10');
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
      expect(regionStateAfterSecondClick.selectedRegionId).toBe('us10');
      expect(regionStateAfterSecondClick.hiddenRegionCount).toBe(
        regionStateAfterSelect.hiddenRegionCount
      );

      await expect(
        webviewFrame.getByRole('button', { name: ORG_TO_SELECT })
      ).toBeVisible({ timeout: 10000 });
      await webviewFrame.getByRole('button', { name: ORG_TO_SELECT }).click();
      await expect(
        webviewFrame.getByRole('button', { name: SPACE_TO_SELECT })
      ).toBeVisible({ timeout: 10000 });
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
        webviewFrame.getByRole('heading', { name: 'Active Apps Log' })
      ).toBeVisible();
      await expect(
        webviewFrame.getByRole('heading', { name: 'Apps Log Control' })
      ).toBeVisible();
      await expect(
        webviewFrame.getByRole('button', { name: 'Start App Logging' })
      ).toBeVisible();
      await expect(webviewFrame.getByText('finance-uat-api')).toBeVisible({
        timeout: 10000,
      });
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

  test('User can open Apps tab and view service artifact export controls', async () => {
    const session = await launchExtensionHost();

    try {
      const webviewFrame = await openSapToolsSidebar(session.window);
      await selectDefaultScope(webviewFrame);

      const confirmButton = webviewFrame.getByRole('button', {
        name: 'Confirm Scope',
      });
      await expect(confirmButton).toBeEnabled();
      await clickWithFallback(confirmButton);

      await clickWithFallback(webviewFrame.getByRole('tab', { name: 'Apps' }));
      await expect(
        webviewFrame.getByRole('heading', { name: 'Export Service Artifacts' })
      ).toBeVisible({ timeout: 10000 });

      await expect(
        webviewFrame.getByRole('button', { name: 'Select Root Folder' })
      ).toBeVisible();
      await expect(
        webviewFrame.getByRole('button', { name: 'Refresh Mapping' })
      ).toHaveCount(0);

      await expect(
        webviewFrame.getByRole('button', { name: 'Export Artifacts' })
      ).toBeDisabled();
      // Export SQLTools Config button must be present and disabled without a selected service
      await expect(
        webviewFrame.getByRole('button', { name: 'Export SQLTools Config' })
      ).toBeDisabled();

      await expect(webviewFrame.locator('.service-export-root-row')).toHaveCount(1);
      await expect(
        webviewFrame.locator('.service-export-root-row .service-export-path')
      ).toHaveCount(1);
      await expect(
        webviewFrame.getByRole('button', { name: 'Export default-env.json' })
      ).toHaveCount(0);
      await expect(
        webviewFrame.getByRole('button', { name: 'Export pnpm-lock.yaml' })
      ).toHaveCount(0);

      await expect(webviewFrame.getByText('Root: Not selected')).toBeVisible();
      await expect(webviewFrame.getByText('finance-uat-api')).toBeVisible();
      await expect(webviewFrame.getByText('finance-uat-worker')).toBeVisible();
      await expect(webviewFrame.getByText('finance-uat-audit')).toBeVisible();
      await expect(
        webviewFrame.locator('.service-map-row.is-unmapped')
      ).toHaveCount(3);
    } finally {
      await cleanupExtensionHost(session);
    }
  });

  test('Export SQLTools Config button is enabled after a mapped service is selected', async () => {
    const fixtureRootPath = createServiceRootMappingFixture();
    const session = await launchExtensionHost({
      extraEnv: {
        SAP_TOOLS_E2E_ROOT_DIALOG_STEPS: 'select',
        SAP_TOOLS_E2E_ROOT_FOLDER_PATH: fixtureRootPath,
      },
    });

    try {
      const webviewFrame = await openSapToolsSidebar(session.window);
      await selectDefaultScope(webviewFrame);

      const confirmButton = webviewFrame.getByRole('button', { name: 'Confirm Scope' });
      await expect(confirmButton).toBeEnabled();
      await clickWithFallback(confirmButton);
      await clickWithFallback(webviewFrame.getByRole('tab', { name: 'Apps' }));

      const selectRootFolderButton = webviewFrame.getByRole('button', {
        name: 'Select Root Folder',
      });
      await clickWithFallback(selectRootFolderButton);

      // Wait for folder scan to complete (all 3 services become mapped)
      const mappedStateCells = webviewFrame.locator(
        '.service-map-row .service-map-state',
        { hasText: /^Mapped$/i }
      );
      await expect(mappedStateCells).toHaveCount(3, { timeout: 10000 });

      // Both export buttons are still disabled — no service selected yet
      await expect(
        webviewFrame.getByRole('button', { name: 'Export Artifacts' })
      ).toBeDisabled();
      await expect(
        webviewFrame.getByRole('button', { name: 'Export SQLTools Config' })
      ).toBeDisabled();

      // Select the first mapped service row
      await clickWithFallback(
        webviewFrame.locator('.service-map-row').filter({ hasText: 'finance_uat_api' }).first()
      );

      // Both export buttons must become enabled after service selection
      await expect(
        webviewFrame.getByRole('button', { name: 'Export Artifacts' })
      ).toBeEnabled({ timeout: 5000 });
      await expect(
        webviewFrame.getByRole('button', { name: 'Export SQLTools Config' })
      ).toBeEnabled({ timeout: 5000 });
    } finally {
      await cleanupExtensionHost(session);
      fs.rmSync(fixtureRootPath, { recursive: true, force: true });
    }
  });

  test('User can keep mapped services when Select Root Folder is cancelled', async () => {
    const fixtureRootPath = createServiceRootMappingFixture();
    const session = await launchExtensionHost({
      extraEnv: {
        SAP_TOOLS_E2E_ROOT_DIALOG_STEPS: 'select,cancel',
        SAP_TOOLS_E2E_ROOT_FOLDER_PATH: fixtureRootPath,
      },
    });

    try {
      const webviewFrame = await openSapToolsSidebar(session.window);
      await selectDefaultScope(webviewFrame);

      const confirmButton = webviewFrame.getByRole('button', {
        name: 'Confirm Scope',
      });
      await expect(confirmButton).toBeEnabled();
      await clickWithFallback(confirmButton);
      await clickWithFallback(webviewFrame.getByRole('tab', { name: 'Apps' }));

      const selectRootFolderButton = webviewFrame.getByRole('button', {
        name: 'Select Root Folder',
      });
      await clickWithFallback(selectRootFolderButton);

      const mappedStateCells = webviewFrame.locator(
        '.service-map-row .service-map-state',
        { hasText: /^Mapped$/i }
      );
      await expect(mappedStateCells).toHaveCount(3, { timeout: 10000 });
      await expect(webviewFrame.locator('.service-export-path')).toContainText(fixtureRootPath);

      // Second open attempt is forced to "cancel" in E2E mode.
      await clickWithFallback(selectRootFolderButton);

      await expect(webviewFrame.getByText(/Scanning local folders/i)).toHaveCount(0);
      await expect(webviewFrame.locator('.service-export-path')).toContainText(fixtureRootPath);
      await expect(mappedStateCells).toHaveCount(3);
    } finally {
      await cleanupExtensionHost(session);
      fs.rmSync(fixtureRootPath, { recursive: true, force: true });
    }
  });

  test('User keeps current Apps export state when Select Root Folder is cancelled initially', async () => {
    const session = await launchExtensionHost({
      extraEnv: {
        SAP_TOOLS_E2E_ROOT_DIALOG_STEPS: 'cancel',
      },
    });

    try {
      const webviewFrame = await openSapToolsSidebar(session.window);
      await selectDefaultScope(webviewFrame);

      const confirmButton = webviewFrame.getByRole('button', {
        name: 'Confirm Scope',
      });
      await expect(confirmButton).toBeEnabled();
      await clickWithFallback(confirmButton);
      await clickWithFallback(webviewFrame.getByRole('tab', { name: 'Apps' }));

      const selectRootFolderButton = webviewFrame.getByRole('button', {
        name: 'Select Root Folder',
      });
      await clickWithFallback(selectRootFolderButton);

      await expect(webviewFrame.getByText(/Scanning local folders/i)).toHaveCount(0);
      await expect(webviewFrame.locator('.service-export-path')).toContainText('Root: Not selected');
      await expect(webviewFrame.locator('.service-map-row.is-unmapped')).toHaveCount(3);
    } finally {
      await cleanupExtensionHost(session);
    }
  });

  test('User can remap services after selecting a new root folder', async () => {
    const firstFixtureRootPath = createServiceRootMappingFixture();
    const secondFixtureRootPath = createServiceRootMappingFixture();
    const session = await launchExtensionHost({
      extraEnv: {
        SAP_TOOLS_E2E_ROOT_DIALOG_STEPS: 'select,select',
        SAP_TOOLS_E2E_ROOT_FOLDER_PATHS: `${firstFixtureRootPath}::${secondFixtureRootPath}`,
      },
    });

    try {
      const webviewFrame = await openSapToolsSidebar(session.window);
      await selectDefaultScope(webviewFrame);

      const confirmButton = webviewFrame.getByRole('button', {
        name: 'Confirm Scope',
      });
      await expect(confirmButton).toBeEnabled();
      await clickWithFallback(confirmButton);
      await clickWithFallback(webviewFrame.getByRole('tab', { name: 'Apps' }));

      const selectRootFolderButton = webviewFrame.getByRole('button', {
        name: 'Select Root Folder',
      });
      const mappedStateCells = webviewFrame.locator(
        '.service-map-row .service-map-state',
        { hasText: /^Mapped$/i }
      );
      const rootPathLabel = webviewFrame.locator('.service-export-path');

      await clickWithFallback(selectRootFolderButton);
      await expect(mappedStateCells).toHaveCount(3, { timeout: 10000 });
      await expect(rootPathLabel).toContainText(firstFixtureRootPath);

      await clickWithFallback(selectRootFolderButton);
      await expect(webviewFrame.getByText(/Scanning local folders/i)).toHaveCount(0);
      await expect(rootPathLabel).toContainText(secondFixtureRootPath);
      await expect(rootPathLabel).not.toContainText(firstFixtureRootPath);
      await expect(mappedStateCells).toHaveCount(3);
    } finally {
      await cleanupExtensionHost(session);
      fs.rmSync(firstFixtureRootPath, { recursive: true, force: true });
      fs.rmSync(secondFixtureRootPath, { recursive: true, force: true });
    }
  });

  test('User can open settings, update sync interval, and return to selection screen', async () => {
    const session = await launchExtensionHost();

    try {
      const webviewFrame = await openSapToolsSidebar(session.window);

      await clickWithFallback(webviewFrame.getByRole('button', { name: 'Open Settings' }));
      await expect(webviewFrame.getByRole('heading', { name: 'Settings' })).toBeVisible();

      await webviewFrame.getByLabel('Cache sync interval').selectOption('12');
      await expect(webviewFrame.getByRole('status')).toContainText(
        /Sync interval updated to 12 hours/i
      );

      await clickWithFallback(
        webviewFrame.getByRole('button', { name: 'Close Settings' })
      );
      await expect(
        webviewFrame.getByRole('heading', { name: 'Select SAP BTP Region' })
      ).toBeVisible();
    } finally {
      await cleanupExtensionHost(session);
    }
  });

  test('User can logout from settings and return to login gate', async () => {
    const session = await launchExtensionHost();

    try {
      const webviewFrame = await openSapToolsSidebar(session.window);
      await clickWithFallback(webviewFrame.getByRole('button', { name: 'Open Settings' }));
      await expect(webviewFrame.getByRole('heading', { name: 'Settings' })).toBeVisible();

      await clickWithFallback(webviewFrame.getByRole('button', { name: 'Logout' }));
      const loginFrame = await resolveSapToolsLoginFrame(session.window);
      await expect(
        loginFrame.getByRole('heading', { name: 'SAP Tools Login' })
      ).toBeVisible({ timeout: 15000 });
    } finally {
      await cleanupExtensionHost(session);
    }
  });
});

test.describe('SAP Tools login gate', () => {
  test('Login gate renders when no credentials are set', async () => {
    // Launch WITHOUT mock credentials so the login gate appears.
    const session = await launchExtensionHost({ withMockCredentials: false });

    try {
      const sapToolsTab = session.window.getByRole('tab', {
        name: new RegExp(ACTIVITY_BAR_TITLE),
      });
      await expect(sapToolsTab).toBeVisible({ timeout: 20000 });
      await clickWithFallback(sapToolsTab);
      const frame = await resolveSapToolsLoginFrame(session.window);

      // Login gate heading and form fields should be visible.
      await expect(frame.getByRole('heading', { name: 'SAP Tools Login' })).toBeVisible();
      await expect(frame.getByLabel('SAP Email')).toBeVisible();
      await expect(frame.getByLabel('SAP Password')).toBeVisible();
      await expect(
        frame.getByRole('button', { name: 'Save and Continue' })
      ).toBeVisible();

      // The main region selector heading must NOT be visible.
      await expect(
        frame.getByRole('heading', { name: 'Select SAP BTP Region' })
      ).toBeHidden();
    } finally {
      await cleanupExtensionHost(session);
    }
  });

  test('Submitting login gate with valid input switches to region selector', async () => {
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

      // Fill in the login form and submit.
      await frame.getByLabel('SAP Email').fill('test@example.com');
      await frame.getByLabel('SAP Password').fill('test-password');
      await clickWithFallback(frame.getByRole('button', { name: 'Save and Continue' }));

      // After submit the extension reloads the webview; the region selector should appear.
      await clickWithFallback(sapToolsTab);
      const reloadedFrame = await resolveSapToolsRegionFrame(session.window);
      await expect(
        reloadedFrame.getByRole('heading', { name: 'Select SAP BTP Region' })
      ).toBeVisible({ timeout: 20000 });
    } finally {
      await cleanupExtensionHost(session);
    }
  });

  test('Login gate shows validation error for invalid email', async () => {
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
    } finally {
      await cleanupExtensionHost(session);
    }
  });
});

test.describe('SAP Tools CF logs panel', () => {
  test('CF logs panel renders with monitoring workspace and filter controls', async () => {
    const session = await launchExtensionHost();

    try {
      await openSapToolsSidebar(session.window);
      const frame = await openCfLogsPanel(session.window);

      // Required structural elements should be present.
      await expect(
        frame.getByRole('heading', { name: 'Monitoring Workspace' })
      ).toBeVisible({ timeout: 10000 });

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
