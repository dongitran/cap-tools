import { mkdir, open, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

const SAPTOOLS_DIR_NAME = '.saptools';
export const EVENT_MESH_QUEUE_REGISTRY_FILENAME = 'sap-tools-vscode-eventmesh-queues.json';
const LOCK_RETRY_MS = 50;
const LOCK_TIMEOUT_MS = 5000;
const STALE_LOCK_MS = 30000;

export interface EventMeshQueueRegistryEntry {
  readonly ownerPid: number;
  readonly ownerId: string;
  readonly appId: string;
  readonly bindingIndex: number;
  readonly bindingName: string;
  readonly bindingNamespace: string;
  readonly queueName: string;
  readonly createdAt: string;
}

let chain: Promise<unknown> = Promise.resolve();

interface RegistryLock {
  readonly handle: FileHandle;
  readonly lockPath: string;
}

function defaultRegistryPath(): string {
  return join(homedir(), SAPTOOLS_DIR_NAME, EVENT_MESH_QUEUE_REGISTRY_FILENAME);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isFileExistsError(error: unknown): boolean {
  return error instanceof Error && (error as NodeJS.ErrnoException).code === 'EEXIST';
}

async function acquireFileLock(filePath: string): Promise<RegistryLock> {
  const lockPath = `${filePath}.lock`;
  const deadline = Date.now() + LOCK_TIMEOUT_MS;
  await mkdir(dirname(filePath), { recursive: true });
  for (;;) {
    try {
      const handle = await open(lockPath, 'wx');
      await handle.writeFile(`${JSON.stringify({ ownerPid: process.pid, createdAt: Date.now() })}\n`, 'utf8');
      return { handle, lockPath };
    } catch (error) {
      if (!isFileExistsError(error) || Date.now() >= deadline) {
        throw error;
      }
      await maybeRemoveStaleLock(lockPath);
      await delay(LOCK_RETRY_MS);
    }
  }
}

async function maybeRemoveStaleLock(lockPath: string): Promise<void> {
  try {
    const parsed: unknown = JSON.parse(await readFile(lockPath, 'utf8'));
    if (!isRecord(parsed)) {
      return;
    }
    const ownerPid = readNumber(parsed, 'ownerPid');
    const createdAt = readNumber(parsed, 'createdAt');
    if (ownerPid === null || createdAt === null) {
      return;
    }
    if (Date.now() - createdAt > STALE_LOCK_MS && !isPidAlive(ownerPid)) {
      await unlink(lockPath);
    }
  } catch {
    // Another process may have released the lock between retries.
  }
}

async function releaseFileLock(lock: RegistryLock): Promise<void> {
  try {
    await lock.handle.close();
  } finally {
    try {
      await unlink(lock.lockPath);
    } catch {
      // Best-effort cleanup; a future writer can reap a stale lock if needed.
    }
  }
}

async function withFileLock<T>(filePath: string, work: () => Promise<T>): Promise<T> {
  const lock = await acquireFileLock(filePath);
  try {
    return await work();
  } finally {
    await releaseFileLock(lock);
  }
}

function serialize<T>(filePath: string, work: () => Promise<T>): Promise<T> {
  const next = chain.then(() => withFileLock(filePath, work), () => withFileLock(filePath, work));
  chain = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readNumber(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];
  return typeof value === 'number' && Number.isInteger(value) ? value : null;
}

function parseEntry(value: unknown): EventMeshQueueRegistryEntry | null {
  if (!isRecord(value)) {
    return null;
  }
  const ownerPid = readNumber(value, 'ownerPid');
  const bindingIndex = readNumber(value, 'bindingIndex');
  const ownerId = readString(value, 'ownerId');
  const appId = readString(value, 'appId');
  const bindingName = readString(value, 'bindingName');
  const bindingNamespace = readString(value, 'bindingNamespace');
  const queueName = readString(value, 'queueName');
  const createdAt = readString(value, 'createdAt');
  if (
    ownerPid === null ||
    bindingIndex === null ||
    ownerId === null ||
    appId === null ||
    bindingName === null ||
    bindingNamespace === null ||
    queueName === null ||
    createdAt === null
  ) {
    return null;
  }
  return { ownerPid, ownerId, appId, bindingIndex, bindingName, bindingNamespace, queueName, createdAt };
}

async function readEntries(filePath: string): Promise<EventMeshQueueRegistryEntry[]> {
  try {
    const raw = await readFile(filePath, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    const queues = isRecord(parsed) ? parsed['queues'] : undefined;
    return Array.isArray(queues) ? queues.flatMap((entry) => parseEntry(entry) ?? []) : [];
  } catch {
    return [];
  }
}

async function writeEntries(
  filePath: string,
  entries: readonly EventMeshQueueRegistryEntry[]
): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${String(process.pid)}.tmp`;
  await writeFile(tempPath, `${JSON.stringify({ queues: entries }, null, 2)}\n`, 'utf8');
  await rename(tempPath, filePath);
}

export function isPidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

export class EventMeshQueueRegistry {
  constructor(private readonly filePath: string = defaultRegistryPath()) {}

  async listQueues(): Promise<EventMeshQueueRegistryEntry[]> {
    return readEntries(this.filePath);
  }

  async recordQueue(entry: EventMeshQueueRegistryEntry): Promise<void> {
    await serialize(this.filePath, async () => {
      const entries = await readEntries(this.filePath);
      const next = entries.filter((candidate) => candidate.queueName !== entry.queueName);
      await writeEntries(this.filePath, [...next, entry]);
    });
  }

  async removeQueue(queueName: string): Promise<void> {
    await serialize(this.filePath, async () => {
      const entries = await readEntries(this.filePath);
      const next = entries.filter((entry) => entry.queueName !== queueName);
      if (next.length !== entries.length) {
        await writeEntries(this.filePath, next);
      }
    });
  }
}
