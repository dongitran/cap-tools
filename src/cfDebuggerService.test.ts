import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as vscode from 'vscode';
import type {
  DebuggerHandle,
  StartDebuggerOptions,
} from '@saptools/cf-debugger';

import {
  buildFakeRunner,
  CfDebuggerService,
  type CfDebuggerRunner,
  type CfDebuggerServiceOptions,
  type DebugSessionView,
  type OutputChannelLike,
  type VscodeDebugLike,
} from './cfDebuggerService';

interface FakeDebugApi extends VscodeDebugLike {
  readonly fireStartedSession: (session: vscode.DebugSession) => void;
  readonly fireTerminatedSession: (session: vscode.DebugSession) => void;
  readonly startCalls: vscode.DebugConfiguration[];
  readonly stopCalls: vscode.DebugSession[];
  startResult: boolean;
}

function createFakeDebugApi(): FakeDebugApi {
  const startListeners = new Set<(session: vscode.DebugSession) => void>();
  const terminateListeners = new Set<(session: vscode.DebugSession) => void>();
  const startCalls: vscode.DebugConfiguration[] = [];
  const stopCalls: vscode.DebugSession[] = [];

  const api: FakeDebugApi = {
    startResult: true,
    startCalls,
    stopCalls,
    startDebugging: (
      _folder: vscode.WorkspaceFolder | undefined,
      config: vscode.DebugConfiguration
    ): Thenable<boolean> => {
      startCalls.push(config);
      return Promise.resolve(api.startResult);
    },
    stopDebugging: (session: vscode.DebugSession): Thenable<void> => {
      stopCalls.push(session);
      return Promise.resolve();
    },
    onDidStartDebugSession: ((listener) => {
      startListeners.add(listener);
      return {
        dispose: (): void => {
          startListeners.delete(listener);
        },
      };
    }) as vscode.Event<vscode.DebugSession>,
    onDidTerminateDebugSession: ((listener) => {
      terminateListeners.add(listener);
      return {
        dispose: (): void => {
          terminateListeners.delete(listener);
        },
      };
    }) as vscode.Event<vscode.DebugSession>,
    fireStartedSession: (session): void => {
      for (const listener of [...startListeners]) {
        listener(session);
      }
    },
    fireTerminatedSession: (session): void => {
      for (const listener of [...terminateListeners]) {
        listener(session);
      }
    },
  };

  return api;
}

function createOutputChannel(): OutputChannelLike & { lines: string[] } {
  const lines: string[] = [];
  return {
    lines,
    appendLine: (value: string): void => {
      lines.push(value);
    },
  };
}

interface InstrumentedHandle extends DebuggerHandle {
  resolveExit(code?: number | null): void;
  disposeCalls: number;
}

function buildControlledRunner(): {
  runner: CfDebuggerRunner;
  handles: Map<string, InstrumentedHandle>;
  capturedOptions: StartDebuggerOptions[];
} {
  const handles = new Map<string, InstrumentedHandle>();
  const capturedOptions: StartDebuggerOptions[] = [];

  const runner: CfDebuggerRunner = (opts) => {
    capturedOptions.push(opts);
    let exitResolve: (value: number | null) => void = (): void => undefined;
    const exitPromise = new Promise<number | null>((resolve) => {
      exitResolve = resolve;
    });
    const handle: InstrumentedHandle = {
      session: {
        sessionId: `session-${opts.app}`,
        pid: 1234,
        hostname: 'h',
        localPort: 20142,
        remotePort: 9229,
        apiEndpoint: 'https://api.cf.test',
        cfHomeDir: '',
        startedAt: '2026-04-23T00:00:00.000Z',
        status: 'ready',
        region: opts.region,
        org: opts.org,
        space: opts.space,
        app: opts.app,
      },
      disposeCalls: 0,
      dispose: async (): Promise<void> => {
        handle.disposeCalls += 1;
        exitResolve(0);
      },
      waitForExit: (): Promise<number | null> => exitPromise,
      resolveExit: (code = 0): void => {
        exitResolve(code);
      },
    };
    handles.set(opts.app, handle);
    opts.onStatus?.('logging-in');
    opts.onStatus?.('targeting');
    opts.onStatus?.('signaling');
    opts.onStatus?.('tunneling');
    return Promise.resolve(handle);
  };

  return { runner, handles, capturedOptions };
}

function buildService(
  overrides: Partial<CfDebuggerServiceOptions> = {}
): {
  service: CfDebuggerService;
  emitted: DebugSessionView[];
  debugApi: FakeDebugApi;
  output: ReturnType<typeof createOutputChannel>;
} {
  const debugApi = createFakeDebugApi();
  const output = createOutputChannel();
  const service = new CfDebuggerService({
    outputChannel: output,
    debugApi,
    ...overrides,
  });
  const emitted: DebugSessionView[] = [];
  service.onSessionChanged((view) => {
    emitted.push(view);
  });
  return { service, emitted, debugApi, output };
}

const VALID_SCOPE = {
  region: 'us10',
  org: 'finance-services-prod',
  space: 'uat',
  email: 'dev@example.com',
  password: 'secret',
};

describe('CfDebuggerService', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('emits an error update when starting without a confirmed scope', async () => {
    const { service, emitted } = buildService();
    await service.startDebug('billing-api');
    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({
      appName: 'billing-api',
      status: 'error',
      errorCode: 'NO_SCOPE',
    });
  });

  it('walks status transitions and attaches the VS Code debugger when the runner resolves', async () => {
    const { runner, handles, capturedOptions } = buildControlledRunner();
    const { service, emitted, debugApi } = buildService({ runner });
    service.setScope(VALID_SCOPE);

    await service.startDebug('billing-api');
    await flushPromises();

    expect(capturedOptions).toHaveLength(1);
    expect(capturedOptions[0]).toMatchObject({
      region: 'us10',
      org: 'finance-services-prod',
      space: 'uat',
      app: 'billing-api',
      email: 'dev@example.com',
    });
    expect(handles.has('billing-api')).toBe(true);

    expect(debugApi.startCalls).toHaveLength(1);
    expect(debugApi.startCalls[0]).toMatchObject({
      type: 'node',
      request: 'attach',
      port: 20142,
      sapToolsManaged: true,
      sapToolsApp: 'billing-api',
    });

    const statusOrder = emitted.map((view) => view.status);
    expect(statusOrder).toContain('starting');
    expect(statusOrder).toContain('tunneling');
    expect(statusOrder).toContain('ready');
    expect(statusOrder[statusOrder.length - 1]).toBe('attached');

    const snapshot = service.snapshot();
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0]).toMatchObject({
      appName: 'billing-api',
      status: 'attached',
      localPort: 20142,
    });
  });

  it('reports an error when VS Code refuses to attach and disposes the tunnel', async () => {
    const { runner, handles } = buildControlledRunner();
    const { service, emitted, debugApi } = buildService({ runner });
    debugApi.startResult = false;
    service.setScope(VALID_SCOPE);

    await service.startDebug('billing-api');
    await flushPromises();

    const final = emitted[emitted.length - 1];
    expect(final).toMatchObject({
      appName: 'billing-api',
      status: 'error',
      errorCode: 'ATTACH_FAILED',
    });
    expect(handles.get('billing-api')?.disposeCalls).toBe(1);
  });

  it('marks an app as error when the runner rejects with a CfDebuggerError-like object', async () => {
    const runner: CfDebuggerRunner = () => {
      const error = new Error('SSH not enabled.');
      (error as { code: string }).code = 'SSH_NOT_ENABLED';
      return Promise.reject(error);
    };
    const { service, emitted, output } = buildService({ runner });
    service.setScope(VALID_SCOPE);

    await service.startDebug('audit-service');

    const final = emitted[emitted.length - 1];
    expect(final).toMatchObject({
      status: 'error',
      errorCode: 'SSH_NOT_ENABLED',
      message: 'SSH not enabled.',
    });
    expect(output.lines.some((line) => line.includes('SSH_NOT_ENABLED'))).toBe(
      true
    );
  });

  it('stops a running session, disposes the tunnel and asks VS Code to stop the debugger', async () => {
    const { runner, handles } = buildControlledRunner();
    const { service, emitted, debugApi } = buildService({ runner });
    service.setScope(VALID_SCOPE);

    await service.startDebug('billing-api');
    await flushPromises();
    debugApi.fireStartedSession({
      id: 'vs-1',
      configuration: {
        type: 'node',
        request: 'attach',
        name: 'SAP Tools Debug: billing-api',
        sapToolsManaged: true,
        sapToolsApp: 'billing-api',
      },
    } as unknown as vscode.DebugSession);

    emitted.length = 0;
    await service.stopDebug('billing-api');
    await flushPromises();

    expect(debugApi.stopCalls).toHaveLength(1);
    expect(handles.get('billing-api')?.disposeCalls).toBe(1);
    const finalView = emitted[emitted.length - 1];
    expect(finalView).toMatchObject({
      status: 'stopped',
      appName: 'billing-api',
    });
    expect(finalView?.localPort).toBeUndefined();
  });

  it('marks the session as tunnel-closed when the SSH tunnel exits unexpectedly', async () => {
    const { runner, handles } = buildControlledRunner();
    const { service, emitted } = buildService({ runner });
    service.setScope(VALID_SCOPE);

    await service.startDebug('billing-api');
    emitted.length = 0;

    handles.get('billing-api')?.resolveExit(0);
    await flushPromises();

    const finalView = emitted[emitted.length - 1];
    expect(finalView).toMatchObject({
      appName: 'billing-api',
      status: 'tunnel-closed',
    });
  });

  it('returns to idle when an externally terminated VS Code debug session ends', async () => {
    const { runner } = buildControlledRunner();
    const { service, emitted, debugApi } = buildService({ runner });
    service.setScope(VALID_SCOPE);

    await service.startDebug('billing-api');
    await flushPromises();
    const fakeSession: vscode.DebugSession = {
      id: 'vs-2',
      configuration: {
        type: 'node',
        request: 'attach',
        name: 'SAP Tools Debug: billing-api',
        sapToolsManaged: true,
        sapToolsApp: 'billing-api',
      },
    } as unknown as vscode.DebugSession;
    debugApi.fireStartedSession(fakeSession);

    emitted.length = 0;
    debugApi.fireTerminatedSession(fakeSession);
    await flushPromises();

    const finalView = emitted[emitted.length - 1];
    expect(finalView).toMatchObject({
      appName: 'billing-api',
      status: 'idle',
    });
  });

  it('stops every tracked session when stopAll is invoked', async () => {
    const { runner, handles } = buildControlledRunner();
    const { service } = buildService({ runner });
    service.setScope(VALID_SCOPE);

    await service.startDebug('billing-api');
    await service.startDebug('payments-worker');
    await flushPromises();

    await service.stopAll();
    await flushPromises();

    expect(handles.get('billing-api')?.disposeCalls).toBe(1);
    expect(handles.get('payments-worker')?.disposeCalls).toBe(1);
    const snapshot = service.snapshot();
    const statuses = snapshot.map((view) => view.status);
    expect(statuses.every((status) => status === 'stopped')).toBe(true);
  });

  it('clears the configured scope and reflects no scope state', () => {
    const { service } = buildService();
    service.setScope(VALID_SCOPE);
    expect(service.hasScope()).toBe(true);
    service.clearScope();
    expect(service.hasScope()).toBe(false);
  });

  it('transitions to stopped (not error) when stopDebug aborts the runner mid-flight', async () => {
    let capturedSignal: AbortSignal | undefined;
    let rejectRunner: (err: unknown) => void = (): void => undefined;
    const runner: CfDebuggerRunner = (opts) => {
      capturedSignal = opts.signal;
      return new Promise<DebuggerHandle>((_resolve, reject) => {
        rejectRunner = reject;
      });
    };
    const { service, emitted, output } = buildService({ runner });
    service.setScope(VALID_SCOPE);

    const startPromise = service.startDebug('billing-api');
    await flushPromises();
    expect(capturedSignal).toBeDefined();

    const stopPromise = service.stopDebug('billing-api');
    expect(capturedSignal?.aborted).toBe(true);
    const abortedError = new Error('Operation aborted by caller');
    (abortedError as unknown as { code: string }).code = 'ABORTED';
    rejectRunner(abortedError);

    await Promise.all([startPromise, stopPromise]);
    await flushPromises();

    const final = emitted[emitted.length - 1];
    expect(final).toMatchObject({ appName: 'billing-api', status: 'stopped' });
    expect(emitted.some((view) => view.status === 'error')).toBe(false);
    expect(
      output.lines.some((line) => line.includes('startDebugger aborted'))
    ).toBe(true);
  });

  it('tears down the VS Code session if stopDebug wins the race against a successful attach', async () => {
    const capturedOptions: StartDebuggerOptions[] = [];
    const handles = new Map<string, InstrumentedHandle>();
    const runner: CfDebuggerRunner = (opts) => {
      capturedOptions.push(opts);
      let exitResolve: (value: number | null) => void = (): void => undefined;
      const exitPromise = new Promise<number | null>((resolve) => {
        exitResolve = resolve;
      });
      const handle: InstrumentedHandle = {
        session: {
          sessionId: `session-${opts.app}`,
          pid: 1234,
          hostname: 'h',
          localPort: 20142,
          remotePort: 9229,
          apiEndpoint: 'https://api.cf.test',
          cfHomeDir: '',
          startedAt: '2026-04-23T00:00:00.000Z',
          status: 'ready',
          region: opts.region,
          org: opts.org,
          space: opts.space,
          app: opts.app,
        },
        disposeCalls: 0,
        dispose: async (): Promise<void> => {
          handle.disposeCalls += 1;
          exitResolve(0);
        },
        waitForExit: (): Promise<number | null> => exitPromise,
        resolveExit: (code = 0): void => {
          exitResolve(code);
        },
      };
      handles.set(opts.app, handle);
      return Promise.resolve(handle);
    };

    let releaseStartDebugging: (value: boolean) => void = (): void => undefined;
    const startDebuggingGate = new Promise<boolean>((resolve) => {
      releaseStartDebugging = resolve;
    });
    const debugApi = createFakeDebugApi();
    const slowDebugApi: VscodeDebugLike = {
      onDidStartDebugSession: debugApi.onDidStartDebugSession,
      onDidTerminateDebugSession: debugApi.onDidTerminateDebugSession,
      startDebugging: (_folder, config): Thenable<boolean> => {
        debugApi.startCalls.push(config);
        return startDebuggingGate.then((result): boolean => {
          if (result) {
            const session = {
              id: 'late-vs',
              configuration: config,
            } as unknown as vscode.DebugSession;
            debugApi.fireStartedSession(session);
          }
          return result;
        });
      },
      stopDebugging: (session): Thenable<void> => {
        debugApi.stopCalls.push(session);
        return Promise.resolve();
      },
    };
    const output = createOutputChannel();
    const service = new CfDebuggerService({
      outputChannel: output,
      debugApi: slowDebugApi,
      runner,
    });
    service.setScope(VALID_SCOPE);

    await service.startDebug('billing-api');
    await flushPromises();

    const stopPromise = service.stopDebug('billing-api');
    await flushPromises();
    releaseStartDebugging(true);
    await stopPromise;
    await flushPromises();

    const snapshot = service.snapshot();
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0]?.status).toBe('stopped');
    expect(handles.get('billing-api')?.disposeCalls).toBe(1);
    expect(debugApi.stopCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('builds a fake runner that walks transitions and resolves a usable handle', async () => {
    vi.useFakeTimers();
    const runner = buildFakeRunner({ stepDelayMs: 0 });
    const statuses: string[] = [];
    const handlePromise = runner({
      region: 'us10',
      org: 'org',
      space: 'space',
      app: 'demo',
      email: 'dev@example.com',
      password: 'secret',
      onStatus: (status): void => {
        statuses.push(status);
      },
    });
    await vi.runAllTimersAsync();
    const handle = await handlePromise;

    expect(statuses).toEqual([
      'logging-in',
      'targeting',
      'signaling',
      'tunneling',
    ]);
    expect(handle.session.localPort).toBeGreaterThan(0);

    const exitPromise = handle.waitForExit();
    await handle.dispose();
    const exitCode = await exitPromise;
    expect(exitCode).toBe(0);
  });
});

async function flushPromises(): Promise<void> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
  }
}
