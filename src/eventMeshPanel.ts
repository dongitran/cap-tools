import * as vscode from 'vscode';
import { randomBytes } from 'node:crypto';

import { fetchDefaultEnvJsonFromTarget, prepareCfCliSession } from './cfClient';
import { extractEventMeshBindings, type EventMeshBinding } from './eventMeshBindings';
import { EventMeshManagementClient } from './eventMeshClient';
import {
  EventMeshAmqpListener,
  type NormalizedEventMessage,
} from './eventMeshAmqpListener';

const EVENT_MESH_VIEW_TYPE = 'sapTools.eventMeshViewer';

/** Path segment used for every debug queue this extension creates, so leftover queues are easy to spot. */
const DEBUG_QUEUE_SEGMENT = 'saptools-debug';
/** Coalesce incoming AMQP messages and post them to the webview at most this often. */
const FLUSH_INTERVAL_MS = 250;
/** Flush immediately once the buffer reaches this many messages (burst handling). */
const FLUSH_THRESHOLD = 40;
/** Max payload bytes forwarded to the webview per message. */
const MAX_PAYLOAD_BYTES = 20000;
/** Cap on how many existing queues to inspect when discovering candidate topics. */
const TOPIC_DISCOVERY_QUEUE_CAP = 25;
/** Leftover queues younger than this may belong to another active VS Code window. */
const STALE_DEBUG_QUEUE_MAX_AGE_MS = 6 * 60 * 60 * 1000;

export interface EventMeshTargetParams {
  readonly apiEndpoint: string;
  readonly email: string;
  readonly password: string;
  readonly orgName: string;
  readonly spaceName: string;
  readonly cfHomeDir: string;
}

type StopReason = 'user' | 'panel-closed' | 'scope-changed' | 'shutdown';

interface OutgoingEventMessage {
  readonly seq: number;
  readonly time: string;
  readonly topic: string | null;
  readonly contentType: string;
  readonly messageId: string | null;
  readonly payload: string;
  readonly encoding: 'json' | 'text' | 'base64';
  readonly truncated: boolean;
  readonly size: number;
  readonly headers: unknown;
}

interface PanelSession {
  readonly panel: vscode.WebviewPanel;
  readonly appId: string;
  readonly targetParams: EventMeshTargetParams | undefined;
  bindings: EventMeshBinding[];
  readonly clientsByBinding: Map<number, EventMeshManagementClient>;
  readonly discoveredByBinding: Map<number, string[]>;
  listener: EventMeshAmqpListener | null;
  activeBindingIndex: number | null;
  queueName: string | null;
  starting: boolean;
  sequence: number;
  buffer: OutgoingEventMessage[];
  flushTimer: ReturnType<typeof setTimeout> | null;
}

function isTestMode(): boolean {
  return process.env['SAP_TOOLS_TEST_MODE'] === '1' || process.env['SAP_TOOLS_E2E'] === '1';
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return typeof error === 'string' ? error : String(error);
}

function isProbablyUtf8(buffer: Buffer): boolean {
  if (buffer.length === 0) {
    return true;
  }
  return !buffer.toString('utf8').includes('�');
}

function formatPayload(
  buffer: Buffer,
  contentType: string,
  limit: number
): { value: string; encoding: 'json' | 'text' | 'base64'; truncated: boolean; size: number } {
  const size = buffer.length;
  const limited = limit > 0 && buffer.length > limit ? buffer.subarray(0, limit) : buffer;
  const truncated = limited.length !== buffer.length;
  const lower = contentType.toLowerCase();

  if (lower.includes('json')) {
    const text = limited.toString('utf8');
    try {
      return { value: JSON.stringify(JSON.parse(text), null, 2), encoding: 'json', truncated, size };
    } catch {
      return { value: text, encoding: 'text', truncated, size };
    }
  }
  if (lower.startsWith('text/') || isProbablyUtf8(limited)) {
    return { value: limited.toString('utf8'), encoding: 'text', truncated, size };
  }
  return { value: limited.toString('base64'), encoding: 'base64', truncated, size };
}

function toSerializableHeaders(headers: Record<string, unknown>): unknown {
  try {
    const json = JSON.stringify(headers);
    if (json.length > 8000) {
      return { note: 'headers omitted (too large)' };
    }
    return JSON.parse(json);
  } catch {
    return {};
  }
}

function buildRunId(): string {
  return `${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`;
}

function wildcardTopicFor(namespace: string): string {
  return `${namespace}/*`;
}

function parseDebugQueueCreatedAt(queueName: string, namespace: string): number | null {
  const prefix = `${namespace}/${DEBUG_QUEUE_SEGMENT}/`;
  if (!queueName.startsWith(prefix)) {
    return null;
  }

  const runId = queueName.slice(prefix.length).split('/')[0] ?? '';
  const timestampPart = runId.split('-')[0] ?? '';
  if (timestampPart.length < 8 || !/^[0-9a-z]+$/i.test(timestampPart)) {
    return null;
  }

  const timestamp = Number.parseInt(timestampPart, 36);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function isStaleDebugQueueName(queueName: string, namespace: string, nowMs: number): boolean {
  const createdAt = parseDebugQueueCreatedAt(queueName, namespace);
  if (createdAt === null) {
    return false;
  }
  return nowMs - createdAt > STALE_DEBUG_QUEUE_MAX_AGE_MS;
}

function areTargetParamsEqual(
  left: EventMeshTargetParams | undefined,
  right: EventMeshTargetParams | undefined
): boolean {
  if (left === undefined || right === undefined) {
    return left === right;
  }
  return (
    left.apiEndpoint === right.apiEndpoint &&
    left.email === right.email &&
    left.password === right.password &&
    left.orgName === right.orgName &&
    left.spaceName === right.spaceName &&
    left.cfHomeDir === right.cfHomeDir
  );
}

export function isStaleDebugQueueNameForTest(
  queueName: string,
  namespace: string,
  nowMs: number
): boolean {
  return isStaleDebugQueueName(queueName, namespace, nowMs);
}

export class EventMeshPanelManager implements vscode.Disposable {
  private readonly sessions = new Map<string, PanelSession>();

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly outputChannel: vscode.OutputChannel
  ) {}

  private log(message: string): void {
    this.outputChannel.appendLine(`[EventMesh] ${message}`);
  }

  dispose(): void {
    for (const session of this.sessions.values()) {
      void this.stopListening(session, 'shutdown', false);
      session.panel.dispose();
    }
    this.sessions.clear();
  }

  /** Stop every active listener (and delete its debug queue) without closing the panels. */
  stopAllListeners(reason: StopReason): void {
    for (const session of this.sessions.values()) {
      if (session.listener !== null || session.starting) {
        void this.stopListening(session, reason, true);
      }
    }
  }

  openEventMeshViewer(appId: string, targetParams?: EventMeshTargetParams): void {
    const existing = this.sessions.get(appId);
    if (existing !== undefined) {
      if (areTargetParamsEqual(existing.targetParams, targetParams)) {
        existing.panel.reveal();
        return;
      }
      existing.panel.dispose();
      if (this.sessions.get(appId) === existing) {
        this.sessions.delete(appId);
      }
    }

    this.log(`open Event viewer for app ${appId}`);

    const panel = vscode.window.createWebviewPanel(
      EVENT_MESH_VIEW_TYPE,
      `Event Mesh · ${appId}`,
      { preserveFocus: false, viewColumn: vscode.ViewColumn.Active },
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'docs', 'designs', 'prototypes')],
        retainContextWhenHidden: true,
      }
    );

    const session: PanelSession = {
      panel,
      appId,
      targetParams,
      bindings: [],
      clientsByBinding: new Map(),
      discoveredByBinding: new Map(),
      listener: null,
      activeBindingIndex: null,
      queueName: null,
      starting: false,
      sequence: 0,
      buffer: [],
      flushTimer: null,
    };
    this.sessions.set(appId, session);

    panel.webview.html = this.buildWebviewHtml(panel.webview, appId);

    panel.onDidDispose(() => {
      if (this.sessions.get(appId) === session) {
        this.sessions.delete(appId);
      }
      void this.stopListening(session, 'panel-closed', false);
    });

    panel.webview.onDidReceiveMessage((raw: unknown) => {
      void this.handleWebviewMessage(session, raw);
    });
  }

  private async handleWebviewMessage(session: PanelSession, raw: unknown): Promise<void> {
    if (typeof raw !== 'object' || raw === null) {
      return;
    }
    const message = raw as Record<string, unknown>;
    const type = message['type'];

    if (type === 'sapTools.events.webviewReady') {
      await this.initSession(session);
      return;
    }
    if (type === 'sapTools.events.selectBinding') {
      const bindingIndex = typeof message['bindingIndex'] === 'number' ? message['bindingIndex'] : 0;
      await this.discoverAndPostTopics(session, bindingIndex);
      return;
    }
    if (type === 'sapTools.events.startListening') {
      const bindingIndex = typeof message['bindingIndex'] === 'number' ? message['bindingIndex'] : 0;
      const topics = Array.isArray(message['topics'])
        ? message['topics'].filter((t): t is string => typeof t === 'string' && t.length > 0)
        : [];
      await this.startListening(session, bindingIndex, topics);
      return;
    }
    if (type === 'sapTools.events.stopListening') {
      await this.stopListening(session, 'user', true);
    }
  }

  private post(session: PanelSession, type: string, payload: Record<string, unknown>): void {
    void session.panel.webview.postMessage({ type, ...payload });
  }

  private postError(session: PanelSession, scope: 'init' | 'start', message: string): void {
    this.post(session, 'sapTools.events.error', { scope, message });
  }

  private async initSession(session: PanelSession): Promise<void> {
    if (isTestMode()) {
      this.postMockReady(session);
      return;
    }

    const target = session.targetParams;
    if (target === undefined) {
      this.postError(session, 'init', 'Sign in and confirm a region/org/space before listening to events.');
      return;
    }

    try {
      await prepareCfCliSession({
        apiEndpoint: target.apiEndpoint,
        email: target.email,
        password: target.password,
        orgName: target.orgName,
        spaceName: target.spaceName,
        cfHomeDir: target.cfHomeDir,
      });
      const envJson = await fetchDefaultEnvJsonFromTarget({
        appName: session.appId,
        cfHomeDir: target.cfHomeDir,
      });
      const bindings = extractEventMeshBindings(JSON.parse(envJson));
      if (bindings.length === 0) {
        this.postError(
          session,
          'init',
          `No "enterprise-messaging" service is bound to "${session.appId}".`
        );
        return;
      }
      session.bindings = bindings;
      this.log(`Found ${String(bindings.length)} Event Mesh binding(s) for ${session.appId}`);
      this.post(session, 'sapTools.events.ready', {
        appName: session.appId,
        bindings: bindings.map((binding) => ({
          index: binding.index,
          name: binding.name,
          namespace: binding.namespace,
          instanceName: binding.instanceName,
        })),
      });
      await this.discoverAndPostTopics(session, bindings[0]?.index ?? 0);
    } catch (error) {
      this.postError(session, 'init', describeError(error));
    }
  }

  private getClient(session: PanelSession, binding: EventMeshBinding): EventMeshManagementClient {
    const existing = session.clientsByBinding.get(binding.index);
    if (existing !== undefined) {
      return existing;
    }
    const client = new EventMeshManagementClient(binding);
    session.clientsByBinding.set(binding.index, client);
    return client;
  }

  private async discoverAndPostTopics(session: PanelSession, bindingIndex: number): Promise<void> {
    if (isTestMode()) {
      return;
    }
    const binding = session.bindings.find((entry) => entry.index === bindingIndex);
    if (binding === undefined) {
      return;
    }
    const wildcardTopic = wildcardTopicFor(binding.namespace);

    const cached = session.discoveredByBinding.get(bindingIndex);
    if (cached !== undefined) {
      this.post(session, 'sapTools.events.topics', { bindingIndex, topics: cached, wildcardTopic });
      return;
    }

    try {
      const topics = await this.getClient(session, binding).discoverTopics(TOPIC_DISCOVERY_QUEUE_CAP);
      session.discoveredByBinding.set(bindingIndex, topics);
      this.post(session, 'sapTools.events.topics', { bindingIndex, topics, wildcardTopic });
    } catch (error) {
      this.post(session, 'sapTools.events.topics', {
        bindingIndex,
        topics: [],
        wildcardTopic,
        discoveryError: describeError(error),
      });
    }
  }

  private async startListening(
    session: PanelSession,
    bindingIndex: number,
    topics: string[]
  ): Promise<void> {
    if (isTestMode()) {
      this.postMockListening(session, topics);
      return;
    }
    if (session.listener !== null || session.starting) {
      this.post(session, 'sapTools.events.status', { message: 'Already listening.' });
      return;
    }
    const binding = session.bindings.find((entry) => entry.index === bindingIndex);
    if (binding === undefined) {
      this.postError(session, 'start', 'Selected messaging binding is no longer available.');
      return;
    }
    if (topics.length === 0) {
      this.postError(session, 'start', 'Select at least one topic to listen to.');
      return;
    }

    session.starting = true;
    session.activeBindingIndex = bindingIndex;
    const client = this.getClient(session, binding);
    const queueName = `${binding.namespace}/${DEBUG_QUEUE_SEGMENT}/${buildRunId()}`;
    let queueCreated = false;
    let listener: EventMeshAmqpListener | null = null;

    try {
      await this.reapStaleDebugQueues(client, binding.namespace);
      this.log(`Creating debug queue ${queueName}`);
      await client.createQueue(queueName);
      queueCreated = true;
      for (const topic of topics) {
        await client.addSubscription(queueName, topic);
      }

      listener = new EventMeshAmqpListener(binding, queueName, {
        onMessage: (normalized): void => {
          this.enqueueMessage(session, normalized);
        },
        onError: (errorMessage): void => {
          this.post(session, 'sapTools.events.status', { message: errorMessage });
        },
        onConnected: (description): void => {
          this.log(`AMQP connected for ${session.appId}${description !== '' ? ` (${description})` : ''}`);
        },
      });
      await listener.start();

      session.listener = listener;
      session.queueName = queueName;
      this.post(session, 'sapTools.events.listening', { queueName, topics });
      this.log(`Listening on ${queueName} (${String(topics.length)} topic(s))`);
    } catch (error) {
      if (listener !== null) {
        listener.stop();
      }
      if (queueCreated) {
        await this.deleteQueueSafely(client, queueName);
      }
      session.queueName = null;
      this.postError(session, 'start', describeError(error));
    } finally {
      session.starting = false;
    }
  }

  private enqueueMessage(session: PanelSession, normalized: NormalizedEventMessage): void {
    session.sequence += 1;
    const payload = formatPayload(normalized.body, normalized.contentType, MAX_PAYLOAD_BYTES);
    session.buffer.push({
      seq: session.sequence,
      time: new Date().toISOString(),
      topic: normalized.topic,
      contentType: normalized.contentType,
      messageId: normalized.messageId,
      payload: payload.value,
      encoding: payload.encoding,
      truncated: payload.truncated,
      size: payload.size,
      headers: toSerializableHeaders(normalized.headers),
    });

    if (session.buffer.length >= FLUSH_THRESHOLD) {
      this.flush(session);
      return;
    }
    session.flushTimer ??= setTimeout(() => {
      this.flush(session);
    }, FLUSH_INTERVAL_MS);
  }

  private flush(session: PanelSession): void {
    if (session.flushTimer !== null) {
      clearTimeout(session.flushTimer);
      session.flushTimer = null;
    }
    if (session.buffer.length === 0) {
      return;
    }
    const events = session.buffer;
    session.buffer = [];
    this.post(session, 'sapTools.events.messages', { events });
  }

  private async reapStaleDebugQueues(
    client: EventMeshManagementClient,
    namespace: string
  ): Promise<void> {
    try {
      const queues = await client.listQueueNames();
      const nowMs = Date.now();
      const stale = queues.filter((name) => isStaleDebugQueueName(name, namespace, nowMs));
      for (const name of stale) {
        this.log(`Reaping leftover debug queue ${name}`);
        await this.deleteQueueSafely(client, name);
      }
    } catch {
      // Discovery/reaping is best-effort and must never block starting a listen.
    }
  }

  private async deleteQueueSafely(
    client: EventMeshManagementClient,
    queueName: string
  ): Promise<void> {
    try {
      await client.deleteQueue(queueName);
    } catch (error) {
      this.log(`Failed to delete debug queue ${queueName}: ${describeError(error)}`);
    }
  }

  private async stopListening(
    session: PanelSession,
    reason: StopReason,
    notifyWebview: boolean
  ): Promise<void> {
    if (session.flushTimer !== null) {
      clearTimeout(session.flushTimer);
      session.flushTimer = null;
    }
    if (notifyWebview) {
      this.flush(session);
    } else {
      session.buffer = [];
    }

    if (session.listener !== null) {
      session.listener.stop();
      session.listener = null;
    }

    const queueName = session.queueName;
    session.queueName = null;
    if (queueName !== null && session.activeBindingIndex !== null) {
      const binding = session.bindings.find((entry) => entry.index === session.activeBindingIndex);
      if (binding !== undefined) {
        await this.deleteQueueSafely(this.getClient(session, binding), queueName);
      }
    }

    if (notifyWebview) {
      this.post(session, 'sapTools.events.stopped', { reason });
    }
  }

  private postMockReady(session: PanelSession): void {
    const namespace = 'demo/service/app';
    this.post(session, 'sapTools.events.ready', {
      appName: session.appId,
      bindings: [{ index: 0, name: 'demo-service', namespace, instanceName: 'demo-service' }],
    });
    this.post(session, 'sapTools.events.topics', {
      bindingIndex: 0,
      topics: [`${namespace}/items/created`, `${namespace}/items/updated`],
      wildcardTopic: wildcardTopicFor(namespace),
    });
  }

  private postMockListening(session: PanelSession, topics: string[]): void {
    const queueName = 'demo/service/app/saptools-debug/mock';
    this.post(session, 'sapTools.events.listening', { queueName, topics });
    this.post(session, 'sapTools.events.messages', {
      events: [
        {
          seq: 1,
          time: new Date().toISOString(),
          topic: 'demo/service/app/items/created',
          contentType: 'application/json',
          messageId: 'mock-1',
          payload: JSON.stringify({ itemId: 'A-1001', status: 'created' }, null, 2),
          encoding: 'json',
          truncated: false,
          size: 42,
          headers: {},
        },
      ],
    });
  }

  private buildWebviewHtml(webview: vscode.Webview, appId: string): string {
    const prototypesUri = vscode.Uri.joinPath(this.extensionUri, 'docs', 'designs', 'prototypes');
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(prototypesUri, 'assets', 'events-webview.js')
    );
    const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(prototypesUri, 'assets', 'prototype.css'));
    // cspell:ignore wght
    const fontUri = webview.asWebviewUri(
      vscode.Uri.joinPath(prototypesUri, 'assets', 'Outfit-VariableFont_wght.ttf')
    );
    const cacheBust = Date.now().toString();
    const scriptUriStr = scriptUri.with({ query: `t=${cacheBust}` }).toString();
    const cssUriStr = cssUri.with({ query: `t=${cacheBust}` }).toString();
    const fontUriStr = fontUri.toString();
    const nonce = randomBytes(16).toString('base64url');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Event Mesh</title>
  <style nonce="${nonce}">
    @font-face {
      font-family: 'Outfit';
      src: url('${fontUriStr}') format('truetype');
      font-weight: 100 900;
      font-style: normal;
      font-display: swap;
    }
    body {
      margin: 0;
      padding: 0;
      font-family: 'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background-color: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
      height: 100vh;
      overflow: hidden;
    }
    #event-mesh-app {
      height: 100%;
      display: flex;
      flex-direction: column;
    }
  </style>
  <link rel="stylesheet" href="${cssUriStr}" />
</head>
<body class="vscode-dark">
  <div id="event-mesh-app"></div>
  <script nonce="${nonce}">
    window.eventMeshAppId = ${JSON.stringify(appId)};
  </script>
  <script nonce="${nonce}" src="${scriptUriStr}"></script>
</body>
</html>`;
  }
}
