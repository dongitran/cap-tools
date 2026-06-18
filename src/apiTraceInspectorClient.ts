const INSPECTOR_LIST_TIMEOUT_MS = 5_000;
const INSPECTOR_CONNECT_TIMEOUT_MS = 5_000;

export interface ApiTraceInspectorClient {
  evaluate(expression: string, timeoutMs: number): Promise<unknown>;
  close(): void;
}

interface RuntimeWebSocket {
  send(data: string): void;
  close(): void;
  addEventListener(type: string, listener: (event: unknown) => void, options?: { readonly once?: boolean }): void;
  removeEventListener(type: string, listener: (event: unknown) => void): void;
}

type RuntimeWebSocketConstructor = new (url: string) => RuntimeWebSocket;

interface PendingInspectorRequest {
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: Error) => void;
  readonly timer: NodeJS.Timeout;
}

export async function createApiTraceInspectorClient(
  localPort: number
): Promise<ApiTraceInspectorClient | null> {
  const webSocketUrl = await fetchInspectorWebSocketUrl(localPort);
  if (webSocketUrl === null) {
    return null;
  }
  return connectInspectorWebSocket(webSocketUrl);
}

export function parseInspectorTargetList(payload: unknown, localPort: number): string | null {
  if (!Array.isArray(payload)) {
    return null;
  }
  for (const target of payload) {
    if (!isRecord(target) || typeof target['webSocketDebuggerUrl'] !== 'string') {
      continue;
    }
    return rewriteInspectorWebSocketUrl(target['webSocketDebuggerUrl'], localPort);
  }
  return null;
}

export function buildRuntimeEvaluateRequest(id: number, expression: string): Record<string, unknown> {
  return {
    id,
    method: 'Runtime.evaluate',
    params: {
      expression,
      awaitPromise: false,
      returnByValue: true,
    },
  };
}

export function extractInspectorEvaluateValue(message: unknown): unknown {
  if (!isRecord(message)) {
    throw new Error('Invalid Inspector response.');
  }
  if (isRecord(message['error'])) {
    throw new Error('Inspector Runtime.evaluate failed.');
  }
  const result = message['result'];
  if (!isRecord(result) || result['exceptionDetails'] !== undefined) {
    throw new Error('Inspector Runtime.evaluate failed.');
  }
  const remoteObject = result['result'];
  if (!isRecord(remoteObject)) {
    return undefined;
  }
  return remoteObject['value'];
}

class NativeApiTraceInspectorClient implements ApiTraceInspectorClient {
  private nextId = 1;
  private readonly pending = new Map<number, PendingInspectorRequest>();

  constructor(private readonly socket: RuntimeWebSocket) {
    this.socket.addEventListener('message', (event) => {
      this.handleMessage(event);
    });
    this.socket.addEventListener('close', () => {
      this.rejectAll('Inspector WebSocket closed.');
    });
    this.socket.addEventListener('error', () => {
      this.rejectAll('Inspector WebSocket error.');
    });
  }

  evaluate(expression: string, timeoutMs: number): Promise<unknown> {
    const id = this.nextId;
    this.nextId += 1;
    const request = buildRuntimeEvaluateRequest(id, expression);
    return this.sendRequest(id, request, timeoutMs);
  }

  close(): void {
    this.rejectAll('Inspector WebSocket closed.');
    this.socket.close();
  }

  private sendRequest(
    id: number,
    request: Record<string, unknown>,
    timeoutMs: number
  ): Promise<unknown> {
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('Inspector Runtime.evaluate timed out.'));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify(request));
    });
  }

  private handleMessage(event: unknown): void {
    const messageText = readWebSocketMessageText(event);
    if (messageText === null) return;
    const parsed = safeJsonParse(messageText);
    if (!isRecord(parsed) || typeof parsed['id'] !== 'number') return;
    const pending = this.pending.get(parsed['id']);
    if (pending === undefined) return;
    this.pending.delete(parsed['id']);
    clearTimeout(pending.timer);
    try {
      pending.resolve(extractInspectorEvaluateValue(parsed));
    } catch (error) {
      pending.reject(error instanceof Error ? error : new Error('Inspector response failed.'));
    }
  }

  private rejectAll(message: string): void {
    const pending = [...this.pending.values()];
    this.pending.clear();
    for (const request of pending) {
      clearTimeout(request.timer);
      request.reject(new Error(message));
    }
  }
}

async function fetchInspectorWebSocketUrl(localPort: number): Promise<string | null> {
  const response = await fetch(`http://127.0.0.1:${String(localPort)}/json/list`, {
    signal: AbortSignal.timeout(INSPECTOR_LIST_TIMEOUT_MS),
  }).catch(() => null);
  if (response?.ok !== true) {
    return null;
  }
  return parseInspectorTargetList(await response.json().catch(() => null), localPort);
}

function connectInspectorWebSocket(url: string): Promise<ApiTraceInspectorClient | null> {
  const SocketConstructor = getWebSocketConstructor();
  if (SocketConstructor === null) {
    return Promise.resolve(null);
  }
  const socket = new SocketConstructor(url);
  return waitForSocketOpen(socket);
}

function waitForSocketOpen(socket: RuntimeWebSocket): Promise<ApiTraceInspectorClient | null> {
  return new Promise<ApiTraceInspectorClient | null>((resolve) => {
    const timer = setTimeout(() => {
      cleanup();
      socket.close();
      resolve(null);
    }, INSPECTOR_CONNECT_TIMEOUT_MS);
    const cleanup = (): void => {
      clearTimeout(timer);
      socket.removeEventListener('open', onOpen);
      socket.removeEventListener('error', onError);
      socket.removeEventListener('close', onError);
    };
    const onOpen = (): void => {
      cleanup();
      resolve(new NativeApiTraceInspectorClient(socket));
    };
    const onError = (): void => {
      cleanup();
      resolve(null);
    };
    socket.addEventListener('open', onOpen);
    socket.addEventListener('error', onError);
    socket.addEventListener('close', onError);
  });
}

function rewriteInspectorWebSocketUrl(rawUrl: string, localPort: number): string | null {
  try {
    const parsed = new URL(rawUrl);
    parsed.hostname = '127.0.0.1';
    parsed.port = String(localPort);
    return parsed.toString();
  } catch {
    return null;
  }
}

function getWebSocketConstructor(): RuntimeWebSocketConstructor | null {
  const candidate = (globalThis as { readonly WebSocket?: unknown }).WebSocket;
  return typeof candidate === 'function' ? candidate as RuntimeWebSocketConstructor : null;
}

function readWebSocketMessageText(event: unknown): string | null {
  if (!isRecord(event)) return null;
  const data = event['data'];
  if (typeof data === 'string') return data;
  if (data instanceof Buffer) return data.toString('utf8');
  return null;
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
