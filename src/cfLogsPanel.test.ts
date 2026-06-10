import { EventEmitter } from 'node:events';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import type { CfLogStreamHandle } from './cfClient';

const fileLogTestConfig = vi.hoisted(() => ({ directory: '' }));

vi.mock('vscode', () => ({
  commands: {
    executeCommand: vi.fn(),
  },
  Uri: {
    joinPath: vi.fn(() => ({
      toString: () => 'mock-uri',
    })),
  },
  window: {
    showWarningMessage: vi.fn(),
  },
  workspace: {
    getConfiguration: vi.fn(() => ({
      get: vi.fn((key: string): unknown =>
        key === 'fileLogDirectory' ? fileLogTestConfig.directory : undefined
      ),
    })),
    workspaceFolders: undefined,
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

interface MockWebview {
  readonly htmlMessages: unknown[];
  html: string;
  options?: unknown;
  asWebviewUri(uri: unknown): unknown;
  postMessage(message: unknown): Promise<boolean>;
  onDidReceiveMessage(listener: (message: unknown) => void): { dispose(): void };
}

function createMockWebview(): MockWebview {
  return {
    htmlMessages: [],
    html: '',
    asWebviewUri: vi.fn((uri: unknown) => uri),
    postMessage: vi.fn(async function postMessage(
      this: MockWebview,
      message: unknown
    ): Promise<boolean> {
      this.htmlMessages.push(message);
      return true;
    }),
    onDidReceiveMessage: vi.fn(() => ({ dispose: vi.fn() })),
  };
}

function createProviderForSettings(globalState?: {
  get?: ReturnType<typeof vi.fn>;
  update?: ReturnType<typeof vi.fn>;
}): CfLogsPanelProvider {
  return new CfLogsPanelProvider({
    extensionUri: { toString: () => 'extension-uri' },
    globalState: {
      get: globalState?.get ?? vi.fn(),
      update: globalState?.update ?? vi.fn(),
    },
  } as unknown as ConstructorParameters<typeof CfLogsPanelProvider>[0]);
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

interface CfLogsPanelHealAccess {
  filterSessionNotReadyLines(stream: unknown, lines: string[]): string[];
  readonly sessionRecoveryCounts: Map<string, number>;
}

function createYoungStream(appName: string): {
  appName: string;
  startedAt: number;
  healthy: boolean;
  sawSessionError: boolean;
} {
  return { appName, startedAt: Date.now(), healthy: false, sawSessionError: false };
}


describe('CfLogsPanelProvider app catalog filtering', () => {
  it('publishes only apps with running instances to the Logs app selector', () => {
    const provider = createProviderForSettings();
    const webview = createMockWebview();

    provider.resolveWebviewView(
      { webview } as unknown as Parameters<CfLogsPanelProvider['resolveWebviewView']>[0]
    );

    provider.updateActiveApps(['orders-api', 'scaled-worker', 'legacy-api']);
    provider.updateApps(
      [
        { id: 'orders-api', name: 'orders-api', runningInstances: 2 },
        { id: 'scaled-worker', name: 'scaled-worker', runningInstances: 0 },
        { id: 'legacy-api', name: 'legacy-api', runningInstances: 0 },
      ],
      null
    );

    expect(webview.htmlMessages).toContainEqual({
      type: 'sapTools.appsUpdate',
      apps: [{ id: 'orders-api', name: 'orders-api', runningInstances: 2 }],
      selectedApp: 'orders-api',
    });
    expect(webview.htmlMessages).toContainEqual({
      type: 'sapTools.activeAppsUpdate',
      appNames: ['orders-api'],
    });
  });
});

describe('CfLogsPanelProvider session healing', () => {
  it('suppresses CF session-not-ready lines for a young stream until real output arrives', () => {
    const provider = createProviderForSettings();
    const access = provider as unknown as CfLogsPanelHealAccess;
    const stream = createYoungStream('app-demo');

    const suppressed = access.filterSessionNotReadyLines(stream, [
      "No org targeted, use 'cf target -o ORG' to target an org.",
      'FAILED',
      "App 'app-demo' not found.",
      "Not logged in. Use 'cf login' or 'cf login --sso' to log in.",
    ]);

    expect(suppressed).toEqual([]);
    expect(stream.sawSessionError).toBe(true);
    expect(stream.healthy).toBe(false);

    const realOutput = '2026-04-12T09:14:31.73+0700 [APP/PROC/WEB/0] OUT server listening';
    const visible = access.filterSessionNotReadyLines(stream, [realOutput]);
    expect(visible).toEqual([realOutput]);
    expect(stream.healthy).toBe(true);

    // Once healthy, even a matching line passes through (it is likely real output).
    expect(access.filterSessionNotReadyLines(stream, ['No org targeted'])).toEqual([
      'No org targeted',
    ]);
  });

  it('stops suppressing once the per-app recovery budget is spent', () => {
    const provider = createProviderForSettings();
    const access = provider as unknown as CfLogsPanelHealAccess;
    access.sessionRecoveryCounts.set('app-demo', 3);
    const stream = createYoungStream('app-demo');

    expect(access.filterSessionNotReadyLines(stream, ['No org targeted'])).toEqual([
      'No org targeted',
    ]);
  });
});

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readStreamStates(webview: MockWebview, appName: string): string[] {
  return webview.htmlMessages
    .filter(isRecordValue)
    .filter(
      (message) =>
        message['type'] === 'sapTools.logsStreamState' && message['appName'] === appName
    )
    .map((message) => String(message['status']));
}

function readAppendedLineBatches(webview: MockWebview, appName: string): string[][] {
  return webview.htmlMessages
    .filter(isRecordValue)
    .filter(
      (message) => message['type'] === 'sapTools.logsAppend' && message['appName'] === appName
    )
    .map((message) =>
      Array.isArray(message['lines']) ? message['lines'].map((line) => String(line)) : []
    );
}

interface CfLogsPanelMessageAccess {
  handleWebviewMessage(message: unknown): Promise<void>;
}

describe('CfLogsPanelProvider file logging', () => {
  it('renders the file-log dropdown left of the gear button defaulting to stream-only', () => {
    const provider = createProviderForSettings();
    const webview = createMockWebview();

    provider.resolveWebviewView(
      { webview } as unknown as Parameters<CfLogsPanelProvider['resolveWebviewView']>[0]
    );

    const dropdownIndex = webview.html.indexOf('id="file-log-select"');
    const gearIndex = webview.html.indexOf('id="settings-toggle"');
    expect(dropdownIndex).toBeGreaterThan(-1);
    expect(gearIndex).toBeGreaterThan(dropdownIndex);
    expect(webview.html).toMatch(/<option value="off" selected>/);
    expect(webview.html).toContain('<option value="file">');
    expect(
      webview.htmlMessages.some(
        (message) =>
          isRecordValue(message) &&
          message['type'] === 'sapTools.fileLogSettingInit' &&
          message['fileLogMode'] === 'off' &&
          typeof message['fileLogDirectory'] === 'string' &&
          message['fileLogDirectory'].length > 0
      )
    ).toBe(true);
  });

  it('writes streamed lines to a per-app timestamped file while Log to file is on', async () => {
    fileLogTestConfig.directory = mkdtempSync(join(tmpdir(), 'saptools-cflogs-'));
    try {
      const provider = createProviderForSettings();
      const webview = createMockWebview();
      provider.resolveWebviewView(
        { webview } as unknown as Parameters<CfLogsPanelProvider['resolveWebviewView']>[0]
      );

      await (provider as unknown as CfLogsPanelMessageAccess).handleWebviewMessage({
        type: 'sapTools.saveFileLogSetting',
        fileLogMode: 'file',
      });

      const access = provider as unknown as CfLogsPanelTestAccess;
      const mockProcess = createMockProcess();
      const stream = createStream('finance-uat-api', mockProcess, vi.fn());
      access.runningStreams.set(stream.appName, stream);
      access.attachStreamListeners(stream);
      mockProcess.stdout.emit(
        'data',
        Buffer.from(
          '2026-04-12T09:14:31.73+0700 [APP/PROC/WEB/0] OUT line-one\nsecond-line\n'
        )
      );

      provider.dispose();

      await vi.waitFor(() => {
        const files = readdirSync(fileLogTestConfig.directory);
        expect(files).toHaveLength(1);
        expect(files[0]).toMatch(
          /^finance-uat-api_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}(_\d+)?\.log$/
        );
        const content = readFileSync(
          join(fileLogTestConfig.directory, files[0] ?? ''),
          'utf8'
        );
        expect(content).toContain('line-one');
        expect(content).toContain('second-line');
      });
    } finally {
      rmSync(fileLogTestConfig.directory, { recursive: true, force: true });
      fileLogTestConfig.directory = '';
    }
  });

  it('keeps streaming without writing files while the dropdown stays off', () => {
    fileLogTestConfig.directory = mkdtempSync(join(tmpdir(), 'saptools-cflogs-off-'));
    try {
      const provider = createProviderForSettings();
      const webview = createMockWebview();
      provider.resolveWebviewView(
        { webview } as unknown as Parameters<CfLogsPanelProvider['resolveWebviewView']>[0]
      );

      const access = provider as unknown as CfLogsPanelTestAccess;
      const mockProcess = createMockProcess();
      const stream = createStream('finance-uat-api', mockProcess, vi.fn());
      access.runningStreams.set(stream.appName, stream);
      access.attachStreamListeners(stream);
      mockProcess.stdout.emit('data', Buffer.from('stream-only-line\n'));

      provider.dispose();

      expect(readdirSync(fileLogTestConfig.directory)).toHaveLength(0);
    } finally {
      rmSync(fileLogTestConfig.directory, { recursive: true, force: true });
      fileLogTestConfig.directory = '';
    }
  });
});

describe('CfLogsPanelProvider pause and resume', () => {
  it('keeps the session and buffers new lines while paused, then flushes on resume', () => {
    const provider = createProviderForSettings();
    const webview = createMockWebview();
    provider.resolveWebviewView(
      { webview } as unknown as Parameters<CfLogsPanelProvider['resolveWebviewView']>[0]
    );
    provider.updateActiveApps(['finance-uat-api']);

    const access = provider as unknown as CfLogsPanelTestAccess;
    const mockProcess = createMockProcess();
    const stop = vi.fn();
    const stream = createStream('finance-uat-api', mockProcess, stop);
    access.runningStreams.set(stream.appName, stream);
    access.attachStreamListeners(stream);

    provider.updatePausedApps(['finance-uat-api']);
    expect(readStreamStates(webview, 'finance-uat-api').at(-1)).toBe('paused');

    mockProcess.stdout.emit('data', Buffer.from('while-paused-line\n'));
    expect(readAppendedLineBatches(webview, 'finance-uat-api')).toEqual([]);
    // The cf logs process keeps running — pause only freezes the display.
    expect(stop).not.toHaveBeenCalled();

    provider.updatePausedApps([]);
    expect(readAppendedLineBatches(webview, 'finance-uat-api')).toEqual([
      ['while-paused-line'],
    ]);
    expect(readStreamStates(webview, 'finance-uat-api').at(-1)).toBe('streaming');
  });

  it('keeps the paused badge while background reconnect states arrive', () => {
    const provider = createProviderForSettings();
    const webview = createMockWebview();
    provider.resolveWebviewView(
      { webview } as unknown as Parameters<CfLogsPanelProvider['resolveWebviewView']>[0]
    );
    provider.updateActiveApps(['finance-uat-api']);
    provider.updatePausedApps(['finance-uat-api']);

    (provider as unknown as {
      postStreamState(appName: string, status: string, message?: string): void;
    }).postStreamState('finance-uat-api', 'reconnecting', 'Retrying in 1000 ms.');

    expect(readStreamStates(webview, 'finance-uat-api').at(-1)).toBe('paused');
  });
});

describe('CfLogsPanelProvider message display setting', () => {
  it('renders a default-off setting to limit long message height', () => {
    const provider = createProviderForSettings();
    const webview = createMockWebview();

    provider.resolveWebviewView(
      { webview } as unknown as Parameters<CfLogsPanelProvider['resolveWebviewView']>[0]
    );

    expect(webview.html).toContain('id="settings-message-limit"');
    expect(webview.html).toContain('aria-label="Limit message height"');
    expect(webview.html).not.toMatch(/<input[^>]*id="settings-message-limit"[^>]*checked/i);
    expect(webview.htmlMessages).toContainEqual({
      type: 'sapTools.messageHeightLimitSettingInit',
      limitMessageHeight: false,
    });
  });

  it('keeps message cells fully expanded by default and limits only in compact mode', () => {
    const css = readFileSync(
      join(process.cwd(), 'docs/designs/prototypes/assets/cf-logs-panel.css'),
      'utf8'
    );

    expect(css).toMatch(
      /\.cf-log-table \.cell-message-text\s*\{[\s\S]*?max-height:\s*none;[\s\S]*?overflow:\s*visible;/
    );
    expect(css).toMatch(
      /\.cf-log-message-limited \.cf-log-table \.cell-message-text\s*\{[\s\S]*?max-height:\s*8\.5em;[\s\S]*?overflow:\s*auto;/
    );
  });

  it('initializes and persists the message height limit setting', async () => {
    const get = vi.fn((key: string): unknown =>
      key === 'cfLogsPanel.limitMessageHeight' ? true : undefined
    );
    const update = vi.fn(async () => undefined);
    const provider = createProviderForSettings({ get, update });
    const webview = createMockWebview();

    provider.resolveWebviewView(
      { webview } as unknown as Parameters<CfLogsPanelProvider['resolveWebviewView']>[0]
    );

    expect(webview.htmlMessages).toContainEqual({
      type: 'sapTools.messageHeightLimitSettingInit',
      limitMessageHeight: true,
    });

    await (provider as unknown as {
      handleWebviewMessage(message: unknown): Promise<void>;
    }).handleWebviewMessage({
      type: 'sapTools.saveMessageHeightLimitSetting',
      limitMessageHeight: false,
    });

    expect(update).toHaveBeenCalledWith('cfLogsPanel.limitMessageHeight', false);
  });
});
