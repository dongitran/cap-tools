import { runCfSshCommandFromTarget } from './cfClient';

const SIGNAL_NODE_INSPECTOR_TIMEOUT_MS = 15_000;

const SIGNAL_NODE_INSPECTOR_COMMAND = [
  "node_pid=\"$(ps -eo pid=,comm= 2>/dev/null | awk '$2 == \"node\" { pid=$1 } END { print pid }')\"",
  'if [ -n "$node_pid" ]; then',
  'kill -USR1 "$node_pid" 2>/dev/null && echo saptools-inspector-signaled || echo saptools-inspector-signal-failed',
  'else',
  'echo saptools-inspector-node-not-found',
  'fi',
].join('; ');

export async function tryStartNodeInspector(params: {
  readonly appName: string;
  readonly cfHomeDir?: string;
  readonly instanceIndex: number;
}): Promise<boolean> {
  try {
    const commandParams = {
      appName: params.appName,
      instanceIndex: params.instanceIndex,
      command: SIGNAL_NODE_INSPECTOR_COMMAND,
      timeoutMs: SIGNAL_NODE_INSPECTOR_TIMEOUT_MS,
      failureMessage: 'Failed to request Node Inspector startup.',
    };
    const stdout = await runCfSshCommandFromTarget(
      params.cfHomeDir === undefined ? commandParams : { ...commandParams, cfHomeDir: params.cfHomeDir }
    );
    return stdout.includes('saptools-inspector-signaled');
  } catch {
    return false;
  }
}
