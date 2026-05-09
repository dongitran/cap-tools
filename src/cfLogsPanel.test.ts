import { EventEmitter } from 'node:events';

import { describe, expect, it, vi } from 'vitest';

import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import type { CfLogStreamHandle } from './cfClient';

vi.mock('vscode', () => ({
  commands: {
    executeCommand: vi.fn(),
  },
  Uri: {
    joinPath: vi.fn(() => ({
      toString: () => 'mock-uri',
    })),
  },
}));

import { CfLogsPanelProvider } from './cfLogsPanel';

interface AppStreamRuntimeForTest {
  readonly appName: string;
  readonly token: number;
  readonly handle: CfLogStreamHandle;
  lineRemainder: string;
  lineBuffer: string[];
  flushTimer: NodeJS.Timeout | null;
  stoppedByRequest: boolean;
}

interface CfLogsPanelTestAccess {
  readonly runningStreams: Map<string, AppStreamRuntimeForTest>;
  attachStreamListeners(stream: AppStreamRuntimeForTest): void;
  stopStream(appName: string, notify: boolean): void;
}

interface MockChildProcess extends EventEmitter {
  readonly stdout: EventEmitter;
  readonly stderr: EventEmitter;
}

function createMockProcess(): MockChildProcess {
  const process = new EventEmitter() as MockChildProcess;
  Object.defineProperties(process, {
    stdout: {
      value: new EventEmitter(),
    },
    stderr: {
      value: new EventEmitter(),
    },
  });
  return process;
}

function createStream(
  appName: string,
  process: MockChildProcess,
  stop: () => void
): AppStreamRuntimeForTest {
  return {
    appName,
    token: 1,
    handle: {
      process: process as unknown as ChildProcessWithoutNullStreams,
      stop,
    },
    lineRemainder: '',
    lineBuffer: [],
    flushTimer: null,
    stoppedByRequest: false,
  };
}

describe('CfLogsPanelProvider stream lifecycle', () => {
  it('detaches stream listeners before stopping a requested stream', () => {
    const provider = new CfLogsPanelProvider({
      extensionUri: { toString: () => 'extension-uri' },
      globalState: {
        get: vi.fn(),
        update: vi.fn(),
      },
    } as unknown as ConstructorParameters<typeof CfLogsPanelProvider>[0]);
    const access = provider as unknown as CfLogsPanelTestAccess;
    const process = createMockProcess();
    const stop = vi.fn(() => {
      expect(process.stdout.listenerCount('data')).toBe(0);
      expect(process.stderr.listenerCount('data')).toBe(0);
      expect(process.listenerCount('exit')).toBe(0);
      expect(process.listenerCount('error')).toBe(0);
    });
    const stream = createStream('finance-uat-api', process, stop);

    access.runningStreams.set(stream.appName, stream);
    access.attachStreamListeners(stream);
    expect(process.stdout.listenerCount('data')).toBe(1);
    expect(process.stderr.listenerCount('data')).toBe(1);
    expect(process.listenerCount('exit')).toBe(1);
    expect(process.listenerCount('error')).toBe(1);

    access.stopStream(stream.appName, true);

    expect(stop).toHaveBeenCalledTimes(1);
    expect(stream.stoppedByRequest).toBe(true);
    expect(access.runningStreams.has(stream.appName)).toBe(false);
  });
});
