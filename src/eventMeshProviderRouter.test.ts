import { describe, expect, it, vi } from 'vitest';

import { EventMeshProviderRouter } from './eventMeshProviderRouter';
import type { EventMeshTargetParams } from './eventMeshPanel';

// cspell:ignore demoapp

function makeTargetParams(): EventMeshTargetParams {
  return {
    apiEndpoint: 'https://api.example.com',
    email: 'user@example.com',
    password: 'secret',
    orgName: 'demo-org',
    spaceName: 'dev',
    cfHomeDir: '/tmp/cf-home',
  };
}

function regularEventEnv(): Record<string, unknown> {
  return {
    VCAP_SERVICES: {
      'enterprise-messaging': [
        {
          name: 'regular-em',
          instance_name: 'regular-em',
          credentials: {
            namespace: 'demo/app',
            management: [
              {
                uri: 'https://event-mesh.example.com',
                oa2: {
                  clientid: 'id',
                  clientsecret: 'secret',
                  tokenendpoint: 'https://uaa.example.com/oauth/token',
                },
              },
            ],
            messaging: [
              {
                protocol: ['httprest'],
                uri: 'https://event-mesh.example.com/rest',
                oa2: {
                  clientid: 'id',
                  clientsecret: 'secret',
                  tokenendpoint: 'https://uaa.example.com/oauth/token',
                },
              },
              {
                protocol: ['amqp10ws'],
                uri: 'wss://event-mesh.example.com/amqp',
                oa2: {
                  clientid: 'id',
                  clientsecret: 'secret',
                  tokenendpoint: 'https://uaa.example.com/oauth/token',
                },
              },
            ],
          },
        },
      ],
    },
  };
}

function advancedEventEnv(): Record<string, unknown> {
  return {
    VCAP_SERVICES: {
      'user-provided': [
        {
          name: 'advanced-event-mesh',
          instance_name: 'advanced-event-mesh',
          credentials: {
            'authentication-service': {
              tokenendpoint: 'https://ias.example.com/oauth2/token',
              clientid: 'client-id',
              clientsecret: 'client-secret',
            },
            endpoints: {
              'advanced-event-mesh': {
                uri: 'https://broker.example.com:943',
                smf_uri: 'wss://broker.example.com:443',
              },
            },
            vpn: 'demo-aem',
          },
        },
      ],
    },
  };
}

function mergedEnv(left: Record<string, unknown>, right: Record<string, unknown>): Record<string, unknown> {
  return {
    VCAP_SERVICES: {
      ...(left['VCAP_SERVICES'] as Record<string, unknown>),
      ...(right['VCAP_SERVICES'] as Record<string, unknown>),
    },
  };
}

function createDeferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
} {
  let resolve: ((value: T) => void) | undefined;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  if (resolve === undefined) {
    throw new Error('Deferred promise initializer did not run.');
  }
  return { promise, resolve };
}

describe('EventMeshProviderRouter', () => {
  it('preserves the legacy Event Mesh panel when no target params are available', () => {
    const classic = { openEventMeshViewer: vi.fn(), closeEventMeshViewer: vi.fn(), stopAllListeners: vi.fn() };
    const advanced = { openAdvancedEventMeshViewer: vi.fn(), stopAllListeners: vi.fn() };
    const router = new EventMeshProviderRouter(classic, advanced);

    router.openEventMeshViewer('demo-app');

    expect(classic.openEventMeshViewer).toHaveBeenCalledWith('demo-app', undefined);
    expect(advanced.openAdvancedEventMeshViewer).not.toHaveBeenCalled();
  });

  it('opens the classic Event Mesh panel before provider detection finishes', async () => {
    const classic = { openEventMeshViewer: vi.fn(), closeEventMeshViewer: vi.fn(), stopAllListeners: vi.fn() };
    const advanced = { openAdvancedEventMeshViewer: vi.fn(), stopAllListeners: vi.fn() };
    const params = makeTargetParams();
    const envGate = createDeferred<string>();
    const router = new EventMeshProviderRouter(classic, advanced, {
      prepareCfCliSession: vi.fn(async () => undefined),
      fetchDefaultEnvJsonFromTarget: vi.fn(() => envGate.promise),
    });

    const openPromise = router.openEventMeshViewer('demo-app', params);
    await Promise.resolve();

    expect(classic.openEventMeshViewer).toHaveBeenCalledWith('demo-app', params);
    expect(advanced.openAdvancedEventMeshViewer).not.toHaveBeenCalled();

    envGate.resolve(JSON.stringify(regularEventEnv()));
    await openPromise;

    expect(classic.closeEventMeshViewer).not.toHaveBeenCalled();
  });

  it('waits for classic viewer readiness after regular provider detection', async () => {
    const classicGate = createDeferred<undefined>();
    const classic = {
      openEventMeshViewer: vi.fn(() => classicGate.promise),
      closeEventMeshViewer: vi.fn(),
      stopAllListeners: vi.fn(),
    };
    const advanced = { openAdvancedEventMeshViewer: vi.fn(), stopAllListeners: vi.fn() };
    const params = makeTargetParams();
    const fetchEnv = vi.fn(async () => JSON.stringify(regularEventEnv()));
    const router = new EventMeshProviderRouter(classic, advanced, {
      prepareCfCliSession: vi.fn(async () => undefined),
      fetchDefaultEnvJsonFromTarget: fetchEnv,
    });
    let settled = false;

    const openPromise = router.openEventMeshViewer('demo-app', params);
    void openPromise.then(() => {
      settled = true;
    });
    await vi.waitFor(() => expect(fetchEnv).toHaveBeenCalled());

    expect(settled).toBe(false);
    expect(advanced.openAdvancedEventMeshViewer).not.toHaveBeenCalled();

    classicGate.resolve(undefined);
    await openPromise;

    expect(settled).toBe(true);
  });

  it('waits for advanced viewer readiness without blocking provider detection on classic readiness', async () => {
    const classicGate = createDeferred<undefined>();
    const advancedGate = createDeferred<undefined>();
    const classic = {
      openEventMeshViewer: vi.fn(() => classicGate.promise),
      closeEventMeshViewer: vi.fn(),
      stopAllListeners: vi.fn(),
    };
    const advanced = {
      openAdvancedEventMeshViewer: vi.fn(() => advancedGate.promise),
      stopAllListeners: vi.fn(),
    };
    const params = makeTargetParams();
    const env = advancedEventEnv();
    const fetchEnv = vi.fn(async () => JSON.stringify(env));
    const router = new EventMeshProviderRouter(classic, advanced, {
      prepareCfCliSession: vi.fn(async () => undefined),
      fetchDefaultEnvJsonFromTarget: fetchEnv,
    });
    let settled = false;

    const openPromise = router.openEventMeshViewer('demo-app', params);
    void openPromise.then(() => {
      settled = true;
    });
    await vi.waitFor(() => expect(fetchEnv).toHaveBeenCalled());

    expect(classic.closeEventMeshViewer).toHaveBeenCalledWith('demo-app');
    expect(advanced.openAdvancedEventMeshViewer).toHaveBeenCalledWith('demo-app', params, {
      classicAvailable: false,
      defaultEnv: env,
    });
    expect(settled).toBe(false);

    advancedGate.resolve(undefined);
    await openPromise;

    expect(settled).toBe(true);
  });

  it('opens the regular Event Mesh panel when only enterprise-messaging is bound', async () => {
    const classic = { openEventMeshViewer: vi.fn(), closeEventMeshViewer: vi.fn(), stopAllListeners: vi.fn() };
    const advanced = { openAdvancedEventMeshViewer: vi.fn(), stopAllListeners: vi.fn() };
    const params = makeTargetParams();
    const router = new EventMeshProviderRouter(classic, advanced, {
      prepareCfCliSession: vi.fn(async () => undefined),
      fetchDefaultEnvJsonFromTarget: vi.fn(async () => JSON.stringify(regularEventEnv())),
    });

    await router.openEventMeshViewer('demo-app', params);

    expect(classic.openEventMeshViewer).toHaveBeenCalledWith('demo-app', params);
    expect(classic.closeEventMeshViewer).not.toHaveBeenCalled();
    expect(advanced.openAdvancedEventMeshViewer).not.toHaveBeenCalled();
  });

  it('opens the Advanced Event Mesh panel when only advanced-event-mesh is bound', async () => {
    const classic = { openEventMeshViewer: vi.fn(), closeEventMeshViewer: vi.fn(), stopAllListeners: vi.fn() };
    const advanced = { openAdvancedEventMeshViewer: vi.fn(), stopAllListeners: vi.fn() };
    const params = makeTargetParams();
    const env = advancedEventEnv();
    const router = new EventMeshProviderRouter(classic, advanced, {
      prepareCfCliSession: vi.fn(async () => undefined),
      fetchDefaultEnvJsonFromTarget: vi.fn(async () => JSON.stringify(env)),
    });

    await router.openEventMeshViewer('demo-app', params);

    expect(classic.openEventMeshViewer).toHaveBeenCalledWith('demo-app', params);
    expect(classic.closeEventMeshViewer).toHaveBeenCalledWith('demo-app');
    expect(advanced.openAdvancedEventMeshViewer).toHaveBeenCalledWith('demo-app', params, {
      classicAvailable: false,
      defaultEnv: env,
    });
  });

  it('opens the Advanced Event Mesh panel with a classic provider tab when both bindings exist', async () => {
    const classic = { openEventMeshViewer: vi.fn(), closeEventMeshViewer: vi.fn(), stopAllListeners: vi.fn() };
    const advanced = { openAdvancedEventMeshViewer: vi.fn(), stopAllListeners: vi.fn() };
    const params = makeTargetParams();
    const env = mergedEnv(regularEventEnv(), advancedEventEnv());
    const router = new EventMeshProviderRouter(classic, advanced, {
      prepareCfCliSession: vi.fn(async () => undefined),
      fetchDefaultEnvJsonFromTarget: vi.fn(async () => JSON.stringify(env)),
    });

    await router.openEventMeshViewer('demo-app', params);

    expect(classic.openEventMeshViewer).toHaveBeenCalledWith('demo-app', params);
    expect(classic.closeEventMeshViewer).toHaveBeenCalledWith('demo-app');
    expect(advanced.openAdvancedEventMeshViewer).toHaveBeenCalledWith('demo-app', params, {
      classicAvailable: true,
      defaultEnv: env,
    });
  });

  it('falls back to the legacy panel so existing no-binding errors stay unchanged', async () => {
    const classic = { openEventMeshViewer: vi.fn(), closeEventMeshViewer: vi.fn(), stopAllListeners: vi.fn() };
    const advanced = { openAdvancedEventMeshViewer: vi.fn(), stopAllListeners: vi.fn() };
    const params = makeTargetParams();
    const router = new EventMeshProviderRouter(classic, advanced, {
      prepareCfCliSession: vi.fn(async () => undefined),
      fetchDefaultEnvJsonFromTarget: vi.fn(async () => JSON.stringify({ VCAP_SERVICES: {} })),
    });

    await router.openEventMeshViewer('demo-app', params);

    expect(classic.openEventMeshViewer).toHaveBeenCalledWith('demo-app', params);
    expect(classic.closeEventMeshViewer).not.toHaveBeenCalled();
    expect(advanced.openAdvancedEventMeshViewer).not.toHaveBeenCalled();
  });

  it('falls back to the legacy panel when provider detection cannot read the app env', async () => {
    const classic = { openEventMeshViewer: vi.fn(), closeEventMeshViewer: vi.fn(), stopAllListeners: vi.fn() };
    const advanced = { openAdvancedEventMeshViewer: vi.fn(), stopAllListeners: vi.fn() };
    const params = makeTargetParams();
    const router = new EventMeshProviderRouter(classic, advanced, {
      prepareCfCliSession: vi.fn(async () => undefined),
      fetchDefaultEnvJsonFromTarget: vi.fn(async () => {
        throw new Error('cf env unavailable');
      }),
    });

    await router.openEventMeshViewer('demo-app', params);

    expect(classic.openEventMeshViewer).toHaveBeenCalledWith('demo-app', params);
    expect(classic.closeEventMeshViewer).not.toHaveBeenCalled();
    expect(advanced.openAdvancedEventMeshViewer).not.toHaveBeenCalled();
  });

  it('stops listeners on every underlying provider', () => {
    const classic = { openEventMeshViewer: vi.fn(), closeEventMeshViewer: vi.fn(), stopAllListeners: vi.fn() };
    const advanced = { openAdvancedEventMeshViewer: vi.fn(), stopAllListeners: vi.fn() };
    const router = new EventMeshProviderRouter(classic, advanced);

    router.stopAllListeners('scope-changed');

    expect(classic.stopAllListeners).toHaveBeenCalledWith('scope-changed');
    expect(advanced.stopAllListeners).toHaveBeenCalledWith('scope-changed');
  });
});
