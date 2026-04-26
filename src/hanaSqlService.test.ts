// cspell:ignore mypw s3cret
import { describe, expect, test } from 'vitest';

import {
  HanaQueryError,
  classifyHanaSqlStatement,
  executeHanaQuery,
  formatHanaCellValue,
  normalizeSingleHanaStatement,
  sanitizeHanaErrorMessage,
  type HdbClient,
  type HdbExecCallback,
  type HdbRow,
  type HdbRowsOrAffected,
  type HdbStatement,
} from './hanaSqlService';

interface FakeStatementMetadata {
  readonly columnDisplayName?: string;
  readonly columnName?: string;
  readonly displayName?: string;
}

interface FakeStatementOptions {
  readonly metadata?: readonly FakeStatementMetadata[];
  readonly rowsOrAffected?: HdbRowsOrAffected;
  readonly execError?: Error;
}

interface FakeClientOptions {
  readonly connectError?: Error;
  readonly prepareError?: Error;
  readonly statement?: FakeStatementOptions;
  readonly disconnectError?: Error;
}

interface FakeClientCallLog {
  readonly events: string[];
}

function createFakeClient(
  options: FakeClientOptions = {}
): { client: HdbClient; log: FakeClientCallLog } {
  const events: string[] = [];
  const statementOptions = options.statement ?? {};
  const fakeStatement: HdbStatement = {
    resultSetMetadata: statementOptions.metadata,
    exec: (_values, callback: HdbExecCallback) => {
      events.push('statement.exec');
      setImmediate(() => {
        if (statementOptions.execError !== undefined) {
          callback(statementOptions.execError, 0);
          return;
        }
        callback(null, statementOptions.rowsOrAffected ?? []);
      });
    },
    drop: (callback) => {
      events.push('statement.drop');
      setImmediate(() => callback?.(null));
    },
  };

  const fakeClient: HdbClient = {
    connect: (callback) => {
      events.push('client.connect');
      setImmediate(() => callback(options.connectError ?? null));
    },
    prepare: (sql, callback) => {
      events.push(`client.prepare:${sql}`);
      setImmediate(() => {
        if (options.prepareError !== undefined) {
          callback(options.prepareError, fakeStatement);
          return;
        }
        callback(null, fakeStatement);
      });
    },
    disconnect: (callback) => {
      events.push('client.disconnect');
      setImmediate(() => callback?.(options.disconnectError ?? null));
    },
    close: () => {
      events.push('client.close');
    },
    on: () => {
      // no-op
    },
  };

  return { client: fakeClient, log: { events } };
}

describe('executeHanaQuery (rows)', () => {
  test('uses resultSetMetadata column names when provided and maps rows in column order', async () => {
    const rows: HdbRow[] = [
      { ID: 42, NAME: 'alice' },
      { ID: 7, NAME: 'bob' },
    ];
    const { client, log } = createFakeClient({
      statement: {
        metadata: [{ columnDisplayName: 'ID' }, { columnDisplayName: 'NAME' }],
        rowsOrAffected: rows,
      },
    });

    const result = await executeHanaQuery(
      { host: 'h', port: 443, user: 'u', password: 'p' },
      'SELECT ID, NAME FROM USERS',
      { clientFactory: () => client }
    );

    expect(result.kind).toBe('resultset');
    if (result.kind !== 'resultset') return;
    expect(result.columns).toEqual(['ID', 'NAME']);
    expect(result.rows).toEqual([
      ['42', 'alice'],
      ['7', 'bob'],
    ]);
    expect(result.rowCount).toBe(2);
    expect(log.events).toContain('client.connect');
    expect(log.events).toContain('client.prepare:SELECT ID, NAME FROM USERS');
    expect(log.events).toContain('statement.drop');
    expect(log.events).toContain('client.disconnect');
  });

  test('decodes text-like Buffer values while mapping rows', async () => {
    const payload =
      '{"status":"Success","message":"This is mock data for testing","timestamp":"2026-04-08T03:10:07.482Z"}';
    const rows: HdbRow[] = [{ ID: 1, PAYLOAD: Buffer.from(payload, 'utf8') }];
    const { client } = createFakeClient({
      statement: {
        metadata: [{ columnDisplayName: 'ID' }, { columnDisplayName: 'PAYLOAD' }],
        rowsOrAffected: rows,
      },
    });

    const result = await executeHanaQuery(
      { host: 'h', port: 443, user: 'u', password: 'p' },
      'SELECT ID, PAYLOAD FROM SAMPLE_MESSAGES',
      { clientFactory: () => client }
    );

    expect(result.kind).toBe('resultset');
    if (result.kind !== 'resultset') return;
    expect(result.rows).toEqual([['1', payload]]);
  });

  test('falls back to row keys when statement metadata is absent', async () => {
    const rows: HdbRow[] = [{ FOO: 1, BAR: 'x' }];
    const { client } = createFakeClient({
      statement: { rowsOrAffected: rows },
    });

    const result = await executeHanaQuery(
      { host: 'h', port: 443, user: 'u', password: 'p' },
      'SELECT FOO, BAR FROM T',
      { clientFactory: () => client }
    );

    if (result.kind !== 'resultset') throw new Error('expected resultset');
    expect(result.columns).toEqual(['FOO', 'BAR']);
    expect(result.rows).toEqual([['1', 'x']]);
  });

  test('returns empty rows array with no columns when query returns nothing and metadata is absent', async () => {
    const { client } = createFakeClient({
      statement: { rowsOrAffected: [] },
    });

    const result = await executeHanaQuery(
      { host: 'h', port: 443, user: 'u', password: 'p' },
      'SELECT 1 FROM EMPTY',
      { clientFactory: () => client }
    );

    if (result.kind !== 'resultset') throw new Error('expected resultset');
    expect(result.columns).toEqual([]);
    expect(result.rows).toEqual([]);
    expect(result.rowCount).toBe(0);
  });
});

describe('executeHanaQuery (status)', () => {
  test('renders 1 row affected message for affected count of 1', async () => {
    const { client } = createFakeClient({
      statement: { rowsOrAffected: 1 },
    });

    const result = await executeHanaQuery(
      { host: 'h', port: 443, user: 'u', password: 'p' },
      "UPDATE ORDERS SET STATUS = 'OPEN'",
      { clientFactory: () => client }
    );

    expect(result.kind).toBe('status');
    if (result.kind !== 'status') return;
    expect(result.message).toBe('1 row affected.');
  });

  test('renders pluralized message for affected counts other than 1', async () => {
    const { client } = createFakeClient({
      statement: { rowsOrAffected: 0 },
    });

    const result = await executeHanaQuery(
      { host: 'h', port: 443, user: 'u', password: 'p' },
      'DELETE FROM ORDERS WHERE 1 = 0',
      { clientFactory: () => client }
    );

    if (result.kind !== 'status') throw new Error('expected status');
    expect(result.message).toBe('0 rows affected.');
  });
});

describe('executeHanaQuery (error mapping)', () => {
  test('maps HANA auth code 10 to auth error kind', async () => {
    const { client } = createFakeClient({
      connectError: Object.assign(new Error('authentication failed'), { code: 10 }),
    });

    await expect(
      executeHanaQuery(
        { host: 'h', port: 443, user: 'u', password: 'p' },
        'SELECT 1 FROM DUMMY',
        { clientFactory: () => client }
      )
    ).rejects.toMatchObject({
      kind: 'auth',
      message: 'authentication failed',
    });
  });

  test('maps ECONNREFUSED on connect to connection error kind', async () => {
    const error = Object.assign(new Error('connect ECONNREFUSED 1.2.3.4:443'), {
      code: 'ECONNREFUSED',
    });
    const { client } = createFakeClient({ connectError: error });

    await expect(
      executeHanaQuery(
        { host: 'h', port: 443, user: 'u', password: 'p' },
        'SELECT 1 FROM DUMMY',
        { clientFactory: () => client }
      )
    ).rejects.toMatchObject({
      kind: 'connection',
    });
  });

  test('maps SQL syntax errors during exec to sql error kind', async () => {
    const { client } = createFakeClient({
      statement: {
        execError: Object.assign(new Error('sql syntax error: incorrect syntax near "broken"'), {
          code: 257,
        }),
      },
    });

    await expect(
      executeHanaQuery(
        { host: 'h', port: 443, user: 'u', password: 'p' },
        'SELECT broken',
        { clientFactory: () => client }
      )
    ).rejects.toMatchObject({
      kind: 'sql',
      exitCode: 257,
    });
  });

  test('still drops the statement and disconnects after SQL exec error', async () => {
    const { client, log } = createFakeClient({
      statement: {
        execError: new Error('boom'),
      },
    });

    await expect(
      executeHanaQuery(
        { host: 'h', port: 443, user: 'u', password: 'p' },
        'SELECT 1',
        { clientFactory: () => client }
      )
    ).rejects.toBeInstanceOf(HanaQueryError);

    expect(log.events).toContain('statement.drop');
    expect(log.events).toContain('client.disconnect');
  });

  test('rejects empty SQL with HanaQueryError of kind empty without contacting hdb', async () => {
    let invoked = false;
    await expect(
      executeHanaQuery(
        { host: 'h', port: 443, user: 'u', password: 'p' },
        '   ;   ',
        {
          clientFactory: () => {
            invoked = true;
            const { client } = createFakeClient();
            return client;
          },
        }
      )
    ).rejects.toMatchObject({ kind: 'empty' });
    expect(invoked).toBe(false);
  });

  test('rejects multi-statement SQL before invoking the client', async () => {
    let invoked = false;
    await expect(
      executeHanaQuery(
        { host: 'h', port: 443, user: 'u', password: 'p' },
        'SELECT 1 FROM DUMMY; DROP TABLE X',
        {
          clientFactory: () => {
            invoked = true;
            const { client } = createFakeClient();
            return client;
          },
        }
      )
    ).rejects.toMatchObject({
      kind: 'sql',
      message: 'Only one SQL statement can be executed at a time.',
    });
    expect(invoked).toBe(false);
  });

  test('honors timeout when connect never resolves', async () => {
    const stalledClient: HdbClient = {
      connect: () => {
        /* never calls back */
      },
      prepare: (_sql, callback) => {
        callback(null, {
          exec: (_values, cb) => cb(null, []),
          drop: (cb) => cb?.(null),
        });
      },
      disconnect: (callback) => callback?.(null),
      close: () => {
        /* noop */
      },
    };

    await expect(
      executeHanaQuery(
        { host: 'h', port: 443, user: 'u', password: 'p' },
        'SELECT 1 FROM DUMMY',
        {
          clientFactory: () => stalledClient,
          timeoutMs: 30,
        }
      )
    ).rejects.toMatchObject({ kind: 'timeout' });
  });
});

describe('formatHanaCellValue', () => {
  test('returns empty string for null and undefined', () => {
    expect(formatHanaCellValue(null)).toBe('');
    expect(formatHanaCellValue(undefined)).toBe('');
  });

  test('passes strings through unchanged', () => {
    expect(formatHanaCellValue('hello')).toBe('hello');
  });

  test('stringifies numbers, bigints, and booleans', () => {
    expect(formatHanaCellValue(42)).toBe('42');
    expect(formatHanaCellValue(BigInt('9007199254740993'))).toBe('9007199254740993');
    expect(formatHanaCellValue(true)).toBe('true');
  });

  test('renders Date as ISO string', () => {
    const date = new Date('2026-04-25T12:34:56.000Z');
    expect(formatHanaCellValue(date)).toBe('2026-04-25T12:34:56.000Z');
  });

  test('renders UTF-8 JSON Buffer as readable text', () => {
    const payload =
      '{"status":"Success","message":"This is mock data for testing","timestamp":"2026-04-08T03:10:07.482Z"}';
    expect(formatHanaCellValue(Buffer.from(payload, 'utf8'))).toBe(payload);
  });

  test('renders multiline UTF-8 text Buffer as readable text', () => {
    expect(formatHanaCellValue(Buffer.from('first line\nsecond line\twith tab', 'utf8'))).toBe(
      'first line\nsecond line\twith tab'
    );
  });

  test('renders binary Buffer as hex prefixed with 0x', () => {
    const buffer = Buffer.from([0xab, 0xcd, 0x10]);
    expect(formatHanaCellValue(buffer)).toBe('0xabcd10');
  });

  test('renders invalid UTF-8 Buffer as hex', () => {
    const buffer = Buffer.from([0xc3, 0x28]);
    expect(formatHanaCellValue(buffer)).toBe('0xc328');
  });

  test('serializes plain objects as JSON', () => {
    expect(formatHanaCellValue({ x: 1, y: 'z' })).toBe('{"x":1,"y":"z"}');
  });
});

describe('classifyHanaSqlStatement', () => {
  test('recognizes readonly statements', () => {
    expect(classifyHanaSqlStatement('SELECT 1 FROM DUMMY')).toBe('readonly');
    expect(classifyHanaSqlStatement('  WITH x AS (SELECT 1) SELECT * FROM x')).toBe('readonly');
    expect(classifyHanaSqlStatement('-- comment\nSELECT 1')).toBe('readonly');
  });

  test('recognizes mutating statements', () => {
    expect(classifyHanaSqlStatement("UPDATE ORDERS SET STATUS = 'OPEN'")).toBe('mutating');
    expect(classifyHanaSqlStatement('DELETE FROM ORDERS')).toBe('mutating');
    expect(classifyHanaSqlStatement('CREATE TABLE T (ID INT)')).toBe('mutating');
  });

  test('recognizes empty statements', () => {
    expect(classifyHanaSqlStatement('   ')).toBe('empty');
    expect(classifyHanaSqlStatement('-- only comment\n')).toBe('empty');
  });
});

describe('normalizeSingleHanaStatement', () => {
  test('strips trailing semicolon and whitespace', () => {
    expect(normalizeSingleHanaStatement('SELECT 1 ;  ')).toBe('SELECT 1');
  });

  test('returns empty string for blank input', () => {
    expect(normalizeSingleHanaStatement('   ')).toBe('');
    expect(normalizeSingleHanaStatement(';')).toBe('');
  });

  test('throws sql error for multiple statements outside literals', () => {
    expect(() => normalizeSingleHanaStatement('SELECT 1; SELECT 2')).toThrowError(
      /one SQL statement/
    );
  });

  test('does not flag semicolons inside string literals', () => {
    expect(normalizeSingleHanaStatement("SELECT 'a;b' FROM DUMMY")).toBe(
      "SELECT 'a;b' FROM DUMMY"
    );
  });
});

describe('sanitizeHanaErrorMessage', () => {
  test('redacts inline secrets passed by the caller', () => {
    expect(sanitizeHanaErrorMessage('login failed for s3cret', ['s3cret'])).toBe(
      'login failed for [redacted]'
    );
  });

  test('redacts password=value patterns even without an explicit secret list', () => {
    expect(sanitizeHanaErrorMessage('connect: password=mypw failed')).toBe(
      'connect: password=[redacted] failed'
    );
  });
});

describe('HanaQueryError', () => {
  test('stores kind and exit code', () => {
    const err = new HanaQueryError('connection', 'refused', 42);

    expect(err.kind).toBe('connection');
    expect(err.exitCode).toBe(42);
    expect(err.message).toBe('refused');
    expect(err.name).toBe('HanaQueryError');
  });

  test('defaults exit code to null', () => {
    const err = new HanaQueryError('auth', 'bad password');

    expect(err.exitCode).toBeNull();
  });
});
