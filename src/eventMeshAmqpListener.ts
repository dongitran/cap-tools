import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import type { EventMeshBinding } from './eventMeshBindings';

/**
 * AMQP 1.0 (over WebSocket) receiver for a single Event Mesh debug queue, built on
 * the untyped `@sap/xb-msg-amqp-v100` client. The connection/normalization shape
 * mirrors the proven standalone listener: attach a receiver to `queue:<name>`,
 * resolve once `subscribed` fires, and hand each message to `onMessage` after
 * acking it on the *debug* queue (production queues are never touched).
 *
 * The module is loaded at runtime from `dist/vendor/@sap/xb-msg-amqp-v100`
 * (vendored because the extension is packaged with `--no-dependencies`), falling
 * back to `node_modules` during local development/tests.
 */

export interface NormalizedEventMessage {
  readonly body: Buffer;
  readonly contentType: string;
  readonly topic: string | null;
  readonly messageId: string | null;
  readonly headers: Record<string, unknown>;
}

export interface EventMeshAmqpCallbacks {
  readonly onMessage: (message: NormalizedEventMessage) => void;
  readonly onError: (message: string) => void;
  readonly onConnected?: (description: string) => void;
}

// --- Minimal structural typing over the untyped AMQP module ------------------

interface AmqpEmitter {
  on(event: string, listener: (...args: unknown[]) => void): void;
  once(event: string, listener: (...args: unknown[]) => void): void;
}
interface AmqpStream extends AmqpEmitter {
  receiver?: () => { detach: () => void };
}
interface AmqpReceiver extends AmqpEmitter {
  attach(source: string): AmqpStream;
}
interface AmqpClient extends AmqpEmitter {
  receiver(name: string): AmqpReceiver;
  connect(): void;
  disconnect(): void;
}
interface AmqpModule {
  Client: new (options: unknown) => AmqpClient;
}
interface AmqpIncomingMessage {
  readonly payload?: unknown;
  readonly source?: unknown;
  readonly done?: () => void;
}

export type AmqpModuleLoader = () => AmqpModule;

let cachedModule: AmqpModule | null = null;

export function loadXbMsgAmqpModule(distDir: string = __dirname): AmqpModule {
  if (cachedModule !== null) {
    return cachedModule;
  }
  const runtimeRequire = createRequire(__filename);
  const vendoredEntry = join(distDir, 'vendor', '@sap', 'xb-msg-amqp-v100', 'index.js');
  const specifier = existsSync(vendoredEntry) ? vendoredEntry : '@sap/xb-msg-amqp-v100';
  cachedModule = runtimeRequire(specifier) as AmqpModule;
  return cachedModule;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return typeof error === 'string' ? error : String(error);
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(describeError(error));
}

function firstString(record: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }
  return null;
}

function extractTopic(source: Record<string, unknown>): string | null {
  const direct = firstString(source, ['to', 'subject', 'address', 'topic']);
  if (direct !== null) {
    return direct;
  }
  const props = source['properties'];
  if (isRecord(props)) {
    return firstString(props, ['to', 'subject', 'address', 'topic']);
  }
  return null;
}

function extractMessageId(source: Record<string, unknown>): string | null {
  const props = source['properties'];
  if (isRecord(props)) {
    const id = firstString(props, ['messageID', 'messageId']);
    if (id !== null) {
      return id;
    }
  }
  const tag = source['deliveryTag'];
  if (typeof tag === 'string' && tag.length > 0) {
    return tag;
  }
  if (typeof tag === 'number') {
    return String(tag);
  }
  return null;
}

function chunkToBuffer(chunk: unknown): Buffer {
  if (Buffer.isBuffer(chunk)) {
    return chunk;
  }
  if (typeof chunk === 'string') {
    return Buffer.from(chunk);
  }
  return Buffer.from(chunk as Uint8Array);
}

function normalizePayload(payload: unknown): { body: Buffer; contentType: string } {
  if (Buffer.isBuffer(payload)) {
    return { body: payload, contentType: 'application/octet-stream' };
  }
  if (isRecord(payload)) {
    const rawType = payload['type'];
    const type = typeof rawType === 'string' ? rawType : null;
    const chunks = payload['chunks'];
    if (Array.isArray(chunks) && chunks.length > 0) {
      return {
        body: Buffer.concat(chunks.map(chunkToBuffer)),
        contentType: type ?? 'application/octet-stream',
      };
    }
    const data = payload['data'];
    if (data !== undefined && data !== null) {
      return { body: Buffer.from(JSON.stringify(data)), contentType: type ?? 'application/json' };
    }
    return { body: Buffer.alloc(0), contentType: type ?? 'application/octet-stream' };
  }
  return { body: Buffer.alloc(0), contentType: 'application/octet-stream' };
}

function normalizeAmqpMessage(message: AmqpIncomingMessage): NormalizedEventMessage {
  const payload = normalizePayload(message.payload);
  const source = isRecord(message.source) ? message.source : {};
  const payloadProperties =
    isRecord(message.payload) && isRecord(message.payload['properties'])
      ? message.payload['properties']
      : {};
  return {
    body: payload.body,
    contentType: payload.contentType,
    topic: extractTopic(source),
    messageId: extractMessageId(source),
    headers: { source, payloadProperties },
  };
}

function buildAmqpOptions(binding: EventMeshBinding, queueName: string): Record<string, unknown> {
  const uri = new URL(binding.amqp.uri);
  return {
    uri: binding.amqp.uri,
    oa2: {
      endpoint: binding.amqp.oa2.tokenendpoint,
      client: binding.amqp.oa2.clientid,
      secret: binding.amqp.oa2.clientsecret,
      flow: binding.amqp.oa2.granttype ?? 'client_credentials',
    },
    sasl: { mechanism: 'ANONYMOUS', identity: 'sap-tools-event-debug' },
    amqp: {
      containerID: `sap-tools-event-${String(process.pid)}-${String(binding.index)}`,
      maxReceiverLinkCredit: 20,
      minReceiverLinkCredit: 10,
    },
    data: { source: `queue:${queueName}`, host: uri.host },
  };
}

export class EventMeshAmqpListener {
  private client: AmqpClient | null = null;
  private stream: AmqpStream | null = null;
  private closed = false;

  constructor(
    private readonly binding: EventMeshBinding,
    private readonly queueName: string,
    private readonly callbacks: EventMeshAmqpCallbacks,
    private readonly moduleLoader: AmqpModuleLoader = loadXbMsgAmqpModule
  ) {}

  start(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const { Client } = this.moduleLoader();
      const client = new Client(buildAmqpOptions(this.binding, this.queueName));
      const receiver = client.receiver(`sap-tools-debug-${String(this.binding.index)}`);
      const stream = receiver.attach(`queue:${this.queueName}`);
      this.client = client;
      this.stream = stream;

      let settled = false;
      const finishStartup = (): void => {
        if (!settled) {
          settled = true;
          resolve();
        }
      };
      const failStartup = (error: unknown): void => {
        if (!settled) {
          settled = true;
          reject(toError(error));
        }
      };

      stream.once('subscribed', () => {
        finishStartup();
      });
      stream.once('error', (error: unknown) => {
        failStartup(error);
      });
      stream.on('data', (message: unknown) => {
        this.handleMessage(message);
      });
      stream.on('error', (error: unknown) => {
        if (!this.closed) {
          this.callbacks.onError(`stream error: ${describeError(error)}`);
        }
      });
      stream.on('close', () => {
        this.closed = true;
      });

      client.once('error', (error: unknown) => {
        failStartup(error);
      });
      client.on('error', (error: unknown) => {
        if (!this.closed) {
          this.callbacks.onError(`client error: ${describeError(error)}`);
        }
      });
      client.on('connected', (...args: unknown[]) => {
        const peerInfo = args[1];
        const peerDescription = isRecord(peerInfo) ? peerInfo['description'] : undefined;
        const description = typeof peerDescription === 'string' ? peerDescription : '';
        this.callbacks.onConnected?.(description);
      });
      client.on('disconnected', () => {
        this.closed = true;
      });

      client.connect();
    });
  }

  private handleMessage(raw: unknown): void {
    const message = raw as AmqpIncomingMessage;
    try {
      this.callbacks.onMessage(normalizeAmqpMessage(message));
    } catch (error) {
      this.callbacks.onError(`message handling failed: ${describeError(error)}`);
    } finally {
      // Ack only on the debug queue; this never removes anything from production queues.
      try {
        message.done?.();
      } catch {
        // Best-effort ack.
      }
    }
  }

  stop(): void {
    this.closed = true;
    try {
      this.stream?.receiver?.().detach();
    } catch {
      // Best-effort detach before disconnect.
    }
    try {
      this.client?.disconnect();
    } catch {
      // Best-effort disconnect; the debug queue is deleted separately.
    }
    this.stream = null;
    this.client = null;
  }
}
