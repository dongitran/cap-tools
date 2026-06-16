import { describe, expect, it } from 'vitest';

import { extractEventMeshBindings } from './eventMeshBindings';

function oauth(suffix: string): Record<string, unknown> {
  return {
    clientid: `client-${suffix}`,
    clientsecret: `secret-${suffix}`,
    tokenendpoint: `https://uaa.example.com/${suffix}/oauth/token`,
  };
}

function validBinding(namespace: string): Record<string, unknown> {
  return {
    name: 'app-service',
    instance_name: 'app-service-instance',
    credentials: {
      namespace,
      management: [{ uri: 'https://mgmt.example.com/', oa2: oauth('mgmt') }],
      messaging: [
        { protocol: ['httprest'], uri: 'https://rest.example.com', oa2: oauth('rest') },
        { protocol: ['amqp10ws'], uri: 'wss://amqp.example.com', oa2: oauth('amqp') },
      ],
    },
  };
}

function envWith(services: unknown): Record<string, unknown> {
  return { VCAP_SERVICES: { 'enterprise-messaging': services } };
}

describe('extractEventMeshBindings', () => {
  it('parses a well-formed enterprise-messaging binding', () => {
    const bindings = extractEventMeshBindings(envWith([validBinding('demo/service/app')]));
    expect(bindings).toHaveLength(1);
    const binding = bindings[0];
    expect(binding?.index).toBe(0);
    expect(binding?.name).toBe('app-service');
    expect(binding?.instanceName).toBe('app-service-instance');
    expect(binding?.namespace).toBe('demo/service/app');
    expect(binding?.management.uri).toBe('https://mgmt.example.com'); // trailing slash stripped
    expect(binding?.management.oa2.clientid).toBe('client-mgmt');
    expect(binding?.messaging.uri).toBe('https://rest.example.com');
    expect(binding?.amqp.uri).toBe('wss://amqp.example.com');
  });

  it('accepts protocol as a bare string as well as an array', () => {
    const service = validBinding('demo/service/app');
    const credentials = service['credentials'] as Record<string, unknown>;
    credentials['messaging'] = [
      { protocol: 'httprest', uri: 'https://rest.example.com', oa2: oauth('rest') },
      { protocol: 'amqp10ws-ws', uri: 'wss://amqp.example.com', oa2: oauth('amqp') },
    ];
    expect(extractEventMeshBindings(envWith([service]))).toHaveLength(1);
  });

  it('omits an absent granttype rather than setting it to undefined', () => {
    const binding = extractEventMeshBindings(envWith([validBinding('demo/service/app')]))[0];
    expect(binding).toBeDefined();
    expect(Object.prototype.hasOwnProperty.call(binding?.management.oa2 ?? {}, 'granttype')).toBe(false);
  });

  it('skips a binding missing the amqp10ws protocol', () => {
    const service = validBinding('demo/service/app');
    const credentials = service['credentials'] as Record<string, unknown>;
    credentials['messaging'] = [
      { protocol: ['httprest'], uri: 'https://rest.example.com', oa2: oauth('rest') },
    ];
    expect(extractEventMeshBindings(envWith([service]))).toHaveLength(0);
  });

  it('skips a binding missing the management endpoint', () => {
    const service = validBinding('demo/service/app');
    const credentials = service['credentials'] as Record<string, unknown>;
    delete credentials['management'];
    expect(extractEventMeshBindings(envWith([service]))).toHaveLength(0);
  });

  it('skips a binding with an incomplete OAuth block', () => {
    const service = validBinding('demo/service/app');
    const credentials = service['credentials'] as Record<string, unknown>;
    credentials['management'] = [{ uri: 'https://mgmt.example.com', oa2: { clientid: 'only-id' } }];
    expect(extractEventMeshBindings(envWith([service]))).toHaveLength(0);
  });

  it('skips a binding with an empty OAuth client secret', () => {
    const service = validBinding('demo/service/app');
    const credentials = service['credentials'] as Record<string, unknown>;
    credentials['management'] = [
      {
        uri: 'https://mgmt.example.com',
        oa2: {
          clientid: 'client-id',
          clientsecret: '',
          tokenendpoint: 'https://uaa.example.com/oauth/token',
        },
      },
    ];

    expect(extractEventMeshBindings(envWith([service]))).toHaveLength(0);
  });

  it('keeps valid bindings and drops malformed ones, preserving the original index', () => {
    const bindings = extractEventMeshBindings(
      envWith([{ credentials: {} }, validBinding('demo/service/alt')])
    );
    expect(bindings).toHaveLength(1);
    // The valid binding was the second array entry, so its index is 1.
    expect(bindings[0]?.index).toBe(1);
    expect(bindings[0]?.namespace).toBe('demo/service/alt');
  });

  it('returns an empty list when there is no enterprise-messaging service', () => {
    expect(extractEventMeshBindings({ VCAP_SERVICES: { hana: [] } })).toEqual([]);
    expect(extractEventMeshBindings({})).toEqual([]);
  });

  it('returns an empty list for non-object input', () => {
    expect(extractEventMeshBindings(null)).toEqual([]);
    expect(extractEventMeshBindings('nope')).toEqual([]);
    expect(extractEventMeshBindings(envWith('not-an-array'))).toEqual([]);
  });
});
