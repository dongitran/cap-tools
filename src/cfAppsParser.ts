export interface ParsedCfAppRow {
  readonly name: string;
  readonly requestedState: string;
  readonly runningInstances: number;
}

export function parseCfAppsOutput(stdout: string): ParsedCfAppRow[] {
  const lines = stdout.split(/\r?\n/);
  const headerIndex = lines.findIndex((line) => line.includes('requested state'));
  if (headerIndex < 0) {
    return [];
  }

  const rows: ParsedCfAppRow[] = [];

  for (const rawLine of lines.slice(headerIndex + 1)) {
    const line = rawLine.trim();
    if (line.length === 0) {
      continue;
    }

    const parts = line.split(/\s{2,}/);
    const name = parts[0]?.trim() ?? '';
    const requestedState = (parts[1]?.trim() ?? '').toLowerCase();
    const instancesToken = parts[2]?.trim() ?? '';

    if (name.length === 0 || requestedState.length === 0) {
      continue;
    }

    rows.push({
      name,
      requestedState,
      runningInstances:
        requestedState === 'started' ? parseRunningInstances(instancesToken) : 0,
    });
  }

  return rows;
}

function parseRunningInstances(instancesToken: string): number {
  if (instancesToken.length === 0) {
    return 0;
  }

  const regex = /(?:^|[, ])(?:[a-zA-Z0-9_-]+:)?(\d+)\/\d+/g;
  let totalRunningInstances = 0;
  let match = regex.exec(instancesToken);

  while (match !== null) {
    const parsedCount = Number.parseInt(match[1] ?? '0', 10);
    if (!Number.isNaN(parsedCount) && parsedCount > 0) {
      totalRunningInstances += parsedCount;
    }
    match = regex.exec(instancesToken);
  }

  return totalRunningInstances;
}
