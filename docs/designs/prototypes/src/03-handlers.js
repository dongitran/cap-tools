function handleAction(action, actionElement) {
  const selectionActionHandled = handleSelectionFlowAction(action, actionElement);
  if (selectionActionHandled !== null) {
    return selectionActionHandled;
  }

  const tabActionHandled = handleTabAction(action, actionElement.dataset.tabId ?? '');
  if (tabActionHandled !== null) {
    return tabActionHandled;
  }

  const logsActionHandled = handleLogsAction(action, actionElement);
  if (logsActionHandled !== null) {
    return logsActionHandled;
  }

  const serviceExportActionHandled = handleServiceExportAction(action, actionElement);
  if (serviceExportActionHandled !== null) {
    return serviceExportActionHandled;
  }

  const sqlTabActionHandled = handleSqlTabAction(action, actionElement);
  if (sqlTabActionHandled !== null) {
    return sqlTabActionHandled;
  }

  return false;
}

function handleSqlTabAction(action, actionElement) {
  if (action === 'toggle-sql-result-export-menu') {
    hanaSqlResultExportMenuOpen = !hanaSqlResultExportMenuOpen;
    hanaSqlResultContextMenuState = null;
    return true;
  }

  if (action === 'open-sql-backup-history') {
    return true;
  }

  if (
    action === 'copy-sql-result-csv' ||
    action === 'copy-sql-result-json' ||
    action === 'export-sql-result-csv' ||
    action === 'export-sql-result-json'
  ) {
    return triggerPrototypeSqlResultExportAction(action);
  }

  if (
    action === 'copy-sql-result-row-object' ||
    action === 'copy-sql-result-cell-value'
  ) {
    return triggerPrototypeSqlResultContextCopyAction(action);
  }

  if (action === 'select-hana-service') {
    const serviceId = actionElement.dataset.serviceId ?? '';
    if (serviceId.length === 0) {
      return false;
    }
    if (selectedHanaServiceId !== serviceId) {
      sqlTableSearchKeyword = '';
      hanaSqlResultPreviewState = null;
      hanaSqlResultExportMenuOpen = false;
      hanaSqlResultContextMenuState = null;
    }
    selectedHanaServiceId = serviceId;
    if (vscodeApi !== null && !hanaTablesByServiceId.has(serviceId)) {
      hanaTablesLoadingByServiceId = new Map(hanaTablesLoadingByServiceId);
      hanaTablesLoadingByServiceId.set(serviceId, 'loading');
    }
    primeHanaTablesForStandalone(serviceId);
    return triggerOpenHanaSqlFile();
  }

  if (action === 'run-hana-table-select') {
    const serviceId = actionElement.dataset.serviceId ?? '';
    const tableName = actionElement.dataset.tableName ?? '';
    const row = actionElement.closest('[data-role="hana-table-row"]');
    const displayTableName =
      row instanceof HTMLElement ? row.dataset.displayTableName ?? tableName : tableName;
    if (serviceId.length === 0 || tableName.length === 0) {
      return false;
    }
    return triggerRunHanaTableSelect(serviceId, tableName, displayTableName);
  }

  if (action === 'refresh-hana-tables') {
    return triggerRefreshHanaTables();
  }

  return null;
}
