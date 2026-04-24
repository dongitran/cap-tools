import { describe, expect, test } from 'vitest';
import { HanaQueryError, parseHdbsqlOutput } from './hanaSqlService';

describe('parseHdbsqlOutput', () => {
  test('parses a two-column result set with a separator row', () => {
    const stdout = [
      '| CURRENT_USER | CURRENT_SCHEMA |',
      '| ------------ | -------------- |',
      '| TECH_USER    | MYSCHEMA       |',
      '1 row selected (overall time 10 ms; server time 3 ms)',
    ].join('\n');

    const result = parseHdbsqlOutput(stdout, 42);

    expect(result.kind).toBe('resultset');
    if (result.kind !== 'resultset') return;
    expect(result.columns).toEqual(['CURRENT_USER', 'CURRENT_SCHEMA']);
    expect(result.rows).toEqual([['TECH_USER', 'MYSCHEMA']]);
    expect(result.rowCount).toBe(1);
    expect(result.elapsedMs).toBe(42);
  });

  test('parses multiple data rows', () => {
    const stdout = [
      '| ID | NAME    |',
      '| -- | ------- |',
      '| 1  | alice   |',
      '| 2  | bob     |',
      '| 3  | charlie |',
      '3 rows selected',
    ].join('\n');

    const result = parseHdbsqlOutput(stdout, 0);

    expect(result.kind).toBe('resultset');
    if (result.kind !== 'resultset') return;
    expect(result.columns).toEqual(['ID', 'NAME']);
    expect(result.rows).toEqual([
      ['1', 'alice'],
      ['2', 'bob'],
      ['3', 'charlie'],
    ]);
    expect(result.rowCount).toBe(3);
  });

  test('handles empty result set (header with no data rows)', () => {
    const stdout = [
      '| COL_A |',
      '| ----- |',
      '0 rows selected',
    ].join('\n');

    const result = parseHdbsqlOutput(stdout, 0);

    expect(result.kind).toBe('resultset');
    if (result.kind !== 'resultset') return;
    expect(result.columns).toEqual(['COL_A']);
    expect(result.rows).toEqual([]);
    expect(result.rowCount).toBe(0);
  });

  test('returns status result for DDL / DML output without table', () => {
    const stdout = '0 rows affected (overall time 3 ms; server time 1 ms)';

    const result = parseHdbsqlOutput(stdout, 7);

    expect(result.kind).toBe('status');
    if (result.kind !== 'status') return;
    expect(result.message).toContain('0 rows affected');
    expect(result.elapsedMs).toBe(7);
  });

  test('returns status with default message when stdout is empty', () => {
    const result = parseHdbsqlOutput('', 0);

    expect(result.kind).toBe('status');
    if (result.kind !== 'status') return;
    expect(result.message).toBe('Statement executed.');
  });

  test('trims whitespace padding from cell values', () => {
    const stdout = [
      '|   ID   |   NAME          |',
      '| ------ | --------------- |',
      '|   42   |   hello world   |',
      '1 row selected',
    ].join('\n');

    const result = parseHdbsqlOutput(stdout, 0);

    expect(result.kind).toBe('resultset');
    if (result.kind !== 'resultset') return;
    expect(result.columns).toEqual(['ID', 'NAME']);
    expect(result.rows).toEqual([['42', 'hello world']]);
  });

  test('tolerates output without a separator row', () => {
    const stdout = [
      '| ID | NAME |',
      '| 1  | x    |',
      '1 row selected',
    ].join('\n');

    const result = parseHdbsqlOutput(stdout, 0);

    expect(result.kind).toBe('resultset');
    if (result.kind !== 'resultset') return;
    expect(result.columns).toEqual(['ID', 'NAME']);
    expect(result.rows).toEqual([['1', 'x']]);
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
