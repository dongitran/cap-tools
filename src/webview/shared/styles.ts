export function getSharedStyles(): string {
  return `
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
      padding: 0;
      overflow-x: hidden;
    }

    /* ── Prerequisites card (region screen) ─────────────────────── */
    .prereq-card {
      background: rgba(255,190,0,0.08);
      border: 1px solid rgba(255,190,0,0.3);
      border-radius: 4px;
      padding: 10px 12px;
      margin-bottom: 4px;
      font-size: 11px;
      line-height: 1.5;
    }
    .prereq-title {
      font-weight: 600;
      font-size: 11px;
      color: #fbbe00;
      margin-bottom: 6px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .prereq-item {
      display: flex;
      align-items: flex-start;
      gap: 6px;
      margin-bottom: 4px;
      color: var(--vscode-foreground);
      opacity: 0.85;
    }
    .prereq-item:last-child { margin-bottom: 0; }
    .prereq-dot {
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background: #fbbe00;
      margin-top: 5px;
      flex-shrink: 0;
    }

    /* ── Context bar (dashboard) ─────────────────────────────────── */
    .context-bar {
      display: flex;
      align-items: center;
      gap: 5px;
      padding: 4px 10px;
      background: var(--vscode-sideBarSectionHeader-background);
      border-bottom: 1px solid var(--vscode-panel-border, transparent);
      font-size: 10px;
      color: var(--vscode-descriptionForeground);
      overflow: hidden;
    }
    .context-region {
      font-weight: 600;
      color: var(--vscode-foreground);
      opacity: 0.7;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      flex-shrink: 0;
    }
    .context-sep { opacity: 0.4; flex-shrink: 0; }
    .context-org {
      font-weight: 500;
      color: var(--vscode-foreground);
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .context-sync {
      flex-shrink: 0;
      opacity: 0.5;
      font-size: 10px;
    }

    /* ── Tab Bar ─────────────────────────────────────────────────── */
    .tab-bar {
      display: flex;
      border-bottom: 1px solid var(--vscode-sideBarSectionHeader-border, var(--vscode-panel-border));
      background: var(--vscode-sideBarSectionHeader-background);
      position: sticky;
      top: 0;
      z-index: 10;
    }

    .tab-btn {
      flex: 1;
      padding: 8px 4px;
      background: none;
      border: none;
      color: var(--vscode-foreground);
      opacity: 0.65;
      cursor: pointer;
      font-size: 11px;
      font-family: inherit;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      border-bottom: 2px solid transparent;
      transition: opacity 0.15s, border-color 0.15s;
      position: relative;
    }

    .tab-btn:hover { opacity: 0.9; }

    .tab-btn.active {
      opacity: 1;
      border-bottom-color: var(--vscode-focusBorder);
      color: var(--vscode-foreground);
    }

    .tab-btn .tab-badge {
      display: inline-block;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      border-radius: 8px;
      font-size: 9px;
      font-weight: 700;
      padding: 0 5px;
      min-width: 14px;
      text-align: center;
      margin-left: 3px;
      vertical-align: middle;
    }

    /* ── Screen Container ────────────────────────────────────────── */
    .screen { padding: 12px; display: none; }
    .screen.active { display: block; }

    /* ── Breadcrumb / org indicator ──────────────────────────────── */
    .breadcrumb {
      display: flex;
      align-items: center;
      gap: 4px;
      margin-bottom: 10px;
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
    }
    .breadcrumb-org {
      font-weight: 600;
      color: var(--vscode-foreground);
      max-width: 120px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .breadcrumb-btn {
      background: none;
      border: none;
      color: var(--vscode-textLink-foreground);
      cursor: pointer;
      font-size: 11px;
      font-family: inherit;
      padding: 2px 4px;
      border-radius: 2px;
    }
    .breadcrumb-btn:hover { background: var(--vscode-list-hoverBackground); }

    /* ── Headings ────────────────────────────────────────────────── */
    .section-title {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 8px;
      margin-top: 16px;
    }
    .section-title:first-child { margin-top: 0; }

    .section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 6px;
      margin-top: 16px;
    }
    .section-header:first-child { margin-top: 0; }
    .section-header .section-title { margin: 0; }

    /* ── Buttons ─────────────────────────────────────────────────── */
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      border: none;
      border-radius: 3px;
      cursor: pointer;
      font-size: 12px;
      font-family: inherit;
      font-weight: 500;
      transition: filter 0.1s;
    }
    .btn:hover { filter: brightness(1.15); }
    .btn:active { filter: brightness(0.9); }
    .btn:disabled { opacity: 0.45; cursor: not-allowed; filter: none; }

    .btn-primary {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    .btn-secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    .btn-danger {
      background: var(--vscode-inputValidation-errorBackground, #5a1d1d);
      color: var(--vscode-errorForeground, #f48771);
      border: 1px solid var(--vscode-inputValidation-errorBorder, #f48771);
    }
    .btn-ghost {
      background: transparent;
      color: var(--vscode-textLink-foreground);
      padding: 4px 8px;
    }
    .btn-ghost:hover { background: var(--vscode-list-hoverBackground); filter: none; }
    .btn-icon {
      background: none;
      border: none;
      cursor: pointer;
      padding: 2px 5px;
      border-radius: 2px;
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
      transition: color 0.1s, background 0.1s;
      font-family: inherit;
    }
    .btn-icon:hover {
      background: var(--vscode-list-hoverBackground);
      color: var(--vscode-foreground);
    }

    .btn-full { width: 100%; justify-content: center; }

    /* ── Inputs ──────────────────────────────────────────────────── */
    input[type="text"], input[type="number"], select {
      width: 100%;
      padding: 5px 8px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border, transparent);
      border-radius: 2px;
      font-family: inherit;
      font-size: 12px;
      outline: none;
    }
    input[type="text"]:focus, input[type="number"]:focus, select:focus {
      border-color: var(--vscode-focusBorder);
    }

    .search-box { position: relative; margin-bottom: 8px; }
    .search-box input { padding-left: 26px; }
    .search-box::before {
      content: '⌕';
      position: absolute;
      left: 8px;
      top: 50%;
      transform: translateY(-50%);
      opacity: 0.5;
      font-size: 14px;
      pointer-events: none;
    }

    /* ── Quick action bar ────────────────────────────────────────── */
    .quick-bar {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px 0;
      margin-bottom: 4px;
    }
    .quick-bar-label {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      flex: 1;
    }

    /* ── Radio cards (region/org picker) ─────────────────────────── */
    .radio-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
      margin-bottom: 12px;
    }

    .radio-card {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 7px 10px;
      border: 1px solid var(--vscode-panel-border, transparent);
      border-radius: 4px;
      cursor: pointer;
      background: var(--vscode-list-inactiveSelectionBackground, rgba(255,255,255,0.04));
      transition: background 0.1s, border-color 0.1s;
      font-size: 11px;
    }
    .radio-card:hover {
      background: var(--vscode-list-hoverBackground);
      border-color: var(--vscode-focusBorder);
    }
    .radio-card.selected {
      background: var(--vscode-list-activeSelectionBackground);
      color: var(--vscode-list-activeSelectionForeground);
      border-color: var(--vscode-focusBorder);
    }
    .radio-card input[type="radio"] { display: none; }

    /* ── Region grouping ─────────────────────────────────────────── */
    .region-group { margin-bottom: 10px; }
    .region-group-label {
      font-size: 9px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 5px;
      padding-left: 2px;
      opacity: 0.8;
    }

    /* ── List items (orgs, apps) ─────────────────────────────────── */
    .list-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 8px;
      border-radius: 3px;
      cursor: pointer;
      transition: background 0.1s;
    }
    .list-item:hover { background: var(--vscode-list-hoverBackground); }
    .list-item.selected {
      background: var(--vscode-list-activeSelectionBackground);
      color: var(--vscode-list-activeSelectionForeground);
    }
    .list-item.disabled { opacity: 0.5; cursor: not-allowed; }
    .list-item input[type="checkbox"] { cursor: pointer; accent-color: var(--vscode-focusBorder); }
    .list-item input[type="radio"] { cursor: pointer; accent-color: var(--vscode-focusBorder); }

    /* ── App status dot ──────────────────────────────────────────── */
    .dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .dot-started { background: #3fb950; }
    .dot-stopped { background: var(--vscode-disabledForeground); }

    /* ── App list grouping ───────────────────────────────────────── */
    .app-group-header {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--vscode-descriptionForeground);
      padding: 4px 8px 2px;
      margin-top: 8px;
    }

    /* ── Session cards ───────────────────────────────────────────── */
    .session-card {
      background: var(--vscode-editor-inactiveSelectionBackground, rgba(255,255,255,0.05));
      border-radius: 4px;
      border: 1px solid var(--vscode-panel-border, transparent);
      margin-bottom: 6px;
      overflow: hidden;
    }
    .session-card-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 7px 10px;
    }
    .session-card .app-name { font-weight: 500; flex: 1; font-size: 12px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .session-card .status-badge {
      font-size: 10px;
      padding: 2px 7px;
      border-radius: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      flex-shrink: 0;
    }
    .session-card .port-badge {
      font-size: 10px;
      color: var(--vscode-descriptionForeground);
      flex-shrink: 0;
      font-family: var(--vscode-editor-font-family, monospace);
    }
    .session-error-row {
      padding: 5px 10px 7px;
      font-size: 11px;
      color: var(--vscode-errorForeground, #f85149);
      border-top: 1px solid var(--vscode-inputValidation-errorBorder, rgba(248,81,73,0.3));
      background: rgba(248,81,73,0.06);
      font-family: var(--vscode-editor-font-family, monospace);
      word-break: break-word;
    }
    .badge-tunneling { background: rgba(255,190,0,0.2); color: #fbbe00; }
    .badge-attaching { background: rgba(100,140,255,0.2); color: #648cff; }
    .badge-attached  { background: rgba(63,185,80,0.2);  color: #3fb950; }
    .badge-error     { background: rgba(248,81,73,0.2);  color: #f85149; }
    .badge-exited    { background: rgba(120,120,120,0.2); color: var(--vscode-disabledForeground); }

    /* ── Spinner ─────────────────────────────────────────────────── */
    .spinner-wrap {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      padding: 32px 0;
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .spinner {
      width: 24px;
      height: 24px;
      border: 2px solid var(--vscode-foreground);
      border-top-color: transparent;
      border-radius: 50%;
      animation: spin 0.7s linear infinite;
      opacity: 0.6;
    }
    .spinner-sm {
      width: 12px;
      height: 12px;
      border-width: 1.5px;
      display: inline-block;
    }

    /* ── Skeleton loader ─────────────────────────────────────────── */
    @keyframes shimmer {
      0%   { background-position: -200% 0; }
      100% { background-position: 200% 0; }
    }
    .skeleton-row {
      height: 30px;
      border-radius: 3px;
      margin-bottom: 5px;
      background: linear-gradient(90deg,
        var(--vscode-list-hoverBackground) 25%,
        rgba(255,255,255,0.04) 50%,
        var(--vscode-list-hoverBackground) 75%
      );
      background-size: 200% 100%;
      animation: shimmer 1.4s infinite;
    }

    /* ── Info / error banners ────────────────────────────────────── */
    .banner {
      padding: 8px 12px;
      border-radius: 4px;
      font-size: 12px;
      margin-bottom: 10px;
      line-height: 1.5;
    }
    .banner-info {
      background: var(--vscode-editorInfo-background, rgba(0,122,204,0.12));
      border-left: 3px solid var(--vscode-editorInfo-foreground, #007acc);
    }
    .banner-error {
      background: var(--vscode-inputValidation-errorBackground, rgba(200,40,40,0.12));
      border-left: 3px solid var(--vscode-inputValidation-errorBorder, #f48771);
      color: var(--vscode-errorForeground);
    }
    .banner-success {
      background: rgba(63,185,80,0.1);
      border-left: 3px solid #3fb950;
    }
    .banner-warn {
      background: rgba(255,190,0,0.1);
      border-left: 3px solid #fbbe00;
    }

    /* ── Result rows ─────────────────────────────────────────────── */
    .result-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 5px 4px;
      font-size: 12px;
      border-bottom: 1px solid var(--vscode-panel-border, transparent);
    }
    .result-row:last-child { border-bottom: none; }
    .result-icon { font-size: 13px; flex-shrink: 0; }
    .result-app { font-weight: 500; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .result-status { font-size: 11px; color: var(--vscode-descriptionForeground); max-width: 100px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    /* ── Stats chips ─────────────────────────────────────────────── */
    .stats-row {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      margin-bottom: 8px;
    }
    .stat-chip {
      padding: 3px 8px;
      border-radius: 10px;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      font-size: 11px;
      font-weight: 500;
    }
    .sync-meta {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      display: flex;
      align-items: center;
      gap: 6px;
    }

    /* ── Toggle switch ───────────────────────────────────────────── */
    .toggle-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 0;
    }
    .toggle-label { font-size: 12px; }
    .toggle-sub { font-size: 11px; color: var(--vscode-descriptionForeground); margin-top: 1px; }
    .toggle {
      position: relative;
      width: 36px;
      height: 18px;
      flex-shrink: 0;
    }
    .toggle input { opacity: 0; width: 0; height: 0; }
    .toggle-track {
      position: absolute;
      inset: 0;
      background: var(--vscode-input-border, #555);
      border-radius: 18px;
      cursor: pointer;
      transition: background 0.2s;
    }
    .toggle input:checked + .toggle-track { background: var(--vscode-focusBorder); }
    .toggle-track::after {
      content: '';
      position: absolute;
      width: 14px;
      height: 14px;
      background: white;
      border-radius: 50%;
      top: 2px;
      left: 2px;
      transition: left 0.2s;
    }
    .toggle input:checked + .toggle-track::after { left: 20px; }

    /* ── Stepper input (sync interval) ───────────────────────────── */
    .stepper {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .stepper input[type="number"] {
      width: 58px;
      text-align: center;
    }
    .stepper-btn {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      border: none;
      border-radius: 2px;
      width: 22px;
      height: 24px;
      cursor: pointer;
      font-size: 14px;
      font-family: inherit;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .stepper-btn:hover { filter: brightness(1.2); }

    /* ── Divider ─────────────────────────────────────────────────── */
    .divider {
      height: 1px;
      background: var(--vscode-panel-border, rgba(255,255,255,0.1));
      margin: 12px 0;
    }

    /* ── Custom endpoint input reveal ────────────────────────────── */
    .custom-endpoint { margin-top: 8px; }
    .hidden { display: none !important; }

    /* ═══════════════════════════════════════════════════════════════
       LOGS TAB
       ═══════════════════════════════════════════════════════════════ */

    /* ── Logs toolbar ────────────────────────────────────────────── */
    .logs-toolbar {
      display: flex;
      gap: 6px;
      align-items: center;
      margin-bottom: 6px;
      flex-wrap: wrap;
    }
    .logs-toolbar select { flex: 1; min-width: 0; }
    .logs-btn-group { display: flex; gap: 4px; flex-shrink: 0; }
    .logs-action-btn { padding: 4px 10px !important; font-size: 11px !important; }

    /* ── Filter bar ──────────────────────────────────────────────── */
    .logs-filter-bar {
      display: flex;
      flex-direction: column;
      gap: 5px;
      margin-bottom: 6px;
    }
    .logs-filter-row {
      display: flex;
      gap: 5px;
      align-items: center;
    }
    .logs-filter-select {
      width: auto !important;
      padding: 4px 6px !important;
      font-size: 11px !important;
      flex-shrink: 0;
    }
    .logs-meta-bar {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      flex-wrap: wrap;
    }
    .logs-autoscroll-label {
      display: flex;
      align-items: center;
      gap: 4px;
      cursor: pointer;
      color: var(--vscode-descriptionForeground);
      user-select: none;
    }
    .logs-autoscroll-label input { cursor: pointer; }
    .log-count-badge {
      margin-left: auto;
      font-size: 10px;
      opacity: 0.6;
      white-space: nowrap;
    }

    /* ── Live status pills ───────────────────────────────────────── */
    .log-status-pill {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 7px;
      border-radius: 10px;
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      flex-shrink: 0;
    }
    .pill-live    { background: rgba(63,185,80,0.18);  color: #3fb950; }
    .pill-connecting { background: rgba(255,190,0,0.18); color: #fbbe00; }
    .pill-stopped { background: rgba(120,120,120,0.18); color: var(--vscode-disabledForeground); }
    .pill-error   { background: rgba(248,81,73,0.18);  color: #f85149; }
    .pill-idle    { background: rgba(120,120,120,0.12); color: var(--vscode-disabledForeground); }

    /* Pulsing live dot */
    @keyframes logPulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50%       { opacity: 0.4; transform: scale(0.75); }
    }
    .log-live-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: currentColor;
      animation: logPulse 1.4s ease-in-out infinite;
      flex-shrink: 0;
    }

    /* ── Log container (terminal area) ──────────────────────────── */
    .log-container {
      font-family: var(--vscode-editor-font-family, 'Consolas', 'Courier New', monospace);
      font-size: 11px;
      line-height: 1.55;
      background: var(--vscode-terminal-background, var(--vscode-editor-background, #1e1e1e));
      border: 1px solid var(--vscode-panel-border, rgba(255,255,255,0.1));
      border-radius: 4px;
      overflow-y: auto;
      /* Fill available height: subtract toolbar, filter bar, tab bar, context bar */
      max-height: calc(100vh - 195px);
      min-height: 120px;
    }

    /* ── Individual log entry ────────────────────────────────────── */
    .log-entry {
      border-left: 2px solid transparent;
      padding: 0;
      transition: background 0.08s;
    }
    .log-entry:hover { background: rgba(255,255,255,0.04); }

    .log-row {
      display: flex;
      align-items: baseline;
      gap: 5px;
      padding: 2px 8px 2px 6px;
      min-height: 20px;
    }

    /* Level-based left border colours */
    .log-entry.lvl-fatal,
    .log-entry.lvl-error   { border-left-color: #f85149; background: rgba(248,81,73,0.04); }
    .log-entry.lvl-warn    { border-left-color: #fbbe00; background: rgba(255,190,0,0.04); }
    .log-entry.lvl-info    { border-left-color: #58a6ff; }
    .log-entry.lvl-debug,
    .log-entry.lvl-trace   { opacity: 0.6; }

    /* ERR stream (stderr) gets subtle red tint regardless of parsed level */
    .log-entry.log-err:not(.lvl-warn):not(.lvl-info):not(.lvl-debug):not(.lvl-trace) {
      border-left-color: rgba(248,81,73,0.6);
    }

    /* ── Timestamp ───────────────────────────────────────────────── */
    .log-ts {
      color: var(--vscode-descriptionForeground);
      opacity: 0.65;
      flex-shrink: 0;
      font-size: 10px;
      min-width: 58px;
    }

    /* ── Source type badges ──────────────────────────────────────── */
    .log-src-badge {
      display: inline-block;
      padding: 0px 5px;
      border-radius: 3px;
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.04em;
      flex-shrink: 0;
      opacity: 0.9;
    }
    .src-badge-app  { background: rgba(88,166,255,0.20); color: #58a6ff; }
    .src-badge-rtr  { background: rgba(57,211,83,0.20);  color: #39d353; }
    .src-badge-api  { background: rgba(188,140,255,0.20); color: #bc8cff; }
    .src-badge-cell { background: rgba(255,166,87,0.20);  color: #ffa657; }
    .src-badge-ssh  { background: rgba(255,190,0,0.20);   color: #fbbe00; }
    .src-badge-stg  { background: rgba(255,123,114,0.20); color: #ff7b72; }
    .src-badge-lgr  { background: rgba(120,120,120,0.20); color: var(--vscode-disabledForeground); }
    .src-badge-other{ background: rgba(120,120,120,0.15); color: var(--vscode-descriptionForeground); }

    /* ── Log message text ────────────────────────────────────────── */
    .log-msg {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      word-break: break-word;
      white-space: pre-wrap;
      color: var(--vscode-terminal-foreground, var(--vscode-foreground));
    }
    .log-msg-truncated { opacity: 0.45; }

    /* ── JSON expand button ──────────────────────────────────────── */
    .log-expand,
    .log-no-expand {
      width: 14px;
      height: 14px;
      flex-shrink: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .log-expand {
      background: none;
      border: none;
      cursor: pointer;
      color: var(--vscode-descriptionForeground);
      font-size: 9px;
      padding: 0;
      border-radius: 2px;
      transition: color 0.1s, background 0.1s;
    }
    .log-expand:hover {
      color: var(--vscode-foreground);
      background: rgba(255,255,255,0.1);
    }
    .log-expand.expanded { color: var(--vscode-focusBorder); }

    /* ── JSON key-value table ────────────────────────────────────── */
    .log-json-body {
      padding: 3px 8px 5px 27px;
      border-top: 1px solid rgba(255,255,255,0.06);
    }
    .log-json-tbl {
      border-collapse: collapse;
      width: 100%;
      font-size: 10.5px;
    }
    .log-json-tbl tr { border-bottom: 1px solid rgba(255,255,255,0.05); }
    .log-json-tbl tr:last-child { border-bottom: none; }
    .json-k {
      color: var(--vscode-debugTokenExpression-name, #9cdcfe);
      padding: 1px 10px 1px 0;
      white-space: nowrap;
      vertical-align: top;
      width: 35%;
      max-width: 120px;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .json-v {
      color: var(--vscode-debugTokenExpression-string, #ce9178);
      word-break: break-word;
      white-space: pre-wrap;
      vertical-align: top;
    }

    /* Level-specific JSON value colouring */
    .lvl-error .json-v, .lvl-fatal .json-v { color: #f85149; }
    .lvl-warn  .json-v { color: #fbbe00; }
    .lvl-info  .json-v { color: var(--vscode-debugTokenExpression-string, #ce9178); }

    /* ── Filtered-out entries (hidden via JS) ────────────────────── */
    .log-entry.log-filtered { display: none !important; }

    /* ── Empty state ─────────────────────────────────────────────── */
    .empty-state {
      text-align: center;
      padding: 20px 10px;
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
    }
    .empty-state-icon {
      font-size: 28px;
      margin-bottom: 8px;
      opacity: 0.5;
    }

    /* ── Folder step UI ──────────────────────────────────────────── */
    .step-indicator {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 14px;
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
    }
    .step-dot {
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: var(--vscode-focusBorder);
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
      font-weight: 700;
      flex-shrink: 0;
    }
    .step-dot.done { background: #3fb950; }

    /* ── Code sample ─────────────────────────────────────────────── */
    .code-sample {
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 11px;
      background: rgba(0,0,0,0.2);
      border-radius: 3px;
      padding: 6px 10px;
      margin: 6px 0;
      line-height: 1.6;
      overflow-x: auto;
      white-space: pre;
    }
  `;
}
