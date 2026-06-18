import { EventEmitter } from 'node:events';

import { describe, expect, it, vi } from 'vitest';

import {
  EventMeshAmqpListener,
  type AmqpModuleLoader,
} from './eventMeshAmqpListener';
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
    amqp: { uri: 'wss://amqp.example.com/protocol/amqp10ws', oa2 },
  };
}

class FakeStream extends EventEmitter {
  readonly detach = vi.fn();

  receiver(): { detach: () => void } {
    return { detach: this.detach };
  }
}

class FakeReceiver {
  constructor(private readonly stream: FakeStream) {}

  attach(): FakeStream {
    return this.stream;
  }
}

class FakeClient extends EventEmitter {
  readonly connect = vi.fn();
  readonly disconnect = vi.fn(() => {
    this.emit('disconnected');
  });

  constructor(private readonly stream: FakeStream) {
    super();
  }

  receiver(): FakeReceiver {
    return new FakeReceiver(this.stream);
  }
}

function createFakeAmqp(): {
  readonly client: FakeClient;
  readonly stream: FakeStream;
  readonly loader: AmqpModuleLoader;
} {
  const stream = new FakeStream();
  const client = new FakeClient(stream);
  const ClientCtor = vi.fn(() => client);
  return {
    client,
    stream,
    loader: (() => ({ Client: ClientCtor })) as AmqpModuleLoader,
  };
}

function createListener(loader: AmqpModuleLoader, startupTimeoutMs = 30000): EventMeshAmqpListener {
  return new EventMeshAmqpListener(
    makeBinding(),
    'demo/orders/api/saptools-debug/run-1',
    { onMessage: vi.fn(), onError: vi.fn(), onConnected: vi.fn() },
    loader,
    startupTimeoutMs
  );
}

describe('EventMeshAmqpListener startup safety', () => {
  it('rejects startup when the stream closes before subscription is active', async () => {
    const fake = createFakeAmqp();
    const listener = createListener(fake.loader);

    const start = listener.start();
    fake.stream.emit('close');

    await expect(start).rejects.toThrow(/closed before subscription/i);
  });

  it('rejects startup when stop is requested before subscription is active', async () => {
    const fake = createFakeAmqp();
    const listener = createListener(fake.loader);

    const start = listener.start();
    listener.stop();

    await expect(start).rejects.toThrow(/stopped before subscription/i);
    expect(fake.stream.detach).toHaveBeenCalledTimes(1);
    expect(fake.client.disconnect).toHaveBeenCalledTimes(1);
  });

  it('rejects startup when the subscription does not become active before the deadline', async () => {
    vi.useFakeTimers();
    try {
      const fake = createFakeAmqp();
      const listener = createListener(fake.loader, 25);

      const start = listener.start();
      const assertion = expect(start).rejects.toThrow(/timed out/i);
      await vi.advanceTimersByTimeAsync(25);

      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
});
