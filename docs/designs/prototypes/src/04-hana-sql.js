function triggerRefreshHanaTables() {
  const serviceId = selectedHanaServiceId;
  if (serviceId.length === 0) {
    return false;
  }
  const service = resolveHanaServices().find((entry) => entry.id === serviceId);
  if (service === undefined) {
    return false;
  }
  hanaTablesLoadingByServiceId = new Map(hanaTablesLoadingByServiceId);
  hanaTablesLoadingByServiceId.set(serviceId, 'loading');
  hanaTablesErrorByServiceId = new Map(hanaTablesErrorByServiceId);
  hanaTablesErrorByServiceId.delete(serviceId);
  if (vscodeApi !== null) {
    vscodeApi.postMessage({
      type: 'sapTools.refreshHanaTables',
      serviceId: service.id,
      serviceName: service.name,
    });
    return true;
  }
  hanaTablesByServiceId = new Map(hanaTablesByServiceId);
  hanaTablesByServiceId.delete(serviceId);
  primeHanaTablesForStandalone(serviceId);
  return true;
}

function primeHanaTablesForStandalone(serviceId) {
  if (vscodeApi !== null) {
    return;
  }
  if (hanaTablesByServiceId.has(serviceId)) {
    return;
  }
  if (hanaTablesLoadingByServiceId.get(serviceId) === 'loading') {
    return;
  }
  const service = resolveHanaServices().find((entry) => entry.id === serviceId);
  if (service === undefined) {
    return;
  }
  hanaTablesLoadingByServiceId = new Map(hanaTablesLoadingByServiceId);
  hanaTablesLoadingByServiceId.set(serviceId, 'loading');
  window.setTimeout(() => {
    hanaTablesByServiceId = new Map(hanaTablesByServiceId);
    hanaTablesLoadingByServiceId = new Map(hanaTablesLoadingByServiceId);
    hanaTablesByServiceId.set(
      serviceId,
      normalizeHanaTableEntries(buildStandaloneTableNames(service.name))
    );
    hanaTablesLoadingByServiceId.set(serviceId, 'loaded');
    refreshUiAfterSqlStateChange();
  }, 450);
}

function buildStandaloneTableNames(appName) {
  const prefix = (appName ?? '').toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  const normalized = prefix.length > 0 ? prefix : 'APP';
  const baseTables = [
    `${normalized}_ORDERS`,
    `${normalized}_ITEMS`,
    `${normalized}_AUDIT`,
    `${normalized}_SAP_CAP_CDS_INVOICE_RECONCILIATION_DRAFTADMINISTRATIVEDATA`,
    `${normalized}_COM_SAP_S4HANA_FINANCE_GENERAL_LEDGER_ACCOUNTING_DOCUMENT_ITEM`,
    `${normalized}_VERY_LONG_NAMESPACE_WITH_DEEPLY_NESTED_SERVICE_PROJECTION_FOR_PAYMENT_ALLOCATION_HISTORY`,
    `${normalized}_I_BUSINESSPARTNERBANK_0001_TO_SUPPLIERINVOICEPAYMENTBLOCKREASON`,
    'DEMO_APP',
    'DEMO_PURCHASEORDERITEMMAPPING',
    'DEMO_BUSINESSAPP_TEST',
    'DUMMY',
    'M_TABLES',
  ];
  const generatedTables = Array.from({ length: 93 }, (_, index) => {
    return `${normalized}_ENTITY_${String(index + 1).padStart(3, '0')}`;
  });
  return [...baseTables, ...generatedTables];
}

function triggerRunHanaTableSelect(serviceId, tableName, displayTableName = tableName) {
  const service = resolveHanaServices().find((entry) => entry.id === serviceId);
  if (service === undefined) {
    hanaQueryStatusTone = 'error';
    hanaQueryStatusMessage = 'Selected app is no longer available.';
    return true;
  }
  hanaQueryStatusTone = 'info';
  hanaQueryStatusMessage = '';
  hanaSqlResultContextMenuState = null;
  setHanaTableSelectLoading(serviceId, tableName, true);

  if (vscodeApi === null) {
    hanaSqlResultPreviewState = buildPrototypeSqlResultLoadingState(service.name, displayTableName);
    hanaSqlResultExportMenuOpen = false;
    window.setTimeout(() => {
      setHanaTableSelectLoading(serviceId, tableName, false);
      hanaSqlResultPreviewState = buildPrototypeSqlResultReadyState(
        service.name,
        tableName,
        displayTableName
      );
      refreshSqlResultPreviewPanel();
    }, 700);
    return true;
  }

  vscodeApi.postMessage({
    type: RUN_HANA_TABLE_SELECT_MESSAGE_TYPE,
    serviceId: service.id,
    serviceName: service.name,
    tableName,
  });
  return true;
}

function buildPrototypeSqlResultLoadingState(appName, tableName) {
  return {
    appName,
    tableName,
    phase: 'loading',
    startedAt: new Date().toISOString(),
  };
}

function buildPrototypeSqlResultReadyState(appName, tableName, displayTableName = tableName) {
  const executedAt = new Date().toISOString();
  return {
    appName,
    batchSummary: {
      committed: false,
      rolledBack: true,
      usedTransaction: true,
    },
    executedAt,
    phase: 'ready',
    statements: [
      {
        columns: ['ID', 'TABLE_NAME', 'STATUS', 'DESCRIPTION'],
        elapsedMs: 128,
        rows: [
          ['1', tableName, 'READY', 'Prototype row with comma, quote " and newline\nfor export checks.'],
          [
            '2',
            tableName,
            'SUCCESS',
            '{"status":"Success","message":"This is mock data for testing","timestamp":"2026-04-08T03:10:07.482Z"}',
          ],
        ],
        sql: `SELECT * FROM "${tableName}" LIMIT 100`,
        status: 'success',
        tableName: displayTableName,
      },
      {
        elapsedMs: 64,
        errorMessage: 'Prototype batch statement failed, so SAP Tools rolled back the transaction.',
        sql: `UPDATE "${tableName}" SET STATUS = 'READY' WHERE ID = 'draft-42'`,
        status: 'error',
        tableName: displayTableName,
      },
      {
        sql: `SELECT COUNT(*) AS TOTAL FROM "${tableName}"`,
        status: 'skipped',
        tableName: displayTableName,
      },
    ],
    tableName: displayTableName,
  };
}

function triggerPrototypeSqlResultExportAction(action) {
  if (hanaSqlResultPreviewState?.phase !== 'ready') {
    return true;
  }

  const isJson = action.endsWith('-json');
  const isCopy = action.startsWith('copy-');
  const content = isJson
    ? buildPrototypeSqlResultJson(hanaSqlResultPreviewState)
    : buildPrototypeSqlResultCsv(hanaSqlResultPreviewState);
  hanaSqlResultExportMenuOpen = false;
  hanaSqlResultContextMenuState = null;

  if (isCopy && navigator.clipboard?.writeText !== undefined) {
    void navigator.clipboard.writeText(content);
  }

  return true;
}

function triggerPrototypeSqlResultContextCopyAction(action) {
  if (hanaSqlResultPreviewState?.phase !== 'ready' || hanaSqlResultContextMenuState === null) {
    return true;
  }

  const state = hanaSqlResultPreviewState;
  const { rowIndex, columnIndex, statementIndex } = hanaSqlResultContextMenuState;
  const resultState = resolvePrototypeSqlResultContextState(state, statementIndex);
  const row = resultState?.rows[rowIndex];
  hanaSqlResultContextMenuState = null;
  if (!Array.isArray(row)) {
    return true;
  }

  const content =
    action === 'copy-sql-result-row-object'
      ? buildPrototypeSqlResultRowObjectJson(resultState, row)
      : row[columnIndex] ?? '';
  if (navigator.clipboard?.writeText !== undefined) {
    void navigator.clipboard.writeText(content);
  }
  return true;
}

function buildPrototypeSqlResultCsv(state) {
  if (isPrototypeSqlResultBatchState(state)) {
    return buildPrototypeSqlResultBatchCsv(state);
  }
  return [
    state.columns.map(escapeCsvValue).join(','),
    ...state.rows.map((row) => state.columns.map((_, index) => escapeCsvValue(row[index] ?? '')).join(',')),
  ].join('\n');
}

function escapeCsvValue(value) {
  if (!/[",\r\n]/.test(value)) {
    return value;
  }
  return `"${value.replaceAll('"', '""')}"`;
}

function buildPrototypeSqlResultJson(state) {
  if (isPrototypeSqlResultBatchState(state)) {
    return buildPrototypeSqlResultBatchJson(state);
  }
  const columnKeys = buildPrototypeSqlResultColumnKeys(state.columns);
  const rows = state.rows.map((row) => {
    return Object.fromEntries(columnKeys.map((column, index) => [column, row[index] ?? '']));
  });
  return JSON.stringify(rows, null, 2);
}

function buildPrototypeSqlResultRowObjectJson(state, row) {
  const columnKeys = buildPrototypeSqlResultColumnKeys(state.columns);
  const rowObject = Object.fromEntries(
    columnKeys.map((column, index) => [column, row[index] ?? ''])
  );
  return JSON.stringify(rowObject, null, 2);
}

function buildPrototypeSqlResultColumnKeys(columns) {
  const counts = new Map();
  return columns.map((column, index) => {
    const rawColumn = typeof column === 'string' ? column.trim() : '';
    const baseKey = rawColumn.length > 0 ? rawColumn : `COLUMN_${String(index + 1)}`;
    const count = (counts.get(baseKey) ?? 0) + 1;
    counts.set(baseKey, count);
    return count === 1 ? baseKey : `${baseKey}_${String(count)}`;
  });
}

function isPrototypeSqlResultBatchState(state) {
  return Array.isArray(state?.statements) && state.statements.length > 1;
}

function resolvePrototypeSqlResultContextState(state, statementIndex) {
  if (!isPrototypeSqlResultBatchState(state)) {
    return state;
  }
  if (!Number.isInteger(statementIndex)) {
    return null;
  }
  const statement = state.statements[statementIndex];
  if (statement?.status !== 'success' || !Array.isArray(statement.rows)) {
    return null;
  }
  return statement;
}

function buildPrototypeSqlResultBatchCsv(state) {
  const sections = [];
  state.statements.forEach((statement, index) => {
    sections.push(buildPrototypeSqlBatchSectionHeader(statement, index));
    if (statement.status === 'success' && Array.isArray(statement.rows)) {
      sections.push(buildPrototypeSqlResultCsv(statement));
    }
    sections.push('');
  });
  return sections.join('\n');
}

function buildPrototypeSqlBatchSectionHeader(statement, index) {
  const status = String(statement.status ?? 'pending').toUpperCase();
  const tableName = statement.tableName ?? 'SQL statement';
  const elapsed = Number.isInteger(statement.elapsedMs) ? `, ${String(statement.elapsedMs)} ms` : '';
  const suffix = statement.errorMessage !== undefined ? ` - ${statement.errorMessage}` : '';
  return `-- Statement ${String(index + 1)} (${status}, ${tableName}${elapsed})${suffix}`;
}

function buildPrototypeSqlResultBatchJson(state) {
  const statements = state.statements.map((statement, index) => {
    const record = {
      index: index + 1,
      sql: statement.sql,
      status: statement.status,
      tableName: statement.tableName,
    };
    if (Number.isInteger(statement.elapsedMs)) {
      record.elapsedMs = statement.elapsedMs;
    }
    if (typeof statement.errorMessage === 'string') {
      record.errorMessage = statement.errorMessage;
    }
    if (Array.isArray(statement.rows)) {
      record.rows = buildPrototypeSqlResultRows(statement);
    }
    return record;
  });
  return JSON.stringify({ statements }, null, 2);
}

function buildPrototypeSqlResultRows(state) {
  const columnKeys = buildPrototypeSqlResultColumnKeys(state.columns);
  return state.rows.map((row) => {
    return Object.fromEntries(columnKeys.map((column, index) => [column, row[index] ?? '']));
  });
}

