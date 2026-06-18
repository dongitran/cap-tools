import type { EventMeshBinding, EventMeshOAuth } from './eventMeshBindings';

/**
 * Thin client over the SAP Event Mesh "default plan" Management REST API
 * (`/hub/rest/api/v1/management/messaging`). It is used only to manage an
 * ephemeral debug queue + topic subscriptions and to discover candidate topics;
 * the actual message flow runs over AMQP (see `eventMeshAmqpListener`).
 *
 * Docs: https://help.sap.com/docs/event-mesh/event-mesh/use-rest-apis-to-manage-queues-and-queue-subscriptions
 */

const MANAGEMENT_PREFIX = '/hub/rest/api/v1/management/messaging';
const DEFAULT_MANAGEMENT_TIMEOUT_MS = 15000;

export type FetchFn = typeof fetch;

export interface EventMeshQueueConfig {
  readonly accessType: string;
  readonly maxMessageSizeInBytes: number;
  readonly maxQueueSizeInBytes: number;
  readonly respectTtl: boolean;
}

/**
 * Conservative config for an ephemeral debug queue: exclusive (single consumer)
 * and a modest size cap so a queue accidentally left behind cannot grow without
 * bound. `respectTtl` lets the broker honour per-message expiry.
 */
export const DEFAULT_DEBUG_QUEUE_CONFIG: EventMeshQueueConfig = {
  accessType: 'EXCLUSIVE',
  maxMessageSizeInBytes: 10485760,
  maxQueueSizeInBytes: 10485760,
  respectTtl: true,
};

export class EventMeshManagementError extends Error {
  constructor(
    readonly method: string,
    readonly url: string,
    readonly status: number,
    body: string
  ) {
    super(`${method} ${url} failed with HTTP ${String(status)}: ${body.slice(0, 500)}`);
    this.name = 'EventMeshManagementError';
  }
}

interface ManagementRequestOptions {
  readonly method: string;
  readonly expected: readonly number[];
  readonly body?: Record<string, unknown>;
  readonly signal?: AbortSignal;
}

interface ManagementResponse {
  readonly status: number;
  readonly body: string;
}

class EventMeshRequestTimeoutError extends Error {
  constructor(label: string, timeoutMs: number) {
    super(`${label} timed out after ${String(timeoutMs)} ms.`);
    this.name = 'EventMeshRequestTimeoutError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function encodeSegment(value: string): string {
  return encodeURIComponent(value);
}

function sanitizeUrl(url: URL): string {
  const clone = new URL(url.toString());
  clone.search = '';
  return clone.toString();
}

async function withTimeout<T>(
  label: string,
  timeoutMs: number,
  parentSignal: AbortSignal | undefined,
  work: (signal: AbortSignal) => Promise<T>
): Promise<T> {
  if (parentSignal?.aborted === true) {
    throw new Error(`${label} was aborted.`);
  }
  if (timeoutMs <= 0) {
    return work(parentSignal ?? new AbortController().signal);
  }

  const controller = new AbortController();
  let rejectAbort: (error: Error) => void = () => undefined;
  const abortPromise = new Promise<never>((_resolve, reject) => {
    rejectAbort = reject;
  });
  const abortFromParent = (): void => {
    rejectAbort(new Error(`${label} was aborted.`));
    controller.abort(parentSignal?.reason);
  };
  parentSignal?.addEventListener('abort', abortFromParent, { once: true });

  const timeout = setTimeout(() => {
    const error = new EventMeshRequestTimeoutError(label, timeoutMs);
    rejectAbort(error);
    controller.abort(error);
  }, timeoutMs);

  try {
    return await Promise.race([work(controller.signal), abortPromise]);
  } finally {
    clearTimeout(timeout);
    parentSignal?.removeEventListener('abort', abortFromParent);
  }
}

/**
 * Pull a flat list of names out of a Management API list response, tolerating
 * the several shapes tenants return: a bare array, `{ queues: [...] }` /
 * `{ subscriptions: [...] }`, and array entries that are either plain strings or
 * objects keyed by `name`/`topic`/etc.
 */
function parseNameList(text: string, keys: readonly string[]): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }

  let list: readonly unknown[] = [];
  if (Array.isArray(parsed)) {
    list = parsed;
  } else if (isRecord(parsed)) {
    for (const wrapperKey of ['queues', 'subscriptions', 'value', 'results']) {
      const candidate = parsed[wrapperKey];
      if (Array.isArray(candidate)) {
        list = candidate;
        break;
      }
    }
  }

  const names: string[] = [];
  for (const entry of list) {
    if (typeof entry === 'string') {
      if (entry.length > 0) {
        names.push(entry);
      }
      continue;
    }
    if (isRecord(entry)) {
      for (const key of keys) {
        const value = entry[key];
        if (typeof value === 'string' && value.length > 0) {
          names.push(value);
          break;
        }
      }
    }
  }
  return names;
}

async function requestOAuthToken(
  oa2: EventMeshOAuth,
  fetchImpl: FetchFn,
  signal?: AbortSignal
): Promise<{ accessToken: string; expiresInSeconds: number }> {
  const url = new URL(oa2.tokenendpoint);
  if (!url.searchParams.has('grant_type')) {
    url.searchParams.set('grant_type', oa2.granttype ?? 'client_credentials');
  }
  if (!url.searchParams.has('response_type')) {
    url.searchParams.set('response_type', 'token');
  }
  const basic = Buffer.from(`${oa2.clientid}:${oa2.clientsecret}`).toString('base64');
  const response = await fetchImpl(url.toString(), {
    method: 'POST',
    headers: { authorization: `Basic ${basic}`, accept: 'application/json' },
    ...(signal !== undefined ? { signal } : {}),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new EventMeshManagementError('POST', sanitizeUrl(url), response.status, text);
  }
  const payload: unknown = JSON.parse(text);
  if (!isRecord(payload) || typeof payload['access_token'] !== 'string') {
    throw new Error(`OAuth token response from ${sanitizeUrl(url)} did not include access_token`);
  }
  const expiresInRaw = payload['expires_in'];
  const expiresInSeconds =
    typeof expiresInRaw === 'number' && expiresInRaw > 0 ? expiresInRaw : 300;
  return { accessToken: payload['access_token'], expiresInSeconds };
}

export class EventMeshManagementClient {
  private cachedToken: { accessToken: string; expiresAt: number } | null = null;

  constructor(
    private readonly binding: EventMeshBinding,
    private readonly fetchImpl: FetchFn = fetch,
    private readonly now: () => number = Date.now,
    private readonly requestTimeoutMs: number = DEFAULT_MANAGEMENT_TIMEOUT_MS
  ) {}

  async createQueue(
    queueName: string,
    config: EventMeshQueueConfig | null = DEFAULT_DEBUG_QUEUE_CONFIG,
    signal?: AbortSignal
  ): Promise<void> {
    const body = config === null ? undefined : { ...config };
    const first = await this.managementRequest(`/queues/${encodeSegment(queueName)}`, {
      method: 'PUT',
      expected: [200, 201, 204, 400, 409],
      ...(body !== undefined ? { body } : {}),
      ...(signal !== undefined ? { signal } : {}),
    });
    // Some tenants reject the JSON body and accept only a bodyless path-based create.
    if (first.status === 400 && body !== undefined) {
      await this.managementRequest(`/queues/${encodeSegment(queueName)}`, {
        method: 'PUT',
        expected: [200, 201, 204, 409],
        ...(signal !== undefined ? { signal } : {}),
      });
    }
  }

  async deleteQueue(queueName: string, signal?: AbortSignal): Promise<void> {
    await this.managementRequest(`/queues/${encodeSegment(queueName)}`, {
      method: 'DELETE',
      expected: [200, 202, 204, 404],
      ...(signal !== undefined ? { signal } : {}),
    });
  }

  async addSubscription(queueName: string, topic: string, signal?: AbortSignal): Promise<void> {
    await this.managementRequest(
      `/queues/${encodeSegment(queueName)}/subscriptions/${encodeSegment(topic)}`,
      {
        method: 'PUT',
        expected: [200, 201, 204, 409],
        ...(signal !== undefined ? { signal } : {}),
      }
    );
  }

  async listQueueNames(signal?: AbortSignal): Promise<string[]> {
    const response = await this.managementRequest('/queues', {
      method: 'GET',
      expected: [200],
      ...(signal !== undefined ? { signal } : {}),
    });
    return parseNameList(response.body, ['name', 'queueName', 'qname']);
  }

  async listQueueSubscriptions(queueName: string, signal?: AbortSignal): Promise<string[]> {
    const response = await this.managementRequest(
      `/queues/${encodeSegment(queueName)}/subscriptions`,
      {
        method: 'GET',
        expected: [200],
        ...(signal !== undefined ? { signal } : {}),
      }
    );
    return parseNameList(response.body, ['topic', 'topicName', 'topicPattern', 'name']);
  }

  /**
   * Best-effort discovery of the topics this instance's existing queues subscribe
   * to. Event Mesh has no "list all topics" API (a topic is an addressing concept,
   * not a stored resource), but the app's own queues are subscribed to exactly the
   * topics that carry real traffic — so their subscriptions are the most useful
   * candidate list to offer the user. Per-queue read failures are swallowed.
   */
  async discoverTopics(maxQueues: number, signal?: AbortSignal): Promise<string[]> {
    const queues = await this.listQueueNames(signal);
    const topics = new Set<string>();
    for (const queueName of queues.slice(0, maxQueues)) {
      try {
        for (const topic of await this.listQueueSubscriptions(queueName, signal)) {
          topics.add(topic);
        }
      } catch {
        // Ignore a single unreadable queue; keep aggregating from the rest.
      }
    }
    return [...topics].sort((a, b) => a.localeCompare(b));
  }

  private async managementRequest(
    path: string,
    options: ManagementRequestOptions
  ): Promise<ManagementResponse> {
    return withTimeout(
      `${options.method} Event Mesh management request`,
      this.requestTimeoutMs,
      options.signal,
      async (signal) => {
        const url = `${this.binding.management.uri}${MANAGEMENT_PREFIX}${path}`;
        const token = await this.getToken(signal);
        const headers: Record<string, string> = { authorization: `Bearer ${token}` };
        if (options.body !== undefined) {
          headers['content-type'] = 'application/json';
        }
        const response = await this.fetchImpl(url, {
          method: options.method,
          headers,
          ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
          signal,
        });
        const body = await response.text();
        if (!options.expected.includes(response.status)) {
          throw new EventMeshManagementError(options.method, url, response.status, body);
        }
        return { status: response.status, body };
      }
    );
  }

  private async getToken(signal?: AbortSignal): Promise<string> {
    const current = this.cachedToken;
    if (current !== null && current.expiresAt - 60000 > this.now()) {
      return current.accessToken;
    }
    const { accessToken, expiresInSeconds } = await requestOAuthToken(
      this.binding.management.oa2,
      this.fetchImpl,
      signal
    );
    this.cachedToken = { accessToken, expiresAt: this.now() + expiresInSeconds * 1000 };
    return accessToken;
  }
}
