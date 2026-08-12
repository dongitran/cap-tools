import { describe, expect, test, vi } from 'vitest';

import {
  resolveHanaConnectionFromApp,
  type HanaSqlScopeSession,
} from './hanaSqlConnectionResolver';
import type { CfAppEnvironment } from './cfClient';

const SESSION: HanaSqlScopeSession = {
  apiEndpoint: 'https://api.cf.us10.hana.ondemand.com',
  email: 'developer@example.com',
  password: 'top-secret',
  orgName: 'finance-services-prod',
  spaceName: 'uat',
  cfHomeDir: '/tmp/sap-tools-cf-home',
};

const HANA_ENV_JSON = JSON.stringify({
  VCAP_SERVICES: {
    hana: [
      {
        credentials: {
          host: 'hana-db.example.com',
          port: '443',
          user: 'DB_USER',
          password: 'DB_PASSWORD',
          schema: 'FINANCE_SCHEMA',
        },
      },
    ],
  },
});

function environment(
  defaultEnvJson: string,
  identity: CfAppEnvironment['identity'] = {
    organizationName: SESSION.orgName,
    spaceName: SESSION.spaceName,
  }
): CfAppEnvironment {
  return { defaultEnvJson, identity };
}

function dependencies(environmentResult: CfAppEnvironment | Promise<CfAppEnvironment>): {
  runWithCfTarget: ReturnType<typeof vi.fn>;
  fetchAppEnvironmentFromTarget: ReturnType<typeof vi.fn>;
} {
  return {
    // Pass-through: the real implementation holds the CF_HOME slot around the
    // operation, which is exercised in cfClient.test.ts.
    runWithCfTarget: vi.fn(async (_params: unknown, operation: () => Promise<unknown>) =>
      operation()
    ),
    fetchAppEnvironmentFromTarget: vi.fn(async () => environmentResult),
  };
}

describe('resolveHanaConnectionFromApp', () => {
  test('resolves HANA host/port/user/password from app default-env payload', async () => {
    const deps = dependencies(environment(HANA_ENV_JSON));

    const result = await resolveHanaConnectionFromApp(
      { appName: 'finance-uat-api', session: SESSION },
      deps
    );

    expect(deps.runWithCfTarget).toHaveBeenCalledTimes(1);
    expect(deps.fetchAppEnvironmentFromTarget).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      connection: {
        host: 'hana-db.example.com',
        port: 443,
        user: 'DB_USER',
        password: 'DB_PASSWORD',
      },
      schema: 'FINANCE_SCHEMA',
    });
  });

  test('throws when default-env has no VCAP_SERVICES.hana binding', async () => {
    const deps = dependencies(environment(JSON.stringify({ VCAP_SERVICES: { xsuaa: [] } })));

    await expect(
      resolveHanaConnectionFromApp({ appName: 'finance-uat-api', session: SESSION }, deps)
    ).rejects.toThrow(/No HANA binding found/i);
  });

  test('throws when HANA port is invalid', async () => {
    const deps = dependencies(
      environment(
        JSON.stringify({
          VCAP_SERVICES: {
            hana: [
              {
                credentials: {
                  host: 'hana-db.example.com',
                  port: 'not-a-port',
                  user: 'DB_USER',
                  password: 'DB_PASSWORD',
                  schema: 'FINANCE_SCHEMA',
                },
              },
            ],
          },
        })
      )
    );

    await expect(
      resolveHanaConnectionFromApp({ appName: 'finance-uat-api', session: SESSION }, deps)
    ).rejects.toThrow(/Invalid HANA port/i);
  });

  test('throws when default-env payload is not valid JSON', async () => {
    const deps = dependencies(environment('{broken-json'));

    await expect(
      resolveHanaConnectionFromApp({ appName: 'finance-uat-api', session: SESSION }, deps)
    ).rejects.toThrow(/not valid JSON/i);
  });

  describe('scope verification', () => {
    test('rejects credentials that came back from a different org', async () => {
      const deps = dependencies(
        environment(HANA_ENV_JSON, {
          organizationName: 'finance-services-dev',
          spaceName: SESSION.spaceName,
        })
      );

      await expect(
        resolveHanaConnectionFromApp({ appName: 'finance-uat-api', session: SESSION }, deps)
      ).rejects.toThrow(/finance-services-dev/);
    });

    test('rejects credentials that came back from a different space', async () => {
      const deps = dependencies(
        environment(HANA_ENV_JSON, {
          organizationName: SESSION.orgName,
          spaceName: 'prod',
        })
      );

      await expect(
        resolveHanaConnectionFromApp({ appName: 'finance-uat-api', session: SESSION }, deps)
      ).rejects.toThrow(/prod/);
    });

    test('names both the expected and the actual scope so the mismatch is diagnosable', async () => {
      const deps = dependencies(
        environment(HANA_ENV_JSON, { organizationName: 'other-org', spaceName: 'other-space' })
      );

      const error = await resolveHanaConnectionFromApp(
        { appName: 'finance-uat-api', session: SESSION },
        deps
      ).catch((thrown: unknown) => thrown);

      expect(error).toBeInstanceOf(Error);
      const message = (error as Error).message;
      expect(message).toContain('other-org/other-space');
      expect(message).toContain('finance-services-prod/uat');
      expect(message).toContain('finance-uat-api');
    });

    test('compares scope names case-insensitively and ignores surrounding whitespace', async () => {
      const deps = dependencies(
        environment(HANA_ENV_JSON, {
          organizationName: '  FINANCE-SERVICES-PROD ',
          spaceName: 'UAT',
        })
      );

      await expect(
        resolveHanaConnectionFromApp({ appName: 'finance-uat-api', session: SESSION }, deps)
      ).resolves.toMatchObject({ schema: 'FINANCE_SCHEMA' });
    });

    test('proceeds when CF did not report an identity, rather than blocking the user', async () => {
      const deps = dependencies(environment(HANA_ENV_JSON, null));

      await expect(
        resolveHanaConnectionFromApp({ appName: 'finance-uat-api', session: SESSION }, deps)
      ).resolves.toMatchObject({ schema: 'FINANCE_SCHEMA' });
    });
  });
});
