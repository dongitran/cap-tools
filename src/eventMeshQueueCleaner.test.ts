import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { EventMeshQueueCleaner } from './eventMeshQueueCleaner';
import { EventMeshQueueRegistry } from './eventMeshQueueRegistry';
import type { EventMeshBinding } from './eventMeshBindings';

function makeBinding(): EventMeshBinding {
  const oa2 = {
    clientid: 'cid',
    clientsecret: 'sec',
    tokenendpoint: 'https://uaa.example.com/oauth/token',
  };
  return {
    index: 0,
    name: 'orders-messaging',
    instanceName: 'orders-messaging',
    namespace: 'demo/orders/api',
    management: { uri: 'https://mgmt.example.com', oa2 },
    messaging: { uri: 'https://rest.example.com', oa2 },
    amqp: { uri: 'wss://amqp.example.com', oa2 },
  };
}

function createClient(queueNames: string[]): {
  readonly listQueueNames: ReturnType<typeof vi.fn>;
  readonly deleteQueue: ReturnType<typeof vi.fn>;
} {
  return {
    listQueueNames: vi.fn().mockResolvedValue(queueNames),
    deleteQueue: vi.fn().mockResolvedValue(undefined),
  };
}

async function withCleaner(
  testBody: (
    cleaner: EventMeshQueueCleaner,
    registry: EventMeshQueueRegistry
  ) => Promise<void>
): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'saptools-eventmesh-cleaner-'));
  try {
    const registry = new EventMeshQueueRegistry(join(dir, 'queues.json'));
    const cleaner = new EventMeshQueueCleaner(
      'current-owner',
      () => undefined,
      registry,
      () => Date.UTC(2026, 5, 18, 12, 0, 0),
      (entry) => entry.ownerId === 'live-owner'
    );
    await testBody(cleaner, registry);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe('EventMeshQueueCleaner', () => {
  it('deletes registered orphan queues before a new listener starts', async () => {
    await withCleaner(async (cleaner, registry) => {
      const binding = makeBinding();
      const queueName = `${binding.namespace}/saptools-debug/orphan`;
      const client = createClient([queueName]);
      await registry.recordQueue({
        ownerPid: 222,
        ownerId: 'dead-owner',
        appId: 'orders-api',
        bindingIndex: binding.index,
        bindingName: binding.name,
        bindingNamespace: binding.namespace,
        queueName,
        createdAt: '2026-06-18T09:00:00.000Z',
      });

      await cleaner.reapForBinding(binding, client);

      expect(client.deleteQueue).toHaveBeenCalledWith(queueName);
      expect(await registry.listQueues()).toEqual([]);
    });
  });

  it('does not stale-reap a registered queue owned by a live window', async () => {
    await withCleaner(async (cleaner, registry) => {
      const binding = makeBinding();
      const oldTimestamp = Date.UTC(2026, 5, 18, 1, 0, 0).toString(36);
      const queueName = `${binding.namespace}/saptools-debug/${oldTimestamp}-live`;
      const client = createClient([queueName]);
      await registry.recordQueue({
        ownerPid: 111,
        ownerId: 'live-owner',
        appId: 'orders-api',
        bindingIndex: binding.index,
        bindingName: binding.name,
        bindingNamespace: binding.namespace,
        queueName,
        createdAt: '2026-06-18T01:00:00.000Z',
      });

      await cleaner.reapForBinding(binding, client);

      expect(client.deleteQueue).not.toHaveBeenCalled();
      expect((await registry.listQueues()).map((entry) => entry.queueName)).toEqual([queueName]);
    });
  });
});
