import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  EventMeshQueueRegistry,
  type EventMeshQueueRegistryEntry,
} from './eventMeshQueueRegistry';

function makeEntry(
  queueName: string,
  ownerPid: number,
  ownerId = `owner-${String(ownerPid)}`
): EventMeshQueueRegistryEntry {
  return {
    ownerPid,
    ownerId,
    appId: 'orders-api',
    bindingIndex: 2,
    bindingName: 'orders-messaging',
    bindingNamespace: 'demo/orders/api',
    queueName,
    createdAt: '2026-06-18T10:00:00.000Z',
  };
}

async function withRegistry(
  testBody: (registry: EventMeshQueueRegistry, filePath: string) => Promise<void>
): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'saptools-eventmesh-registry-'));
  const filePath = join(dir, 'queues.json');
  try {
    await testBody(new EventMeshQueueRegistry(filePath), filePath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe('EventMeshQueueRegistry', () => {
  it('records queue ownership without storing Event Mesh credentials', async () => {
    await withRegistry(async (registry, filePath) => {
      await registry.recordQueue(makeEntry('demo/orders/api/saptools-debug/run-1', 111));

      const raw = await readFile(filePath, 'utf8');
      expect(raw).toContain('demo/orders/api/saptools-debug/run-1');
      expect(raw).not.toContain('clientsecret');
      expect(raw).not.toContain('password');
      expect(raw).not.toContain('access_token');
      expect(await registry.listQueues()).toHaveLength(1);
    });
  });

  it('removes a queue after successful cleanup', async () => {
    await withRegistry(async (registry) => {
      await registry.recordQueue(makeEntry('demo/orders/api/saptools-debug/run-1', 111));

      await registry.removeQueue('demo/orders/api/saptools-debug/run-1');

      expect(await registry.listQueues()).toEqual([]);
    });
  });

});
