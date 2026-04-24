import {
  fetchDefaultEnvJsonFromTarget,
  prepareCfCliSession,
} from './cfClient';
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

interface ResolveHanaConnectionDependencies {
  readonly prepareCfCliSession: typeof prepareCfCliSession;
  readonly fetchDefaultEnvJsonFromTarget: typeof fetchDefaultEnvJsonFromTarget;
}

const defaultDependencies: ResolveHanaConnectionDependencies = {
  prepareCfCliSession,
  fetchDefaultEnvJsonFromTarget,
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
  await dependencies.prepareCfCliSession({
    apiEndpoint: options.session.apiEndpoint,
    email: options.session.email,
    password: options.session.password,
    orgName: options.session.orgName,
    spaceName: options.session.spaceName,
    cfHomeDir: options.session.cfHomeDir,
  });

  const defaultEnvJson = await dependencies.fetchDefaultEnvJsonFromTarget({
    appName: options.appName,
    cfHomeDir: options.session.cfHomeDir,
  });

  const parsedPayload = parseDefaultEnv(defaultEnvJson);
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
