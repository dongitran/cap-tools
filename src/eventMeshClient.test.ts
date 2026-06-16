import { describe, expect, it, vi } from 'vitest';

import { EventMeshManagementClient, type FetchFn } from './eventMeshClient';
import type { EventMeshBinding } from './eventMeshBindings';

function makeBinding(): EventMeshBinding {
  const oa2 = {
    clientid: 'cid',
    clientsecret: 'sec',
    tokenendpoint: 'https://uaa.example.com/oauth/token',
  };
  return {
    index: 0,
    name: 'app-service',
    instanceName: 'app-service',
    namespace: 'demo/service/app',
    management: { uri: 'https://mgmt.example.com', oa2 },
    messaging: { uri: 'https://rest.example.com', oa2 },
    amqp: { uri: 'wss://amqp.example.com', oa2 },
  };
}

function jsonResponse(status: number, body: string): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    text: () => Promise.resolve(body),
  } as unknown as Response;
}

const TOKEN_BODY = JSON.stringify({ access_token: 'tok', expires_in: 1000 });

type ManagementHandler = (url: string, init: RequestInit | undefined) => Response;

function routedFetch(handle: ManagementHandler): ReturnType<typeof vi.fn> {
  return vi.fn((url: string, init?: RequestInit) => {
    if (url.includes('/oauth/token')) {
      return Promise.resolve(jsonResponse(200, TOKEN_BODY));
    }
    return Promise.resolve(handle(url, init));
  });
}

describe('EventMeshManagementClient', () => {
  it('fetches the OAuth token once and reuses it while valid', async () => {
    const fetchFn = routedFetch(() => jsonResponse(200, '[]'));
    const client = new EventMeshManagementClient(makeBinding(), fetchFn as unknown as FetchFn, () => 1000);

    await client.listQueueNames();
    await client.listQueueNames();

    const tokenCalls = fetchFn.mock.calls.filter((call) =>
      String(call[0]).includes('/oauth/token')
    );
    expect(tokenCalls).toHaveLength(1);
  });

  it('creates a queue with a config body and URL-encodes the slashes in the name', async () => {
    const fetchFn = routedFetch(() => jsonResponse(200, ''));
    const client = new EventMeshManagementClient(makeBinding(), fetchFn as unknown as FetchFn);

    await client.createQueue('demo/service/app/saptools-debug/x1');

    const put = fetchFn.mock.calls.find((call) => (call[1] as RequestInit | undefined)?.method === 'PUT');
    expect(put).toBeDefined();
    expect(String(put?.[0])).toContain(
      `/queues/${encodeURIComponent('demo/service/app/saptools-debug/x1')}`
    );
    expect(String((put?.[1] as RequestInit).body)).toContain('EXCLUSIVE');
  });

  it('retries queue creation without a body when the tenant rejects the JSON (HTTP 400)', async () => {
    let putCount = 0;
    const fetchFn = routedFetch((_url, init) => {
      if (init?.method === 'PUT') {
        putCount += 1;
        return jsonResponse(putCount === 1 ? 400 : 201, '');
      }
      return jsonResponse(200, '[]');
    });
    const client = new EventMeshManagementClient(makeBinding(), fetchFn as unknown as FetchFn);

    await client.createQueue('q1');

    const puts = fetchFn.mock.calls.filter((call) => (call[1] as RequestInit | undefined)?.method === 'PUT');
    expect(puts).toHaveLength(2);
    expect((puts[0]?.[1] as RequestInit).body).toBeDefined();
    expect((puts[1]?.[1] as RequestInit).body).toBeUndefined();
  });

  it('encodes the topic when adding a subscription', async () => {
    const fetchFn = routedFetch(() => jsonResponse(204, ''));
    const client = new EventMeshManagementClient(makeBinding(), fetchFn as unknown as FetchFn);

    await client.addSubscription('q1', 'demo/service/app/items/*');

    const call = fetchFn.mock.calls.find((entry) => String(entry[0]).includes('/subscriptions/'));
    expect(String(call?.[0])).toContain(
      `/queues/q1/subscriptions/${encodeURIComponent('demo/service/app/items/*')}`
    );
  });

  it('parses queue list responses in several shapes', async () => {
    const objectList = new EventMeshManagementClient(
      makeBinding(),
      routedFetch(() => jsonResponse(200, JSON.stringify([{ name: 'q1' }, { name: 'q2' }]))) as unknown as FetchFn
    );
    expect(await objectList.listQueueNames()).toEqual(['q1', 'q2']);

    const stringList = new EventMeshManagementClient(
      makeBinding(),
      routedFetch(() => jsonResponse(200, JSON.stringify(['q3']))) as unknown as FetchFn
    );
    expect(await stringList.listQueueNames()).toEqual(['q3']);

    const wrapped = new EventMeshManagementClient(
      makeBinding(),
      routedFetch(() => jsonResponse(200, JSON.stringify({ queues: [{ name: 'q4' }] }))) as unknown as FetchFn
    );
    expect(await wrapped.listQueueNames()).toEqual(['q4']);
  });

  it('discovers the union of topics across existing queues, sorted and de-duplicated', async () => {
    const fetchFn = vi.fn((url: string) => {
      if (url.includes('/oauth/token')) {
        return Promise.resolve(jsonResponse(200, TOKEN_BODY));
      }
      if (url.endsWith('/messaging/queues')) {
        return Promise.resolve(jsonResponse(200, JSON.stringify([{ name: 'q1' }, { name: 'q2' }])));
      }
      if (url.includes('/queues/q1/subscriptions')) {
        return Promise.resolve(jsonResponse(200, JSON.stringify([{ topic: 'demo/service/app/b' }])));
      }
      if (url.includes('/queues/q2/subscriptions')) {
        return Promise.resolve(
          jsonResponse(
            200,
            JSON.stringify([{ topic: 'demo/service/app/a' }, { topic: 'demo/service/app/b' }])
          )
        );
      }
      return Promise.resolve(jsonResponse(200, '[]'));
    });
    const client = new EventMeshManagementClient(makeBinding(), fetchFn as unknown as FetchFn);

    const topics = await client.discoverTopics(25);
    expect(topics).toEqual(['demo/service/app/a', 'demo/service/app/b']);
  });

  it('ignores a single unreadable queue during discovery', async () => {
    const fetchFn = vi.fn((url: string) => {
      if (url.includes('/oauth/token')) {
        return Promise.resolve(jsonResponse(200, TOKEN_BODY));
      }
      if (url.endsWith('/messaging/queues')) {
        return Promise.resolve(jsonResponse(200, JSON.stringify(['q1', 'q2'])));
      }
      if (url.includes('/queues/q1/subscriptions')) {
        return Promise.resolve(jsonResponse(500, 'nope'));
      }
      return Promise.resolve(jsonResponse(200, JSON.stringify([{ topic: 'demo/service/app/ok' }])));
    });
    const client = new EventMeshManagementClient(makeBinding(), fetchFn as unknown as FetchFn);

    expect(await client.discoverTopics(25)).toEqual(['demo/service/app/ok']);
  });

  it('throws EventMeshManagementError on an unexpected status', async () => {
    const fetchFn = routedFetch(() => jsonResponse(500, 'boom'));
    const client = new EventMeshManagementClient(makeBinding(), fetchFn as unknown as FetchFn);

    await expect(client.listQueueNames()).rejects.toThrow(/HTTP 500/);
  });
});
