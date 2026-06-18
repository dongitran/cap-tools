import type { EventMeshBinding } from './eventMeshBindings';
import {
  EventMeshQueueRegistry,
  isPidAlive,
  type EventMeshQueueRegistryEntry,
} from './eventMeshQueueRegistry';
import { isStaleDebugQueueName } from './eventMeshDebugQueues';

export interface EventMeshQueueManagementClient {
  listQueueNames(): Promise<string[]>;
  deleteQueue(queueName: string): Promise<void>;
}

type LogFn = (message: string) => void;
type NowFn = () => number;
type IsOwnerAliveFn = (entry: EventMeshQueueRegistryEntry) => boolean;

export class EventMeshQueueCleaner {
  constructor(
    private readonly ownerId: string,
    private readonly log: LogFn,
    private readonly registry = new EventMeshQueueRegistry(),
    private readonly now: NowFn = Date.now,
    private readonly isOwnerAliveFn: IsOwnerAliveFn = (entry) => isPidAlive(entry.ownerPid)
  ) {}

  async recordQueue(appId: string, binding: EventMeshBinding, queueName: string): Promise<void> {
    await this.ignoreRegistryError(async () => {
      await this.registry.recordQueue({
        ownerPid: process.pid,
        ownerId: this.ownerId,
        appId,
        bindingIndex: binding.index,
        bindingName: binding.name,
        bindingNamespace: binding.namespace,
        queueName,
        createdAt: new Date(this.now()).toISOString(),
      });
    });
  }

  async removeQueue(queueName: string): Promise<void> {
    await this.ignoreRegistryError(async () => {
      await this.registry.removeQueue(queueName);
    });
  }

  async reapRegisteredForBindings(
    bindings: readonly EventMeshBinding[],
    getClient: (binding: EventMeshBinding) => EventMeshQueueManagementClient
  ): Promise<void> {
    for (const binding of bindings) {
      await this.reapRegisteredForBinding(binding, getClient(binding));
    }
  }

  async reapForBindings(
    bindings: readonly EventMeshBinding[],
    getClient: (binding: EventMeshBinding) => EventMeshQueueManagementClient
  ): Promise<void> {
    for (const binding of bindings) {
      await this.reapForBinding(binding, getClient(binding));
    }
  }

  async reapForBinding(
    binding: EventMeshBinding,
    client: EventMeshQueueManagementClient
  ): Promise<void> {
    const liveRegisteredQueues = await this.reapRegisteredForBinding(binding, client);
    await this.reapStaleForBinding(binding, client, liveRegisteredQueues);
  }

  private async reapRegisteredForBinding(
    binding: EventMeshBinding,
    client: EventMeshQueueManagementClient
  ): Promise<Set<string>> {
    const liveQueueNames = new Set<string>();
    const entries = await this.safeListRegistryQueues();
    for (const entry of entries.filter((candidate) => candidate.bindingNamespace === binding.namespace)) {
      if (this.isEntryOwnedByLiveWindow(entry)) {
        liveQueueNames.add(entry.queueName);
        continue;
      }
      await this.deleteRegisteredQueue(client, entry);
    }
    return liveQueueNames;
  }

  private async reapStaleForBinding(
    binding: EventMeshBinding,
    client: EventMeshQueueManagementClient,
    protectedQueueNames: ReadonlySet<string>
  ): Promise<void> {
    try {
      const queues = await client.listQueueNames();
      for (const name of queues) {
        if (protectedQueueNames.has(name) || !isStaleDebugQueueName(name, binding.namespace, this.now())) {
          continue;
        }
        this.log(`Reaping stale debug queue ${name}`);
        await this.deleteRemoteQueue(client, name);
      }
    } catch {
      // Discovery/reaping is best-effort and must never block starting a listen.
    }
  }

  private isEntryOwnedByLiveWindow(entry: EventMeshQueueRegistryEntry): boolean {
    if (entry.ownerPid === process.pid) {
      return entry.ownerId === this.ownerId;
    }
    return this.isOwnerAliveFn(entry);
  }

  private async safeListRegistryQueues(): Promise<EventMeshQueueRegistryEntry[]> {
    try {
      return await this.registry.listQueues();
    } catch {
      return [];
    }
  }

  private async deleteRegisteredQueue(
    client: EventMeshQueueManagementClient,
    entry: EventMeshQueueRegistryEntry
  ): Promise<void> {
    this.log(`Reaping orphaned debug queue ${entry.queueName}`);
    try {
      await client.deleteQueue(entry.queueName);
      await this.registry.removeQueue(entry.queueName);
    } catch (error) {
      this.log(`Failed to delete ${entry.queueName}: ${this.describeError(error)}`);
    }
  }

  private async deleteRemoteQueue(
    client: EventMeshQueueManagementClient,
    queueName: string
  ): Promise<void> {
    try {
      await client.deleteQueue(queueName);
    } catch (error) {
      this.log(`Failed to delete ${queueName}: ${this.describeError(error)}`);
    }
  }

  private async ignoreRegistryError(work: () => Promise<void>): Promise<void> {
    try {
      await work();
    } catch (error) {
      this.log(`Event Mesh queue registry update failed: ${this.describeError(error)}`);
    }
  }

  private describeError(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    return typeof error === 'string' ? error : String(error);
  }
}
