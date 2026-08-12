import type { CfAppEnvironmentIdentity } from './cfClient';

/**
 * Lives in its own module because both the HANA workbench resolver and the
 * SQLTools config exporter need it, and those two already import from each
 * other — putting the guard in either one would close a cycle.
 */

export interface CfAppScopeExpectation {
  readonly appName: string;
  readonly orgName: string;
  readonly spaceName: string;
}

/**
 * Refuse credentials that came back from a different org/space than the caller
 * asked for. The CF CLI resolves an app against whatever `.cf/config.json`
 * currently targets, and that file is shared by every SAP Tools feature and every
 * window — so a concurrent `cf target` can land between our own target and the
 * lookup. Without this check an app that exists in both dev and prod silently
 * hands back the wrong tenant's HANA credentials.
 *
 * When CF reports no identity we proceed: a missing `VCAP_APPLICATION` is not
 * evidence of a mismatch, and blocking on it would break legitimate resolutions.
 *
 * Blocking is the right default even though it can misfire: `VCAP_APPLICATION`
 * is stamped at staging, so an org/space renamed without restarting the app
 * reports its old name. That case is rare, self-announcing and recoverable — a
 * silent write to the wrong tenant's database is none of those.
 */
export function assertResolvedAppScope(
  expected: CfAppScopeExpectation,
  identity: CfAppEnvironmentIdentity | null
): void {
  if (identity === null) {
    return;
  }
  const wanted = formatScopeLabel(expected.orgName, expected.spaceName);
  const actual = formatScopeLabel(identity.organizationName, identity.spaceName);
  if (wanted === actual) {
    return;
  }
  throw new Error(
    `Refusing to use credentials: app "${expected.appName}" resolved in ` +
      `${identity.organizationName}/${identity.spaceName} but the active scope is ` +
      `${expected.orgName}/${expected.spaceName}. ` +
      'Another Cloud Foundry operation most likely changed the CF target while this ' +
      'one was running — retry the action. If it keeps failing, the org or space was ' +
      'renamed after the app was last staged; restart the app to refresh VCAP_APPLICATION.'
  );
}

function formatScopeLabel(orgName: string, spaceName: string): string {
  return `${orgName.trim().toLowerCase()}/${spaceName.trim().toLowerCase()}`;
}
