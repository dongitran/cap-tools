function formatSyncIntervalLabel(syncHours) {
  if (syncHours === 24) {
    return '1 day';
  }

  if (syncHours % 24 === 0) {
    return `${String(syncHours / 24)} days`;
  }

  return `${String(syncHours)} hours`;
}

function formatTimestampLabel(value) {
  if (typeof value !== 'string' || value.length === 0) {
    return 'Never';
  }

  const timestampMs = Date.parse(value);
  if (Number.isNaN(timestampMs)) {
    return 'Never';
  }

  return new Intl.DateTimeFormat('en-GB', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(timestampMs));
}

function resolveSyncStatusLabel() {
  if (syncInProgress) {
    return 'Sync in progress...';
  }

  if (lastSyncError.length > 0) {
    return `Last sync failed: ${lastSyncError}`;
  }

  if (lastSyncCompletedAt !== null) {
    return `Last sync completed at ${formatTimestampLabel(lastSyncCompletedAt)}.`;
  }

  return 'Sync has not started yet.';
}

function resolveSettingsStatusMessage() {
  if (settingsStatusMessage.length > 0) {
    return settingsStatusMessage;
  }

  return resolveSyncStatusLabel();
}

function applyDesignTokens(design) {
  const root = document.body;
  const themeClass = `theme-${String(design.id).padStart(2, '0')}`;
  const patternClass = `pattern-${design.pattern}`;
  applyDesignClasses(root, patternClass, themeClass);
  root.style.setProperty('--design-page-bg', design.colors.page);
  root.style.setProperty('--design-frame-bg', design.colors.frame);
  root.style.setProperty('--design-surface-bg', design.colors.surface);
  root.style.setProperty('--design-border-color', design.colors.border);
  root.style.setProperty('--design-text-color', design.colors.text);
  root.style.setProperty('--design-muted-color', design.colors.muted);
  root.style.setProperty('--design-accent-color', design.colors.accent);
  root.style.setProperty('--design-accent-soft', design.colors.accentSoft);
  root.style.setProperty('--design-chip-text', design.colors.chipText);
  root.style.setProperty('--design-panel-shadow', design.shadow);
  root.style.setProperty('--design-title-font', design.typography.title);
  root.style.setProperty('--design-body-font', design.typography.body);
}

function applyDesignClasses(root, patternClass, themeClass) {
  const classNames = Array.from(root.classList);
  for (const className of classNames) {
    if (
      className.startsWith(DESIGN_PATTERN_CLASS_PREFIX) ||
      className.startsWith(DESIGN_THEME_CLASS_PREFIX)
    ) {
      root.classList.remove(className);
    }
  }

  root.classList.add('prototype-page', patternClass, themeClass);
}

