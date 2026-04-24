// cspell:words hdbsql ondemand tenantdb
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const HDBSQL_MAX_BUFFER_BYTES = 16 * 1024 * 1024;
const HDBSQL_DEFAULT_TIMEOUT_MS = 30_000;

export interface HanaConnection {
  readonly host: string;
  readonly port: number;
  readonly user: string;
  readonly password: string;
  readonly database?: string;
}

export interface HanaQueryResultSet {
  readonly kind: 'resultset';
  readonly columns: string[];
  readonly rows: string[][];
  readonly rowCount: number;
  readonly elapsedMs: number;
}

export interface HanaQueryStatus {
  readonly kind: 'status';
  readonly message: string;
  readonly elapsedMs: number;
}

export type HanaQueryResult = HanaQueryResultSet | HanaQueryStatus;

export type HanaSqlStatementKind = 'empty' | 'readonly' | 'mutating';

export type HanaQueryErrorKind =
  | 'hdbsql-missing'
  | 'connection'
  | 'auth'
  | 'sql'
  | 'timeout'
  | 'empty'
  | 'unknown';

export class HanaQueryError extends Error {
  readonly kind: HanaQueryErrorKind;
  readonly exitCode: number | null;

  constructor(kind: HanaQueryErrorKind, message: string, exitCode: number | null = null) {
    super(message);
    this.name = 'HanaQueryError';
    this.kind = kind;
    this.exitCode = exitCode;
  }
}

export interface ExecuteHanaQueryOptions {
  readonly timeoutMs?: number;
  readonly hdbsqlPath?: string;
}

interface HdbsqlInvocationResult {
  readonly stdout: string;
  readonly stderr: string;
}

/**
 * Execute a single SQL statement against a HANA instance via the `hdbsql` CLI.
 *
 * Callers must have the SAP HANA Client installed and `hdbsql` on PATH. The
 * password is passed via the `-p` flag; this project accepts that trade-off
 * to keep the feature free of native driver dependencies. For scripts that
 * need stronger secrecy, use `hdbuserstore` and a custom `hdbsqlPath`.
 */
export async function executeHanaQuery(
  connection: HanaConnection,
  sql: string,
  options: ExecuteHanaQueryOptions = {}
): Promise<HanaQueryResult> {
  const trimmedSql = normalizeSingleHanaStatement(sql);
  if (trimmedSql.length === 0) {
    throw new HanaQueryError('empty', 'Query is empty.');
  }

  const args = buildHdbsqlArgs(connection, trimmedSql);
  const timeoutMs = options.timeoutMs ?? HDBSQL_DEFAULT_TIMEOUT_MS;
  const hdbsqlPath = options.hdbsqlPath ?? 'hdbsql';

  const started = Date.now();
  let invocation: HdbsqlInvocationResult;
  try {
    invocation = await invokeHdbsql(hdbsqlPath, args, timeoutMs);
  } catch (error) {
    throw toHanaQueryError(error);
  }
  const elapsedMs = Date.now() - started;

  const stderrTrim = invocation.stderr.trim();
  if (stderrTrim.length > 0 && !isIgnorableStderr(stderrTrim)) {
    throw classifyStderr(stderrTrim);
  }

  return parseHdbsqlOutput(invocation.stdout, elapsedMs);
}

export function classifyHanaSqlStatement(sql: string): HanaSqlStatementKind {
  const normalized = stripLeadingSqlComments(sql).trim().toUpperCase();
  if (normalized.length === 0) {
    return 'empty';
  }

  const firstToken = /^[A-Z]+/.exec(normalized)?.[0] ?? '';
  if (['SELECT', 'WITH', 'EXPLAIN', 'DESCRIBE'].includes(firstToken)) {
    return 'readonly';
  }

  return 'mutating';
}

export function normalizeSingleHanaStatement(sql: string): string {
  const trimmedSql = sql.trim().replace(/;\s*$/, '').trim();
  if (trimmedSql.length === 0) {
    return '';
  }
  if (hasSqlDelimiterOutsideLiteral(trimmedSql)) {
    throw new HanaQueryError('sql', 'Only one SQL statement can be executed at a time.');
  }
  return trimmedSql;
}

export function sanitizeHanaErrorMessage(
  message: string,
  secrets: readonly string[] = []
): string {
  let sanitized = message;
  for (const secret of secrets) {
    if (secret.length === 0) {
      continue;
    }
    sanitized = sanitized.split(secret).join('[redacted]');
  }
  return sanitized
    .replace(/(password\s*[=:]\s*)\S+/gi, '$1[redacted]')
    .replace(/(token\s*[=:]\s*)\S+/gi, '$1[redacted]')
    .replace(/(secret\s*[=:]\s*)\S+/gi, '$1[redacted]');
}

function buildHdbsqlArgs(connection: HanaConnection, sql: string): string[] {
  const args: string[] = [
    '-n',
    `${connection.host}:${String(connection.port)}`,
    '-u',
    connection.user,
    '-p',
    connection.password,
    '-a',
  ];

  const database = (connection.database ?? '').trim();
  if (database.length > 0) {
    args.push('-d', database);
  }

  args.push(sql);
  return args;
}

async function invokeHdbsql(
  command: string,
  args: string[],
  timeoutMs: number
): Promise<HdbsqlInvocationResult> {
  const { stdout, stderr } = await execFileAsync(command, args, {
    maxBuffer: HDBSQL_MAX_BUFFER_BYTES,
    timeout: timeoutMs,
    windowsHide: true,
  });
  return { stdout, stderr };
}

function toHanaQueryError(error: unknown): HanaQueryError {
  if (error !== null && typeof error === 'object') {
    const maybeError = error as {
      code?: unknown;
      killed?: unknown;
      stderr?: unknown;
      stdout?: unknown;
      message?: unknown;
    };

    if (maybeError.code === 'ENOENT') {
      return new HanaQueryError(
        'hdbsql-missing',
        'hdbsql CLI not found. Install the SAP HANA Client and ensure hdbsql is on PATH.'
      );
    }

    if (maybeError.killed === true) {
      return new HanaQueryError('timeout', 'hdbsql timed out.');
    }

    const stderrText = typeof maybeError.stderr === 'string' ? maybeError.stderr : '';
    const stdoutText = typeof maybeError.stdout === 'string' ? maybeError.stdout : '';
    const messageText = typeof maybeError.message === 'string' ? maybeError.message : '';
    const combined = [stderrText, stdoutText, messageText]
      .map((text) => text.trim())
      .filter((text) => text.length > 0)
      .join('\n');

    if (combined.length > 0) {
      return classifyStderr(combined);
    }
  }

  return new HanaQueryError('unknown', 'hdbsql invocation failed.');
}

function classifyStderr(text: string): HanaQueryError {
  const normalized = text.trim();

  if (/authentication failed|invalid user name or password|259|10/i.test(normalized)
      && /authentication/i.test(normalized)) {
    return new HanaQueryError('auth', normalized);
  }

  if (/cannot connect|connection refused|network|econn|unreachable|host not found/i.test(normalized)) {
    return new HanaQueryError('connection', normalized);
  }

  return new HanaQueryError('sql', normalized);
}

function isIgnorableStderr(stderr: string): boolean {
  return /^password:\s*$/i.test(stderr);
}

function stripLeadingSqlComments(sql: string): string {
  let remaining = sql.trimStart();
  let didStrip = true;
  while (didStrip) {
    didStrip = false;
    if (remaining.startsWith('--')) {
      const newlineIndex = remaining.indexOf('\n');
      remaining = newlineIndex >= 0 ? remaining.slice(newlineIndex + 1).trimStart() : '';
      didStrip = true;
    }
    if (remaining.startsWith('/*')) {
      const endIndex = remaining.indexOf('*/');
      remaining = endIndex >= 0 ? remaining.slice(endIndex + 2).trimStart() : '';
      didStrip = true;
    }
  }
  return remaining;
}

function hasSqlDelimiterOutsideLiteral(sql: string): boolean {
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index] ?? '';
    const next = sql[index + 1] ?? '';
    if (inLineComment && char === '\n') inLineComment = false;
    else if (inBlockComment && char === '*' && next === '/') {
      inBlockComment = false;
      index += 1;
    } else if (!inSingleQuote && !inDoubleQuote && !inLineComment && !inBlockComment) {
      if (char === '-' && next === '-') inLineComment = true;
      else if (char === '/' && next === '*') inBlockComment = true;
      else if (char === "'") inSingleQuote = true;
      else if (char === '"') inDoubleQuote = true;
      else if (char === ';') return true;
    } else if (inSingleQuote && char === "'") {
      if (next === "'") index += 1;
      else inSingleQuote = false;
    } else if (inDoubleQuote && char === '"') {
      inDoubleQuote = false;
    }
  }

  return false;
}

/**
 * Parse hdbsql's default pipe-delimited text output into a result set.
 *
 * Typical DQL output with `-a` (suppressed query echo):
 *   | COL1 | COL2 |
 *   | ---- | ---- |
 *   | a    | 1    |
 *   1 row selected (overall time 5 ms; server time 2 ms)
 *
 * DDL / DML output has no table, just a status line such as:
 *   0 rows affected (overall time 3 ms; server time 1 ms)
 */
export function parseHdbsqlOutput(stdout: string, elapsedMs: number): HanaQueryResult {
  const lines = stdout
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);

  const dataLines: string[] = [];
  const statusLines: string[] = [];
  for (const line of lines) {
    if (line.startsWith('|')) {
      dataLines.push(line);
      continue;
    }
    statusLines.push(line);
  }

  if (dataLines.length === 0) {
    const message = statusLines.length > 0 ? statusLines.join(' ') : 'Statement executed.';
    return { kind: 'status', message, elapsedMs };
  }

  const cells = dataLines.map(splitPipeRow);

  let separatorIndex = -1;
  for (let i = 1; i < cells.length; i += 1) {
    const row = cells[i];
    if (row?.every((cell) => /^-+$/.test(cell.trim()) || cell.trim().length === 0) === true) {
      separatorIndex = i;
      break;
    }
  }

  const headerRow = cells[0] ?? [];
  const columns = headerRow.map((cell) => cell.trim());
  const dataStart = separatorIndex >= 0 ? separatorIndex + 1 : 1;
  const rows = cells
    .slice(dataStart)
    .map((row) => row.map((cell) => cell.trim()));

  return {
    kind: 'resultset',
    columns,
    rows,
    rowCount: rows.length,
    elapsedMs,
  };
}

function splitPipeRow(line: string): string[] {
  const trimmed = line.replace(/^\|/, '').replace(/\|\s*$/, '');
  return trimmed.split('|');
}
