import { describe, expect, test, vi } from 'vitest';

import {
  resolveHanaConnectionFromApp,
  type HanaSqlScopeSession,
} from './hanaSqlConnectionResolver';

const SESSION: HanaSqlScopeSession = {
  apiEndpoint: 'https://api.cf.us10.hana.ondemand.com',
  email: 'developer@example.com',
  password: 'top-secret',
  orgName: 'finance-services-prod',
  spaceName: 'uat',
  cfHomeDir: '/tmp/sap-tools-cf-home',
};

describe('resolveHanaConnectionFromApp', () => {
  test('resolves HANA host/port/user/password from app default-env payload', async () => {
    const prepareCfCliSession = vi.fn(async () => undefined);
    const fetchDefaultEnvJsonFromTarget = vi.fn(async () => {
      return JSON.stringify({
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
    });

    const result = await resolveHanaConnectionFromApp(
      {
        appName: 'finance-uat-api',
        session: SESSION,
      },
      {
        prepareCfCliSession,
        fetchDefaultEnvJsonFromTarget,
      }
    );

    expect(prepareCfCliSession).toHaveBeenCalledTimes(1);
    expect(fetchDefaultEnvJsonFromTarget).toHaveBeenCalledTimes(1);
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
    const prepareCfCliSession = vi.fn(async () => undefined);
    const fetchDefaultEnvJsonFromTarget = vi.fn(async () => {
      return JSON.stringify({
        VCAP_SERVICES: {
          xsuaa: [],
        },
      });
    });

    await expect(
      resolveHanaConnectionFromApp(
        {
          appName: 'finance-uat-api',
          session: SESSION,
        },
        {
          prepareCfCliSession,
          fetchDefaultEnvJsonFromTarget,
        }
      )
    ).rejects.toThrow(/No HANA binding found/i);
  });

  test('throws when HANA port is invalid', async () => {
    const prepareCfCliSession = vi.fn(async () => undefined);
    const fetchDefaultEnvJsonFromTarget = vi.fn(async () => {
      return JSON.stringify({
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
      });
    });

    await expect(
      resolveHanaConnectionFromApp(
        {
          appName: 'finance-uat-api',
          session: SESSION,
        },
        {
          prepareCfCliSession,
          fetchDefaultEnvJsonFromTarget,
        }
      )
    ).rejects.toThrow(/Invalid HANA port/i);
  });

  test('throws when default-env payload is not valid JSON', async () => {
    const prepareCfCliSession = vi.fn(async () => undefined);
    const fetchDefaultEnvJsonFromTarget = vi.fn(async () => '{broken-json');

    await expect(
      resolveHanaConnectionFromApp(
        {
          appName: 'finance-uat-api',
          session: SESSION,
        },
        {
          prepareCfCliSession,
          fetchDefaultEnvJsonFromTarget,
        }
      )
    ).rejects.toThrow(/not valid JSON/i);
  });
});
