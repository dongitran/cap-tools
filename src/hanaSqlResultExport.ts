import type { HanaQueryResultSet } from './hanaSqlService';

export type HanaSqlResultExportFormat = 'csv' | 'json';

export function formatHanaSqlResultSetCsv(result: HanaQueryResultSet): string {
  return [
    result.columns.map(formatCsvCell).join(','),
    ...result.rows.map((row) => {
      return result.columns.map((_, index) => formatCsvCell(row[index] ?? '')).join(',');
    }),
  ].join('\n');
}

function formatCsvCell(value: string): string {
  if (!/[",\r\n]/.test(value)) {
    return value;
  }
  return `"${value.replaceAll('"', '""')}"`;
}

export function formatHanaSqlResultSetJson(result: HanaQueryResultSet): string {
  const columnKeys = buildUniqueColumnKeys(result.columns);
  const rows = result.rows.map((row) => {
    return buildRowObject(columnKeys, row);
  });
  return JSON.stringify(rows, null, 2);
}

export function formatHanaSqlResultRowObjectJson(
  result: HanaQueryResultSet,
  rowIndex: number
): string | null {
  const row = resolveResultRow(result, rowIndex);
  if (row === null) {
    return null;
  }
  return JSON.stringify(buildRowObject(buildUniqueColumnKeys(result.columns), row), null, 2);
}

export function resolveHanaSqlResultCellValue(
  result: HanaQueryResultSet,
  rowIndex: number,
  columnIndex: number
): string | null {
  const row = resolveResultRow(result, rowIndex);
  if (row === null || !isValidIndex(columnIndex) || columnIndex >= result.columns.length) {
    return null;
  }
  return row[columnIndex] ?? '';
}

function buildRowObject(
  columnKeys: readonly string[],
  row: readonly string[]
): Record<string, string> {
  return Object.fromEntries(columnKeys.map((columnKey, index) => [columnKey, row[index] ?? '']));
}

function resolveResultRow(
  result: HanaQueryResultSet,
  rowIndex: number
): readonly string[] | null {
  if (!isValidIndex(rowIndex)) {
    return null;
  }
  return result.rows[rowIndex] ?? null;
}

function isValidIndex(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

function buildUniqueColumnKeys(columns: readonly string[]): readonly string[] {
  const counts = new Map<string, number>();
  return columns.map((column, index) => {
    const baseKey = column.trim().length > 0 ? column.trim() : `COLUMN_${String(index + 1)}`;
    const count = (counts.get(baseKey) ?? 0) + 1;
    counts.set(baseKey, count);
    return count === 1 ? baseKey : `${baseKey}_${String(count)}`;
  });
}

export function buildHanaSqlResultExportFileName(
  appName: string,
  executedAt: string,
  format: HanaSqlResultExportFormat
): string {
  const appSlug = appName.trim().toLowerCase().replaceAll(/[^a-z0-9._-]+/g, '-');
  const safeAppSlug = appSlug.length > 0 ? appSlug : 'hana-query';
  const timestamp = executedAt.replaceAll(/[^0-9a-z]+/gi, '-').replaceAll(/^-+|-+$/g, '');
  const safeTimestamp = timestamp.length > 0 ? timestamp : 'result';
  return `sap-tools-${safeAppSlug}-${safeTimestamp}.${format}`;
}
