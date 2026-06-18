import { runCfSshCommandFromTarget } from './cfClient';

const SIGNAL_NODE_INSPECTOR_TIMEOUT_MS = 15_000;

const SIGNAL_NODE_INSPECTOR_COMMAND = [
  'inspector_url="http://127.0.0.1:9229/json/list"',
  'inspector_ready() { ((command -v curl >/dev/null 2>&1 && curl -fsS --max-time 1 "$inspector_url" >/dev/null 2>&1) || (command -v wget >/dev/null 2>&1 && wget -qO- -T 1 "$inspector_url" >/dev/null 2>&1)); }',
  'if inspector_ready; then',
  'echo saptools-inspector-ready',
  'exit 0',
  'fi',
  'node_pid=""',
  'best_score=-1',
  'for pid_dir in /proc/[0-9]*; do',
  '[ -d "$pid_dir" ] || continue',
  'node_exe="$(readlink "$pid_dir/exe" 2>/dev/null || true)"',
  '[ "${node_exe##*/}" = "node" ] || continue',
  'node_cmdline="$(tr "\\000" " " < "$pid_dir/cmdline" 2>/dev/null || true)"',
  '[ -n "$node_cmdline" ] || continue',
  'score=10',
  'if printf "%s\\n" "$node_cmdline" | grep -Eq "@sap/cds|cds/bin/serve|serve\\.js|server\\.js|app\\.js|dist|build|index\\.js"; then',
  'score=20',
  'fi',
  'if [ "$score" -gt "$best_score" ]; then',
  'best_score="$score"',
  'node_pid="${pid_dir##*/}"',
  'fi',
  'done',
  'if [ -z "$node_pid" ]; then',
  'echo saptools-inspector-node-not-found',
  'exit 0',
  'fi',
  'echo "saptools-inspector-node-pid=$node_pid"',
  'if kill -USR1 "$node_pid" 2>/dev/null; then',
  'echo saptools-inspector-signaled',
  'else',
  'echo saptools-inspector-signal-failed',
  'exit 0',
  'fi',
  'attempt=0',
  'while [ "$attempt" -lt 20 ]; do',
  'if inspector_ready; then',
  'echo saptools-inspector-ready',
  'exit 0',
  'fi',
  'attempt=$((attempt + 1))',
  'sleep 0.25',
  'done',
  'echo saptools-inspector-not-ready',
].join('\n');

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
    return hasInspectorReadyMarker(stdout);
  } catch {
    return false;
  }
}

function hasInspectorReadyMarker(stdout: string): boolean {
  const markers = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  return markers.includes('saptools-inspector-ready');
}
