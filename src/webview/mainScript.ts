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
    if (e.target.id === 'btnStopAll') {
      const count = $all('.session-card').length;
      if (confirm('Stop ' + count + ' active debug session' + (count !== 1 ? 's' : '') + '?')) {
        post('stopAllDebug');
      }
    }
    if (e.target.id === 'btnChangeOrg') { post('backToOrgSelect'); }
    if (e.target.id === 'btnRefreshApps' || e.target.id === 'btnRetryLoadApps') {
      readOrgCtx();
      post('loadApps', { orgName: state.selectedOrg });
    }
    if (e.target.id === 'btnReLogin') { post('backToOrgSelect'); }
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
      if (confirm('Reset all SAP Tools configuration?\\n\\nThis will clear your login, org mappings, and cached app data.')) {
        post('resetConfig');
      }
    }
  });

  // ── Logs Tab ──────────────────────────────────────────────────────────────

  // XSS-safe HTML escaping for dynamic content
  function escHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escAttr(s) {
    return escHtml(s).replace(/\n/g, '&#10;');
  }

  function formatLogTime(ts) {
    const m = /T(\\d{2}:\\d{2}:\\d{2})/.exec(ts);
    return m ? m[1] : (ts.slice(0, 8) || ts);
  }

  function buildLogEntryEl(entry) {
    const div = document.createElement('div');
    const levelCls = entry.level ? 'lvl-' + entry.level : '';
    const srcCls = 'src-' + entry.sourceType.toLowerCase();
    const streamCls = entry.stream === 'ERR' ? 'log-err' : '';
    const hasJson = !!entry.jsonData;

    div.className = 'log-entry ' + levelCls + ' ' + srcCls + ' ' + streamCls + (hasJson ? ' has-json' : '');
    div.dataset.src  = entry.sourceType;
    div.dataset.lvl  = entry.level || '';
    div.dataset.txt  = (entry.sourceType + ' ' + (entry.level || '') + ' ' + entry.message).toLowerCase();

    const ts  = escHtml(formatLogTime(entry.timestamp));
    const src = escHtml(entry.sourceType);
    const msg = entry.message.trim();
    const displayMsg = msg.length > 400
      ? escHtml(msg.slice(0, 400)) + '<span class="log-msg-truncated">…</span>'
      : escHtml(msg);

    const expandBtn = hasJson
      ? '<button class="log-expand" onclick="toggleLogJson(this)" title="Expand JSON">▶</button>'
      : '<span class="log-no-expand"></span>';

    let jsonHtml = '';
    if (entry.jsonData) {
      const rows = Object.entries(entry.jsonData).slice(0, 40).map(function(kv) {
        const k = kv[0], v = kv[1];
        const val = (typeof v === 'object' && v !== null) ? JSON.stringify(v) : String(v);
        return '<tr><td class="json-k">' + escHtml(k) + '</td><td class="json-v">' + escHtml(val) + '</td></tr>';
      }).join('');
      jsonHtml = '<div class="log-json-body hidden"><table class="log-json-tbl">' + rows + '</table></div>';
    }

    div.innerHTML = '<div class="log-row">'
      + expandBtn
      + '<span class="log-ts">' + ts + '</span>'
      + '<span class="log-src-badge src-badge-' + escHtml(entry.sourceType.toLowerCase()) + '">' + src + '</span>'
      + '<span class="log-msg">' + displayMsg + '</span>'
      + '</div>'
      + jsonHtml;

    return div;
  }

  // Entry counter tracked client-side
  var logEntryCount = 0;

  function updateLogCount() {
    const badge = $id('logCountBadge');
    if (badge) {
      const visCount = $all('#logContainer .log-entry:not(.log-filtered)').length;
      const total = $all('#logContainer .log-entry').length;
      badge.textContent = visCount === total
        ? total + ' entr' + (total === 1 ? 'y' : 'ies')
        : visCount + '/' + total + ' entr' + (total === 1 ? 'y' : 'ies');
    }
  }

  function appendLogEntry(entry) {
    const container = $id('logContainer');
    if (!container) { return; }

    const el = buildLogEntryEl(entry);

    // Apply current filter immediately
    const search  = ($id('logSearchInput')?.value || '').toLowerCase().trim();
    const srcFilter = $id('logSrcFilter')?.value  || '';
    const lvlFilter = $id('logLvlFilter')?.value  || '';

    if (
      (srcFilter && el.dataset.src !== srcFilter) ||
      (lvlFilter && el.dataset.lvl !== lvlFilter) ||
      (search && !(el.dataset.txt || '').includes(search))
    ) {
      el.classList.add('log-filtered');
    }

    // Ring buffer: remove oldest entry if over limit
    const MAX_ENTRIES = 2000;
    const all = container.querySelectorAll('.log-entry');
    if (all.length >= MAX_ENTRIES) {
      all[0].remove();
    }

    container.appendChild(el);
    logEntryCount++;

    // Auto-scroll
    const autoScroll = $id('logAutoScroll');
    if (autoScroll && autoScroll.checked) {
      container.scrollTop = container.scrollHeight;
    }

    updateLogCount();
  }

  window.filterLogs = function() {
    const search    = ($id('logSearchInput')?.value || '').toLowerCase().trim();
    const srcFilter = $id('logSrcFilter')?.value  || '';
    const lvlFilter = $id('logLvlFilter')?.value  || '';

    $all('#logContainer .log-entry').forEach(function(el) {
      const src = el.dataset.src || '';
      const lvl = el.dataset.lvl || '';
      const txt = el.dataset.txt || '';

      const hidden =
        (srcFilter !== '' && src !== srcFilter) ||
        (lvlFilter !== '' && lvl !== lvlFilter) ||
        (search !== '' && !txt.includes(search));

      el.classList.toggle('log-filtered', hidden);
    });

    updateLogCount();
  };

  window.toggleLogJson = function(btn) {
    const body = btn.closest('.log-entry')?.querySelector('.log-json-body');
    if (!body) { return; }
    const isExpanded = !body.classList.contains('hidden');
    body.classList.toggle('hidden', isExpanded);
    btn.textContent = isExpanded ? '▶' : '▼';
    btn.classList.toggle('expanded', !isExpanded);
  };

  function clearLogContainer() {
    const container = $id('logContainer');
    if (container) { container.innerHTML = ''; }
    logEntryCount = 0;
    updateLogCount();
  }

  function setLogStatus(status, error) {
    const statusEl = $id('logStatusMeta');
    if (!statusEl) { return; }

    var html = '';
    if (status === 'CONNECTING') {
      html = '<span class="log-status-pill pill-connecting"><span class="log-live-dot"></span>Connecting…</span>';
    } else if (status === 'STREAMING') {
      html = '<span class="log-status-pill pill-live"><span class="log-live-dot"></span>Live</span>';
    } else if (status === 'ERROR') {
      html = '<span class="log-status-pill pill-error">✕ Error</span>';
    } else if (status === 'STOPPED') {
      html = '<span class="log-status-pill pill-stopped">■ Stopped</span>';
    } else {
      html = '<span class="log-status-pill pill-idle">○ Idle</span>';
    }
    statusEl.innerHTML = html;

    var isStreaming = status === 'STREAMING' || status === 'CONNECTING';
    var liveBtns  = $all('#btnLiveLogs, #btnRecentLogs');
    var stopBtn   = $id('btnStopLogs');
    var appSel    = $id('logAppSelect');

    liveBtns.forEach(function(b) { b.classList.toggle('hidden', isStreaming); });
    if (stopBtn) { stopBtn.classList.toggle('hidden', !isStreaming); }
    if (appSel) { appSel.disabled = isStreaming; }

    if (error) {
      var existing = document.querySelector('#logsScreen .logs-error-banner');
      if (!existing) {
        var banner = document.createElement('div');
        banner.className = 'banner banner-error logs-error-banner';
        banner.style.cssText = 'margin:4px 0;font-size:11px';
        banner.textContent = '⚠ ' + error;
        var toolbar = document.querySelector('.logs-toolbar');
        if (toolbar && toolbar.parentNode) {
          toolbar.parentNode.insertBefore(banner, toolbar.nextSibling);
        }
      }
    } else {
      document.querySelector('#logsScreen .logs-error-banner')?.remove();
    }
  }

  // Logs tab button handlers
  document.addEventListener('click', function(e) {
    if (e.target.id === 'btnLiveLogs') {
      var appName = $id('logAppSelect')?.value;
      if (!appName) { return; }
      post('startLogs', { appName: appName });
      setLogStatus('CONNECTING');
    }
    if (e.target.id === 'btnRecentLogs') {
      var appName = $id('logAppSelect')?.value;
      if (!appName) { return; }
      clearLogContainer();
      post('loadRecentLogs', { appName: appName });
      setLogStatus('CONNECTING');
    }
    if (e.target.id === 'btnStopLogs') {
      post('stopLogs');
      setLogStatus('STOPPED');
    }
    if (e.target.id === 'btnClearLogs') {
      clearLogContainer();
      post('clearLogs');
    }
    if (e.target.id === 'btnExportLogs') {
      post('exportLogs');
    }
  });

  // ── Init logs tab from embedded server data ───────────────────────────────

  (function initLogsTab() {
    var metaEl = $id('__logMeta');
    if (!metaEl) { return; }
    try {
      var meta = JSON.parse(metaEl.textContent || '{}');
      if (meta.selectedApp) {
        var sel = $id('logAppSelect');
        if (sel) { sel.value = meta.selectedApp; }
      }
      setLogStatus(meta.status || 'IDLE', meta.error || '');
      updateLogCount();

      // Auto-scroll to bottom on initial load if we have entries
      var container = $id('logContainer');
      if (container && container.children.length > 0) {
        container.scrollTop = container.scrollHeight;
      }
    } catch(err) { /* ignore parse errors */ }
  }());

  // ── Message Dispatch ──────────────────────────────────────────────────────

  window.addEventListener('message', function(event) {
    const msg = event.data;
    switch (msg.type) {
      case 'init':
        saveState({ selectedOrg: msg.payload?.config?.selectedOrg });
        break;

      case 'logEntry':
        appendLogEntry(msg.payload);
        break;

      case 'logStatus':
        setLogStatus(msg.payload.status, msg.payload.error || '');
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
