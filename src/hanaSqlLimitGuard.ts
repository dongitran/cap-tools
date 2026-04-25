export const HANA_SQL_DEFAULT_SELECT_LIMIT = 100;

export interface HanaSqlLimitGuardResult {
  readonly sql: string;
  readonly applied: boolean;
  readonly limit: number;
}

interface SqlWordToken {
  readonly upper: string;
  readonly start: number;
  readonly end: number;
  readonly depth: number;
}

export function applyDefaultHanaSelectLimit(
  sql: string,
  limit: number = HANA_SQL_DEFAULT_SELECT_LIMIT
): HanaSqlLimitGuardResult {
  const safeLimit = resolveSafeLimit(limit);
  const source = sql.trim();
  const unchanged = { sql: source, applied: false, limit: safeLimit };
  const tokens = tokenizeSqlWords(source);
  const outerSelectIndex = findOuterSelectTokenIndex(tokens);

  if (outerSelectIndex < 0) return unchanged;
  if (hasTopAfterSelect(tokens, outerSelectIndex)) return unchanged;
  if (hasTopLevelRowLimit(tokens, outerSelectIndex)) return unchanged;

  const insertionIndex = findLimitInsertionIndex(source, tokens, outerSelectIndex);
  return {
    sql: insertLimitClause(source, insertionIndex, safeLimit),
    applied: true,
    limit: safeLimit,
  };
}

function resolveSafeLimit(limit: number): number {
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new RangeError('Default HANA SELECT limit must be a positive integer.');
  }
  return limit;
}

function findOuterSelectTokenIndex(tokens: readonly SqlWordToken[]): number {
  const firstTopLevelIndex = tokens.findIndex((token) => token.depth === 0);
  if (firstTopLevelIndex < 0) return -1;

  const firstTopLevel = tokens[firstTopLevelIndex];
  if (firstTopLevel?.upper === 'SELECT') return firstTopLevelIndex;
  if (firstTopLevel?.upper !== 'WITH') return -1;

  return tokens.findIndex((token, index) => {
    return index > firstTopLevelIndex && token.depth === 0 && token.upper === 'SELECT';
  });
}

function hasTopAfterSelect(tokens: readonly SqlWordToken[], selectIndex: number): boolean {
  const nextToken = findNextTopLevelToken(tokens, selectIndex);
  return nextToken?.upper === 'TOP' && findLastTopLevelSetOperatorIndex(tokens, selectIndex) < 0;
}

function hasTopLevelRowLimit(tokens: readonly SqlWordToken[], selectIndex: number): boolean {
  const lastSetOperatorIndex = findLastTopLevelSetOperatorIndex(tokens, selectIndex);
  const startIndex = lastSetOperatorIndex >= 0 ? lastSetOperatorIndex + 1 : selectIndex + 1;
  for (let index = startIndex; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token?.depth !== 0) continue;
    if (token.upper === 'LIMIT') return true;
    if (token.upper === 'FETCH' && isFetchRowLimit(tokens, index)) return true;
  }
  return false;
}

function findLastTopLevelSetOperatorIndex(
  tokens: readonly SqlWordToken[],
  selectIndex: number
): number {
  let lastIndex = -1;
  for (let index = selectIndex + 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token?.depth === 0 && isSetOperatorToken(token)) {
      lastIndex = index;
    }
  }
  return lastIndex;
}

function isSetOperatorToken(token: SqlWordToken): boolean {
  return ['UNION', 'INTERSECT', 'EXCEPT', 'MINUS'].includes(token.upper);
}

function isFetchRowLimit(tokens: readonly SqlWordToken[], index: number): boolean {
  const nextToken = findNextTopLevelToken(tokens, index);
  return nextToken?.upper === 'FIRST' || nextToken?.upper === 'NEXT';
}

function findLimitInsertionIndex(
  sql: string,
  tokens: readonly SqlWordToken[],
  selectIndex: number
): number {
  for (let index = selectIndex + 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token?.depth === 0 && isTrailingSelectOptionStart(tokens, index)) {
      return token.start;
    }
  }
  return sql.length;
}

function isTrailingSelectOptionStart(
  tokens: readonly SqlWordToken[],
  index: number
): boolean {
  const token = tokens[index];
  if (token?.depth !== 0) return false;

  const nextToken = findNextTopLevelToken(tokens, index);
  if (token.upper === 'WITH') return nextToken?.upper === 'HINT';
  if (token.upper !== 'FOR') return false;
  return ['UPDATE', 'SHARE', 'JSON', 'XML'].includes(nextToken?.upper ?? '');
}

function findNextTopLevelToken(
  tokens: readonly SqlWordToken[],
  index: number
): SqlWordToken | undefined {
  return tokens.slice(index + 1).find((token) => token.depth === 0);
}

function insertLimitClause(sql: string, insertionIndex: number, limit: number): string {
  const before = sql.slice(0, insertionIndex).trimEnd();
  const after = sql.slice(insertionIndex).trimStart();
  if (after.length === 0) {
    return `${before} LIMIT ${String(limit)}`;
  }
  return `${before} LIMIT ${String(limit)} ${after}`;
}

function tokenizeSqlWords(sql: string): SqlWordToken[] {
  const tokens: SqlWordToken[] = [];
  let depth = 0;
  let index = 0;

  while (index < sql.length) {
    const char = sql[index] ?? '';
    const next = sql[index + 1] ?? '';
    if (char === "'") index = skipSingleQuotedString(sql, index);
    else if (char === '"') index = skipDoubleQuotedIdentifier(sql, index);
    else if (char === '-' && next === '-') index = skipLineComment(sql, index);
    else if (char === '/' && next === '*') index = skipBlockComment(sql, index);
    else if (char === '(') {
      depth += 1;
      index += 1;
    } else if (char === ')') {
      depth = Math.max(0, depth - 1);
      index += 1;
    } else if (isSqlWordStart(char)) {
      const start = index;
      index = readSqlWordEnd(sql, index + 1);
      tokens.push({ upper: sql.slice(start, index).toUpperCase(), start, end: index, depth });
    } else {
      index += 1;
    }
  }

  return tokens;
}

function skipSingleQuotedString(sql: string, start: number): number {
  for (let index = start + 1; index < sql.length; index += 1) {
    if (sql[index] !== "'") continue;
    if (sql[index + 1] === "'") {
      index += 1;
      continue;
    }
    return index + 1;
  }
  return sql.length;
}

function skipDoubleQuotedIdentifier(sql: string, start: number): number {
  for (let index = start + 1; index < sql.length; index += 1) {
    if (sql[index] !== '"') continue;
    if (sql[index + 1] === '"') {
      index += 1;
      continue;
    }
    return index + 1;
  }
  return sql.length;
}

function skipLineComment(sql: string, start: number): number {
  const newlineIndex = sql.indexOf('\n', start + 2);
  return newlineIndex >= 0 ? newlineIndex + 1 : sql.length;
}

function skipBlockComment(sql: string, start: number): number {
  const endIndex = sql.indexOf('*/', start + 2);
  return endIndex >= 0 ? endIndex + 2 : sql.length;
}

function readSqlWordEnd(sql: string, start: number): number {
  let index = start;
  while (index < sql.length && isSqlWordPart(sql[index] ?? '')) {
    index += 1;
  }
  return index;
}

function isSqlWordStart(char: string): boolean {
  return /^[A-Za-z_]$/.test(char);
}

function isSqlWordPart(char: string): boolean {
  return /^[A-Za-z0-9_$#]$/.test(char);
}
