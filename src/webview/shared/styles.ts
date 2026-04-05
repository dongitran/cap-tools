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
    }

    .tab-btn:hover { opacity: 0.9; }

    .tab-btn.active {
      opacity: 1;
      border-bottom-color: var(--vscode-focusBorder);
      color: var(--vscode-foreground);
    }

    /* ── Screen Container ────────────────────────────────────────── */
    .screen { padding: 12px; display: none; }
    .screen.active { display: block; }

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
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 10px;
      background: var(--vscode-editor-inactiveSelectionBackground, rgba(255,255,255,0.05));
      border-radius: 4px;
      border: 1px solid var(--vscode-panel-border, transparent);
      margin-bottom: 6px;
    }
    .session-card .app-name { font-weight: 500; flex: 1; font-size: 12px; }
    .session-card .status-badge {
      font-size: 10px;
      padding: 2px 7px;
      border-radius: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
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

    /* ── Result rows ─────────────────────────────────────────────── */
    .result-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 5px 0;
      font-size: 12px;
      border-bottom: 1px solid var(--vscode-panel-border, transparent);
    }
    .result-icon { font-size: 14px; }
    .result-app { font-weight: 500; flex: 1; }
    .result-status { font-size: 11px; color: var(--vscode-descriptionForeground); }

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

    /* ── Divider ─────────────────────────────────────────────────── */
    .divider {
      height: 1px;
      background: var(--vscode-panel-border, rgba(255,255,255,0.1));
      margin: 12px 0;
    }

    /* ── Custom endpoint input reveal ────────────────────────────── */
    .custom-endpoint { margin-top: 8px; }
    .hidden { display: none !important; }
  `;
}
