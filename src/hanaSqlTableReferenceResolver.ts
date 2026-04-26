export interface HanaResolvedTableReference {
  readonly displayName: string;
  readonly identifier: string;
  readonly tableName: string;
}

export interface HanaTableReferenceResolution {
  readonly replacements: readonly HanaResolvedTableReference[];
  readonly sql: string;
}

interface HanaTableDisplayEntryLike {
  readonly displayName: string;
  readonly name: string;
}

interface SqlReferenceToken {
  readonly depth: number;
  readonly end: number;
  readonly kind: 'dot' | 'word';
  readonly start: number;
  readonly text: string;
  readonly upper: string;
}

interface TableReferenceCandidate {
  readonly qualified: boolean;
  readonly tokenIndex: number;
}

export function resolveHanaDisplayTableReferences(
  sql: string,
  tableEntries: readonly HanaTableDisplayEntryLike[],
  schema: string
): HanaTableReferenceResolution {
  const tableMap = buildTableReferenceMap(tableEntries);
  if (tableMap.size === 0) {
    return { replacements: [], sql };
  }

  const tokens = tokenizeSqlReferenceTokens(sql);
  const candidates = findTableReferenceCandidates(tokens);
  return applyTableReferenceReplacements(sql, tokens, candidates, tableMap, schema);
}

function buildTableReferenceMap(
  tableEntries: readonly HanaTableDisplayEntryLike[]
): Map<string, HanaTableDisplayEntryLike> {
  const tableMap = new Map<string, HanaTableDisplayEntryLike>();
  for (const entry of tableEntries) {
    tableMap.set(normalizeTableReferenceKey(entry.displayName), entry);
    tableMap.set(normalizeTableReferenceKey(entry.name), entry);
  }
  return tableMap;
}

function findTableReferenceCandidates(
  tokens: readonly SqlReferenceToken[]
): readonly TableReferenceCandidate[] {
  const candidates: TableReferenceCandidate[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token?.kind !== 'word' || !isTableReferenceKeyword(tokens, index)) {
      continue;
    }
    const nextWordIndex = findNextSameDepthWordIndex(tokens, index);
    if (nextWordIndex >= 0) {
      candidates.push(resolveQualifiedTableReference(tokens, nextWordIndex));
    }
  }
  return candidates;
}

function applyTableReferenceReplacements(
  sql: string,
  tokens: readonly SqlReferenceToken[],
  candidates: readonly TableReferenceCandidate[],
  tableMap: ReadonlyMap<string, HanaTableDisplayEntryLike>,
  schema: string
): HanaTableReferenceResolution {
  const replacements: HanaResolvedTableReference[] = [];
  let resolvedSql = '';
  let cursor = 0;
  for (const candidate of candidates) {
    const replacement = buildTableReferenceReplacement(tokens, candidate, tableMap, schema);
    if (replacement === null || replacement.start < cursor) continue;
    resolvedSql += `${sql.slice(cursor, replacement.start)}${replacement.identifier}`;
    cursor = replacement.end;
    replacements.push(replacement.resolved);
  }
  if (replacements.length === 0) {
    return { replacements, sql };
  }
  return { replacements, sql: `${resolvedSql}${sql.slice(cursor)}` };
}

function buildTableReferenceReplacement(
  tokens: readonly SqlReferenceToken[],
  candidate: TableReferenceCandidate,
  tableMap: ReadonlyMap<string, HanaTableDisplayEntryLike>,
  schema: string
): {
  readonly end: number;
  readonly identifier: string;
  readonly resolved: HanaResolvedTableReference;
  readonly start: number;
} | null {
  const token = tokens[candidate.tokenIndex];
  if (token === undefined) return null;
  const entry = tableMap.get(normalizeTableReferenceKey(token.text));
  if (entry === undefined || !shouldRewriteTableReference(token.text, entry)) return null;
  const identifier = candidate.qualified
    ? quoteHanaIdentifier(entry.name)
    : buildQualifiedHanaTableIdentifier(schema, entry.name);
  return {
    end: token.end,
    identifier,
    resolved: { displayName: entry.displayName, identifier, tableName: entry.name },
    start: token.start,
  };
}

function resolveQualifiedTableReference(
  tokens: readonly SqlReferenceToken[],
  startIndex: number
): TableReferenceCandidate {
  let tokenIndex = startIndex;
  let cursor = startIndex;
  while (isQualifiedReferenceStep(tokens, startIndex, cursor)) {
    tokenIndex = cursor + 2;
    cursor += 2;
  }
  return { qualified: tokenIndex !== startIndex, tokenIndex };
}

function isQualifiedReferenceStep(
  tokens: readonly SqlReferenceToken[],
  startIndex: number,
  cursor: number
): boolean {
  return (
    tokens[cursor + 1]?.kind === 'dot' &&
    tokens[cursor + 2]?.kind === 'word' &&
    tokens[cursor + 2]?.depth === tokens[startIndex]?.depth
  );
}

function isTableReferenceKeyword(
  tokens: readonly SqlReferenceToken[],
  index: number
): boolean {
  const token = tokens[index];
  if (token?.kind !== 'word') return false;
  if (['FROM', 'JOIN', 'UPDATE', 'INTO', 'DESCRIBE'].includes(token.upper)) {
    return true;
  }
  if (token.upper !== 'TABLE') return false;
  return findPreviousSameDepthWord(tokens, index)?.upper === 'TRUNCATE';
}

function findNextSameDepthWordIndex(
  tokens: readonly SqlReferenceToken[],
  index: number
): number {
  const current = tokens[index];
  if (current === undefined) return -1;
  return tokens.findIndex((token, nextIndex) => {
    return nextIndex > index && token.kind === 'word' && token.depth === current.depth;
  });
}

function findPreviousSameDepthWord(
  tokens: readonly SqlReferenceToken[],
  index: number
): SqlReferenceToken | undefined {
  const current = tokens[index];
  if (current === undefined) return undefined;
  return [...tokens]
    .slice(0, index)
    .reverse()
    .find((token) => token.kind === 'word' && token.depth === current.depth);
}

function shouldRewriteTableReference(
  tokenText: string,
  entry: HanaTableDisplayEntryLike
): boolean {
  return (
    !isUppercaseHanaIdentifier(entry.name) ||
    tokenText.toUpperCase() !== entry.name.toUpperCase()
  );
}

function buildQualifiedHanaTableIdentifier(schema: string, tableName: string): string {
  const quotedTable = quoteHanaIdentifier(tableName);
  const normalizedSchema = schema.trim();
  if (normalizedSchema.length === 0) {
    return quotedTable;
  }
  return `${quoteHanaIdentifier(normalizedSchema)}.${quotedTable}`;
}

function tokenizeSqlReferenceTokens(sql: string): SqlReferenceToken[] {
  const tokens: SqlReferenceToken[] = [];
  let depth = 0;
  let index = 0;
  while (index < sql.length) {
    const nextIndex = readNextSqlReferenceToken(sql, index, depth, tokens);
    if (nextIndex.depth !== depth) depth = nextIndex.depth;
    index = nextIndex.index;
  }
  return tokens;
}

function readNextSqlReferenceToken(
  sql: string,
  index: number,
  depth: number,
  tokens: SqlReferenceToken[]
): { readonly depth: number; readonly index: number } {
  const char = sql[index] ?? '';
  const next = sql[index + 1] ?? '';
  if (char === "'") return { depth, index: skipSingleQuotedSqlText(sql, index) };
  if (char === '"') return { depth, index: skipDoubleQuotedSqlIdentifier(sql, index) };
  if (char === '-' && next === '-') return { depth, index: skipLineSqlComment(sql, index) };
  if (char === '/' && next === '*') return { depth, index: skipBlockSqlComment(sql, index) };
  if (char === '(') return { depth: depth + 1, index: index + 1 };
  if (char === ')') return { depth: Math.max(0, depth - 1), index: index + 1 };
  if (char === '.') {
    tokens.push({ depth, end: index + 1, kind: 'dot', start: index, text: '.', upper: '.' });
    return { depth, index: index + 1 };
  }
  if (!isSqlIdentifierStart(char)) {
    return { depth, index: index + 1 };
  }
  const end = readSqlIdentifierEnd(sql, index + 1);
  const text = sql.slice(index, end);
  tokens.push({ depth, end, kind: 'word', start: index, text, upper: text.toUpperCase() });
  return { depth, index: end };
}

function quoteHanaIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function normalizeTableReferenceKey(value: string): string {
  return value.trim().toUpperCase();
}

function isUppercaseHanaIdentifier(value: string): boolean {
  return /^[A-Z_][A-Z0-9_$#]*$/.test(value);
}

function skipSingleQuotedSqlText(sql: string, start: number): number {
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

function skipDoubleQuotedSqlIdentifier(sql: string, start: number): number {
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

function skipLineSqlComment(sql: string, start: number): number {
  const newlineIndex = sql.indexOf('\n', start + 2);
  return newlineIndex >= 0 ? newlineIndex + 1 : sql.length;
}

function skipBlockSqlComment(sql: string, start: number): number {
  const endIndex = sql.indexOf('*/', start + 2);
  return endIndex >= 0 ? endIndex + 2 : sql.length;
}

function readSqlIdentifierEnd(sql: string, start: number): number {
  let index = start;
  while (index < sql.length && isSqlIdentifierPart(sql[index] ?? '')) {
    index += 1;
  }
  return index;
}

function isSqlIdentifierStart(char: string): boolean {
  return /^[A-Za-z_]$/.test(char);
}

function isSqlIdentifierPart(char: string): boolean {
  return /^[A-Za-z0-9_$#]$/.test(char);
}
