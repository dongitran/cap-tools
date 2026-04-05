/**
 * Client-side JavaScript injected into the webview.
 * Runs in the browser context — no Node.js or VSCode APIs available.
 * Communicates with the extension host via acquireVsCodeApi().postMessage().
 */
export function getMainScript(): string {
  return `
(function() {
  'use strict';

  const vscode = acquireVsCodeApi();
  let state = vscode.getState() ?? {};

  // ── Helpers ──────────────────────────────────────────────────────────────

  function post(type, payload) {
    vscode.postMessage(payload !== undefined ? { type, payload } : { type });
  }

  function saveState(update) {
    state = { ...state, ...update };
    vscode.setState(state);
  }

  function $id(id) { return document.getElementById(id); }
  function $all(sel) { return document.querySelectorAll(sel); }

  // Read org context embedded by server-side render
  function readOrgCtx() {
    const orgCtx = $id('tabBar')?.dataset.orgCtx;
    if (orgCtx && orgCtx !== state.selectedOrg) {
      saveState({ selectedOrg: orgCtx });
    }
    return state.selectedOrg ?? '';
  }

  // ── Tab switching ─────────────────────────────────────────────────────────

  document.addEventListener('click', function(e) {
    const tabBtn = e.target.closest('[data-tab]');
    if (tabBtn && tabBtn.classList.contains('tab-btn')) {
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
      const wrap = $id('customEndpointWrap');
      if (wrap) { wrap.classList.toggle('hidden', !isCustom); }
      saveState({ region: e.target.value });
    }
  });

  document.addEventListener('click', function(e) {
    if (e.target.id === 'btnLogin') {
      const regionInput = document.querySelector('input[name="region"]:checked');
      const region = state.region ?? regionInput?.value ?? 'ap11';
      const customInput = $id('customEndpoint');
      const customEndpoint = customInput?.value?.trim();
      post('login', {
        regionId: region,
        customEndpoint: region === 'custom' && customEndpoint ? customEndpoint : undefined
      });
    }
  });

  // Enter key on region screen
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      const login = $id('btnLogin');
      if (login) { e.preventDefault(); login.click(); return; }
      const confirm = $id('btnConfirmFolder');
      if (confirm) { e.preventDefault(); confirm.click(); return; }
    }
  });

  // ── Org Screen ────────────────────────────────────────────────────────────

  window.filterOrgs = function(q) {
    $all('#orgList .list-item').forEach(function(item) {
      const name = item.dataset.org ?? '';
      item.style.display = name.toLowerCase().includes(q.toLowerCase()) ? '' : 'none';
    });
  };

  document.addEventListener('change', function(e) {
    if (e.target.name === 'org') {
      $all('#orgList .list-item').forEach(c => c.classList.remove('selected'));
      e.target.closest('.list-item')?.classList.add('selected');
      saveState({ selectedOrg: e.target.value });
      post('selectOrg', { orgName: e.target.value });
    }
  });

  // ── Folder Screen ─────────────────────────────────────────────────────────

  document.addEventListener('click', function(e) {
    if (e.target.id === 'btnBrowse') { post('browseFolder'); }
    if (e.target.id === 'btnConfirmFolder') { post('changeTab', { tab: 'debug' }); }
    if (e.target.id === 'btnSkipFolder') { post('changeTab', { tab: 'debug' }); }
  });

  // ── Debug Tab ─────────────────────────────────────────────────────────────

  window.filterApps = function(q) {
    $all('#appList .list-item').forEach(function(item) {
      const name = item.dataset.app ?? '';
      item.style.display = name.toLowerCase().includes(q.toLowerCase()) ? '' : 'none';
    });
  };

  function updateDebugBtnLabel() {
    const btn = $id('btnStartDebug');
    if (!btn) { return; }
    const count = $all('#appList input[type="checkbox"]:checked:not(:disabled)').length;
    btn.textContent = count > 0 ? '▶ Start Debug (' + count + ')' : '▶ Start Debug';
    btn.disabled = count === 0;
  }

  document.addEventListener('change', function(e) {
    if (e.target.name === 'app') { updateDebugBtnLabel(); }
  });

  // Select all / Clear all running apps
  document.addEventListener('click', function(e) {
    if (e.target.id === 'btnSelectAll') {
      $all('#appList input[type="checkbox"]:not(:disabled)').forEach(function(cb) {
        cb.checked = true;
      });
      updateDebugBtnLabel();
    }
    if (e.target.id === 'btnClearAll') {
      $all('#appList input[type="checkbox"]:not(:disabled)').forEach(function(cb) {
        cb.checked = false;
      });
      updateDebugBtnLabel();
    }
  });

  // Stop debug via data attribute (avoids XSS from inline onclick)
  document.addEventListener('click', function(e) {
    const btn = e.target.closest('.stop-debug-btn');
    if (btn) {
      const appName = btn.dataset.app;
      if (appName) { post('stopDebug', { appName }); }
    }
  });

  // View app environment (VCAP_SERVICES + user-provided vars)
  document.addEventListener('click', function(e) {
    const btn = e.target.closest('.view-env-btn');
    if (btn) {
      const appName = btn.dataset.app;
      if (appName) { post('getAppEnv', { appName, orgName: state.selectedOrg ?? '' }); }
    }
  });

  document.addEventListener('click', function(e) {
    if (e.target.id === 'btnStartDebug') {
      const checked = $all('#appList input[type="checkbox"]:checked:not(:disabled)');
      const appNames = Array.from(checked).map(function(el) { return el.value; });
      if (appNames.length === 0) { return; }
      // orgName is managed server-side — extension uses config.selectedOrg
      post('startDebug', { appNames });
    }
    if (e.target.id === 'btnStopAll') { post('stopAllDebug'); }
    if (e.target.id === 'btnChangeOrg') { post('backToOrgSelect'); }
    if (e.target.id === 'btnRefreshApps') {
      readOrgCtx();
      post('loadApps', { orgName: state.selectedOrg });
    }
  });

  // Initialise debug button state on load
  updateDebugBtnLabel();

  // ── Credentials Tab ───────────────────────────────────────────────────────

  window.onSpaceChange = function(spaceName) {
    if (!spaceName) { return; }
    saveState({ selectedSpace: spaceName });
    post('loadSpaceApps', { orgName: state.selectedOrg, spaceName });
  };

  window.filterCredApps = function(q) {
    $all('#credAppList .list-item').forEach(function(item) {
      const name = item.dataset.app ?? '';
      item.style.display = name.toLowerCase().includes(q.toLowerCase()) ? '' : 'none';
    });
  };

  function updateExtractBtnLabel() {
    const btn = $id('btnExtract');
    if (!btn) { return; }
    const count = $all('#credAppList input[type="checkbox"]:checked').length;
    btn.textContent = count > 0 ? '🔑 Extract ' + count + ' App' + (count !== 1 ? 's' : '') : '🔑 Extract Credentials';
    btn.disabled = count === 0 || !state.selectedSpace;
  }

  document.addEventListener('change', function(e) {
    if (e.target.name === 'credApp') { updateExtractBtnLabel(); }
  });

  document.addEventListener('click', function(e) {
    // Select all / clear cred apps
    if (e.target.id === 'btnCredSelectAll') {
      $all('#credAppList input[type="checkbox"]').forEach(function(cb) { cb.checked = true; });
      updateExtractBtnLabel();
    }
    if (e.target.id === 'btnCredClear') {
      $all('#credAppList input[type="checkbox"]').forEach(function(cb) { cb.checked = false; });
      updateExtractBtnLabel();
    }

    if (e.target.id === 'btnExtract') {
      const checked = $all('#credAppList input[type="checkbox"]:checked');
      const appNames = Array.from(checked).map(function(el) { return el.value; });
      if (appNames.length === 0) { return; }
      const outputEl = document.querySelector('input[name="credOutput"]:checked');
      const output = outputEl ? outputEl.value : 'sqltools';
      // orgName managed server-side — extension uses config.selectedOrg
      post('extractCreds', {
        spaceName: state.selectedSpace ?? '',
        appNames,
        output,
      });
    }

    // Copy credential result by app name
    const copyBtn = e.target.closest('.copy-cred-btn');
    if (copyBtn) {
      const appName = copyBtn.dataset.app;
      if (appName) { post('getAppEnv', { appName, orgName: state.selectedOrg ?? '' }); }
    }
  });

  updateExtractBtnLabel();

  // ── Settings Tab ──────────────────────────────────────────────────────────

  window.updateSetting = function(key, value) {
    post('updateSettings', { [key]: value });
  };

  window.stepInterval = function(delta) {
    const input = $id('syncInterval');
    if (!input) { return; }
    const current = parseInt(input.value, 10) || 240;
    const next = Math.max(30, Math.min(1440, current + delta));
    input.value = String(next);
    post('updateSettings', { syncInterval: next });
  };

  document.addEventListener('click', function(e) {
    if (e.target.id === 'btnSyncNow') { post('triggerSync'); }
    if (e.target.id === 'btnReset') {
      if (confirm('Reset all SAP Dev Suite configuration?\\n\\nThis will clear your login, org mappings, and cached app data.')) {
        post('resetConfig');
      }
    }
  });

  // ── Message Dispatch ──────────────────────────────────────────────────────

  window.addEventListener('message', function(event) {
    const msg = event.data;
    switch (msg.type) {
      case 'init':
        saveState({ selectedOrg: msg.payload?.config?.selectedOrg });
        break;
    }
  });

  // ── Init ──────────────────────────────────────────────────────────────────

  // Sync org from server-rendered DOM if present
  readOrgCtx();

  post('ready');
})();
  `;
}
