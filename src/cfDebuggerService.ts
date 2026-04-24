import type * as vscode from 'vscode';

// Local type declarations mirroring @saptools/cf-debugger's public API surface.
// We cannot static-import types from that ESM package while compiling to
// Node16 CommonJS without an import attribute, so we keep the contract here
// and load the runtime via dynamic import() inside loadDefaultRunner().
export type SessionStatus =
  | 'starting'
  | 'logging-in'
  | 'targeting'
  | 'ssh-enabling'
  | 'ssh-restarting'
  | 'signaling'
  | 'tunneling'
  | 'ready'
  | 'stopping'
  | 'stopped'
  | 'error';

export interface ActiveSession {
  readonly sessionId: string;
  readonly pid: number;
  readonly hostname: string;
  readonly localPort: number;
  readonly remotePort: number;
  readonly apiEndpoint: string;
  readonly cfHomeDir: string;
  readonly startedAt: string;
  readonly status: SessionStatus;
  readonly message?: string;
  readonly region: string;
  readonly org: string;
  readonly space: string;
  readonly app: string;
}

export interface StartDebuggerOptions {
  readonly region: string;
  readonly org: string;
  readonly space: string;
  readonly app: string;
  readonly email?: string;
  readonly password?: string;
  readonly apiEndpoint?: string;
  readonly preferredPort?: number;
  readonly tunnelReadyTimeoutMs?: number;
  readonly verbose?: boolean;
  readonly onStatus?: (status: SessionStatus, message?: string) => void;
  readonly signal?: AbortSignal;
}

export interface DebuggerHandle {
  readonly session: ActiveSession;
  dispose(): Promise<void>;
  waitForExit(): Promise<number | null>;
}

export type DebugSessionStatus = SessionStatus | 'idle' | 'attached' | 'tunnel-closed';

export interface DebugSessionView {
  readonly appName: string;
  readonly status: DebugSessionStatus;
  readonly message?: string;
  readonly localPort?: number;
  readonly errorCode?: string;
  readonly startedAt?: string;
}

export interface DebugScope {
  readonly region: string;
  readonly org: string;
  readonly space: string;
  readonly email: string;
  readonly password: string;
}

export type CfDebuggerRunner = (
  opts: StartDebuggerOptions
) => Promise<DebuggerHandle>;

export interface OutputChannelLike {
  appendLine(value: string): void;
}

export interface VscodeDebugLike {
  startDebugging(
    folder: vscode.WorkspaceFolder | undefined,
    config: vscode.DebugConfiguration
  ): Thenable<boolean>;
  stopDebugging(session: vscode.DebugSession): Thenable<void>;
  onDidStartDebugSession: vscode.Event<vscode.DebugSession>;
  onDidTerminateDebugSession: vscode.Event<vscode.DebugSession>;
}

export interface CfDebuggerServiceOptions {
  readonly outputChannel: OutputChannelLike;
  readonly debugApi: VscodeDebugLike;
  readonly runner?: CfDebuggerRunner;
  readonly resolveWorkspaceFolder?: () => vscode.WorkspaceFolder | undefined;
}

const VSCODE_SESSION_NAME_PREFIX = 'SAP Tools Debug:';
const SAP_TOOLS_MANAGED_KEY = 'sapToolsManaged';
const SAP_TOOLS_APP_KEY = 'sapToolsApp';

interface ManagedSession {
  readonly appName: string;
  status: DebugSessionStatus;
  message?: string | undefined;
  localPort?: number | undefined;
  errorCode?: string | undefined;
  startedAt?: string | undefined;
}

let cachedRunnerPromise: Promise<CfDebuggerRunner> | undefined;

interface CfDebuggerModule {
  readonly startDebugger: CfDebuggerRunner;
}

async function loadDefaultRunner(): Promise<CfDebuggerRunner> {
  cachedRunnerPromise ??= (async (): Promise<CfDebuggerRunner> => {
    const mod = (await import(
      '@saptools/cf-debugger'
    )) as unknown as CfDebuggerModule;
    return mod.startDebugger;
  })();
  return cachedRunnerPromise;
}

class Emitter<T> {
  private readonly listeners = new Set<(value: T) => void>();

  readonly event: vscode.Event<T> = (
    listener: (value: T) => unknown,
    thisArg?: unknown
  ): vscode.Disposable => {
    const bound: (value: T) => void =
      thisArg === undefined
        ? (value): void => {
            listener(value);
          }
        : (value): void => {
            listener.call(thisArg, value);
          };
    this.listeners.add(bound);
    return {
      dispose: (): void => {
        this.listeners.delete(bound);
      },
    };
  };

  fire(value: T): void {
    for (const listener of [...this.listeners]) {
      try {
        listener(value);
      } catch {
        // ignore listener errors — they shouldn't affect emission
      }
    }
  }

  dispose(): void {
    this.listeners.clear();
  }
}

export class CfDebuggerService implements vscode.Disposable {
  private readonly outputChannel: OutputChannelLike;
  private readonly runner: CfDebuggerRunner | undefined;
  private readonly debugApi: VscodeDebugLike;
  private readonly resolveWorkspaceFolder: () =>
    | vscode.WorkspaceFolder
    | undefined;

  private scope: DebugScope | undefined;
  private readonly sessions = new Map<string, ManagedSession>();
  private readonly handles = new Map<string, DebuggerHandle>();
  private readonly aborts = new Map<string, AbortController>();
  private readonly vscodeSessions = new Map<string, vscode.DebugSession>();

  private readonly emitter = new Emitter<DebugSessionView>();
  readonly onSessionChanged: vscode.Event<DebugSessionView> = this.emitter.event;

  private readonly startListener: vscode.Disposable;
  private readonly terminateListener: vscode.Disposable;
  // Serializes `vscode.debug.startDebugging` calls — VS Code drops
  // concurrent attach requests silently, so we queue them.
  private attachQueue: Promise<void> = Promise.resolve();
  private disposed = false;

  public constructor(options: CfDebuggerServiceOptions) {
    this.outputChannel = options.outputChannel;
    this.runner = options.runner;
    this.debugApi = options.debugApi;
    this.resolveWorkspaceFolder =
      options.resolveWorkspaceFolder ?? ((): undefined => undefined);

    this.startListener = this.debugApi.onDidStartDebugSession((session) => {
      this.handleVscodeSessionStarted(session);
    });
    this.terminateListener = this.debugApi.onDidTerminateDebugSession(
      (session) => {
        this.handleVscodeSessionTerminated(session);
      }
    );
  }

  public setScope(scope: DebugScope): void {
    this.scope = scope;
  }

  public clearScope(): void {
    this.scope = undefined;
  }

  public hasScope(): boolean {
    return this.scope !== undefined;
  }

  public snapshot(): readonly DebugSessionView[] {
    return [...this.sessions.values()].map((session) => this.toView(session));
  }

  public async startDebug(appName: string): Promise<void> {
    const trimmedName = appName.trim();
    if (trimmedName.length === 0) {
      throw new Error('appName is required.');
    }
    if (this.scope === undefined) {
      this.applyError(
        trimmedName,
        'NO_SCOPE',
        'Confirm a region, organization and space first.'
      );
      return;
    }
    if (this.handles.has(trimmedName)) {
      return;
    }
    if (this.aborts.has(trimmedName)) {
      return;
    }

    const abortController = new AbortController();
    this.aborts.set(trimmedName, abortController);
    this.update(trimmedName, { status: 'starting', message: undefined });

    const scope = this.scope;
    let handle: DebuggerHandle;
    try {
      const runner = this.runner ?? (await loadDefaultRunner());
      handle = await runner({
        region: scope.region,
        org: scope.org,
        space: scope.space,
        app: trimmedName,
        email: scope.email,
        password: scope.password,
        signal: abortController.signal,
        onStatus: (status, message): void => {
          if (this.handles.has(trimmedName) && status === 'ready') {
            return;
          }
          this.update(trimmedName, this.buildStatusUpdate(status, message));
        },
      });
    } catch (err) {
      this.aborts.delete(trimmedName);
      const code = readErrorCode(err);
      const message = readErrorMessage(err);
      if (code === 'ABORTED') {
        // stopDebug aborted us mid-flight; it already drove the session to
        // 'stopped'. Don't overwrite that with an 'error' state.
        this.outputChannel.appendLine(
          `[debug] startDebugger aborted for ${trimmedName} (caller invoked stopDebug)`
        );
        return;
      }
      this.applyError(trimmedName, code, message);
      this.outputChannel.appendLine(
        `[debug] startDebugger failed for ${trimmedName}: ${code} ${message}`
      );
      return;
    }
    this.aborts.delete(trimmedName);
    this.handles.set(trimmedName, handle);
    this.update(trimmedName, {
      status: 'ready',
      message: undefined,
      localPort: handle.session.localPort,
      startedAt: handle.session.startedAt,
      errorCode: undefined,
    });

    void this.attachVscodeDebugger(trimmedName, handle);
    this.watchTunnelExit(trimmedName, handle);
  }

  public async stopDebug(appName: string): Promise<void> {
    const trimmedName = appName.trim();
    if (trimmedName.length === 0) {
      return;
    }
    const abort = this.aborts.get(trimmedName);
    if (abort !== undefined) {
      abort.abort();
      this.aborts.delete(trimmedName);
    }
    const session = this.sessions.get(trimmedName);
    if (session !== undefined && session.status !== 'error') {
      this.update(trimmedName, { status: 'stopping' });
    }
    const vscodeSession = this.vscodeSessions.get(trimmedName);
    if (vscodeSession !== undefined) {
      try {
        await this.debugApi.stopDebugging(vscodeSession);
      } catch (err) {
        this.outputChannel.appendLine(
          `[debug] stopDebugging error for ${trimmedName}: ${readErrorMessage(err)}`
        );
      }
      this.vscodeSessions.delete(trimmedName);
    }
    const handle = this.handles.get(trimmedName);
    if (handle !== undefined) {
      try {
        await handle.dispose();
      } catch (err) {
        this.outputChannel.appendLine(
          `[debug] handle.dispose error for ${trimmedName}: ${readErrorMessage(err)}`
        );
      }
      this.handles.delete(trimmedName);
    }
    this.update(trimmedName, {
      status: 'stopped',
      message: undefined,
      localPort: undefined,
      errorCode: undefined,
    });
  }

  public async stopAll(): Promise<void> {
    const appNames = [
      ...new Set([
        ...this.handles.keys(),
        ...this.aborts.keys(),
        ...this.vscodeSessions.keys(),
        ...this.sessions.keys(),
      ]),
    ];
    await Promise.all(appNames.map((name) => this.stopDebug(name)));
  }

  public dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.startListener.dispose();
    this.terminateListener.dispose();
    void this.stopAll().finally((): void => {
      this.emitter.dispose();
    });
  }

  private attachVscodeDebugger(
    appName: string,
    handle: DebuggerHandle
  ): Promise<void> {
    const next = this.attachQueue.then(() =>
      this.attachVscodeDebuggerNow(appName, handle)
    );
    this.attachQueue = next.catch((): void => undefined);
    return next;
  }

  private async attachVscodeDebuggerNow(
    appName: string,
    handle: DebuggerHandle
  ): Promise<void> {
    if (this.disposed) {
      return;
    }
    if (this.handles.get(appName) !== handle) {
      return;
    }
    const folder = this.resolveWorkspaceFolder();
    const config: vscode.DebugConfiguration = {
      type: 'node',
      request: 'attach',
      name: `${VSCODE_SESSION_NAME_PREFIX} ${appName}`,
      address: '127.0.0.1',
      port: handle.session.localPort,
      skipFiles: ['<node_internals>/**'],
      sourceMaps: true,
      restart: false,
      [SAP_TOOLS_MANAGED_KEY]: true,
      [SAP_TOOLS_APP_KEY]: appName,
    };
    let attached = false;
    try {
      attached = await this.debugApi.startDebugging(folder, config);
    } catch (err) {
      this.outputChannel.appendLine(
        `[debug] startDebugging error for ${appName}: ${readErrorMessage(err)}`
      );
    }
    // Re-check after the await: the user may have called stopDebug while we
    // were waiting for VS Code to attach. If stopDebug ran, the handle was
    // removed; we must not overwrite the 'stopped' state and we must tear
    // down any VS Code session that managed to start in the meantime.
    if (this.handles.get(appName) !== handle) {
      if (attached) {
        const orphan = this.vscodeSessions.get(appName);
        if (orphan !== undefined) {
          this.vscodeSessions.delete(appName);
          void this.debugApi.stopDebugging(orphan).then(
            (): void => undefined,
            (): void => undefined
          );
        }
      }
      return;
    }
    if (!attached) {
      this.applyError(
        appName,
        'ATTACH_FAILED',
        'VS Code refused to attach the Node debugger.'
      );
      const handleRef = this.handles.get(appName);
      if (handleRef !== undefined) {
        try {
          await handleRef.dispose();
        } catch {
          // ignore — best-effort cleanup
        }
        this.handles.delete(appName);
      }
      return;
    }
    this.update(appName, { status: 'attached', message: undefined });
  }

  private watchTunnelExit(appName: string, handle: DebuggerHandle): void {
    void handle
      .waitForExit()
      .catch((): null => null)
      .then((): void => {
        if (this.disposed) {
          return;
        }
        if (this.handles.get(appName) !== handle) {
          return;
        }
        this.handles.delete(appName);
        const vscodeSession = this.vscodeSessions.get(appName);
        if (vscodeSession !== undefined) {
          this.vscodeSessions.delete(appName);
          void this.debugApi.stopDebugging(vscodeSession).then(
            (): void => undefined,
            (): void => undefined
          );
        }
        const current = this.sessions.get(appName);
        if (current?.status === 'stopping') {
          this.update(appName, { status: 'stopped' });
          return;
        }
        if (current?.status === 'stopped') {
          return;
        }
        this.update(appName, {
          status: 'tunnel-closed',
          message: 'SSH tunnel closed.',
        });
      });
  }

  private handleVscodeSessionStarted(session: vscode.DebugSession): void {
    const appName = readSessionAppName(session);
    if (appName === undefined) {
      return;
    }
    this.vscodeSessions.set(appName, session);
  }

  private handleVscodeSessionTerminated(session: vscode.DebugSession): void {
    const appName = readSessionAppName(session);
    if (appName === undefined) {
      return;
    }
    if (this.vscodeSessions.get(appName)?.id === session.id) {
      this.vscodeSessions.delete(appName);
    }
    const current = this.sessions.get(appName);
    if (current === undefined) {
      return;
    }
    if (current.status === 'stopped' || current.status === 'error') {
      return;
    }
    if (current.status === 'stopping') {
      return;
    }
    const handle = this.handles.get(appName);
    if (handle !== undefined) {
      this.handles.delete(appName);
      void handle.dispose().catch((): void => undefined);
    }
    this.update(appName, {
      status: 'idle',
      message: 'Debugger detached.',
      localPort: undefined,
      errorCode: undefined,
    });
  }

  private buildStatusUpdate(
    status: SessionStatus,
    message: string | undefined
  ): Partial<ManagedSession> {
    const partial: Partial<ManagedSession> = { status };
    if (message !== undefined && message.length > 0) {
      partial.message = message;
    } else {
      partial.message = undefined;
    }
    return partial;
  }

  private applyError(
    appName: string,
    code: string,
    message: string
  ): void {
    this.update(appName, {
      status: 'error',
      message,
      errorCode: code,
    });
  }

  private update(appName: string, partial: Partial<ManagedSession>): void {
    if (this.disposed) {
      return;
    }
    const previous: ManagedSession =
      this.sessions.get(appName) ?? { appName, status: 'idle' };
    const next: ManagedSession = { ...previous, ...partial, appName };
    if ('localPort' in partial && partial.localPort === undefined) {
      delete next.localPort;
    }
    if ('errorCode' in partial && partial.errorCode === undefined) {
      delete next.errorCode;
    }
    if ('message' in partial && partial.message === undefined) {
      delete next.message;
    }
    this.sessions.set(appName, next);
    this.emitter.fire(this.toView(next));
  }

  private toView(session: ManagedSession): DebugSessionView {
    const view: DebugSessionView = {
      appName: session.appName,
      status: session.status,
      ...(session.message !== undefined ? { message: session.message } : {}),
      ...(session.localPort !== undefined
        ? { localPort: session.localPort }
        : {}),
      ...(session.errorCode !== undefined
        ? { errorCode: session.errorCode }
        : {}),
      ...(session.startedAt !== undefined
        ? { startedAt: session.startedAt }
        : {}),
    };
    return view;
  }
}

function readSessionAppName(session: vscode.DebugSession): string | undefined {
  const config = session.configuration as Record<string, unknown> | undefined;
  if (config === undefined) {
    return undefined;
  }
  const managed = config[SAP_TOOLS_MANAGED_KEY];
  if (managed !== true) {
    return undefined;
  }
  const appName = config[SAP_TOOLS_APP_KEY];
  if (typeof appName !== 'string' || appName.length === 0) {
    return undefined;
  }
  return appName;
}

function readErrorCode(err: unknown): string {
  if (err !== null && typeof err === 'object' && 'code' in err) {
    const code = (err as { code: unknown }).code;
    if (typeof code === 'string' && code.length > 0) {
      return code;
    }
  }
  return 'UNKNOWN';
}

function readErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  if (typeof err === 'string') {
    return err;
  }
  return 'Unknown error';
}

export function buildFakeRunner(
  options: {
    readonly stepDelayMs?: number;
    readonly localPort?: number;
  } = {}
): CfDebuggerRunner {
  const stepDelayMs = options.stepDelayMs ?? 30;
  const localPort = options.localPort ?? 39229;

  return async function fakeStartDebugger(
    opts: StartDebuggerOptions
  ): Promise<DebuggerHandle> {
    const transitions: SessionStatus[] = [
      'logging-in',
      'targeting',
      'signaling',
      'tunneling',
    ];
    for (const step of transitions) {
      await delay(stepDelayMs);
      if (opts.signal?.aborted === true) {
        const error = new Error('Aborted');
        (error as unknown as { code: string }).code = 'ABORTED';
        throw error;
      }
      opts.onStatus?.(step);
    }

    let exitResolve: (value: number | null) => void = (): void => undefined;
    const exitPromise = new Promise<number | null>((resolve) => {
      exitResolve = resolve;
    });

    const session = {
      sessionId: `fake-${opts.app}`,
      pid: 0,
      hostname: 'fake-host',
      localPort,
      remotePort: 9229,
      apiEndpoint: opts.apiEndpoint ?? `https://api.cf.${opts.region}.test`,
      cfHomeDir: '',
      startedAt: new Date().toISOString(),
      status: 'ready' as SessionStatus,
      region: opts.region,
      org: opts.org,
      space: opts.space,
      app: opts.app,
    };

    return {
      session,
      dispose: async (): Promise<void> => {
        exitResolve(0);
        await Promise.resolve();
      },
      waitForExit: (): Promise<number | null> => exitPromise,
    };
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

interface FakeDebugApiInternals {
  fireTerminated(session: vscode.DebugSession): void;
}

export type FakeDebugApi = VscodeDebugLike & FakeDebugApiInternals;

export function buildFakeDebugApi(): FakeDebugApi {
  const startListeners = new Set<(session: vscode.DebugSession) => void>();
  const terminateListeners = new Set<(session: vscode.DebugSession) => void>();
  let nextSessionId = 1;

  const startEvent: vscode.Event<vscode.DebugSession> = ((listener) => {
    startListeners.add(listener);
    return {
      dispose: (): void => {
        startListeners.delete(listener);
      },
    };
  }) as vscode.Event<vscode.DebugSession>;

  const terminateEvent: vscode.Event<vscode.DebugSession> = ((listener) => {
    terminateListeners.add(listener);
    return {
      dispose: (): void => {
        terminateListeners.delete(listener);
      },
    };
  }) as vscode.Event<vscode.DebugSession>;

  return {
    onDidStartDebugSession: startEvent,
    onDidTerminateDebugSession: terminateEvent,
    startDebugging: (
      _folder,
      config: vscode.DebugConfiguration
    ): Thenable<boolean> => {
      const session = {
        id: `fake-vs-${String(nextSessionId++)}`,
        type: config.type,
        name: config.name,
        workspaceFolder: undefined,
        configuration: config,
      } as unknown as vscode.DebugSession;
      for (const listener of [...startListeners]) {
        try {
          listener(session);
        } catch {
          // ignore listener errors
        }
      }
      return Promise.resolve(true);
    },
    stopDebugging: (session: vscode.DebugSession): Thenable<void> => {
      for (const listener of [...terminateListeners]) {
        try {
          listener(session);
        } catch {
          // ignore listener errors
        }
      }
      return Promise.resolve();
    },
    fireTerminated: (session: vscode.DebugSession): void => {
      for (const listener of [...terminateListeners]) {
        try {
          listener(session);
        } catch {
          // ignore listener errors
        }
      }
    },
  };
}
