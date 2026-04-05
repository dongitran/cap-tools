/**
 * Client-side JavaScript injected into the webview.
 * Runs in the browser context — no Node.js or VSCode APIs available.
 * Communicates with the extension host via acquireVsCodeApi().postMessage().
 */
export function getMainScript(): string {
  return `
(function() {
  const vscode = acquireVsCodeApi();
  let state = vscode.getState() ?? {};

  // ── Helpers ──────────────────────────────────────────────────────────────

  function post(type, payload) {
    vscode.postMessage({ type, payload });
  }

  function saveState(update) {
    state = { ...state, ...update };
    vscode.setState(state);
  }

  function $id(id) { return document.getElementById(id); }
  function $all(sel) { return document.querySelectorAll(sel); }

  // ── Tab switching ─────────────────────────────────────────────────────────

  document.addEventListener('click', function(e) {
    const tabBtn = e.target.closest('[data-tab]');
    if (tabBtn) {
      const tab = tabBtn.dataset.tab;
      $all('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
      saveState({ activeTab: tab });
      post('changeTab', { tab });
    }
  });

  // ── Region Screen ─────────────────────────────────────────────────────────

  document.addEventListener('change', function(e) {
    if (e.target.name === 'region') {
      $all('.radio-card').forEach(c => c.classList.remove('selected'));
      e.target.closest('.radio-card')?.classList.add('selected');
      const isCustom = e.target.value === 'custom';
      $id('customEndpointWrap')?.classList.toggle('hidden', !isCustom);
      saveState({ region: e.target.value });
    }
  });

  document.addEventListener('click', function(e) {
    if (e.target.id === 'btnLogin') {
      const region = state.region ?? document.querySelector('input[name="region"]:checked')?.value ?? 'ap11';
      const customEndpoint = $id('customEndpoint')?.value?.trim();
      post('login', { regionId: region, customEndpoint: region === 'custom' ? customEndpoint : undefined });
    }
  });

  // ── Org Screen ────────────────────────────────────────────────────────────

  window.filterOrgs = function(q) {
    $all('#orgList .list-item').forEach(function(item) {
      const match = item.dataset.org?.toLowerCase().includes(q.toLowerCase());
      item.style.display = match ? '' : 'none';
    });
  };

  document.addEventListener('change', function(e) {
    if (e.target.name === 'org') {
      $all('#orgList .list-item').forEach(c => c.classList.remove('selected'));
      e.target.closest('.list-item')?.classList.add('selected');
      post('selectOrg', { orgName: e.target.value });
    }
  });

  // ── Folder Screen ─────────────────────────────────────────────────────────

  document.addEventListener('click', function(e) {
    if (e.target.id === 'btnBrowse') post('browseFolder');
    if (e.target.id === 'btnConfirmFolder') post('changeTab', { tab: 'debug' });
  });

  // ── Debug Tab ─────────────────────────────────────────────────────────────

  window.filterApps = function(q) {
    $all('#appList .list-item').forEach(function(item) {
      const match = item.dataset.app?.toLowerCase().includes(q.toLowerCase());
      item.style.display = match ? '' : 'none';
    });
  };

  window.stopDebug = function(appName) {
    post('stopDebug', { appName });
  };

  document.addEventListener('click', function(e) {
    if (e.target.id === 'btnStartDebug') {
      const checked = $all('#appList input[type="checkbox"]:checked:not(:disabled)');
      const appNames = Array.from(checked).map(function(el) { return el.value; });
      if (appNames.length === 0) return;
      post('startDebug', { appNames, orgName: state.selectedOrg });
    }
    if (e.target.id === 'btnStopAll') post('stopAllDebug');
    if (e.target.id === 'btnChangeOrg') post('changeTab', { tab: 'debug' });
    if (e.target.id === 'btnRefreshApps') post('loadApps', { orgName: state.selectedOrg });
  });

  // ── Credentials Tab ───────────────────────────────────────────────────────

  window.onSpaceChange = function(spaceName) {
    if (!spaceName) return;
    saveState({ selectedSpace: spaceName });
    post('loadSpaceApps', { orgName: state.selectedOrg, spaceName });
  };

  window.filterCredApps = function(q) {
    $all('#credAppList .list-item').forEach(function(item) {
      const match = item.dataset.app?.toLowerCase().includes(q.toLowerCase());
      item.style.display = match ? '' : 'none';
    });
  };

  document.addEventListener('click', function(e) {
    if (e.target.id === 'btnExtract') {
      const checked = $all('#credAppList input[type="checkbox"]:checked');
      const appNames = Array.from(checked).map(function(el) { return el.value; });
      if (appNames.length === 0) {
        alert('Select at least one app');
        return;
      }
      const outputEl = document.querySelector('input[name="credOutput"]:checked');
      const output = outputEl ? outputEl.value : 'sqltools';
      post('extractCreds', {
        orgName: state.selectedOrg,
        spaceName: state.selectedSpace,
        appNames,
        output,
      });
    }
  });

  // ── Settings Tab ──────────────────────────────────────────────────────────

  window.updateSetting = function(key, value) {
    post('updateSettings', { [key]: value });
  };

  document.addEventListener('click', function(e) {
    if (e.target.id === 'btnSyncNow') post('triggerSync');
    if (e.target.id === 'btnReset') {
      if (confirm('Reset all SAP Dev Suite configuration? This cannot be undone.')) {
        post('resetConfig');
      }
    }
  });

  // ── Message Dispatch ──────────────────────────────────────────────────────

  window.addEventListener('message', function(event) {
    const msg = event.data;
    switch (msg.type) {
      case 'init':
        // Extension sends initial state; page is already rendered server-side
        saveState({ selectedOrg: msg.payload?.config?.selectedOrg });
        break;
      case 'folderSelected':
        saveState({ groupFolder: msg.payload.path });
        // Re-render folder screen is handled server-side; extension re-sends HTML
        break;
    }
  });

  // ── Init ──────────────────────────────────────────────────────────────────

  post('ready');
})();
  `;
}
