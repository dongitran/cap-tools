import type { EventMeshBinding } from './eventMeshBindings';
import type { NormalizedEventMessage } from './eventMeshAmqpListener';

export interface EventMeshListenerLike {
  start(): Promise<void>;
  stop(): void;
}

export interface EventMeshManagementClientLike {
  createQueue(queueName: string): Promise<void>;
  addSubscription(queueName: string, topic: string): Promise<void>;
  deleteQueue(queueName: string): Promise<void>;
}

export interface EventMeshListenRequest {
  readonly binding: EventMeshBinding;
  readonly topics: readonly string[];
}

export interface EventMeshBindingSummary {
  readonly bindingIndex: number;
  readonly bindingName: string;
  readonly bindingNamespace: string;
  readonly queueName: string;
  readonly topics: readonly string[];
}

export interface EventMeshListenCallbacks {
  readonly onMessage: (
    binding: EventMeshBinding,
    queueName: string,
    message: NormalizedEventMessage
  ) => void;
  readonly onStatus: (bindingIndex: number, message: string) => void;
  readonly onConnected: (binding: EventMeshBinding, description: string) => void;
}

export interface EventMeshListenerCallbacks {
  readonly onMessage: (message: NormalizedEventMessage) => void;
  readonly onError: (message: string) => void;
  readonly onConnected: (description: string) => void;
}

export interface EventMeshListeningSessionOptions {
  readonly debugQueueSegment: string;
  readonly buildRunId: (binding: EventMeshBinding) => string;
  readonly getClient: (binding: EventMeshBinding) => EventMeshManagementClientLike;
  readonly createListener: (
    binding: EventMeshBinding,
    queueName: string,
    callbacks: EventMeshListenerCallbacks
  ) => EventMeshListenerLike;
  readonly beforeCreateQueue?: (
    binding: EventMeshBinding,
    client: EventMeshManagementClientLike
  ) => Promise<void>;
  readonly onQueueCreated?: (binding: EventMeshBinding, queueName: string) => Promise<void>;
  readonly onQueueDeleted?: (binding: EventMeshBinding, queueName: string) => Promise<void>;
  readonly onCleanupError?: (message: string) => void;
}

interface ActiveEventMeshListen {
  readonly binding: EventMeshBinding;
  readonly client: EventMeshManagementClientLike;
  readonly listener: EventMeshListenerLike;
  readonly queueName: string;
  readonly topics: string[];
}

interface PendingEventMeshListen {
  readonly binding: EventMeshBinding;
  readonly client: EventMeshManagementClientLike;
  readonly queueName: string;
  listener: EventMeshListenerLike | null;
  queueCreated: boolean;
  stopRequested: boolean;
}

class EventMeshStartupStoppedError extends Error {
  constructor(queueName: string) {
    super(`Event Mesh listener startup was stopped before queue ${queueName} became active.`);
    this.name = 'EventMeshStartupStoppedError';
  }
}

export function isEventMeshStartupStoppedError(error: unknown): boolean {
  return error instanceof Error && error.name === 'EventMeshStartupStoppedError';
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return typeof error === 'string' ? error : String(error);
}

function uniqueTopics(topics: readonly string[]): string[] {
  const unique = new Set<string>();
  for (const topic of topics) {
    if (topic.length > 0) {
      unique.add(topic);
    }
  }
  return [...unique];
}

function summarizeActive(active: ActiveEventMeshListen): EventMeshBindingSummary {
  return {
    bindingIndex: active.binding.index,
    bindingName: active.binding.name,
    bindingNamespace: active.binding.namespace,
    queueName: active.queueName,
    topics: [...active.topics],
  };
}

export class EventMeshListeningSession {
  private readonly activeByBinding = new Map<number, ActiveEventMeshListen>();
  private readonly pendingByBinding = new Map<number, PendingEventMeshListen>();

  constructor(private readonly options: EventMeshListeningSessionOptions) {}

  hasActiveListeners(): boolean {
    return this.activeByBinding.size > 0;
  }

  activeSummaries(): EventMeshBindingSummary[] {
    return [...this.activeByBinding.values()].map(summarizeActive);
  }

  async startMany(
    requests: readonly EventMeshListenRequest[],
    callbacks: EventMeshListenCallbacks
  ): Promise<EventMeshBindingSummary[]> {
    const startedIndexes: number[] = [];
    try {
      const summaries: EventMeshBindingSummary[] = [];
      for (const request of requests) {
        const summary = await this.startBinding(request, callbacks);
        summaries.push(summary);
        startedIndexes.push(request.binding.index);
      }
      return summaries;
    } catch (error) {
      await this.stopStartedBindings(startedIndexes);
      throw error;
    }
  }

  async startBinding(
    request: EventMeshListenRequest,
    callbacks: EventMeshListenCallbacks
  ): Promise<EventMeshBindingSummary> {
    this.assertCanStart(request);
    const binding = request.binding;
    const client = this.options.getClient(binding);
    const queueName = `${binding.namespace}/${this.options.debugQueueSegment}/${this.options.buildRunId(binding)}`;
    const topics = uniqueTopics(request.topics);
    const pending: PendingEventMeshListen = {
      binding,
      client,
      queueName,
      listener: null,
      queueCreated: false,
      stopRequested: false,
    };
    this.pendingByBinding.set(binding.index, pending);

    try {
      await this.options.beforeCreateQueue?.(binding, client);
      this.throwIfStartupStopped(pending);
      await client.createQueue(queueName);
      pending.queueCreated = true;
      await this.options.onQueueCreated?.(binding, queueName);
      this.throwIfStartupStopped(pending);
      await this.addSubscriptions(client, queueName, topics);
      this.throwIfStartupStopped(pending);
      pending.listener = this.options.createListener(binding, queueName, this.createCallbacks(binding, queueName, callbacks));
      await pending.listener.start();
      this.throwIfStartupStopped(pending);
      const listener = pending.listener;
      const active = { binding, client, listener, queueName, topics };
      this.pendingByBinding.delete(binding.index);
      this.activeByBinding.set(binding.index, active);
      return summarizeActive(active);
    } catch (error) {
      pending.listener?.stop();
      await this.cleanupPendingQueue(pending);
      this.pendingByBinding.delete(binding.index);
      throw error;
    }
  }

  async addTopics(bindingIndex: number, topics: readonly string[]): Promise<string[]> {
    const active = this.activeByBinding.get(bindingIndex);
    if (active === undefined) {
      throw new Error('Selected messaging binding is not listening.');
    }
    const additions = uniqueTopics(topics).filter((topic) => !active.topics.includes(topic));
    for (const topic of additions) {
      await active.client.addSubscription(active.queueName, topic);
      active.topics.push(topic);
    }
    return additions;
  }

  async stopAll(): Promise<void> {
    await this.stopPendingBindings();
    const indexes = [...this.activeByBinding.keys()];
    for (const index of indexes) {
      await this.stopBindingByIndex(index);
    }
  }

  private assertCanStart(request: EventMeshListenRequest): void {
    if (
      this.activeByBinding.has(request.binding.index) ||
      this.pendingByBinding.has(request.binding.index)
    ) {
      throw new Error('Selected messaging binding is already listening.');
    }
    if (uniqueTopics(request.topics).length === 0) {
      throw new Error('Select at least one topic to listen to.');
    }
  }

  private throwIfStartupStopped(pending: PendingEventMeshListen): void {
    if (pending.stopRequested) {
      throw new EventMeshStartupStoppedError(pending.queueName);
    }
  }

  private createCallbacks(
    binding: EventMeshBinding,
    queueName: string,
    callbacks: EventMeshListenCallbacks
  ): EventMeshListenerCallbacks {
    return {
      onMessage: (message): void => { callbacks.onMessage(binding, queueName, message); },
      onError: (message): void => { callbacks.onStatus(binding.index, message); },
      onConnected: (description): void => { callbacks.onConnected(binding, description); },
    };
  }

  private async addSubscriptions(
    client: EventMeshManagementClientLike,
    queueName: string,
    topics: readonly string[]
  ): Promise<void> {
    for (const topic of topics) {
      await client.addSubscription(queueName, topic);
    }
  }

  private async stopStartedBindings(startedIndexes: readonly number[]): Promise<void> {
    for (const index of [...startedIndexes].reverse()) {
      await this.stopBindingByIndex(index);
    }
  }

  private async stopBindingByIndex(bindingIndex: number): Promise<void> {
    const active = this.activeByBinding.get(bindingIndex);
    if (active === undefined) {
      return;
    }
    this.activeByBinding.delete(bindingIndex);
    active.listener.stop();
    await this.deleteQueueSafely(active.binding, active.client, active.queueName);
  }

  private async stopPendingBindings(): Promise<void> {
    const pendingList = [...this.pendingByBinding.values()];
    for (const pending of pendingList) {
      pending.stopRequested = true;
      pending.listener?.stop();
      await this.cleanupPendingQueue(pending);
    }
  }

  private async cleanupPendingQueue(pending: PendingEventMeshListen): Promise<void> {
    if (!pending.queueCreated) {
      return;
    }
    pending.queueCreated = false;
    await this.deleteQueueSafely(pending.binding, pending.client, pending.queueName);
  }

  private async deleteQueueSafely(
    binding: EventMeshBinding,
    client: EventMeshManagementClientLike,
    queueName: string
  ): Promise<void> {
    try {
      await client.deleteQueue(queueName);
      await this.options.onQueueDeleted?.(binding, queueName);
    } catch (error) {
      this.options.onCleanupError?.(
        `Failed to delete debug queue ${queueName}: ${describeError(error)}`
      );
    }
  }
}
