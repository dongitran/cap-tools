import { describe, expect, it, vi } from 'vitest';

const { createWebviewPanelMock } = vi.hoisted(() => ({
  createWebviewPanelMock: vi.fn(),
}));

vi.mock('vscode', () => ({
  Uri: {
    joinPath: vi.fn((_base: unknown, ...parts: string[]) => ({ path: parts.join('/') })),
  },
  ViewColumn: {
    Active: 1,
  },
  window: {
    createWebviewPanel: createWebviewPanelMock,
  },
}));

import {
  EventMeshPanelManager,
  isStaleDebugQueueNameForTest,
  type EventMeshTargetParams,
} from './eventMeshPanel';

interface MockPanel {
  readonly webview: {
    html: string;
    readonly asWebviewUri: (uri: { readonly path?: string }) => {
      readonly with: () => { readonly toString: () => string };
      readonly toString: () => string;
    };
    readonly onDidReceiveMessage: ReturnType<typeof vi.fn>;
    readonly postMessage: ReturnType<typeof vi.fn>;
  };
  readonly reveal: ReturnType<typeof vi.fn>;
  readonly dispose: ReturnType<typeof vi.fn>;
  readonly onDidDispose: ReturnType<typeof vi.fn>;
}

function createMockPanel(): MockPanel {
  const disposeHandlers: (() => void)[] = [];
  return {
    webview: {
      html: '',
      asWebviewUri: (uri) => ({
        with: () => ({ toString: () => `vscode-resource:${uri.path ?? 'asset'}` }),
        toString: () => `vscode-resource:${uri.path ?? 'asset'}`,
      }),
      onDidReceiveMessage: vi.fn(),
      postMessage: vi.fn(),
    },
    reveal: vi.fn(),
    dispose: vi.fn(() => {
      for (const handler of disposeHandlers) {
        handler();
      }
    }),
    onDidDispose: vi.fn((handler: () => void) => {
      disposeHandlers.push(handler);
      return { dispose: vi.fn() };
    }),
  };
}

function makeTargetParams(spaceName: string): EventMeshTargetParams {
  return {
    apiEndpoint: 'https://api.example.com',
    email: 'user@example.com',
    password: 'secret',
    orgName: 'demo-org',
    spaceName,
    cfHomeDir: '/tmp/cf-home',
  };
}

describe('EventMeshPanelManager debug queue cleanup', () => {
  it('keeps a recently created debug queue so another active viewer is not interrupted', () => {
    const namespace = 'demo/service/app';
    const createdAt = Date.UTC(2026, 5, 16, 10, 0, 0);
    const queueName = `${namespace}/saptools-debug/${createdAt.toString(36)}-abcd1234`;

    expect(
      isStaleDebugQueueNameForTest(queueName, namespace, createdAt + 60_000)
    ).toBe(false);
  });

  it('reaps only timestamped debug queues older than the stale threshold', () => {
    const namespace = 'demo/service/app';
    const createdAt = Date.UTC(2026, 5, 16, 10, 0, 0);
    const queueName = `${namespace}/saptools-debug/${createdAt.toString(36)}-abcd1234`;

    expect(
      isStaleDebugQueueNameForTest(queueName, namespace, createdAt + 7 * 60 * 60 * 1000)
    ).toBe(true);
  });

  it('does not reap unrelated or invalid queues', () => {
    const namespace = 'demo/service/app';

    expect(
      isStaleDebugQueueNameForTest(`${namespace}/other-tool/abc`, namespace, Date.now())
    ).toBe(false);
    expect(
      isStaleDebugQueueNameForTest(`${namespace}/saptools-debug/not-a-timestamp`, namespace, Date.now())
    ).toBe(false);
  });
});

describe('EventMeshPanelManager panel reuse', () => {
  it('recreates an existing app panel when the target scope changes', () => {
    const panels = [createMockPanel(), createMockPanel()];
    createWebviewPanelMock.mockImplementation(() => {
      const panel = panels.shift();
      if (panel === undefined) {
        throw new Error('No mock panel available.');
      }
      return panel;
    });
    const firstPanel = panels[0];
    if (firstPanel === undefined) {
      throw new Error('First mock panel missing.');
    }
    const manager = new EventMeshPanelManager({} as never, { appendLine: vi.fn() } as never);

    manager.openEventMeshViewer('demo-app', makeTargetParams('space-a'));
    manager.openEventMeshViewer('demo-app', makeTargetParams('space-b'));

    expect(createWebviewPanelMock).toHaveBeenCalledTimes(2);
    expect(firstPanel.dispose).toHaveBeenCalledTimes(1);
    expect(firstPanel.reveal).not.toHaveBeenCalled();
  });
});
