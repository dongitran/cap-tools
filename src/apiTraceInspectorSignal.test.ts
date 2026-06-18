import { beforeEach, describe, expect, it, vi } from 'vitest';

const cfClientMocks = vi.hoisted(() => ({
  runCfSshCommandFromTarget: vi.fn(),
}));

vi.mock('./cfClient.js', () => cfClientMocks);

import { tryStartNodeInspector } from './apiTraceInspectorSignal';

interface SshCommandParams {
  readonly appName: string;
  readonly command: string;
  readonly cfHomeDir?: string;
  readonly instanceIndex?: number;
  readonly timeoutMs?: number;
  readonly failureMessage: string;
}

function lastSshParams(): SshCommandParams {
  const calls = cfClientMocks.runCfSshCommandFromTarget.mock.calls as [SshCommandParams][];
  const lastCall = calls.at(-1);
  if (lastCall === undefined) {
    throw new Error('Expected a CF SSH command to be issued.');
  }
  return lastCall[0];
}

describe('apiTraceInspectorSignal', () => {
  beforeEach(() => {
    cfClientMocks.runCfSshCommandFromTarget.mockReset();
  });

  it('builds a proc-based Node Inspector startup command for runtimes with non-node thread names', async () => {
    cfClientMocks.runCfSshCommandFromTarget.mockResolvedValue([
      'saptools-inspector-node-pid=42',
      'saptools-inspector-signaled',
      'saptools-inspector-ready',
    ].join('\n'));

    const started = await tryStartNodeInspector({
      appName: 'orders-api',
      cfHomeDir: '/tmp/cf-home',
      instanceIndex: 0,
    });

    const params = lastSshParams();
    expect(started).toBe(true);
    expect(params.appName).toBe('orders-api');
    expect(params.cfHomeDir).toBe('/tmp/cf-home');
    expect(params.instanceIndex).toBe(0);
    expect(params.command).toContain('/proc/[0-9]*');
    expect(params.command).toContain('readlink "$pid_dir/exe"');
    expect(params.command).toContain('"$pid_dir/cmdline"');
    expect(params.command).toContain('kill -USR1 "$node_pid"');
    expect(params.command).toContain('saptools-inspector-ready');
    expect(params.command).toContain('serve\\.js');
    expect(params.command).not.toContain('$2 == "node"');
    expect(params.command).not.toContain('/environ');
  });

  it('returns true when Inspector is already reachable before signaling', async () => {
    cfClientMocks.runCfSshCommandFromTarget.mockResolvedValue('saptools-inspector-ready\n');

    const started = await tryStartNodeInspector({
      appName: 'orders-api',
      instanceIndex: 0,
    });

    expect(started).toBe(true);
  });

  it.each([
    ['saptools-inspector-node-not-found\n'],
    ['saptools-inspector-signal-failed\n'],
    ['saptools-inspector-signaled\nsaptools-inspector-not-ready\n'],
  ])('returns false for unsuccessful Inspector startup marker output %#', async (stdout) => {
    cfClientMocks.runCfSshCommandFromTarget.mockResolvedValue(stdout);

    const started = await tryStartNodeInspector({
      appName: 'orders-api',
      instanceIndex: 0,
    });

    expect(started).toBe(false);
  });

  it('returns false when the CF SSH command fails', async () => {
    cfClientMocks.runCfSshCommandFromTarget.mockRejectedValue(new Error('ssh failed'));

    const started = await tryStartNodeInspector({
      appName: 'orders-api',
      instanceIndex: 0,
    });

    expect(started).toBe(false);
  });
});
