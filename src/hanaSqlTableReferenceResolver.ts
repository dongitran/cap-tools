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
  readonly kind: 'comma' | 'dot' | 'parenClose' | 'parenOpen' | 'quotedWord' | 'word';
  readonly start: number;
  readonly text: string;
  readonly upper: string;
}

interface TableReferenceCandidate {
  readonly qualified: boolean;
  readonly tokenIndex: number;
}

interface TableReferenceReplacement {
  readonly end: number;
  readonly identifier: string;
  readonly resolved: HanaResolvedTableReference;
  readonly start: number;
}

const TABLE_FACTOR_STOP_WORDS = new Set([
  'CONNECT',
  'EXCEPT',
  'FETCH',
  'FOR',
  'FULL',
  'GROUP',
  'HAVING',
  'INNER',
  'INTERSECT',
  'JOIN',
  'LEFT',
  'LIMIT',
  'MINUS',
  'OFFSET',
  'ON',
  'ORDER',
  'RIGHT',
  'UNION',
  'WHERE',
  'WITH',
]);

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
  const cteNames = collectTopLevelCteNames(tokens);
  const candidates = findTableReferenceCandidates(tokens, cteNames);
  return applyTableReferenceReplacements(sql, tokens, candidates, tableMap, schema);
}

function buildTableReferenceMap(
  tableEntries: readonly HanaTableDisplayEntryLike[]
): Map<string, HanaTableDisplayEntryLike | null> {
  const tableMap = new Map<string, HanaTableDisplayEntryLike | null>();
  for (const entry of tableEntries) {
    addTableReferenceMapEntry(tableMap, normalizeTableReferenceKey(entry.displayName), entry);
    addTableReferenceMapEntry(tableMap, normalizeTableReferenceKey(entry.name), entry);
  }
  return tableMap;
}

function addTableReferenceMapEntry(
  tableMap: Map<string, HanaTableDisplayEntryLike | null>,
  key: string,
  entry: HanaTableDisplayEntryLike
): void {
  const current = tableMap.get(key);
  if (current === undefined) {
    tableMap.set(key, entry);
    return;
  }
  if (current === entry || (current?.displayName === entry.displayName && current.name === entry.name)) {
    return;
  }
  tableMap.set(key, null);
}

function collectTopLevelCteNames(tokens: readonly SqlReferenceToken[]): ReadonlySet<string> {
  const firstWordIndex = tokens.findIndex((token) => token.kind === 'word' && token.depth === 0);
  if (tokens[firstWordIndex]?.upper !== 'WITH') return new Set();

  const cteNames = new Set<string>();
  let cursor = firstWordIndex + 1;
  while (cursor < tokens.length) {
    const nameToken = findNextTopLevelToken(tokens, cursor);
    if (nameToken?.kind !== 'word') break;
    if (nameToken.upper === 'SELECT') break;
    cteNames.add(normalizeTableReferenceKey(nameToken.text));
    const nextIndex = skipCteDefinition(tokens, tokens.indexOf(nameToken) + 1);
    if (nextIndex < 0 || tokens[nextIndex]?.kind !== 'comma') break;
    cursor = nextIndex + 1;
  }
  return cteNames;
}

function skipCteDefinition(tokens: readonly SqlReferenceToken[], startIndex: number): number {
  const asIndex = tokens.findIndex((token, index) => {
    return index >= startIndex && token.depth === 0 && token.kind === 'word' && token.upper === 'AS';
  });
  if (asIndex < 0) return -1;
  const openIndex = tokens.findIndex((token, index) => {
    return index > asIndex && token.depth === 0 && token.kind === 'parenOpen';
  });
  if (openIndex < 0) return -1;
  const closeIndex = findMatchingCloseParenIndex(tokens, openIndex);
  if (closeIndex < 0) return -1;
  return findNextTopLevelTokenIndex(tokens, closeIndex + 1);
}

function findTableReferenceCandidates(
  tokens: readonly SqlReferenceToken[],
  cteNames: ReadonlySet<string>
): readonly TableReferenceCandidate[] {
  const candidates: TableReferenceCandidate[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token?.kind !== 'word') continue;
    const found = findCandidatesForKeyword(tokens, index, cteNames);
    candidates.push(...found);
  }
  return candidates;
}

function findCandidatesForKeyword(
  tokens: readonly SqlReferenceToken[],
  index: number,
  cteNames: ReadonlySet<string>
): readonly TableReferenceCandidate[] {
  const token = tokens[index];
  if (token?.upper === 'FROM') return scanFromTableReferences(tokens, index, cteNames);
  if (['JOIN', 'UPDATE'].includes(token?.upper ?? '')) return scanSingleTableReference(tokens, index, cteNames);
  if (token?.upper === 'INTO' && isInsertIntoKeyword(tokens, index)) {
    return scanSingleTableReference(tokens, index, cteNames);
  }
  if (token?.upper === 'DESCRIBE') return scanDescribeTableReference(tokens, index, cteNames);
  if (token?.upper === 'TABLE' && findPreviousSameDepthWord(tokens, index)?.upper === 'TRUNCATE') {
    return scanSingleTableReference(tokens, index, cteNames);
  }
  return [];
}

function scanFromTableReferences(
  tokens: readonly SqlReferenceToken[],
  keywordIndex: number,
  cteNames: ReadonlySet<string>
): readonly TableReferenceCandidate[] {
  const candidates: TableReferenceCandidate[] = [];
  let cursor = findNextTokenIndex(tokens, keywordIndex + 1, tokens[keywordIndex]?.depth ?? 0);
  while (cursor >= 0) {
    const token = tokens[cursor];
    if (token === undefined || isTableFactorStopToken(token)) break;
    const result = readTableFactorCandidate(tokens, cursor, cteNames);
    if (result.candidate !== null) candidates.push(result.candidate);
    cursor = skipTableReferenceTail(tokens, result.nextIndex, token.depth);
    if (tokens[cursor]?.kind !== 'comma') break;
    cursor = findNextTokenIndex(tokens, cursor + 1, token.depth);
  }
  return candidates;
}

function scanSingleTableReference(
  tokens: readonly SqlReferenceToken[],
  keywordIndex: number,
  cteNames: ReadonlySet<string>
): readonly TableReferenceCandidate[] {
  const depth = tokens[keywordIndex]?.depth ?? 0;
  const startIndex = findNextTokenIndex(tokens, keywordIndex + 1, depth);
  if (startIndex < 0) return [];
  const result = readTableFactorCandidate(tokens, startIndex, cteNames);
  return result.candidate === null ? [] : [result.candidate];
}

function scanDescribeTableReference(
  tokens: readonly SqlReferenceToken[],
  keywordIndex: number,
  cteNames: ReadonlySet<string>
): readonly TableReferenceCandidate[] {
  const depth = tokens[keywordIndex]?.depth ?? 0;
  const nextIndex = findNextTokenIndex(tokens, keywordIndex + 1, depth);
  const tableIndex = tokens[nextIndex]?.upper === 'TABLE'
    ? findNextTokenIndex(tokens, nextIndex + 1, depth)
    : nextIndex;
  if (tableIndex < 0) return [];
  const result = readTableFactorCandidate(tokens, tableIndex, cteNames);
  return result.candidate === null ? [] : [result.candidate];
}

function readTableFactorCandidate(
  tokens: readonly SqlReferenceToken[],
  startIndex: number,
  cteNames: ReadonlySet<string>
): { readonly candidate: TableReferenceCandidate | null; readonly nextIndex: number } {
  const token = tokens[startIndex];
  if (token === undefined) return { candidate: null, nextIndex: startIndex };
  if (token.kind === 'parenOpen') {
    const closeIndex = findMatchingCloseParenIndex(tokens, startIndex);
    return { candidate: null, nextIndex: closeIndex < 0 ? startIndex + 1 : closeIndex + 1 };
  }
  const chain = readIdentifierChain(tokens, startIndex);
  if (chain === null) return { candidate: null, nextIndex: startIndex + 1 };
  const tableToken = tokens[chain.tableTokenIndex];
  if (tableToken?.kind !== 'word' || cteNames.has(normalizeTableReferenceKey(tableToken.text))) {
    return { candidate: null, nextIndex: chain.nextIndex };
  }
  return {
    candidate: { qualified: chain.qualified, tokenIndex: chain.tableTokenIndex },
    nextIndex: chain.nextIndex,
  };
}

function readIdentifierChain(
  tokens: readonly SqlReferenceToken[],
  startIndex: number
): { readonly nextIndex: number; readonly qualified: boolean; readonly tableTokenIndex: number } | null {
  if (!isIdentifierToken(tokens[startIndex])) return null;
  let cursor = startIndex;
  let tableTokenIndex = startIndex;
  let qualified = false;
  while (tokens[cursor + 1]?.kind === 'dot' && isIdentifierToken(tokens[cursor + 2])) {
    qualified = true;
    tableTokenIndex = cursor + 2;
    cursor += 2;
  }
  return { nextIndex: cursor + 1, qualified, tableTokenIndex };
}

function applyTableReferenceReplacements(
  sql: string,
  tokens: readonly SqlReferenceToken[],
  candidates: readonly TableReferenceCandidate[],
  tableMap: ReadonlyMap<string, HanaTableDisplayEntryLike | null>,
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
  tableMap: ReadonlyMap<string, HanaTableDisplayEntryLike | null>,
  schema: string
): TableReferenceReplacement | null {
  const token = tokens[candidate.tokenIndex];
  if (token === undefined) return null;
  const entry = tableMap.get(normalizeTableReferenceKey(token.text));
  if (entry === undefined || entry === null || !shouldRewriteTableReference(token.text, entry)) {
    return null;
  }
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

function shouldRewriteTableReference(tokenText: string, entry: HanaTableDisplayEntryLike): boolean {
  if (!isUppercaseHanaIdentifier(entry.name)) return true;
  return tokenText !== entry.name;
}

function skipTableReferenceTail(
  tokens: readonly SqlReferenceToken[],
  startIndex: number,
  depth: number
): number {
  let cursor = findNextTokenIndex(tokens, startIndex, depth);
  while (cursor >= 0) {
    const token = tokens[cursor];
    if (token === undefined || token.kind === 'comma' || isTableFactorStopToken(token)) break;
    cursor = findNextTokenIndex(tokens, cursor + 1, depth);
  }
  return cursor;
}

function isTableFactorStopToken(token: SqlReferenceToken): boolean {
  return token.kind === 'word' && TABLE_FACTOR_STOP_WORDS.has(token.upper);
}

function isInsertIntoKeyword(tokens: readonly SqlReferenceToken[], index: number): boolean {
  const previous = findPreviousSameDepthWord(tokens, index);
  return previous?.upper === 'INSERT' || previous?.upper === 'UPSERT';
}

function findNextTokenIndex(tokens: readonly SqlReferenceToken[], startIndex: number, depth: number): number {
  return tokens.findIndex((token, index) => index >= startIndex && token.depth === depth);
}

function findNextTopLevelToken(tokens: readonly SqlReferenceToken[], startIndex: number): SqlReferenceToken | undefined {
  const index = findNextTopLevelTokenIndex(tokens, startIndex);
  return index < 0 ? undefined : tokens[index];
}

function findNextTopLevelTokenIndex(tokens: readonly SqlReferenceToken[], startIndex: number): number {
  return tokens.findIndex((token, index) => index >= startIndex && token.depth === 0);
}

function findMatchingCloseParenIndex(tokens: readonly SqlReferenceToken[], openIndex: number): number {
  const open = tokens[openIndex];
  if (open?.kind !== 'parenOpen') return -1;
  return tokens.findIndex((token, index) => {
    return index > openIndex && token.kind === 'parenClose' && token.depth === open.depth;
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
    depth = nextIndex.depth;
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
  if (char === '"') return readQuotedSqlIdentifier(sql, index, depth, tokens);
  if (char === '-' && next === '-') return { depth, index: skipLineSqlComment(sql, index) };
  if (char === '/' && next === '*') return { depth, index: skipBlockSqlComment(sql, index) };
  if (char === '(') {
    tokens.push({ depth, end: index + 1, kind: 'parenOpen', start: index, text: '(', upper: '(' });
    return { depth: depth + 1, index: index + 1 };
  }
  if (char === ')') {
    const nextDepth = Math.max(0, depth - 1);
    tokens.push({ depth: nextDepth, end: index + 1, kind: 'parenClose', start: index, text: ')', upper: ')' });
    return { depth: nextDepth, index: index + 1 };
  }
  if (char === '.' || char === ',') {
    const kind = char === '.' ? 'dot' : 'comma';
    tokens.push({ depth, end: index + 1, kind, start: index, text: char, upper: char });
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

function readQuotedSqlIdentifier(
  sql: string,
  start: number,
  depth: number,
  tokens: SqlReferenceToken[]
): { readonly depth: number; readonly index: number } {
  const end = skipDoubleQuotedSqlIdentifier(sql, start);
  const text = unquoteSqlIdentifier(sql.slice(start, end));
  tokens.push({ depth, end, kind: 'quotedWord', start, text, upper: text.toUpperCase() });
  return { depth, index: end };
}

function quoteHanaIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function unquoteSqlIdentifier(value: string): string {
  return value.slice(1, -1).replaceAll('""', '"');
}

function normalizeTableReferenceKey(value: string): string {
  return value.trim().toUpperCase();
}

function isUppercaseHanaIdentifier(value: string): boolean {
  return /^[A-Z_][A-Z0-9_$#]*$/.test(value);
}

function isIdentifierToken(token: SqlReferenceToken | undefined): boolean {
  return token?.kind === 'word' || token?.kind === 'quotedWord';
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
