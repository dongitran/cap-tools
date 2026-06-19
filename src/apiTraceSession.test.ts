import { describe, expect, it, vi } from 'vitest';

import { ApiTraceSession } from './apiTraceSession';
import type { ApiTraceStatePayload } from './apiTraceTypes';
import type { ApiTraceInspectorClient } from './apiTraceInspectorClient';
import type { ApiTraceTunnelReadyResult } from './apiTraceTunnel';

function createDeferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (reason?: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function createSession(): {
  readonly batches: unknown[];
  readonly session: ApiTraceSession;
  readonly states: ApiTraceStatePayload[];
  readonly summaries: unknown[];
} {
  const states: ApiTraceStatePayload[] = [];
  const batches: unknown[] = [];
  const summaries: unknown[] = [];
  const session = new ApiTraceSession({
    appId: 'finance-uat-api',
    targetParams: undefined,
    isTestMode: true,
    callbacks: {
      postState: (state) => states.push(state),
      postBatch: (batch) => batches.push(batch),
      postUrlSummary: (summary) => summaries.push(summary),
      log: vi.fn(),
    },
  });
  return { batches, session, states, summaries };
}

describe('ApiTraceSession', () => {
  it('starts in test mode and emits raw mock trace events with URL summaries', async () => {
    const { batches, session, states, summaries } = createSession();

    await session.start({
      mode: 'runtime-http',
      instanceIndex: 0,
      processName: 'web',
      captureHeaders: false,
      captureRequestBody: false,
      captureResponseBody: false,
      maxBodyBytes: 4096,
      filters: {
        method: [],
        pathContains: '',
        statusClass: 'all',
      },
    });

    expect(states.map((state) => state.state)).toEqual(['preparingCli', 'streaming']);
    expect(session.isRunning()).toBe(true);
    expect(batches).toHaveLength(1);
    expect(JSON.stringify(batches[0])).toContain('demo-access-token');
    expect(summaries).toHaveLength(1);
    expect(JSON.stringify(summaries[0])).toContain('/odata/v4/products');
  });

  it('stops and disposes idempotently', async () => {
    const { session, states } = createSession();

    await session.start({
      mode: 'runtime-http',
      instanceIndex: 0,
      processName: 'web',
      captureHeaders: false,
      captureRequestBody: false,
      captureResponseBody: false,
      maxBodyBytes: 4096,
      filters: {
        method: [],
        pathContains: '',
        statusClass: 'all',
      },
    });
    await session.stop('user', true);
    await session.stop('user', true);
    session.dispose();

    expect(session.isRunning()).toBe(false);
    expect(states.at(-1)).toEqual(
      expect.objectContaining({
        state: 'stopped',
        runtimeHookInstalled: false,
        runtimeHookMayRemain: false,
      })
    );
  });

  it('clears buffered trace summaries without stopping a running session', async () => {
    const { session, summaries } = createSession();

    await session.start({
      mode: 'runtime-http',
      instanceIndex: 0,
      processName: 'web',
      captureHeaders: false,
      captureRequestBody: false,
      captureResponseBody: false,
      maxBodyBytes: 4096,
      filters: {
        method: [],
        pathContains: '',
        statusClass: 'all',
      },
    });
    session.clear();

    expect(session.isRunning()).toBe(true);
    expect(JSON.stringify(summaries.at(-1))).toContain('"urls":[]');
  });

  it('starts runtime tracing through an inspector tunnel and drains raw events', async () => {
    let pollCallback: (() => void) | undefined;
    const states: ApiTraceStatePayload[] = [];
    const batches: unknown[] = [];
    const summaries: unknown[] = [];
    const inspectorClient: ApiTraceInspectorClient = {
      evaluate: vi.fn(async (expression: string) => {
        if (expression.includes('drainEvents')) {
          return {
            events: [
              {
                id: 'runtime-1',
                timestamp: '2026-06-18T07:22:10.120Z',
                instance: '0',
                method: 'GET',
                path: '/odata/v4/products',
                url: '/odata/v4/products?access_token=raw-token',
                normalizedUrl: '/odata/v4/products?access_token=raw-token',
                status: 200,
                durationMs: 31,
                requestBytes: 0,
                responseBytes: 128,
                requestHeaders: { authorization: 'Bearer raw-token' },
                responseHeaders: { 'content-type': 'application/json' },
                requestBodyPreview: '',
                responseBodyPreview: '{"token":"raw-token"}',
                requestBodyTruncated: false,
                responseBodyTruncated: false,
                droppedBeforeEvent: 0,
                traceId: 'runtime-1',
                correlationId: null,
              },
            ],
            droppedCount: 0,
            queueSize: 0,
          };
        }
        return { installed: true };
      }),
      close: vi.fn(),
    };
    const tunnelHandle = {
      localPort: 51234,
      stop: vi.fn(),
    };
    const session = new ApiTraceSession({
      appId: 'finance-uat-api',
      targetParams: {
        apiEndpoint: 'https://api.example.com',
        email: 'user@example.com',
        password: 'secret',
        orgName: 'demo-org',
        spaceName: 'demo-space',
        cfHomeDir: '/tmp/cf-home',
      },
      isTestMode: false,
      callbacks: {
        postState: (state) => states.push(state),
        postBatch: (batch) => batches.push(batch),
        postUrlSummary: (summary) => summaries.push(summary),
        log: vi.fn(),
      },
      dependencies: {
        prepareCfCliSession: vi.fn(async () => undefined),
        tryStartNodeInspector: vi.fn(async () => true),
        openInspectorTunnel: vi.fn(async (): Promise<ApiTraceTunnelReadyResult> => ({
          status: 'ready',
          handle: tunnelHandle,
        })),
        createInspectorClient: vi.fn(async () => inspectorClient),
        setInterval: vi.fn((callback: () => void) => {
          pollCallback = callback;
          return 7 as unknown as NodeJS.Timeout;
        }),
        clearInterval: vi.fn(),
      },
    });

    await session.start({
      mode: 'runtime-http',
      instanceIndex: 0,
      processName: 'web',
      captureHeaders: true,
      captureRequestBody: false,
      captureResponseBody: true,
      maxBodyBytes: 4096,
      filters: {
        method: [],
        pathContains: '',
        statusClass: 'all',
      },
    });
    pollCallback?.();
    await Promise.resolve();

    expect(states.map((state) => state.state)).toEqual([
      'preparingCli',
      'checkingRuntime',
      'openingTunnel',
      'injecting',
      'streaming',
    ]);
    expect(batches).toHaveLength(1);
    expect(JSON.stringify(batches[0])).toContain('Bearer raw-token');
    expect(JSON.stringify(summaries[0])).toContain('/odata/v4/products?access_token=raw-token');

    await session.stop('user', true);

    expect(inspectorClient.evaluate).toHaveBeenCalledWith(expect.stringContaining('uninstall'), 5000);
    expect(inspectorClient.close).toHaveBeenCalledTimes(1);
    expect(tunnelHandle.stop).toHaveBeenCalledTimes(1);
  });

  it('cancels late tunnel startup when tracing is stopped during startup', async () => {
    const states: ApiTraceStatePayload[] = [];
    const tunnelDeferred = createDeferred<ApiTraceTunnelReadyResult>();
    const tunnelHandle = {
      localPort: 51235,
      stop: vi.fn(),
    };
    const createInspectorClient = vi.fn(async (): Promise<ApiTraceInspectorClient | null> => ({
      evaluate: vi.fn(),
      close: vi.fn(),
    }));
    const session = new ApiTraceSession({
      appId: 'finance-uat-api',
      targetParams: {
        apiEndpoint: 'https://api.example.com',
        email: 'user@example.com',
        password: 'secret',
        orgName: 'demo-org',
        spaceName: 'demo-space',
      },
      isTestMode: false,
      callbacks: {
        postState: (state) => states.push(state),
        postBatch: vi.fn(),
        postUrlSummary: vi.fn(),
        log: vi.fn(),
      },
      dependencies: {
        prepareCfCliSession: vi.fn(async () => undefined),
        tryStartNodeInspector: vi.fn(async () => true),
        openInspectorTunnel: vi.fn(async () => tunnelDeferred.promise),
        createInspectorClient,
        setInterval: vi.fn(() => 8 as unknown as NodeJS.Timeout),
        clearInterval: vi.fn(),
      },
    });

    const startPromise = session.start({
      mode: 'runtime-http',
      instanceIndex: 0,
      processName: 'web',
      captureHeaders: true,
      captureRequestBody: false,
      captureResponseBody: true,
      maxBodyBytes: 4096,
      filters: {
        method: [],
        pathContains: '',
        statusClass: 'all',
      },
    });

    await vi.waitFor(() => {
      expect(states.map((state) => state.state)).toContain('openingTunnel');
    });
    await session.stop('panel-closed', true);
    tunnelDeferred.resolve({ status: 'ready', handle: tunnelHandle });
    await startPromise;

    expect(tunnelHandle.stop).toHaveBeenCalledTimes(1);
    expect(createInspectorClient).not.toHaveBeenCalled();
    expect(states.at(-1)?.state).toBe('stopped');
    expect(session.isRunning()).toBe(false);
  });

  it('treats needsInspector as stoppable without marking it as actively streaming', async () => {
    const states: ApiTraceStatePayload[] = [];
    const session = new ApiTraceSession({
      appId: 'finance-uat-api',
      targetParams: {
        apiEndpoint: 'https://api.example.com',
        email: 'user@example.com',
        password: 'secret',
        orgName: 'demo-org',
        spaceName: 'demo-space',
      },
      isTestMode: false,
      callbacks: {
        postState: (state) => states.push(state),
        postBatch: vi.fn(),
        postUrlSummary: vi.fn(),
        log: vi.fn(),
      },
      dependencies: {
        prepareCfCliSession: vi.fn(async () => undefined),
        tryStartNodeInspector: vi.fn(async () => false),
        openInspectorTunnel: vi.fn(async () => ({ status: 'not-reachable' })),
        createInspectorClient: vi.fn(),
      },
    });

    await session.start({
      mode: 'runtime-http',
      instanceIndex: 0,
      processName: 'web',
      captureHeaders: false,
      captureRequestBody: false,
      captureResponseBody: false,
      maxBodyBytes: 4096,
      filters: {
        method: [],
        pathContains: '',
        statusClass: 'all',
      },
    });

    expect(states.at(-1)?.state).toBe('needsInspector');
    expect(session.isRunning()).toBe(false);
    expect(session.canStop()).toBe(true);

    await session.stop('scope-changed', true);

    expect(states.at(-1)?.state).toBe('stopped');
    expect(session.canStop()).toBe(false);
  });
});
