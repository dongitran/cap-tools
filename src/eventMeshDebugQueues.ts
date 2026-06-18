/** Path segment used for every debug queue this extension creates. */
export const DEBUG_QUEUE_SEGMENT = 'saptools-debug';

/** Leftover queues younger than this may belong to another active VS Code window. */
export const STALE_DEBUG_QUEUE_MAX_AGE_MS = 6 * 60 * 60 * 1000;

export function parseDebugQueueCreatedAt(queueName: string, namespace: string): number | null {
  const prefix = `${namespace}/${DEBUG_QUEUE_SEGMENT}/`;
  if (!queueName.startsWith(prefix)) {
    return null;
  }

  const runId = queueName.slice(prefix.length).split('/')[0] ?? '';
  const timestampPart = runId.split('-')[0] ?? '';
  if (timestampPart.length < 8 || !/^[0-9a-z]+$/i.test(timestampPart)) {
    return null;
  }

  const timestamp = Number.parseInt(timestampPart, 36);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function isStaleDebugQueueName(
  queueName: string,
  namespace: string,
  nowMs: number
): boolean {
  const createdAt = parseDebugQueueCreatedAt(queueName, namespace);
  if (createdAt === null) {
    return false;
  }
  return nowMs - createdAt > STALE_DEBUG_QUEUE_MAX_AGE_MS;
}
