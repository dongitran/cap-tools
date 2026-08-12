import { describe, expect, test } from 'vitest';

import { HanaQueryError } from './hanaSqlService';
import {
  MAX_HANA_SQL_BATCH_STATEMENTS,
  splitHanaSqlStatements,
} from './hanaSqlStatementSplitter';

describe('splitHanaSqlStatements', () => {
  test('returns a single statement when no top-level semicolon is present', () => {
    const statements = splitHanaSqlStatements('SELECT 1 FROM DUMMY');
    expect(statements).toEqual([{ sql: 'SELECT 1 FROM DUMMY', startOffset: 0 }]);
  });

  test('strips a single trailing semicolon and trailing whitespace', () => {
    const statements = splitHanaSqlStatements('SELECT 1 FROM DUMMY ;  \n');
    expect(statements).toEqual([{ sql: 'SELECT 1 FROM DUMMY', startOffset: 0 }]);
  });

  test('splits two statements separated by a top-level semicolon', () => {
    const statements = splitHanaSqlStatements('SELECT 1 FROM DUMMY; SELECT 2 FROM DUMMY');
    expect(statements).toHaveLength(2);
    expect(statements[0]?.sql).toBe('SELECT 1 FROM DUMMY');
    expect(statements[1]?.sql).toBe('SELECT 2 FROM DUMMY');
  });

  test('preserves semicolons inside single-quoted string literals', () => {
    const statements = splitHanaSqlStatements("SELECT 'a;b' FROM DUMMY; SELECT 'c;d' FROM DUMMY");
    expect(statements).toHaveLength(2);
    expect(statements[0]?.sql).toBe("SELECT 'a;b' FROM DUMMY");
    expect(statements[1]?.sql).toBe("SELECT 'c;d' FROM DUMMY");
  });

  test('handles escaped single quotes inside string literals', () => {
    const statements = splitHanaSqlStatements("SELECT 'a''b;c' FROM DUMMY; SELECT 2 FROM DUMMY");
    expect(statements).toHaveLength(2);
    expect(statements[0]?.sql).toBe("SELECT 'a''b;c' FROM DUMMY");
    expect(statements[1]?.sql).toBe('SELECT 2 FROM DUMMY');
  });

  test('preserves semicolons inside double-quoted identifiers', () => {
    const statements = splitHanaSqlStatements('SELECT * FROM "T;X"; SELECT 1 FROM DUMMY');
    expect(statements).toHaveLength(2);
    expect(statements[0]?.sql).toBe('SELECT * FROM "T;X"');
    expect(statements[1]?.sql).toBe('SELECT 1 FROM DUMMY');
  });

  test('preserves semicolons inside line comments', () => {
    const statements = splitHanaSqlStatements('SELECT 1 -- a;b\nFROM DUMMY; SELECT 2 FROM DUMMY');
    expect(statements).toHaveLength(2);
    expect(statements[0]?.sql).toContain('-- a;b');
    expect(statements[1]?.sql).toBe('SELECT 2 FROM DUMMY');
  });

  test('preserves semicolons inside block comments', () => {
    const statements = splitHanaSqlStatements('SELECT /* a;b */ 1 FROM DUMMY; SELECT 2 FROM DUMMY');
    expect(statements).toHaveLength(2);
    expect(statements[0]?.sql).toBe('SELECT /* a;b */ 1 FROM DUMMY');
    expect(statements[1]?.sql).toBe('SELECT 2 FROM DUMMY');
  });

  test('drops empty fragments between consecutive semicolons', () => {
    const statements = splitHanaSqlStatements('SELECT 1 FROM DUMMY;;SELECT 2 FROM DUMMY;');
    expect(statements).toHaveLength(2);
    expect(statements[0]?.sql).toBe('SELECT 1 FROM DUMMY');
    expect(statements[1]?.sql).toBe('SELECT 2 FROM DUMMY');
  });

  test('drops comment-only fragments', () => {
    const statements = splitHanaSqlStatements(
      'SELECT 1 FROM DUMMY;\n-- only a comment\n;\nSELECT 2 FROM DUMMY'
    );
    expect(statements).toHaveLength(2);
    expect(statements[0]?.sql).toBe('SELECT 1 FROM DUMMY');
    expect(statements[1]?.sql).toBe('SELECT 2 FROM DUMMY');
  });

  test('returns an empty list when input only contains whitespace and semicolons', () => {
    expect(splitHanaSqlStatements('   ;  ;\n  ;')).toEqual([]);
    expect(splitHanaSqlStatements('')).toEqual([]);
  });

  test('records the starting offset of each statement in the original input', () => {
    const input = 'SELECT 1 FROM DUMMY; SELECT 2 FROM DUMMY';
    const statements = splitHanaSqlStatements(input);
    expect(statements[0]?.startOffset).toBe(0);
    expect(statements[1]?.startOffset).toBe(input.indexOf('SELECT 2'));
  });

  describe('HANA block statements', () => {
    test('keeps an anonymous DO block whole', () => {
      const sql = 'DO BEGIN\n  DECLARE v INT = 1;\n  SELECT :v FROM DUMMY;\nEND;';
      const statements = splitHanaSqlStatements(sql);
      expect(statements).toHaveLength(1);
      expect(statements[0]?.sql).toBe('DO BEGIN\n  DECLARE v INT = 1;\n  SELECT :v FROM DUMMY;\nEND');
    });

    test('keeps a CREATE PROCEDURE body whole', () => {
      const sql = 'CREATE PROCEDURE p LANGUAGE SQLSCRIPT AS BEGIN INSERT INTO T VALUES(1); UPDATE T SET a=2; END;';
      const statements = splitHanaSqlStatements(sql);
      expect(statements).toHaveLength(1);
      expect(statements[0]?.sql).toContain('UPDATE T SET a=2');
    });

    test('keeps a trigger body whole', () => {
      const sql = 'CREATE TRIGGER t AFTER INSERT ON A BEGIN INSERT INTO B VALUES(1); END;';
      expect(splitHanaSqlStatements(sql)).toHaveLength(1);
    });

    test('does not let END IF close the enclosing BEGIN block', () => {
      const sql = 'DO BEGIN\n  IF 1 = 1 THEN\n    UPDATE T SET a = 1;\n  END IF;\n  UPDATE T SET b = 2;\nEND;';
      expect(splitHanaSqlStatements(sql)).toHaveLength(1);
    });

    test('does not let END WHILE or END FOR close the enclosing BEGIN block', () => {
      const whileSql = 'DO BEGIN\n  WHILE x < 3 DO\n    UPDATE T SET a = 1;\n  END WHILE;\nEND;';
      const forSql = 'DO BEGIN\n  FOR r AS c DO\n    UPDATE T SET a = 1;\n  END FOR;\nEND;';
      expect(splitHanaSqlStatements(whileSql)).toHaveLength(1);
      expect(splitHanaSqlStatements(forSql)).toHaveLength(1);
    });

    test('splits statements that follow a completed block', () => {
      const sql = 'DO BEGIN SELECT 1 FROM DUMMY; END;\nSELECT 2 FROM DUMMY;';
      const statements = splitHanaSqlStatements(sql);
      expect(statements).toHaveLength(2);
      expect(statements[1]?.sql).toBe('SELECT 2 FROM DUMMY');
    });

    test('balances CASE ... END so it does not swallow the rest of the script', () => {
      const sql = 'SELECT CASE WHEN a = 1 THEN 1 ELSE 2 END FROM T; SELECT 2 FROM DUMMY;';
      const statements = splitHanaSqlStatements(sql);
      expect(statements).toHaveLength(2);
      expect(statements[1]?.sql).toBe('SELECT 2 FROM DUMMY');
    });

    test('handles a CASE nested inside a block', () => {
      const sql = 'DO BEGIN\n  UPDATE T SET a = CASE WHEN b = 1 THEN 1 ELSE 2 END;\n  UPDATE T SET c = 3;\nEND;';
      expect(splitHanaSqlStatements(sql)).toHaveLength(1);
    });

    test('ignores BEGIN and END that are only part of a longer identifier', () => {
      const sql = 'SELECT BEGIN_DATE, END_DATE FROM T; SELECT 2 FROM DUMMY;';
      expect(splitHanaSqlStatements(sql)).toHaveLength(2);
    });

    test('ignores BEGIN and END inside quotes and comments', () => {
      const sql = "SELECT 'BEGIN' AS a FROM T; -- END\nSELECT 2 FROM DUMMY;";
      expect(splitHanaSqlStatements(sql)).toHaveLength(2);
    });

    test('ignores a quoted identifier named BEGIN', () => {
      const sql = 'SELECT "BEGIN" FROM T; SELECT 2 FROM DUMMY;';
      expect(splitHanaSqlStatements(sql)).toHaveLength(2);
    });

    test('never lets a stray END drive the depth negative', () => {
      const sql = 'SELECT CASE WHEN a THEN 1 END END FROM T; SELECT 2 FROM DUMMY;';
      expect(splitHanaSqlStatements(sql)).toHaveLength(2);
    });

    test('closes a SQLScript CASE statement on END CASE without re-opening it', () => {
      const sql = 'DO BEGIN CASE x WHEN 1 THEN UPDATE T SET a = 1; END CASE; END;\nSELECT 2 FROM DUMMY;';
      const statements = splitHanaSqlStatements(sql);
      expect(statements).toHaveLength(2);
      expect(statements[1]?.sql).toBe('SELECT 2 FROM DUMMY');
    });

    test('handles a top-level CASE statement closed by END CASE', () => {
      const sql = 'CASE x WHEN 1 THEN SELECT 1 FROM DUMMY; END CASE;\nSELECT 2 FROM DUMMY;';
      expect(splitHanaSqlStatements(sql)).toHaveLength(2);
    });

    test('handles nested CASE statements each closed by END CASE', () => {
      const sql =
        'DO BEGIN CASE a WHEN 1 THEN CASE b WHEN 2 THEN UPDATE T SET c = 1; END CASE; END CASE; END;\nSELECT 2 FROM DUMMY;';
      expect(splitHanaSqlStatements(sql)).toHaveLength(2);
    });

    test('still treats an expression CASE closed by a bare END correctly', () => {
      const sql = 'DO BEGIN UPDATE T SET a = CASE WHEN b THEN 1 ELSE 2 END; END;\nSELECT 2 FROM DUMMY;';
      expect(splitHanaSqlStatements(sql)).toHaveLength(2);
    });

    test('recognizes END CASE even with a comment between the two words', () => {
      const blockComment = 'DO BEGIN CASE x WHEN 1 THEN UPDATE T SET a = 1; END /* done */ CASE; END;\nSELECT 2 FROM DUMMY;';
      const lineComment = 'DO BEGIN CASE x WHEN 1 THEN UPDATE T SET a = 1; END -- done\n CASE; END;\nSELECT 2 FROM DUMMY;';
      expect(splitHanaSqlStatements(blockComment)).toHaveLength(2);
      expect(splitHanaSqlStatements(lineComment)).toHaveLength(2);
    });

    test('recognizes END IF even with a comment between the two words', () => {
      const sql = 'DO BEGIN IF 1 = 1 THEN UPDATE T SET a = 1; END /* x */ IF; UPDATE T SET b = 2; END;\nSELECT 2 FROM DUMMY;';
      expect(splitHanaSqlStatements(sql)).toHaveLength(2);
    });

    test('treats a trailing FOR UPDATE as a query option, not a loop close', () => {
      // `END FOR` closes a SQLScript FOR loop, but `END` followed by `FOR UPDATE`
      // is a CASE expression followed by a row-locking option — the bare END must
      // still close the CASE or every later semicolon is suppressed.
      const sql =
        "SELECT * FROM ORDERS WHERE STATUS = CASE WHEN 1 = 1 THEN 'OPEN' ELSE 'X' END FOR UPDATE;\nDELETE FROM ORDERS WHERE ID = 1;";
      const statements = splitHanaSqlStatements(sql);
      expect(statements).toHaveLength(2);
      expect(statements[1]?.sql).toBe('DELETE FROM ORDERS WHERE ID = 1');
    });

    test('treats the other trailing FOR options the same way', () => {
      for (const option of ['SHARE', 'JSON', 'XML']) {
        const sql = `SELECT CASE WHEN a THEN 1 ELSE 2 END FROM T FOR ${option};\nSELECT 2 FROM DUMMY;`;
        expect(splitHanaSqlStatements(sql)).toHaveLength(2);
      }
    });

    test('still lets END FOR close a SQLScript FOR loop', () => {
      const sql = 'DO BEGIN\n  FOR r AS c DO\n    UPDATE T SET a = 1;\n  END FOR;\nEND;\nSELECT 2 FROM DUMMY;';
      expect(splitHanaSqlStatements(sql)).toHaveLength(2);
    });

    test('an unterminated block keeps the remainder as one statement', () => {
      // Deliberate: after an unclosed BEGIN every following semicolon belongs to
      // the block body as far as any parser can tell.
      const sql = 'DO BEGIN SELECT 1 FROM DUMMY; DROP TABLE X';
      expect(splitHanaSqlStatements(sql)).toHaveLength(1);
    });
  });

  test('throws when the number of statements exceeds the hard cap', () => {
    const input = Array.from({ length: MAX_HANA_SQL_BATCH_STATEMENTS + 1 }, () => 'SELECT 1 FROM DUMMY').join(';\n');
    expect(() => splitHanaSqlStatements(input)).toThrowError(HanaQueryError);
  });

  test('accepts exactly the hard cap of statements', () => {
    const input = Array.from({ length: MAX_HANA_SQL_BATCH_STATEMENTS }, () => 'SELECT 1 FROM DUMMY').join(';\n');
    const statements = splitHanaSqlStatements(input);
    expect(statements).toHaveLength(MAX_HANA_SQL_BATCH_STATEMENTS);
  });
});
