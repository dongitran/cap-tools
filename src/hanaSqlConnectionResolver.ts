import {
  fetchAppEnvironmentFromTarget,
  runWithCfTarget,
} from './cfClient';
import { assertResolvedAppScope } from './cfAppScopeGuard';
import { extractHanaCredentialsFromDefaultEnv } from './sqlToolsConfigExporter';
import type { HanaConnection } from './hanaSqlService';

export interface HanaSqlScopeSession {
  readonly apiEndpoint: string;
  readonly email: string;
  readonly password: string;
  readonly orgName: string;
  readonly spaceName: string;
  readonly cfHomeDir: string;
}

export interface ResolveHanaConnectionOptions {
  readonly appName: string;
  readonly session: HanaSqlScopeSession;
}

export interface ResolveHanaConnectionResult {
  readonly connection: HanaConnection;
  readonly schema: string;
}

export interface HanaSqlHistoryScope {
  readonly region: string;
  readonly orgName: string;
  readonly spaceName: string;
}

interface ResolveHanaConnectionDependencies {
  readonly runWithCfTarget: typeof runWithCfTarget;
  readonly fetchAppEnvironmentFromTarget: typeof fetchAppEnvironmentFromTarget;
}

const defaultDependencies: ResolveHanaConnectionDependencies = {
  runWithCfTarget,
  fetchAppEnvironmentFromTarget,
};

function parseDefaultEnv(defaultEnvJson: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(defaultEnvJson) as unknown;
  } catch {
    throw new Error('default-env.json is not valid JSON.');
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('default-env.json must be a JSON object.');
  }

  return parsed as Record<string, unknown>;
}


function parsePort(portRaw: string, appName: string): number {
  const parsedPort = Number.parseInt(portRaw, 10);
  if (!Number.isFinite(parsedPort) || parsedPort <= 0) {
    throw new Error(`Invalid HANA port "${portRaw}" for app "${appName}".`);
  }
  return parsedPort;
}

export async function resolveHanaConnectionFromApp(
  options: ResolveHanaConnectionOptions,
  dependencies: ResolveHanaConnectionDependencies = defaultDependencies
): Promise<ResolveHanaConnectionResult> {
  // Target and lookup happen inside one CF_HOME slot so no other feature can
  // retarget between them; assertResolvedAppScope is the belt to that braces.
  const environment = await dependencies.runWithCfTarget(
    {
      apiEndpoint: options.session.apiEndpoint,
      email: options.session.email,
      password: options.session.password,
      orgName: options.session.orgName,
      spaceName: options.session.spaceName,
      cfHomeDir: options.session.cfHomeDir,
    },
    () =>
      dependencies.fetchAppEnvironmentFromTarget({
        appName: options.appName,
        cfHomeDir: options.session.cfHomeDir,
      })
  );
  assertResolvedAppScope(
    {
      appName: options.appName,
      orgName: options.session.orgName,
      spaceName: options.session.spaceName,
    },
    environment.identity
  );

  const parsedPayload = parseDefaultEnv(environment.defaultEnvJson);
  const credentials = extractHanaCredentialsFromDefaultEnv(parsedPayload);
  if (credentials === null) {
    throw new Error(
      `No HANA binding found for app "${options.appName}" in VCAP_SERVICES.hana.`
    );
  }

  return {
    connection: {
      host: credentials.host,
      port: parsePort(credentials.port, options.appName),
      user: credentials.user,
      password: credentials.password,
    },
    schema: credentials.schema,
  };
}
