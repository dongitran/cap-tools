import fs from 'node:fs';

import { test, expect } from '@playwright/test';

import {
  AREA_TO_SELECT,
  BR10_REGION_TO_SELECT,
  ORG_TO_SELECT,
  PROOF_ORG_TO_SELECT,
  REGION_TO_SELECT,
  SPACE_TO_SELECT,
  THEME_SCENARIOS,
  cleanupExtensionHost,
  clickWithFallback,
  createServiceRootMappingFixture,
  expectNoOuterGutter,
  launchExtensionHost,
  openSapToolsSidebar,
  readPaletteSnapshot,
  readViewportGutterSnapshot,
  readWebviewBodyClasses,
  resolveSapToolsLoginFrame,
  selectDefaultScope,
  type ShellNodeStabilitySnapshot,
} from './support/sapToolsHarness';

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

  test('User sees code-first region labels without cloud provider suffix', async () => {
    const session = await launchExtensionHost();

    try {
      const webviewFrame = await openSapToolsSidebar(session.window);
      await clickWithFallback(webviewFrame.getByRole('button', { name: AREA_TO_SELECT }));

      const regionButton = webviewFrame.getByRole('button', { name: REGION_TO_SELECT });
      await expect(regionButton).toBeVisible({ timeout: 10000 });
      const regionLabel = await regionButton.innerText();
      expect(regionLabel).toMatch(/^\s*us-10\s+US East \(VA\)/i);
      expect(regionLabel).not.toMatch(/\b(aws|azure|gcp)\b/i);
    } finally {
      await cleanupExtensionHost(session);
    }
  });

  test(
    'User can select area region and organization without recreating selection shell nodes',
    async () => {
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
        const orgSlotElement = document.querySelector('[data-stage-slot="org"]');

        if (
          !(shellElement instanceof HTMLElement) ||
          !(headerElement instanceof HTMLElement) ||
          !(groupsElement instanceof HTMLElement) ||
          !(areaSlotElement instanceof HTMLElement) ||
          !(regionSlotElement instanceof HTMLElement) ||
          !(orgSlotElement instanceof HTMLElement)
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
            orgSlot: HTMLElement;
          };
        };

        runtimeWindow.__sapToolsSelectionRefs = {
          shell: shellElement,
          header: headerElement,
          groups: groupsElement,
          areaSlot: areaSlotElement,
          regionSlot: regionSlotElement,
          orgSlot: orgSlotElement,
        };

        return true;
      });
      expect(hasInitialStageSlots).toBe(true);

      await webviewFrame.getByRole('button', { name: AREA_TO_SELECT }).click();
      await webviewFrame.getByRole('button', { name: REGION_TO_SELECT }).click();
      await expect(
        webviewFrame.getByRole('button', { name: ORG_TO_SELECT })
      ).toBeVisible({ timeout: 10000 });
      await webviewFrame.getByRole('button', { name: ORG_TO_SELECT }).click();

      const shellNodeStability = await webviewFrame.evaluate(() => {
        const runtimeWindow = window as Window & {
          __sapToolsSelectionRefs?: {
            shell: HTMLElement;
            header: HTMLElement;
            groups: HTMLElement;
            areaSlot: HTMLElement;
            regionSlot: HTMLElement;
            orgSlot: HTMLElement;
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
        const orgSlotElement = document.querySelector('[data-stage-slot="org"]');

        return {
          sameShellNode: shellElement === refs.shell,
          sameHeaderNode: headerElement === refs.header,
          sameGroupsNode: groupsElement === refs.groups,
          sameAreaSlotNode: areaSlotElement === refs.areaSlot,
          sameRegionSlotNode: regionSlotElement === refs.regionSlot,
          sameOrgSlotNode: orgSlotElement === refs.orgSlot,
        };
      });

      const expectedStabilitySnapshot: ShellNodeStabilitySnapshot = {
        sameShellNode: true,
        sameHeaderNode: true,
        sameGroupsNode: true,
        sameAreaSlotNode: true,
        sameRegionSlotNode: true,
        sameOrgSlotNode: true,
      };
      expect(shellNodeStability).toEqual(expectedStabilitySnapshot);
    } finally {
      await cleanupExtensionHost(session);
    }
    }
  );

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

  test('User sees stable selection cards without entry animation while choosing scope', async () => {
    const session = await launchExtensionHost();

    try {
      const webviewFrame = await openSapToolsSidebar(session.window);
      await clickWithFallback(webviewFrame.getByRole('button', { name: AREA_TO_SELECT }));
      await clickWithFallback(webviewFrame.getByRole('button', { name: REGION_TO_SELECT }));
      await expect(
        webviewFrame.getByRole('button', { name: ORG_TO_SELECT })
      ).toBeVisible({ timeout: 10000 });
      await clickWithFallback(webviewFrame.getByRole('button', { name: ORG_TO_SELECT }));

      const animationSnapshot = await webviewFrame.evaluate(() => {
        const cards = Array.from(document.querySelectorAll('.groups .group-card'));
        if (cards.length === 0) {
          return {
            cardCount: 0,
            hasAnimatedCard: true,
          };
        }

        const hasAnimatedCard = cards.some((card) => {
          if (!(card instanceof HTMLElement)) {
            return false;
          }
          const animationName = getComputedStyle(card).animationName;
          return animationName !== 'none';
        });

        return {
          cardCount: cards.length,
          hasAnimatedCard,
        };
      });

      expect(animationSnapshot.cardCount).toBeGreaterThan(0);
      expect(animationSnapshot.hasAnimatedCard).toBe(false);
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

      const workspaceHeaderLayout = await webviewFrame.evaluate(() => {
        const headerRow = document.querySelector('.workspace-header .shell-header-row');
        if (!(headerRow instanceof HTMLElement)) {
          return {
            hasChangeRegionInHeader: false,
            hasSettingsInHeader: false,
            isChangeBeforeSettings: false,
            hasFooterChangeButton: false,
          };
        }

        const changeRegionButton = headerRow.querySelector('[data-action="change-region"]');
        const settingsButton = headerRow.querySelector('[data-action="open-settings"]');
        const footerChangeButton = document.querySelector(
          '.workspace-footer [data-action="change-region"]'
        );
        const isChangeBeforeSettings =
          changeRegionButton instanceof HTMLElement &&
          settingsButton instanceof HTMLElement &&
          changeRegionButton.compareDocumentPosition(settingsButton) ===
            Node.DOCUMENT_POSITION_FOLLOWING;

        return {
          hasChangeRegionInHeader: changeRegionButton instanceof HTMLElement,
          hasSettingsInHeader: settingsButton instanceof HTMLElement,
          isChangeBeforeSettings,
          hasFooterChangeButton: footerChangeButton instanceof HTMLElement,
        };
      });

      expect(workspaceHeaderLayout).toEqual({
        hasChangeRegionInHeader: true,
        hasSettingsInHeader: true,
        isChangeBeforeSettings: true,
        hasFooterChangeButton: false,
      });

      await webviewFrame.getByRole('button', { name: 'Change Region' }).click();
      await expect(
        webviewFrame.getByRole('heading', { name: 'Select SAP BTP Region' })
      ).toBeVisible();
      await expect(confirmButton).toBeEnabled();
    } finally {
      await cleanupExtensionHost(session);
    }
  });

  test('User can toggle app selection by clicking app row in Apps Log Control', async () => {
    const session = await launchExtensionHost();

    try {
      const webviewFrame = await openSapToolsSidebar(session.window);
      await selectDefaultScope(webviewFrame);

      const confirmButton = webviewFrame.getByRole('button', { name: 'Confirm Scope' });
      await expect(confirmButton).toBeEnabled();
      await clickWithFallback(confirmButton);

      const appRow = webviewFrame.locator('.app-log-item', {
        hasText: 'finance-uat-api',
      });
      const appCheckbox = appRow.locator('[data-role="log-app-checkbox"]');
      const startLoggingButton = webviewFrame.getByRole('button', {
        name: 'Start App Logging',
      });

      await expect(appCheckbox).not.toBeChecked();
      await expect(startLoggingButton).toBeDisabled();

      await clickWithFallback(appRow);
      await expect(appCheckbox).toBeChecked();
      await expect(startLoggingButton).toBeEnabled();

      await clickWithFallback(appRow);
      await expect(appCheckbox).not.toBeChecked();
      await expect(startLoggingButton).toBeDisabled();
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
      await expect(
        webviewFrame.locator('.settings-status-list li span', { hasText: 'Last start' })
      ).toHaveCount(0);

      const buttonHeights = await Promise.all([
        webviewFrame.getByRole('button', { name: 'Sync now' }).evaluate((button) => {
          return Math.round(button.getBoundingClientRect().height);
        }),
        webviewFrame.getByRole('button', { name: 'Logout' }).evaluate((button) => {
          return Math.round(button.getBoundingClientRect().height);
        }),
      ]);
      expect(Math.abs(buttonHeights[0] - buttonHeights[1])).toBeLessThanOrEqual(1);

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

  test('User sees interrupted sync status after stale cache sync recovery on launch', async () => {
    const session = await launchExtensionHost({
      extraEnv: {
        SAP_TOOLS_TEST_MODE: '0',
        SAP_TOOLS_E2E_SEED_STALE_SYNC: '1',
      },
    });

    try {
      const webviewFrame = await openSapToolsSidebar(session.window);
      await clickWithFallback(webviewFrame.getByRole('button', { name: 'Open Settings' }));
      await expect(webviewFrame.getByRole('heading', { name: 'Settings' })).toBeVisible();

      const syncStatusMessage = webviewFrame.locator('.settings-status-message');
      await expect(syncStatusMessage).toContainText(/interrupted/i);
      await expect(syncStatusMessage).not.toContainText(/sync in progress/i);
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
