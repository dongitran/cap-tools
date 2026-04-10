import { spawn, execFile } from 'child_process';
import { promisify } from 'util';
import type { ChildProcess } from 'child_process';
import type { LogEntry, LogLevel, LogSessionStatus, LogSourceType } from '../types/index.js';
import { logger } from './logger.js';

const execFileAsync = promisify(execFile);

let nextId = 0;

// CF log format: TIMESTAMP [SOURCE/INSTANCE] OUT|ERR MESSAGE
// e.g.: 2024-01-15T10:30:45.123+0000 [APP/PROC/WEB/0] OUT {"level":"info","msg":"started"}
const LOG_LINE_RE = /^(\S+)\s+\[([^\]]+)\]\s+(OUT|ERR)\s(.*)$/;

// Strip ANSI escape sequences from CF CLI colorised output
function stripAnsi(s: string): string {
  return s.replace(/\u001B\[[0-9;]*[a-zA-Z]/g, '');
}

function getSourceType(source: string): LogSourceType {
  const prefix = (source.split('/')[0] ?? '').toUpperCase();
  const VALID: readonly LogSourceType[] = ['APP', 'RTR', 'API', 'CELL', 'SSH', 'STG', 'LGR'];
  return (VALID as readonly string[]).includes(prefix) ? (prefix as LogSourceType) : 'OTHER';
}

function normalizeLevel(raw: string): LogLevel | undefined {
  const l = raw.toLowerCase();
  if (l === 'trace') { return 'trace'; }
  if (l === 'debug') { return 'debug'; }
  if (l === 'info' || l === 'information') { return 'info'; }
  if (l === 'warn' || l === 'warning') { return 'warn'; }
  if (l === 'error' || l === 'err') { return 'error'; }
  if (l === 'fatal' || l === 'critical') { return 'fatal'; }
  return undefined;
}

function extractLevelFromJson(data: Record<string, unknown>): LogLevel | undefined {
  const raw = data['level'] ?? data['lvl'] ?? data['severity'] ?? data['Level'];
  if (typeof raw !== 'string') { return undefined; }
  return normalizeLevel(raw);
}

function detectLevelFromText(text: string): LogLevel | undefined {
  const t = text.toLowerCase();
  if (/\b(fatal|critical)\b/.test(t)) { return 'fatal'; }
  if (/\b(error|err\b|exception|fail(ed)?)\b/.test(t)) { return 'error'; }
  if (/\bwarn(ing)?\b/.test(t)) { return 'warn'; }
  if (/\binfo(rmation)?\b/.test(t)) { return 'info'; }
  if (/\b(debug|trace)\b/.test(t)) { return 'debug'; }
  return undefined;
}

export function parseLogLine(raw: string): LogEntry | null {
  const clean = stripAnsi(raw.trim());
  const m = LOG_LINE_RE.exec(clean);
  if (!m) { return null; }

  // All capture groups are required in the regex, so they are always strings
  const [, timestamp, source, streamRaw, message] = m as unknown as [string, string, string, string, string];

  const sourceType = getSourceType(source);
  const stream: 'OUT' | 'ERR' = streamRaw === 'ERR' ? 'ERR' : 'OUT';

  let level: LogLevel | undefined;
  let jsonData: Record<string, unknown> | undefined;

  const trimmed = message.trim();
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        jsonData = parsed as Record<string, unknown>;
        level = extractLevelFromJson(jsonData);
      }
    } catch {
      // not valid JSON — treat as plain text
    }
  }

  level ??= stream === 'ERR' ? 'error' : detectLevelFromText(message);

  return {
    id: ++nextId,
    timestamp,
    source,
    sourceType,
    stream,
    message,
    ...(level !== undefined ? { level } : {}),
    ...(jsonData !== undefined ? { jsonData } : {}),
  };
}

type EntryCallback = (entry: LogEntry) => void;
type StatusCallback = (status: LogSessionStatus, error?: string) => void;

export class LogsManager {
  private proc: ChildProcess | undefined;
  private _currentApp: string | undefined;
  private entryCallback: EntryCallback | undefined;
  private statusCallback: StatusCallback | undefined;
  private firstEntry = true;

  setCallbacks(onEntry: EntryCallback, onStatus: StatusCallback): void {
    this.entryCallback = onEntry;
    this.statusCallback = onStatus;
  }

  startStreaming(appName: string): void {
    this.stop();
    this._currentApp = appName;
    this.firstEntry = true;
    this.statusCallback?.('CONNECTING');

    const proc = spawn('cf', ['logs', appName], {
      shell: false,
      env: process.env,
    });
    this.proc = proc;

    let buf = '';

    const onData = (chunk: Buffer | string): void => {
      buf += chunk.toString();
      const lines = buf.split('\n');
      buf = lines.pop() ?? /* keep incomplete trailing line */ '';
      for (const line of lines) {
        if (!line.trim()) { continue; }
        const entry = parseLogLine(line);
        if (entry !== null) {
          if (this.firstEntry) {
            this.firstEntry = false;
            this.statusCallback?.('STREAMING');
          }
          this.entryCallback?.(entry);
        }
      }
    };

    // stdout/stderr may be null — guarded by the eslint disable
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    proc.stdout?.on('data', onData);
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    proc.stderr?.on('data', onData);

    proc.on('error', err => {
      logger.error(`cf logs error for ${appName}`, err);
      this.proc = undefined;
      this.statusCallback?.('ERROR', err.message);
    });

    proc.on('close', () => {
      logger.info(`cf logs for ${appName} closed`);
      this.proc = undefined;
      if (this._currentApp === appName) {
        this.statusCallback?.('STOPPED');
      }
    });

    logger.info(`Started cf logs streaming for ${appName} (pid=${String(proc.pid ?? '?')})`);
  }

  async loadRecent(appName: string): Promise<void> {
    this.stop();
    this._currentApp = appName;
    this.statusCallback?.('CONNECTING');

    try {
      const { stdout } = await execFileAsync('cf', ['logs', appName, '--recent'], {
        timeout: 30_000,
        maxBuffer: 10 * 1024 * 1024,
        env: process.env,
      });

      const lines = stdout.split('\n');
      for (const line of lines) {
        if (!line.trim()) { continue; }
        const entry = parseLogLine(line);
        if (entry !== null) { this.entryCallback?.(entry); }
      }
      this.statusCallback?.('STOPPED');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`cf logs --recent failed for ${appName}`, err);
      this.statusCallback?.('ERROR', msg);
    }
  }

  stop(): void {
    if (this.proc !== undefined) {
      this.proc.kill('SIGTERM');
      this.proc = undefined;
    }
    this._currentApp = undefined;
  }

  isStreaming(): boolean {
    return this.proc !== undefined;
  }

  get currentApp(): string | undefined {
    return this._currentApp;
  }

  dispose(): void {
    this.stop();
    this.entryCallback = undefined;
    this.statusCallback = undefined;
  }
}
