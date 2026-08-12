/**
 * Analyzes mutating SQL statements (UPDATE/DELETE/MERGE) to:
 * 1. Identify the target table name and schema.
 * 2. Extract the WHERE clause.
 * 3. Build a backup SELECT query to run BEFORE the mutation.
 *
 * Uses the same token-based approach as hanaSqlLimitGuard to correctly
 * handle string literals, quoted identifiers, and nested parentheses.
 */

export type MutatingStatementType = 'UPDATE' | 'DELETE' | 'MERGE';

export interface MutationAnalysis {
  /** Whether this analysis produced a viable backup query. */
  readonly canBackup: boolean;
  readonly statementType: MutatingStatementType;
  /** Raw table name as extracted from the SQL (may include schema prefix). */
  readonly tableName: string;
  /** WHERE clause text (without the WHERE keyword), or null if absent. */
  readonly whereClause: string | null;
  /**
   * SELECT query to run to capture data before the mutation.
   * Null when no WHERE clause is present (backup would be unbounded).
   */
  readonly backupSelectSql: string | null;
}

interface SqlWordToken {
  readonly upper: string;
  readonly text: string;
  readonly start: number;
  readonly end: number;
  readonly depth: number;
}

/**
 * Analyze a single SQL statement (already split, no semicolon) to produce
 * a MutationAnalysis. Returns null if the statement is not a supported
 * mutating statement type.
 */
export function analyzeMutatingStatement(
  sql: string,
  schema: string
): MutationAnalysis | null {
  const source = sql.trim();
  const tokens = tokenizeSqlWords(source);
  const firstTop = tokens.find((t) => t.depth === 0);
  if (firstTop === undefined) return null;

  const verb = firstTop.upper;
  if (verb === 'UPDATE') return analyzeUpdate(source, tokens, schema);
  if (verb === 'DELETE') return analyzeDelete(source, tokens, schema);
  if (verb === 'MERGE') return analyzeMerge(source, tokens, schema);
  return null;
}

// ── UPDATE ───────────────────────────────────────────────────────────────────

function analyzeUpdate(
  sql: string,
  tokens: readonly SqlWordToken[],
  schema: string
): MutationAnalysis | null {
  // Syntax: UPDATE [schema.]table [[AS] alias] SET ... [WHERE ...]
  const updateIdx = tokens.findIndex((t) => t.depth === 0 && t.upper === 'UPDATE');
  if (updateIdx < 0) return null;

  const tableToken = findNextTopLevelToken(tokens, updateIdx);
  if (tableToken === undefined) return null;

  const reference = readTableReference(tokens, tableToken, sql);
  const whereClause = extractWhereClause(sql, tokens);

  // HANA allows `UPDATE t SET ... FROM <from_clause> WHERE ...`. The WHERE then
  // references tables the backup's single-table FROM does not have, exactly the
  // failure that was fixed for MERGE — decline rather than emit broken SQL.
  if (hasTopLevelKeyword(tokens, 'FROM')) {
    return {
      canBackup: false,
      statementType: 'UPDATE',
      tableName: reference.tableName,
      whereClause: null,
      backupSelectSql: null,
    };
  }

  return buildAnalysis('UPDATE', reference.tableName, whereClause, schema, reference.alias);
}

function hasTopLevelKeyword(tokens: readonly SqlWordToken[], keyword: string): boolean {
  return tokens.some((token) => token.depth === 0 && token.upper === keyword);
}

// ── DELETE ───────────────────────────────────────────────────────────────────

function analyzeDelete(
  sql: string,
  tokens: readonly SqlWordToken[],
  schema: string
): MutationAnalysis | null {
  // Syntax: DELETE FROM [schema.]table [WHERE ...]
  //      or DELETE [schema.]table [WHERE ...]  (HANA allows this)
  const deleteIdx = tokens.findIndex((t) => t.depth === 0 && t.upper === 'DELETE');
  if (deleteIdx < 0) return null;

  const afterDelete = findNextTopLevelToken(tokens, deleteIdx);
  if (afterDelete === undefined) return null;

  let tableToken: SqlWordToken;
  if (afterDelete.upper === 'FROM') {
    const next = findNextTopLevelToken(tokens, tokens.indexOf(afterDelete));
    if (next === undefined) return null;
    tableToken = next;
  } else {
    tableToken = afterDelete;
  }

  const reference = readTableReference(tokens, tableToken, sql);
  const whereClause = extractWhereClause(sql, tokens);

  return buildAnalysis('DELETE', reference.tableName, whereClause, schema, reference.alias);
}

// ── MERGE ────────────────────────────────────────────────────────────────────

function analyzeMerge(
  sql: string,
  tokens: readonly SqlWordToken[],
  schema: string
): MutationAnalysis | null {
  // Syntax: MERGE INTO [schema.]table [[AS] alias] USING <source> [[AS] alias] ON <cond> WHEN ...
  const mergeIdx = tokens.findIndex((t) => t.depth === 0 && t.upper === 'MERGE');
  if (mergeIdx < 0) return null;

  const afterMerge = findNextTopLevelToken(tokens, mergeIdx);
  if (afterMerge === undefined) return null;

  let tableToken: SqlWordToken;
  if (afterMerge.upper === 'INTO') {
    const next = findNextTopLevelToken(tokens, tokens.indexOf(afterMerge));
    if (next === undefined) return null;
    tableToken = next;
  } else {
    tableToken = afterMerge;
  }

  const target = readTableReference(tokens, tableToken, sql);
  // MERGE has no WHERE; the ON clause is the row filter.
  const onClause = extractMergeOnClause(sql, tokens);
  const source = readMergeSource(sql, tokens);

  return buildMergeAnalysis(target, source, onClause, schema);
}

/**
 * A MERGE's ON clause references the USING source, so filtering the target by it
 * alone produces a query that cannot resolve. Bring the source into scope with a
 * semi-join instead:
 * `SELECT * FROM <target> [alias] WHERE EXISTS (SELECT 1 FROM <source> [alias] WHERE <cond>)`.
 *
 * EXISTS rather than an inner join on purpose — a join fans out when the source
 * matches a target row more than once, which would duplicate rows in the backup
 * and burn the row cap on copies. The semi-join returns each matching target row
 * exactly once, which is precisely the set the MERGE will update.
 *
 * When the source or the condition cannot be recovered, decline the backup rather
 * than emit SQL that is guaranteed to fail.
 */
function buildMergeAnalysis(
  target: TableReference,
  source: MergeSource | null,
  onClause: string | null,
  schema: string
): MutationAnalysis {
  const trimmedTableName = target.tableName.trim();
  const declined: MutationAnalysis = {
    canBackup: false,
    statementType: 'MERGE',
    tableName: target.tableName,
    whereClause: onClause === null || onClause.trim().length === 0 ? null : onClause.trim(),
    backupSelectSql: null,
  };
  if (!isUsableTableName(trimmedTableName)) return { ...declined, whereClause: null };
  if (source === null || declined.whereClause === null) return declined;

  const qualifiedTarget = qualifyTableName(target.tableName, schema);
  const targetClause = target.alias === null ? qualifiedTarget : `${qualifiedTarget} ${target.alias}`;
  // The source needs the same schema treatment as the target: unqualified in the
  // MERGE it resolves against the session schema, which the backup cannot assume.
  const sourceText = source.isSubquery ? source.text : qualifyTableName(source.text, schema);
  const sourceClause = source.alias === null ? sourceText : `${sourceText} ${source.alias}`;

  return {
    canBackup: true,
    statementType: 'MERGE',
    tableName: target.tableName,
    whereClause: declined.whereClause,
    // The closing paren goes on its own line: the ON clause is copied verbatim and
    // may end in a `--` comment, which would otherwise swallow the paren.
    backupSelectSql: `SELECT * FROM ${targetClause} WHERE EXISTS (SELECT 1 FROM ${sourceClause} WHERE ${declined.whereClause}\n)`,
  };
}

interface MergeSource {
  /** Raw source text — a table reference or a parenthesized subquery, verbatim. */
  readonly text: string;
  readonly alias: string | null;
  /** Subqueries carry their own FROM and must not be schema-qualified. */
  readonly isSubquery: boolean;
}

function readMergeSource(sql: string, tokens: readonly SqlWordToken[]): MergeSource | null {
  const usingIdx = tokens.findIndex((t) => t.depth === 0 && t.upper === 'USING');
  const usingToken = usingIdx < 0 ? undefined : tokens[usingIdx];
  if (usingToken === undefined) return null;

  const openIndex = findNextNonWhitespaceIndex(sql, usingToken.end);
  if (openIndex >= 0 && sql[openIndex] === '(') {
    const closeIndex = findMatchingParenIndex(sql, openIndex);
    if (closeIndex < 0) return null;
    return {
      text: sql.slice(openIndex, closeIndex + 1),
      alias: readAliasAfterOffset(tokens, closeIndex),
      isSubquery: true,
    };
  }

  const startToken = findNextTopLevelToken(tokens, usingIdx);
  if (startToken === undefined || isTableReferenceStopWord(startToken.upper)) return null;
  const reference = readTableReference(tokens, startToken, sql);
  if (!isUsableTableName(reference.tableName.trim())) return null;
  // A table function source (`USING MY_FUNC(1) s`) loses its argument list here,
  // so the backup would join a table that does not exist — decline instead.
  if (isFollowedByOpenParen(sql, startToken, reference)) return null;
  return { text: reference.tableName, alias: reference.alias, isSubquery: false };
}

function isFollowedByOpenParen(
  sql: string,
  startToken: SqlWordToken,
  reference: TableReference
): boolean {
  const nameEnd = sql.indexOf(reference.tableName, startToken.start);
  if (nameEnd < 0) return false;
  const next = findNextNonWhitespaceIndex(sql, nameEnd + reference.tableName.length);
  return next >= 0 && sql[next] === '(';
}


/**
 * Next index that is neither whitespace nor comment. Comments matter here: a
 * `USING /* note *\/ (SELECT …)` would otherwise look like a plain table
 * reference and the derived-table alias would be read as the source table.
 */
function findNextNonWhitespaceIndex(sql: string, start: number): number {
  let index = start;
  while (index < sql.length) {
    const char = sql[index] ?? '';
    if (/\s/.test(char)) {
      index += 1;
    } else if (char === '-' && sql[index + 1] === '-') {
      index = skipLineComment(sql, index);
    } else if (char === '/' && sql[index + 1] === '*') {
      const end = skipBlockComment(sql, index);
      if (end === index) return -1;
      index = end;
    } else {
      return index;
    }
  }
  return -1;
}

/** Match the closing paren for `openIndex`, skipping quoted text and comments. */
function findMatchingParenIndex(sql: string, openIndex: number): number {
  let depth = 0;
  let index = openIndex;
  while (index < sql.length) {
    const char = sql[index] ?? '';
    const next = sql[index + 1] ?? '';
    if (char === "'") {
      index = skipSingleQuotedString(sql, index);
    } else if (char === '"') {
      index = skipDoubleQuotedIdentifier(sql, index);
    } else if (char === '-' && next === '-') {
      index = skipLineComment(sql, index);
    } else if (char === '/' && next === '*') {
      index = skipBlockComment(sql, index);
    } else if (char === '(') {
      depth += 1;
      index += 1;
    } else if (char === ')') {
      depth -= 1;
      if (depth === 0) return index;
      index += 1;
    } else {
      index += 1;
    }
  }
  return -1;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildAnalysis(
  statementType: MutatingStatementType,
  tableName: string,
  whereClause: string | null,
  schema: string,
  alias: string | null = null
): MutationAnalysis {
  const trimmedTableName = tableName.trim();
  if (!isUsableTableName(trimmedTableName)) {
    return { canBackup: false, statementType, tableName, whereClause: null, backupSelectSql: null };
  }

  if (whereClause === null || whereClause.trim().length === 0) {
    // No WHERE — cannot safely backup (could be unbounded)
    return { canBackup: false, statementType, tableName, whereClause: null, backupSelectSql: null };
  }

  const qualifiedTable = qualifyTableName(tableName, schema);
  const fromClause = alias === null ? qualifiedTable : `${qualifiedTable} ${alias}`;
  const backupSelectSql = `SELECT * FROM ${fromClause} WHERE ${whereClause.trim()}`;

  return {
    canBackup: true,
    statementType,
    tableName,
    whereClause: whereClause.trim(),
    backupSelectSql,
  };
}

function isUsableTableName(trimmedTableName: string): boolean {
  if (trimmedTableName.length === 0) return false;
  return !trimmedTableName.split('.').some((segment) => segment.trim() === '""');
}

/**
 * Qualify a table name with schema if it does not already contain a dot.
 * HANA system tables (DUMMY) and fully-qualified names are left as-is.
 */
function qualifyTableName(tableName: string, schema: string): string {
  if (tableName.includes('.')) {
    return tableName;
  }
  if (schema.trim().length === 0) {
    return tableName;
  }
  return `${schema}.${tableName}`;
}

interface TableReference {
  /** Full qualified name as written, e.g. `T`, `SCH.T`, `"SCH"."T"`. */
  readonly tableName: string;
  /** Correlation name that follows it, with or without `AS`. */
  readonly alias: string | null;
}

/**
 * Words that may legally follow a table reference but are never an alias. Without
 * this, `DELETE FROM T WHERE ...` would read `WHERE` as the table's alias.
 */
const TABLE_REFERENCE_STOP_WORDS = new Set([
  'AND', 'AS', 'CROSS', 'DELETE', 'FETCH', 'FOR', 'FROM', 'FULL', 'GROUP',
  'HAVING', 'INNER', 'INSERT', 'INTO', 'JOIN', 'LEFT', 'LIMIT', 'MATCHED',
  'MERGE', 'NOT', 'OFFSET', 'ON', 'OR', 'ORDER', 'RIGHT', 'SELECT', 'SET',
  'THEN', 'UPDATE', 'USING', 'VALUES', 'WHEN', 'WHERE', 'WITH',
]);

function isTableReferenceStopWord(upper: string): boolean {
  return TABLE_REFERENCE_STOP_WORDS.has(upper);
}

/**
 * Given the token that starts a table reference, read the full qualified name
 * (`schema.table` or `"SCHEMA"."TABLE"`) plus any alias that follows it. The
 * alias matters because a predicate written against it — `WHERE so.ID = 1` —
 * only resolves if the backup SELECT declares the same correlation name.
 */
function readTableReference(
  tokens: readonly SqlWordToken[],
  startToken: SqlWordToken,
  sql: string
): TableReference {
  const startIdx = tokens.indexOf(startToken);
  if (startIdx < 0) return { tableName: '', alias: null };

  // Read identifiers separated by dots at depth 0
  let name = extractIdentifierText(sql, startToken);
  let nextIdx = startIdx + 1;

  while (nextIdx < tokens.length) {
    const tok = tokens[nextIdx];
    if (tok?.depth !== 0) break;
    // Check for dot between token and next token in raw SQL
    const prevToken = tokens[nextIdx - 1];
    const between = sql.slice(prevToken?.end ?? 0, tok.start).trim();
    if (between === '.') {
      name += '.' + extractIdentifierText(sql, tok);
      nextIdx += 1;
    } else {
      break;
    }
  }

  return { tableName: name, alias: readAliasAtTokenIndex(tokens, nextIdx) };
}

function readAliasAtTokenIndex(
  tokens: readonly SqlWordToken[],
  index: number
): string | null {
  const token = tokens[index];
  if (token?.depth !== 0) return null;
  if (token.upper === 'AS') {
    const aliasToken = tokens[index + 1];
    if (aliasToken?.depth !== 0) return null;
    return isTableReferenceStopWord(aliasToken.upper) ? null : aliasToken.text;
  }
  return isTableReferenceStopWord(token.upper) ? null : token.text;
}

/** Read the alias sitting after a raw character offset (used after a subquery's `)`). */
function readAliasAfterOffset(
  tokens: readonly SqlWordToken[],
  offset: number
): string | null {
  const index = tokens.findIndex((token) => token.depth === 0 && token.start > offset);
  return index < 0 ? null : readAliasAtTokenIndex(tokens, index);
}

/**
 * Extract the raw text of an identifier token, preserving quoted identifiers.
 */
function extractIdentifierText(sql: string, token: SqlWordToken): string {
  // For quoted identifiers, the token text starts/ends with "
  const raw = sql.slice(token.start, token.end);
  return raw;
}

/**
 * Find the WHERE clause start position at top level and return its content.
 * Returns null if no top-level WHERE is present.
 */
function extractWhereClause(
  sql: string,
  tokens: readonly SqlWordToken[]
): string | null {
  // Find the last top-level WHERE (handles UPDATE ... SET ... WHERE ...)
  let whereStart = -1;
  for (const token of tokens) {
    if (token.depth === 0 && token.upper === 'WHERE') {
      whereStart = token.end;
    }
  }
  if (whereStart < 0) return null;

  // Where clause runs to end of statement (trailing ; already stripped by splitter)
  // Strip any ORDER BY / LIMIT / FOR UPDATE / WITH HINT that follows
  const afterWhere = sql.slice(whereStart);
  const trimmed = stripTrailingClauses(afterWhere, tokens, whereStart).trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Strip trailing clauses (ORDER BY, LIMIT, FOR, WITH HINT) from the WHERE body.
 * These come after the WHERE conditions and should not be included in the backup SELECT.
 */
function stripTrailingClauses(whereBody: string, tokens: readonly SqlWordToken[], whereBodyStart: number): string {
  const trailingKeywords = new Set(['ORDER', 'LIMIT', 'FETCH', 'FOR', 'OFFSET', 'GROUP', 'HAVING']);
  let cutPoint = whereBody.length;

  for (const token of tokens) {
    if (token.depth !== 0) continue;
    if (token.start <= whereBodyStart) continue;
    if (trailingKeywords.has(token.upper)) {
      const relativePos = token.start - whereBodyStart;
      if (relativePos > 0 && relativePos < cutPoint) {
        cutPoint = relativePos;
      }
    }
  }

  return whereBody.slice(0, cutPoint).trimEnd();
}

/**
 * For MERGE, extract the ON clause condition as the backup filter. The clause is
 * bounded by the first top-level `WHEN` *token* — a raw substring search would
 * also match inside a literal (`ON T.CODE = 'WHEN MATCHED'`) or inside a column
 * name (`T.WHEN_CREATED`), truncating the condition mid-expression.
 */
function extractMergeOnClause(sql: string, tokens: readonly SqlWordToken[]): string | null {
  let usingSeen = false;
  let onToken: SqlWordToken | undefined;
  for (const token of tokens) {
    if (token.depth !== 0) continue;
    if (token.upper === 'USING') {
      usingSeen = true;
      continue;
    }
    if (usingSeen && token.upper === 'ON') {
      onToken = token;
      break;
    }
  }
  if (onToken === undefined) return null;

  const onEnd = onToken.end;
  // An unparenthesized `CASE WHEN` inside the ON clause owns its own WHEN, so the
  // first WHEN after ON is not necessarily the MERGE's. Skip any WHEN that sits
  // inside an open CASE.
  let caseDepth = 0;
  let boundary: number | null = null;
  for (const token of tokens) {
    if (token.depth !== 0 || token.start < onEnd) continue;
    if (token.upper === 'CASE') {
      caseDepth += 1;
    } else if (token.upper === 'END') {
      caseDepth = Math.max(0, caseDepth - 1);
    } else if (token.upper === 'WHEN' && caseDepth === 0) {
      boundary = token.start;
      break;
    }
  }
  // An unbalanced CASE means the boundary could not be located reliably — decline
  // rather than emit a truncated condition that would back up the wrong rows.
  if (boundary === null && caseDepth > 0) return null;
  const clause = sql.slice(onEnd, boundary ?? sql.length).trim();
  return clause.length > 0 ? clause : null;
}

function findNextTopLevelToken(
  tokens: readonly SqlWordToken[],
  fromIndex: number
): SqlWordToken | undefined {
  return tokens.slice(fromIndex + 1).find((t) => t.depth === 0);
}

// ── Tokenizer (same approach as hanaSqlLimitGuard.ts) ────────────────────────

function tokenizeSqlWords(sql: string): SqlWordToken[] {
  const tokens: SqlWordToken[] = [];
  let depth = 0;
  let index = 0;

  while (index < sql.length) {
    const char = sql[index] ?? '';
    const next = sql[index + 1] ?? '';

    if (char === "'") {
      index = skipSingleQuotedString(sql, index);
    } else if (char === '"') {
      const start = index;
      index = skipDoubleQuotedIdentifier(sql, index);
      const text = sql.slice(start, index);
      tokens.push({ upper: text, text, start, end: index, depth });
    } else if (char === '-' && next === '-') {
      index = skipLineComment(sql, index);
    } else if (char === '/' && next === '*') {
      index = skipBlockComment(sql, index);
    } else if (char === '(') {
      depth += 1;
      index += 1;
    } else if (char === ')') {
      depth = Math.max(0, depth - 1);
      index += 1;
    } else if (isSqlWordStart(char)) {
      const start = index;
      index = readSqlWordEnd(sql, index + 1);
      const text = sql.slice(start, index);
      tokens.push({ upper: text.toUpperCase(), text, start, end: index, depth });
    } else {
      index += 1;
    }
  }

  return tokens;
}

function skipSingleQuotedString(sql: string, start: number): number {
  for (let i = start + 1; i < sql.length; i += 1) {
    if (sql[i] !== "'") continue;
    if (sql[i + 1] === "'") { i += 1; continue; }
    return i + 1;
  }
  return sql.length;
}

function skipDoubleQuotedIdentifier(sql: string, start: number): number {
  for (let i = start + 1; i < sql.length; i += 1) {
    if (sql[i] !== '"') continue;
    if (sql[i + 1] === '"') { i += 1; continue; }
    return i + 1;
  }
  return sql.length;
}

function skipLineComment(sql: string, start: number): number {
  const nl = sql.indexOf('\n', start + 2);
  return nl >= 0 ? nl + 1 : sql.length;
}

function skipBlockComment(sql: string, start: number): number {
  const end = sql.indexOf('*/', start + 2);
  return end >= 0 ? end + 2 : sql.length;
}

function readSqlWordEnd(sql: string, start: number): number {
  let i = start;
  while (i < sql.length && isSqlWordPart(sql[i] ?? '')) i += 1;
  return i;
}

function isSqlWordStart(char: string): boolean {
  return /^[A-Za-z_]$/.test(char);
}

function isSqlWordPart(char: string): boolean {
  return /^[A-Za-z0-9_$#]$/.test(char);
}
