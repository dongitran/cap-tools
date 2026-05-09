import { resolveHanaSqlTargetTableName } from './hanaSqlWorkbenchSupport';

export function sanitizeSqlLogValue(value: string): string {
  return value.replaceAll(/[\r\n\t]+/g, ' ').slice(0, 500);
}

export function sanitizeSqlCommandLogValue(value: string): string {
  return sanitizeSqlLogValue(redactSqlStringLiteralsForLog(value));
}

export function resolveSqlResultTableName(sql: string): string {
  return resolveHanaSqlTargetTableName(sql) ?? 'SQL statement';
}

export function toPositiveViewColumnNumber(
  viewColumn: number | undefined
): number | undefined {
  if (viewColumn === undefined) {
    return undefined;
  }
  return viewColumn > 0 ? viewColumn : undefined;
}

export async function delayTestModeTableLoadIfConfigured(): Promise<void> {
  await delayE2eMsFromEnv('SAP_TOOLS_E2E_TESTMODE_TABLES_DELAY_MS');
}

export async function delayE2eQuickSelectIfConfigured(): Promise<void> {
  await delayE2eMsFromEnv('SAP_TOOLS_E2E_QUICK_SELECT_DELAY_MS');
}

function redactSqlStringLiteralsForLog(value: string): string {
  let redacted = '';
  let index = 0;
  while (index < value.length) {
    if (value[index] !== "'") {
      redacted += value[index] ?? '';
      index += 1;
      continue;
    }
    redacted += "'[literal]'";
    index = skipSqlStringLiteralForLog(value, index);
  }
  return redacted;
}

function skipSqlStringLiteralForLog(value: string, start: number): number {
  for (let index = start + 1; index < value.length; index += 1) {
    if (value[index] !== "'") continue;
    if (value[index + 1] === "'") {
      index += 1;
      continue;
    }
    return index + 1;
  }
  return value.length;
}

async function delayE2eMsFromEnv(envName: string): Promise<void> {
  const delayMs = resolveE2eDelayMs(envName);
  if (delayMs === 0) {
    return;
  }
  await new Promise<void>((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

function resolveE2eDelayMs(envName: string): number {
  if (process.env['SAP_TOOLS_E2E'] !== '1') {
    return 0;
  }

  const rawDelay = process.env[envName] ?? '';
  const parsedDelay = Number.parseInt(rawDelay, 10);
  if (!Number.isFinite(parsedDelay) || parsedDelay <= 0) {
    return 0;
  }

  return Math.min(parsedDelay, 30_000);
}
