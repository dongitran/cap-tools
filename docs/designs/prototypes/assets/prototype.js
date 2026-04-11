import { DESIGN_CATALOG, REGION_GROUPS, TOTAL_REGION_COUNT } from './design-catalog.js';

const appElement = document.getElementById('app');

if (!(appElement instanceof HTMLElement)) {
  throw new Error('Prototype root element not found.');
}

const designIdRaw = Number.parseInt(document.body.dataset.designId ?? '1', 10);
const activeDesign =
  DESIGN_CATALOG.find((design) => design.id === designIdRaw) ?? DESIGN_CATALOG[0];

const groupLookup = new Map(REGION_GROUPS.map((group) => [group.id, group]));
const regionLookup = new Map(
  REGION_GROUPS.flatMap((group) => group.regions.map((region) => [region.id, region]))
);
const regionGroupLookup = new Map(
  REGION_GROUPS.flatMap((group) => group.regions.map((region) => [region.id, group.id]))
);

let selectedGroupId = '';
let selectedRegionId = '';
const outputMessages = ['Select an area to reveal available regions.'];

applyDesignTokens(activeDesign);
renderPrototype();

appElement.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const areaButton = target.closest('[data-group-id]');
  if (areaButton instanceof HTMLButtonElement) {
    const nextGroupId = areaButton.dataset.groupId ?? '';
    const nextGroup = groupLookup.get(nextGroupId);
    if (nextGroup === undefined) {
      return;
    }

    const didChangeGroup = selectedGroupId !== nextGroupId;
    selectedGroupId = nextGroupId;

    if (didChangeGroup) {
      selectedRegionId = '';
      outputMessages.push(`[${timestampNow()}] Area selected: ${nextGroup.label}`);
      trimOutputMessages();
    }

    renderPrototype();
    return;
  }

  const regionButton = target.closest('[data-region-id]');
  if (!(regionButton instanceof HTMLButtonElement)) {
    return;
  }

  const nextRegionId = regionButton.dataset.regionId ?? '';
  const selectedRegion = regionLookup.get(nextRegionId);
  const nextGroupId = regionGroupLookup.get(nextRegionId) ?? '';

  if (selectedRegion === undefined || nextGroupId.length === 0) {
    return;
  }

  selectedGroupId = nextGroupId;
  selectedRegionId = nextRegionId;
  outputMessages.push(`[${timestampNow()}] Selected ${selectedRegion.name} (${selectedRegion.code})`);
  trimOutputMessages();

  renderPrototype();
});

function applyDesignTokens(design) {
  const root = document.body;
  const themeClass = `theme-${String(design.id).padStart(2, '0')}`;

  root.className = `prototype-page pattern-${design.pattern} ${themeClass}`;
  root.style.setProperty('--page-bg', design.colors.page);
  root.style.setProperty('--frame-bg', design.colors.frame);
  root.style.setProperty('--surface-bg', design.colors.surface);
  root.style.setProperty('--border-color', design.colors.border);
  root.style.setProperty('--text-color', design.colors.text);
  root.style.setProperty('--muted-color', design.colors.muted);
  root.style.setProperty('--accent-color', design.colors.accent);
  root.style.setProperty('--accent-soft', design.colors.accentSoft);
  root.style.setProperty('--chip-text', design.colors.chipText);
  root.style.setProperty('--panel-shadow', design.shadow);
  root.style.setProperty('--title-font', design.typography.title);
  root.style.setProperty('--body-font', design.typography.body);
}

function renderPrototype() {
  const selectedGroup = groupLookup.get(selectedGroupId);
  const areaPickerMarkup = renderAreaPicker();
  const regionPanelMarkup =
    selectedGroup === undefined ? renderEmptyRegionPanel() : renderSelectedGroupPanel(selectedGroup);
  const outputMarkup = outputMessages
    .map((line) => `<p class="output-line">${line}</p>`)
    .join('');

  appElement.innerHTML = `
    <section class="prototype-shell select-style-${activeDesign.selectStyle}">
      <header class="shell-header">
        <h1>Select SAP BTP Region</h1>
        <div class="shell-subline">
          <span>${TOTAL_REGION_COUNT} regions in this prototype</span>
          <span class="design-pill">Design ${activeDesign.id}</span>
        </div>
      </header>

      <div class="meta-strip">
        <p>${activeDesign.subtitle}</p>
        <strong>${activeDesign.name}</strong>
      </div>

      <div class="groups" role="list">
        <section class="group-card area-stage" aria-label="Area selector">
          <div class="group-head">
            <h2>Choose Area</h2>
            <span class="group-count">${REGION_GROUPS.length}</span>
          </div>
          <div class="area-picker" role="listbox" aria-label="SAP area groups">
            ${areaPickerMarkup}
          </div>
        </section>

        ${regionPanelMarkup}
      </div>

      <footer class="output-box">
        <p class="output-title">Extension Output Preview</p>
        <div class="output-stream">
          ${outputMarkup}
        </div>
      </footer>
    </section>
  `;
}

function renderAreaPicker() {
  return REGION_GROUPS.map((group) => {
    const isActive = group.id === selectedGroupId;
    return `
      <button
        type="button"
        class="area-option${isActive ? ' is-active' : ''}"
        data-group-id="${group.id}"
        aria-pressed="${isActive}"
      >
        <span class="area-label">${group.label}</span>
        <span class="area-meta">${group.regions.length} regions</span>
      </button>
    `;
  }).join('');
}

function renderSelectedGroupPanel(group) {
  const regionOptionsMarkup = group.regions
    .map((region) => {
      const isSelected = region.id === selectedRegionId;
      return `
        <button
          type="button"
          class="region-option${isSelected ? ' is-selected' : ''}"
          data-region-id="${region.id}"
          aria-pressed="${isSelected}"
        >
          <span class="region-name">${region.name}</span>
          <span class="region-code">${region.code}</span>
        </button>
      `;
    })
    .join('');

  return `
    <section class="group-card" aria-label="Region list">
      <div class="group-head">
        <h2>${group.label} Regions</h2>
        <span class="group-count">${group.regions.length}</span>
      </div>
      <div class="region-layout ${activeDesign.layout}">
        ${regionOptionsMarkup}
      </div>
    </section>
  `;
}

function renderEmptyRegionPanel() {
  return `
    <section class="group-card empty-panel" aria-live="polite">
      <p class="empty-title">No area selected yet</p>
      <p class="empty-description">Pick an area above to reveal region options.</p>
    </section>
  `;
}

function trimOutputMessages() {
  if (outputMessages.length > 4) {
    outputMessages.shift();
  }
}

function timestampNow() {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date());
}
