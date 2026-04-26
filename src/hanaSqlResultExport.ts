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
    return Object.fromEntries(
      columnKeys.map((columnKey, index) => [columnKey, row[index] ?? ''])
    );
  });
  return JSON.stringify(rows, null, 2);
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
