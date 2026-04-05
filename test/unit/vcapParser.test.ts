import { describe, it, expect } from 'vitest';
import { extractHanaCredentials, parseVcapFromEnvOutput } from '../../src/features/credentials/vcapParser';

const MOCK_VCAP: Record<string, unknown> = {
  hana: [
    {
      name: 'my-hana',
      label: 'hana',
      credentials: {
        host: 'my-host.hana.ondemand.com',
        port: 30015,
        schema: 'MY_SCHEMA',
        user: 'MYUSER',
        password: 'secret123',
        certificate: '-----BEGIN CERTIFICATE-----\nMIID...',
      },
    },
  ],
};

describe('extractHanaCredentials', () => {
  it('extracts credentials from hana binding', () => {
    const creds = extractHanaCredentials(MOCK_VCAP as never);
    expect(creds).not.toBeUndefined();
    expect(creds?.host).toBe('my-host.hana.ondemand.com');
    expect(creds?.port).toBe(30015);
    expect(creds?.database).toBe('MY_SCHEMA');
    expect(creds?.user).toBe('MYUSER');
    expect(creds?.password).toBe('secret123');
    expect(creds?.certificate).toContain('BEGIN CERTIFICATE');
  });

  it('returns undefined when no HANA binding', () => {
    const creds = extractHanaCredentials({ xsuaa: [] } as never);
    expect(creds).toBeUndefined();
  });

  it('returns undefined when credentials missing required fields', () => {
    const vcap = {
      hana: [{ name: 'test', label: 'hana', credentials: { host: 'host' } }],
    };
    const creds = extractHanaCredentials(vcap as never);
    expect(creds).toBeUndefined();
  });

  it('handles hanatrial label', () => {
    const vcap = {
      hanatrial: [
        {
          name: 'trial',
          label: 'hanatrial',
          credentials: {
            host: 'trial-host.hana.ondemand.com',
            port: 443,
            schema: 'TRIAL',
            user: 'USER',
            password: 'pass',
          },
        },
      ],
    };
    const creds = extractHanaCredentials(vcap as never);
    expect(creds?.host).toBe('trial-host.hana.ondemand.com');
  });

  it('handles hostname alias', () => {
    const vcap = {
      hana: [
        {
          name: 'test',
          label: 'hana',
          credentials: { hostname: 'alt-host', port: 30015, schema: 'S', username: 'U', password: 'P' },
        },
      ],
    };
    const creds = extractHanaCredentials(vcap as never);
    expect(creds?.host).toBe('alt-host');
    expect(creds?.user).toBe('U');
  });
});

describe('parseVcapFromEnvOutput', () => {
  it('parses VCAP_SERVICES from cf env output', () => {
    const output = `
System-Provided:
VCAP_SERVICES: {
  "hana": [
    {
      "name": "my-hana",
      "label": "hana",
      "credentials": {
        "host": "test.hana.ondemand.com",
        "port": 30015,
        "schema": "TEST",
        "user": "U",
        "password": "P"
      }
    }
  ]
}

No user-defined env variables have been set
`;
    const vcap = parseVcapFromEnvOutput(output);
    expect(vcap).toHaveProperty('hana');
    expect(vcap['hana']).toHaveLength(1);
    expect((vcap['hana'][0] as { credentials: { host: string } }).credentials.host).toBe('test.hana.ondemand.com');
  });

  it('returns empty object when VCAP_SERVICES not present', () => {
    const output = 'No system-provided services.\nNo user env variables.';
    const vcap = parseVcapFromEnvOutput(output);
    expect(vcap).toEqual({});
  });
});
