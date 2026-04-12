// cspell:words hana ondemand

export interface CfLoginInfo {
  readonly authorizationEndpoint: string;
}

export interface CfToken {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresAt: number;
}

export interface CfOrg {
  readonly guid: string;
  readonly name: string;
}

export interface CfSpace {
  readonly guid: string;
  readonly name: string;
}

export interface CfSession {
  readonly token: CfToken;
  readonly apiEndpoint: string;
}

/**
 * Derive the SAP BTP Cloud Foundry API endpoint from a region code.
 * Region codes may be either the catalog form (e.g. "us-10") or the raw form (e.g. "us10").
 */
export function getCfApiEndpoint(regionCode: string): string {
  const regionId = regionCode.replace('-', '');
  return `https://api.cf.${regionId}.hana.ondemand.com`;
}

/**
 * Fetch CF API /v2/info to discover the UAA authorization endpoint.
 */
export async function fetchCfLoginInfo(apiEndpoint: string): Promise<CfLoginInfo> {
  const response = await fetch(`${apiEndpoint}/v2/info`, {
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`CF API info request failed with status ${String(response.status)}.`);
  }

  const data = await response.json();
  if (!isRecord(data) || typeof data['authorization_endpoint'] !== 'string') {
    throw new Error('Unexpected CF API info response format.');
  }

  return { authorizationEndpoint: data['authorization_endpoint'] };
}

/**
 * Authenticate against the UAA endpoint using resource owner password grant.
 * Uses the public CF client (client_id=cf, client_secret=empty).
 */
export async function cfLogin(
  authorizationEndpoint: string,
  email: string,
  password: string
): Promise<CfToken> {
  const clientCredentials = btoa('cf:');
  const body = new URLSearchParams({
    grant_type: 'password',
    username: email,
    password,
    scope: '',
  });

  const response = await fetch(`${authorizationEndpoint}/oauth/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${clientCredentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    const isAuthError = response.status === 401 || response.status === 400;
    const message = isAuthError
      ? 'Invalid SAP credentials. Check your email and password.'
      : `CF authentication failed with status ${String(response.status)}.`;
    throw new Error(message + (errorText.length > 0 ? ` (${errorText.slice(0, 120)})` : ''));
  }

  const data = await response.json();
  if (
    !isRecord(data) ||
    typeof data['access_token'] !== 'string' ||
    typeof data['expires_in'] !== 'number'
  ) {
    throw new Error('Unexpected UAA token response format.');
  }

  return {
    accessToken: data['access_token'],
    refreshToken: typeof data['refresh_token'] === 'string' ? data['refresh_token'] : '',
    expiresAt: Date.now() + data['expires_in'] * 1000,
  };
}

/**
 * Fetch all CF organizations visible to the authenticated user.
 */
export async function fetchOrgs(session: CfSession): Promise<CfOrg[]> {
  const response = await fetch(
    `${session.apiEndpoint}/v2/organizations?results-per-page=100&order-by=name`,
    {
      headers: {
        Authorization: `Bearer ${session.token.accessToken}`,
        Accept: 'application/json',
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch CF organizations (status ${String(response.status)}).`);
  }

  const data = await response.json();
  if (!isRecord(data) || !Array.isArray(data['resources'])) {
    throw new Error('Unexpected CF organizations response format.');
  }

  const orgs: CfOrg[] = [];
  for (const resource of data['resources']) {
    if (!isRecord(resource)) continue;
    const metadata = resource['metadata'];
    const entity = resource['entity'];
    if (!isRecord(metadata) || !isRecord(entity)) continue;
    const guid = metadata['guid'];
    const name = entity['name'];
    if (typeof guid !== 'string' || typeof name !== 'string') continue;
    orgs.push({ guid, name });
  }

  return orgs;
}

/**
 * Fetch all CF spaces within the given organization.
 */
export async function fetchSpaces(session: CfSession, orgGuid: string): Promise<CfSpace[]> {
  const response = await fetch(
    `${session.apiEndpoint}/v2/spaces?q=organization_guid:${encodeURIComponent(orgGuid)}&results-per-page=100&order-by=name`,
    {
      headers: {
        Authorization: `Bearer ${session.token.accessToken}`,
        Accept: 'application/json',
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch CF spaces (status ${String(response.status)}).`);
  }

  const data = await response.json();
  if (!isRecord(data) || !Array.isArray(data['resources'])) {
    throw new Error('Unexpected CF spaces response format.');
  }

  const spaces: CfSpace[] = [];
  for (const resource of data['resources']) {
    if (!isRecord(resource)) continue;
    const metadata = resource['metadata'];
    const entity = resource['entity'];
    if (!isRecord(metadata) || !isRecord(entity)) continue;
    const guid = metadata['guid'];
    const name = entity['name'];
    if (typeof guid !== 'string' || typeof name !== 'string') continue;
    spaces.push({ guid, name });
  }

  return spaces;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
