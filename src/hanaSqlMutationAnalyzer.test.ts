import { describe, expect, it } from 'vitest';
import { analyzeMutatingStatement } from './hanaSqlMutationAnalyzer';

describe('hanaSqlMutationAnalyzer', () => {
  it('should return null for non-mutating statements (SELECT, CREATE, ALTER, INSERT, UPSERT)', () => {
    expect(analyzeMutatingStatement('SELECT * FROM "Employees"', 'schema')).toBeNull();
    expect(analyzeMutatingStatement('CREATE TABLE "Temp" ("ID" INT)', 'schema')).toBeNull();
    expect(analyzeMutatingStatement('ALTER TABLE "Users" ADD "Age" INT', 'schema')).toBeNull();
    expect(analyzeMutatingStatement('INSERT INTO "Users" ("ID") VALUES (1)', 'schema')).toBeNull();
    expect(analyzeMutatingStatement('UPSERT "Users" ("ID") VALUES (1) WITH PRIMARY KEY', 'schema')).toBeNull();
  });

  describe('UPSERT (Ignored / Non-backupable)', () => {
    it('should ignore basic UPSERT with VALUES and PRIMARY KEY', () => {
      const sql = 'UPSERT "Employees" ("ID", "Name") VALUES (1, \'John\') WITH PRIMARY KEY';
      expect(analyzeMutatingStatement(sql, 'MYSCHEMA')).toBeNull();
    });

    it('should ignore UPSERT with SELECT subquery', () => {
      const sql = 'UPSERT "Employees" SELECT "ID", "Name" FROM "StagingEmployees"';
      expect(analyzeMutatingStatement(sql, 'MYSCHEMA')).toBeNull();
    });

    it('should ignore UPSERT with SELECT subquery and its own WHERE clause', () => {
      // The WHERE clause here belongs to the SELECT, but even so, the whole statement is an UPSERT
      // and thus should not trigger a backup.
      const sql = 'UPSERT "Employees" SELECT "ID", "Name" FROM "StagingEmployees" WHERE "Status" = \'ACTIVE\'';
      expect(analyzeMutatingStatement(sql, 'MYSCHEMA')).toBeNull();
    });

    it('should ignore extreme whitespace and unquoted UPSERT', () => {
      const sql = '\n \n UPSERT \n \n  Employees   \n \n SELECT \n X FROM \n Y \n WHERE \n Z = 1 \n ';
      expect(analyzeMutatingStatement(sql, 'MYSCHEMA')).toBeNull();
    });

    it('should ignore UPSERT with fully qualified table names and subqueries', () => {
      const sql = 'UPSERT MYSCHEMA."Target" ("A", "B") SELECT "A", "B" FROM OTHERSCHEMA."Source" WHERE "Date" > \'2023\' GROUP BY "A", "B"';
      expect(analyzeMutatingStatement(sql, 'MYSCHEMA')).toBeNull();
    });
  });

  describe('UPDATE', () => {
    it('should extract basic UPDATE', () => {
      const sql = 'UPDATE "Employees" SET "Salary" = 50000 WHERE "Department" = \'Sales\'';
      const result = analyzeMutatingStatement(sql, 'MYSCHEMA');
      expect(result).not.toBeNull();
      expect(result?.canBackup).toBe(true);
      expect(result?.statementType).toBe('UPDATE');
      expect(result?.tableName).toBe('"Employees"');
      expect(result?.whereClause).toBe('"Department" = \'Sales\'');
      expect(result?.backupSelectSql).toBe('SELECT * FROM MYSCHEMA."Employees" WHERE "Department" = \'Sales\'');
    });

    it('should handle fully qualified table name', () => {
      const sql = 'UPDATE OTHERSCHEMA."Employees" SET "Status" = 1 WHERE "ID" = 5';
      const result = analyzeMutatingStatement(sql, 'MYSCHEMA');
      expect(result?.tableName).toBe('OTHERSCHEMA."Employees"');
      expect(result?.backupSelectSql).toBe('SELECT * FROM OTHERSCHEMA."Employees" WHERE "ID" = 5');
    });

    it('should refuse backup if no WHERE clause is provided', () => {
      const sql = 'UPDATE "Employees" SET "Salary" = 50000';
      const result = analyzeMutatingStatement(sql, 'MYSCHEMA');
      expect(result?.canBackup).toBe(false);
      expect(result?.backupSelectSql).toBeNull();
    });

    it('should strip trailing clauses (ORDER BY, LIMIT)', () => {
      const sql = 'UPDATE "Employees" SET "Salary" = 50000 WHERE "Department" = \'Sales\' LIMIT 10';
      const result = analyzeMutatingStatement(sql, 'MYSCHEMA');
      expect(result?.whereClause).toBe('"Department" = \'Sales\'');
    });

    it('should ignore WHERE inside nested SELECTs', () => {
      const sql = 'UPDATE "Employees" SET "Salary" = (SELECT MAX("Sal") FROM "T" WHERE "ID"=1) WHERE "Department" = \'Sales\'';
      const result = analyzeMutatingStatement(sql, 'MYSCHEMA');
      expect(result?.whereClause).toBe('"Department" = \'Sales\'');
    });
    
    it('should handle extreme whitespace and comments', () => {
      const sql = 'UPDATE    "Employees" \n /* comment */ \n SET "Salary" = 100 \n -- inline comment \n WHERE \n "ID" = 10';
      const result = analyzeMutatingStatement(sql, 'MYSCHEMA');
      expect(result?.tableName).toBe('"Employees"');
      expect(result?.whereClause).toBe('"ID" = 10');
    });

    it('should handle unquoted table names and extremely fragmented statements', () => {
      const sql = '\n \n UPDATE \n \n  Employees   \n \n SET \n X = 1 \n WHERE \n Y = 2 \n ';
      const result = analyzeMutatingStatement(sql, 'SCH');
      expect(result?.tableName).toBe('Employees');
      expect(result?.whereClause).toBe('Y = 2');
      expect(result?.backupSelectSql).toBe('SELECT * FROM SCH.Employees WHERE Y = 2');
    });
  });

  describe('DELETE', () => {
    it('should extract basic DELETE FROM', () => {
      const sql = 'DELETE FROM "Logs" WHERE "Timestamp" < \'2023-01-01\'';
      const result = analyzeMutatingStatement(sql, '');
      expect(result?.statementType).toBe('DELETE');
      expect(result?.tableName).toBe('"Logs"');
      expect(result?.backupSelectSql).toBe('SELECT * FROM "Logs" WHERE "Timestamp" < \'2023-01-01\'');
    });

    it('should extract DELETE without FROM (HANA allows this)', () => {
      const sql = 'DELETE "Logs" WHERE "Level" = \'ERROR\'';
      const result = analyzeMutatingStatement(sql, 'SCH');
      expect(result?.tableName).toBe('"Logs"');
      expect(result?.backupSelectSql).toBe('SELECT * FROM SCH."Logs" WHERE "Level" = \'ERROR\'');
    });

    it('should refuse backup if no WHERE clause', () => {
      const sql = 'DELETE FROM "Logs"';
      const result = analyzeMutatingStatement(sql, 'SCH');
      expect(result?.canBackup).toBe(false);
    });
  });

  describe('MERGE', () => {
    it('should semi-join the USING source so the ON clause actually resolves', () => {
      const sql = 'MERGE INTO "Target" USING "Source" ON "Target"."ID" = "Source"."ID" WHEN MATCHED THEN UPDATE SET "Val" = 1';
      const result = analyzeMutatingStatement(sql, 'SCH');
      expect(result?.statementType).toBe('MERGE');
      expect(result?.tableName).toBe('"Target"');
      expect(result?.whereClause).toBe('"Target"."ID" = "Source"."ID"');
      expect(result?.backupSelectSql).toBe(
        'SELECT * FROM SCH."Target" WHERE EXISTS (SELECT 1 FROM SCH."Source" WHERE "Target"."ID" = "Source"."ID"\n)'
      );
    });

    it('should extract MERGE without INTO (HANA syntax variation)', () => {
      const sql = 'MERGE "Target" USING "Source" ON "Target"."ID" = 1';
      const result = analyzeMutatingStatement(sql, 'SCH');
      expect(result?.tableName).toBe('"Target"');
      expect(result?.whereClause).toBe('"Target"."ID" = 1');
      expect(result?.backupSelectSql).toBe(
        'SELECT * FROM SCH."Target" WHERE EXISTS (SELECT 1 FROM SCH."Source" WHERE "Target"."ID" = 1\n)'
      );
    });

    it('should carry both aliases into the EXISTS subquery', () => {
      const sql = 'MERGE INTO ORDERS o USING STAGED s ON (o.ID = s.ID) WHEN MATCHED THEN UPDATE SET o.QTY = s.QTY';
      const result = analyzeMutatingStatement(sql, 'SCH');
      expect(result?.canBackup).toBe(true);
      expect(result?.backupSelectSql).toBe(
        'SELECT * FROM SCH.ORDERS o WHERE EXISTS (SELECT 1 FROM SCH.STAGED s WHERE (o.ID = s.ID)\n)'
      );
    });

    it('should support AS aliases on both sides', () => {
      const sql = 'MERGE INTO ORDERS AS o USING STAGED AS s ON o.ID = s.ID WHEN MATCHED THEN UPDATE SET o.QTY = 1';
      const result = analyzeMutatingStatement(sql, 'SCH');
      expect(result?.backupSelectSql).toBe(
        'SELECT * FROM SCH.ORDERS o WHERE EXISTS (SELECT 1 FROM SCH.STAGED s WHERE o.ID = s.ID\n)'
      );
    });

    it('should keep a parenthesized source subquery intact', () => {
      const sql = 'MERGE INTO ORDERS o USING (SELECT ID, QTY FROM STAGED WHERE FLAG = 1) s ON o.ID = s.ID WHEN MATCHED THEN UPDATE SET o.QTY = s.QTY';
      const result = analyzeMutatingStatement(sql, 'SCH');
      expect(result?.canBackup).toBe(true);
      expect(result?.backupSelectSql).toBe(
        'SELECT * FROM SCH.ORDERS o WHERE EXISTS (SELECT 1 FROM (SELECT ID, QTY FROM STAGED WHERE FLAG = 1) s WHERE o.ID = s.ID\n)'
      );
    });

    it('should not cut the ON clause at a column whose name contains WHEN', () => {
      const sql = 'MERGE INTO T USING S ON (T.WHEN_CREATED = S.WHEN_CREATED) WHEN MATCHED THEN UPDATE SET T.A = 1';
      const result = analyzeMutatingStatement(sql, 'SCH');
      expect(result?.whereClause).toBe('(T.WHEN_CREATED = S.WHEN_CREATED)');
      expect(result?.backupSelectSql).toBe(
        'SELECT * FROM SCH.T WHERE EXISTS (SELECT 1 FROM SCH.S WHERE (T.WHEN_CREATED = S.WHEN_CREATED)\n)'
      );
    });

    it('should not cut the ON clause at WHEN inside a string literal', () => {
      const sql = "MERGE INTO T USING S ON T.CODE = 'WHEN MATCHED' WHEN MATCHED THEN UPDATE SET T.A = 1";
      const result = analyzeMutatingStatement(sql, 'SCH');
      expect(result?.whereClause).toBe("T.CODE = 'WHEN MATCHED'");
    });

    it('should refuse a backup when the USING source cannot be parsed', () => {
      const sql = 'MERGE INTO T USING ON T.ID = 1 WHEN MATCHED THEN UPDATE SET A = 1';
      const result = analyzeMutatingStatement(sql, 'SCH');
      expect(result?.canBackup).toBe(false);
      expect(result?.backupSelectSql).toBeNull();
    });

    it('should refuse a backup when there is no ON clause', () => {
      const sql = 'MERGE INTO T USING S WHEN MATCHED THEN UPDATE SET A = 1';
      const result = analyzeMutatingStatement(sql, 'SCH');
      expect(result?.canBackup).toBe(false);
      expect(result?.backupSelectSql).toBeNull();
    });

    it('should use EXISTS so a fan-out source cannot duplicate target rows', () => {
      const sql = 'MERGE INTO ORDERS o USING LINES l ON o.ID = l.ORDER_ID WHEN MATCHED THEN UPDATE SET o.QTY = l.QTY';
      const backup = analyzeMutatingStatement(sql, 'SCH')?.backupSelectSql ?? '';
      // A JOIN would emit one target row per matching source row.
      expect(backup).toContain('WHERE EXISTS (SELECT 1 FROM');
      expect(backup).not.toContain('JOIN');
    });

    it('should qualify an unqualified USING source with the app schema', () => {
      const sql = 'MERGE INTO ORDERS o USING STAGED s ON o.ID = s.ID WHEN MATCHED THEN UPDATE SET o.QTY = 1';
      expect(analyzeMutatingStatement(sql, 'SCH')?.backupSelectSql).toContain('FROM SCH.STAGED s');
    });

    it('should leave an already-qualified USING source alone', () => {
      const sql = 'MERGE INTO ORDERS o USING OTHER.STAGED s ON o.ID = s.ID WHEN MATCHED THEN UPDATE SET o.QTY = 1';
      const backup = analyzeMutatingStatement(sql, 'SCH')?.backupSelectSql ?? '';
      expect(backup).toContain('FROM OTHER.STAGED s');
      expect(backup).not.toContain('SCH.OTHER');
    });

    it('should refuse a backup when the USING source is a table function', () => {
      const sql = 'MERGE INTO ORDERS o USING MY_FUNC(1, 2) s ON o.ID = s.ID WHEN MATCHED THEN UPDATE SET o.QTY = 1';
      const result = analyzeMutatingStatement(sql, 'SCH');
      expect(result?.canBackup).toBe(false);
      expect(result?.backupSelectSql).toBeNull();
    });
  });

  describe('UPDATE ... FROM (multi-table update)', () => {
    it('should refuse a backup because the WHERE spans tables the backup cannot see', () => {
      const sql = 'UPDATE ORDERS o SET o.QTY = s.QTY FROM STAGED s WHERE o.ID = s.ID';
      const result = analyzeMutatingStatement(sql, 'SCH');
      expect(result?.canBackup).toBe(false);
      expect(result?.backupSelectSql).toBeNull();
    });

    it('should still back up a plain UPDATE whose subquery contains FROM', () => {
      const sql = 'UPDATE ORDERS SET QTY = 1 WHERE ID IN (SELECT ID FROM STAGED)';
      const result = analyzeMutatingStatement(sql, 'SCH');
      expect(result?.canBackup).toBe(true);
      expect(result?.backupSelectSql).toBe(
        'SELECT * FROM SCH.ORDERS WHERE ID IN (SELECT ID FROM STAGED)'
      );
    });
  });

  describe('table aliases', () => {
    it('should keep an UPDATE alias so alias-qualified predicates resolve', () => {
      const result = analyzeMutatingStatement(
        "UPDATE SALES_ORDER so SET STATUS = 'CANCELLED' WHERE so.CUSTOMER_ID = 42",
        'MYSCHEMA'
      );
      expect(result?.tableName).toBe('SALES_ORDER');
      expect(result?.backupSelectSql).toBe(
        'SELECT * FROM MYSCHEMA.SALES_ORDER so WHERE so.CUSTOMER_ID = 42'
      );
    });

    it('should keep an UPDATE ... AS alias', () => {
      const result = analyzeMutatingStatement(
        'UPDATE SALES_ORDER AS so SET STATUS = 1 WHERE so.ID = 7',
        'MYSCHEMA'
      );
      expect(result?.backupSelectSql).toBe(
        'SELECT * FROM MYSCHEMA.SALES_ORDER so WHERE so.ID = 7'
      );
    });

    it('should keep a DELETE alias', () => {
      const result = analyzeMutatingStatement(
        'DELETE FROM SALES_ORDER so WHERE so.ID IN (1, 2)',
        'MYSCHEMA'
      );
      expect(result?.backupSelectSql).toBe(
        'SELECT * FROM MYSCHEMA.SALES_ORDER so WHERE so.ID IN (1, 2)'
      );
    });

    it('should not mistake SET or WHERE for an alias', () => {
      expect(
        analyzeMutatingStatement('UPDATE ORDERS SET QTY = 1 WHERE ID = 2', 'SCH')?.backupSelectSql
      ).toBe('SELECT * FROM SCH.ORDERS WHERE ID = 2');
      expect(
        analyzeMutatingStatement('DELETE FROM ORDERS WHERE ID = 2', 'SCH')?.backupSelectSql
      ).toBe('SELECT * FROM SCH.ORDERS WHERE ID = 2');
    });

    it('should keep an alias on a schema-qualified table', () => {
      const result = analyzeMutatingStatement(
        'UPDATE OTHER.ORDERS o SET QTY = 1 WHERE o.ID = 3',
        'SCH'
      );
      expect(result?.backupSelectSql).toBe('SELECT * FROM OTHER.ORDERS o WHERE o.ID = 3');
    });
  });

  describe('Edge Cases', () => {
    it('should handle malformed SQL missing table gracefully', () => {
      expect(analyzeMutatingStatement('UPDATE ', 'SCH')).toBeNull();
      expect(analyzeMutatingStatement('DELETE FROM ', 'SCH')).toBeNull();
    });
    
    it('should not choke on unmatched quotes', () => {
      const sql = 'UPDATE "Table SET "Val" = 1 WHERE "ID" = 2';
      const result = analyzeMutatingStatement(sql, 'SCH');
      expect(result).toBeDefined();
    });

    it('should handle complex nested parentheses in WHERE clause correctly', () => {
      const sql = 'UPDATE "Users" SET "Status" = 0 WHERE "ID" IN (SELECT "UserID" FROM "Bans" WHERE "Reason" IN (SELECT "Code" FROM "Reasons" WHERE (Type = 1) AND (Severity > (SELECT MAX(X) FROM Y))))';
      const result = analyzeMutatingStatement(sql, 'SCH');
      expect(result).not.toBeNull();
      expect(result?.whereClause).toBe('"ID" IN (SELECT "UserID" FROM "Bans" WHERE "Reason" IN (SELECT "Code" FROM "Reasons" WHERE (Type = 1) AND (Severity > (SELECT MAX(X) FROM Y))))');
    });

    it('should correctly parse complex MERGE statement with multiple ON conditions', () => {
      const sql = 'MERGE INTO "Dest" USING "Source" ON "Dest"."ID" = "Source"."ID" AND ("Dest"."Cat" = "Source"."Cat" OR "Dest"."Type" = 5) WHEN MATCHED THEN UPDATE SET "Val" = 1';
      const result = analyzeMutatingStatement(sql, 'SCH');
      expect(result).not.toBeNull();
      expect(result?.statementType).toBe('MERGE');
      expect(result?.tableName).toBe('"Dest"');
      expect(result?.whereClause).toBe('"Dest"."ID" = "Source"."ID" AND ("Dest"."Cat" = "Source"."Cat" OR "Dest"."Type" = 5)');
    });

    it('should handle missing table name in analyzeSqlMutation directly', () => {
      const sql = 'UPDATE "" SET x = 1';
      const result = analyzeMutatingStatement(sql, 'SCH');
      expect(result?.canBackup).toBe(false);
      expect(result?.tableName).toBe('""');
    });

    it('should not build backup SQL for empty quoted table identifiers with filters', () => {
      const updateResult = analyzeMutatingStatement('UPDATE "" SET x = 1 WHERE ID = 1', 'SCH');
      const deleteResult = analyzeMutatingStatement('DELETE FROM "" WHERE ID = 1', 'SCH');

      expect(updateResult?.canBackup).toBe(false);
      expect(updateResult?.backupSelectSql).toBeNull();
      expect(deleteResult?.canBackup).toBe(false);
      expect(deleteResult?.backupSelectSql).toBeNull();
    });

    it('should gracefully handle unclosed single quotes at EOF', () => {
      const sql = "UPDATE t SET name = 'unclosed";
      const result = analyzeMutatingStatement(sql, 'SCH');
      expect(result).toBeDefined();
    });

    it('should gracefully handle unclosed double quotes at EOF', () => {
      const sql = 'DELETE FROM "unclosed_table';
      const result = analyzeMutatingStatement(sql, 'SCH');
      expect(result?.canBackup).toBe(false); // No WHERE clause found, but it parsed safely to EOF
    });
  });
});
