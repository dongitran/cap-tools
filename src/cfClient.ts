// cspell:words guids hana ondemand
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const CF_MAX_BUFFER_BYTES = 8 * 1024 * 1024;
const CF_COMMAND_TIMEOUT_MS = 30_000;
const CF_API_REQUEST_TIMEOUT_MS = 20_000;
const CF_V3_PAGE_SIZE = 200;

interface CfCliExecutionOptions {
  readonly cfHomeDir?: string;
  readonly timeoutMs?: number;
  readonly failureMessage: string;
}

interface ParsedCfAppRow {
  readonly name: string;
  readonly requestedState: string;
  readonly runningInstances: number;
}

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

export interface CfRunningApp {
  readonly name: string;
  readonly runningInstances: number;
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
  const response = await fetchCfApi(`${apiEndpoint}/v2/info`, {
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

  const response = await fetchCfApi(`${authorizationEndpoint}/oauth/token`, {
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
  const v3Resources = await fetchV3Resources(
    session,
    `/v3/organizations?order_by=name&per_page=${String(CF_V3_PAGE_SIZE)}`,
    'Failed to fetch CF organizations'
  );
  return mapV3NamedResources(v3Resources);
}

/**
 * Fetch all CF spaces within the given organization.
 */
export async function fetchSpaces(session: CfSession, orgGuid: string): Promise<CfSpace[]> {
  const encodedOrgGuid = encodeURIComponent(orgGuid);
  const v3Resources = await fetchV3Resources(
    session,
    `/v3/spaces?organization_guids=${encodedOrgGuid}&order_by=name&per_page=${String(CF_V3_PAGE_SIZE)}`,
    'Failed to fetch CF spaces'
  );
  return mapV3NamedResources(v3Resources);
}

/**
 * Parse `cf apps` output and keep each app row with calculated running instances.
 * Supports both:
 * - CF v8 style `processes` column: `web:1/1, worker:0/1`
 * - CF v7 style `instances` column: `1/1`
 */
export function parseCfAppsOutput(stdout: string): ParsedCfAppRow[] {
  const lines = stdout.split(/\r?\n/);
  const headerIndex = lines.findIndex((line) => line.includes('requested state'));
  if (headerIndex < 0) {
    return [];
  }

  const rows: ParsedCfAppRow[] = [];

  for (const rawLine of lines.slice(headerIndex + 1)) {
    const line = rawLine.trim();
    if (line.length === 0) {
      continue;
    }

    const parts = line.split(/\s{2,}/);
    const name = parts[0]?.trim() ?? '';
    const requestedState = (parts[1]?.trim() ?? '').toLowerCase();
    const instancesToken = parts[2]?.trim() ?? '';

    if (name.length === 0 || requestedState.length === 0) {
      continue;
    }

    const runningInstances =
      requestedState === 'started' ? parseRunningInstances(instancesToken) : 0;

    rows.push({
      name,
      requestedState,
      runningInstances,
    });
  }

  return rows;
}

/**
 * Fetch apps from Cloud Foundry CLI and return only effectively running apps:
 * requested state is `started` and running instances > 0.
 */
export async function fetchStartedAppsViaCfCli(params: {
  readonly apiEndpoint: string;
  readonly email: string;
  readonly password: string;
  readonly orgName: string;
  readonly spaceName: string;
  readonly cfHomeDir?: string;
}): Promise<CfRunningApp[]> {
  const cfHomeOptions = buildCfHomeOptions(params.cfHomeDir);

  await runCfCommand(['api', params.apiEndpoint], {
    ...cfHomeOptions,
    failureMessage: 'Failed to set CF API endpoint.',
  });

  await runCfCommand(['auth', params.email, params.password], {
    ...cfHomeOptions,
    failureMessage: 'Failed to authenticate Cloud Foundry CLI.',
  });

  await runCfCommand(['target', '-o', params.orgName, '-s', params.spaceName], {
    ...cfHomeOptions,
    failureMessage: 'Failed to target CF org/space.',
  });

  const appsStdout = await runCfCommand(['apps'], {
    ...cfHomeOptions,
    failureMessage: 'Failed to fetch apps from CF CLI.',
  });

  return parseCfAppsOutput(appsStdout)
    .filter((row) => row.requestedState === 'started' && row.runningInstances > 0)
    .map((row) => ({ name: row.name, runningInstances: row.runningInstances }));
}

async function runCfCommand(
  args: string[],
  options: CfCliExecutionOptions
): Promise<string> {
  const env = { ...process.env };
  if (typeof options.cfHomeDir === 'string' && options.cfHomeDir.length > 0) {
    env['CF_HOME'] = options.cfHomeDir;
  }

  try {
    const { stdout } = await execFileAsync('cf', args, {
      env,
      maxBuffer: CF_MAX_BUFFER_BYTES,
      timeout: options.timeoutMs ?? CF_COMMAND_TIMEOUT_MS,
    });
    return stdout;
  } catch (error) {
    const safeDetail = extractSafeCliDetail(error);
    const detailSuffix = safeDetail.length > 0 ? ` ${safeDetail}` : '';
    throw new Error(`${options.failureMessage}${detailSuffix}`);
  }
}

function parseRunningInstances(instancesToken: string): number {
  if (instancesToken.length === 0) {
    return 0;
  }

  const regex = /(?:^|[, ])(?:[a-zA-Z0-9_-]+:)?(\d+)\/\d+/g;
  let totalRunningInstances = 0;
  let match = regex.exec(instancesToken);

  while (match !== null) {
    const parsedCount = Number.parseInt(match[1] ?? '0', 10);
    if (!Number.isNaN(parsedCount) && parsedCount > 0) {
      totalRunningInstances += parsedCount;
    }
    match = regex.exec(instancesToken);
  }

  return totalRunningInstances;
}

function extractSafeCliDetail(error: unknown): string {
  if (!isRecord(error)) {
    return '';
  }

  const stderr = typeof error['stderr'] === 'string' ? error['stderr'] : '';
  const normalized = stderr.replaceAll(/\s+/g, ' ').trim();

  if (normalized.length === 0) {
    return '';
  }

  return `(cli: ${normalized.slice(0, 180)})`;
}

function buildCfHomeOptions(cfHomeDir: string | undefined): Pick<CfCliExecutionOptions, 'cfHomeDir'> {
  if (typeof cfHomeDir === 'string' && cfHomeDir.length > 0) {
    return { cfHomeDir };
  }

  return {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function fetchV3Resources(
  session: CfSession,
  relativeUrl: string,
  failureMessage: string
): Promise<Record<string, unknown>[]> {
  const visitedUrls = new Set<string>();
  const resources: Record<string, unknown>[] = [];
  let nextPageUrl = `${session.apiEndpoint}${relativeUrl}`;

  while (nextPageUrl.length > 0) {
    if (visitedUrls.has(nextPageUrl)) {
      throw new Error(`${failureMessage} (v3 pagination loop detected).`);
    }
    visitedUrls.add(nextPageUrl);

    const response = await fetchCfApi(nextPageUrl, {
      headers: buildCfAuthHeaders(session.token.accessToken),
    });

    if (!response.ok) {
      throw new Error(`${failureMessage} (status ${String(response.status)}).`);
    }

    const payload = await response.json();
    if (!isRecord(payload) || !Array.isArray(payload['resources'])) {
      throw new Error(`Unexpected v3 response format for ${failureMessage.toLowerCase()}.`);
    }

    for (const resource of payload['resources']) {
      if (isRecord(resource)) {
        resources.push(resource);
      }
    }

    nextPageUrl = resolveV3NextPageUrl(payload['pagination'], session.apiEndpoint);
  }

  return resources;
}

function mapV3NamedResources(resources: readonly Record<string, unknown>[]): CfOrg[] {
  const items: CfOrg[] = [];
  for (const resource of resources) {
    const guid = resource['guid'];
    const name = resource['name'];
    if (typeof guid === 'string' && typeof name === 'string') {
      items.push({ guid, name });
    }
  }
  return items;
}

function resolveV3NextPageUrl(pagination: unknown, apiEndpoint: string): string {
  if (!isRecord(pagination)) {
    return '';
  }
  const next = pagination['next'];
  if (!isRecord(next) || typeof next['href'] !== 'string') {
    return '';
  }
  const href = next['href'];
  if (href.length === 0) {
    return '';
  }
  if (href.startsWith('http://') || href.startsWith('https://')) {
    return href;
  }
  return `${apiEndpoint}${href}`;
}

function buildCfAuthHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/json',
  };
}

async function fetchCfApi(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, CF_API_REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error(`CF API request timed out after ${String(CF_API_REQUEST_TIMEOUT_MS)}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function isAbortError(error: unknown): boolean {
  return (
    isRecord(error) &&
    typeof error['name'] === 'string' &&
    error['name'].toLowerCase() === 'aborterror'
  );
}
