const frameElement = document.getElementById('prototype-frame');
const prototypePicker = document.getElementById('prototype-picker');
const themeButton = document.getElementById('theme-cycle');
const controlsToggle = document.getElementById('controls-toggle');
const controlsPanel = document.getElementById('floating-controls-panel');
const floatingNav = document.querySelector('.floating-nav');

const GALLERY_THEME_CLASS_PREFIX = 'gallery-theme-';
const PROTOTYPE_THEME_CLASS_PREFIX = 'vscode-';
const REGION_LAYOUT_CLASS = 'mode-region-menu';
const CF_LOGS_LAYOUT_CLASS = 'mode-cf-logs-panel';

const PROTOTYPE_VARIANTS = [
  {
    id: 'login-gate',
    hash: 'login-gate',
    label: 'Prototype: Login Gate',
    framePath: './variants/login-gate.html?v=20260412j',
  },
  {
    id: 'design',
    hash: 'design',
    label: 'Prototype: Region Menu',
    framePath: './variants/design.html?v=20260426a',
  },
  {
    id: 'cf-logs-panel',
    hash: 'cf-logs-panel',
    label: 'Prototype: CFLogs Panel',
    framePath: './variants/cf-logs-panel.html?v=20260414n',
  },
  {
    id: 'brand-gallery',
    hash: 'brand-gallery',
    label: '🎨 Brand Identity Gallery',
    framePath: '../brand/index.html',
  },
];

const THEME_VARIANTS = [
  {
    id: 'dark',
    buttonLabel: 'Theme: Dark',
    galleryClass: 'gallery-theme-dark',
    prototypeClass: 'vscode-dark',
  },
  {
    id: 'light',
    buttonLabel: 'Theme: Light',
    galleryClass: 'gallery-theme-light',
    prototypeClass: 'vscode-light',
  },
  {
    id: 'high-contrast',
    buttonLabel: 'Theme: High Contrast',
    galleryClass: 'gallery-theme-high-contrast',
    prototypeClass: 'vscode-high-contrast',
  },
];

if (
  !(frameElement instanceof HTMLIFrameElement) ||
  !(prototypePicker instanceof HTMLSelectElement) ||
  !(themeButton instanceof HTMLButtonElement) ||
  !(controlsToggle instanceof HTMLButtonElement) ||
  !(controlsPanel instanceof HTMLDivElement) ||
  !(floatingNav instanceof HTMLElement)
) {
  throw new Error('Prototype gallery is missing required DOM nodes.');
}

let currentVariantIndex = resolveInitialVariantIndex();
let currentThemeIndex = resolveInitialThemeIndex();
let isControlsPanelOpen = false;
frameElement.addEventListener('load', () => {
  applyThemeToPrototypeFrame();
});

prototypePicker.addEventListener('change', () => {
  switchVariantById(prototypePicker.value);
  setControlsPanelOpen(false);
});

themeButton.addEventListener('click', () => {
  currentThemeIndex = wrapThemeIndex(currentThemeIndex + 1);
  applyGalleryTheme();
  applyThemeToPrototypeFrame();
  updateUrlState();
});

controlsToggle.addEventListener('click', () => {
  setControlsPanelOpen(!isControlsPanelOpen);
});

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && isControlsPanelOpen) {
    setControlsPanelOpen(false);
    return;
  }

  if (event.key === 'ArrowLeft') {
    currentVariantIndex = wrapVariantIndex(currentVariantIndex - 1);
    renderCurrentVariant();
  }

  if (event.key === 'ArrowRight') {
    currentVariantIndex = wrapVariantIndex(currentVariantIndex + 1);
    renderCurrentVariant();
  }
});

window.addEventListener('message', (event) => {
  if (!isRecord(event.data)) {
    return;
  }

  if (event.data['type'] !== 'saptools.prototype.navigate') {
    return;
  }

  const variantId = event.data['variantId'];
  if (typeof variantId !== 'string') {
    return;
  }

  switchVariantById(variantId);
});

window.addEventListener('click', (event) => {
  if (!(event.target instanceof Node)) {
    return;
  }

  if (!isControlsPanelOpen || floatingNav.contains(event.target)) {
    return;
  }

  setControlsPanelOpen(false);
});

applyGalleryTheme();
renderCurrentVariant();
setControlsPanelOpen(false);

function resolveInitialVariantIndex() {
  const hash = window.location.hash.replace(/^#/, '');
  if (hash.startsWith('prototype-')) {
    const legacyToCurrentHash = {
      'design-34': 'design',
    };
    const rawVariantHash = hash.replace('prototype-', '');
    const variantHash = legacyToCurrentHash[rawVariantHash] ?? rawVariantHash;
    const variantIndex = PROTOTYPE_VARIANTS.findIndex(
      (variant) => variant.hash === variantHash
    );
    if (variantIndex >= 0) {
      return variantIndex;
    }
  }

  return 0;
}

function wrapVariantIndex(index) {
  if (index < 0) {
    return PROTOTYPE_VARIANTS.length - 1;
  }

  if (index >= PROTOTYPE_VARIANTS.length) {
    return 0;
  }

  return index;
}

function wrapThemeIndex(index) {
  if (index < 0) {
    return THEME_VARIANTS.length - 1;
  }

  if (index >= THEME_VARIANTS.length) {
    return 0;
  }

  return index;
}

function renderCurrentVariant() {
  const variant = PROTOTYPE_VARIANTS[currentVariantIndex];
  if (variant === undefined) {
    return;
  }

  applyLayoutForVariant(variant.id);
  frameElement.src = variant.framePath;
  prototypePicker.value = variant.id;
  updateUrlState();
}

function setControlsPanelOpen(isOpen) {
  isControlsPanelOpen = isOpen;
  controlsPanel.hidden = !isOpen;
  controlsToggle.setAttribute('aria-expanded', String(isOpen));
}

function switchVariantById(variantId) {
  const nextIndex = PROTOTYPE_VARIANTS.findIndex((variant) => variant.id === variantId);
  if (nextIndex < 0 || nextIndex === currentVariantIndex) {
    return;
  }

  currentVariantIndex = nextIndex;
  renderCurrentVariant();
}

function applyLayoutForVariant(variantId) {
  const isCfLogsPanel = variantId === 'cf-logs-panel';
  document.body.classList.toggle(REGION_LAYOUT_CLASS, !isCfLogsPanel);
  document.body.classList.toggle(CF_LOGS_LAYOUT_CLASS, isCfLogsPanel);
}

function resolveInitialThemeIndex() {
  const url = new URL(window.location.href);
  const themeId = url.searchParams.get('theme');
  if (themeId !== null) {
    const themeIndex = THEME_VARIANTS.findIndex((theme) => theme.id === themeId);
    if (themeIndex >= 0) {
      return themeIndex;
    }
  }

  return 0;
}

function applyGalleryTheme() {
  const activeTheme = THEME_VARIANTS[currentThemeIndex];
  if (activeTheme === undefined) {
    return;
  }

  const bodyElement = document.body;
  for (const className of bodyElement.classList) {
    if (className.startsWith(GALLERY_THEME_CLASS_PREFIX)) {
      bodyElement.classList.remove(className);
    }
  }

  bodyElement.classList.add(activeTheme.galleryClass);
  themeButton.textContent = activeTheme.buttonLabel;
}

function applyThemeToPrototypeFrame() {
  const activeTheme = THEME_VARIANTS[currentThemeIndex];
  if (activeTheme === undefined) {
    return;
  }

  const frameDocument = frameElement.contentDocument;
  if (frameDocument === null) {
    return;
  }

  const frameBody = frameDocument.body;
  if (frameBody === null) {
    return;
  }

  for (const className of frameBody.classList) {
    if (className.startsWith(PROTOTYPE_THEME_CLASS_PREFIX)) {
      frameBody.classList.remove(className);
    }
  }

  frameBody.classList.add(activeTheme.prototypeClass);
}

function updateUrlState() {
  const activeVariant = PROTOTYPE_VARIANTS[currentVariantIndex];
  const activeTheme = THEME_VARIANTS[currentThemeIndex];
  if (activeVariant === undefined || activeTheme === undefined) {
    return;
  }

  const url = new URL(window.location.href);
  url.searchParams.set('theme', activeTheme.id);
  url.hash = `prototype-${activeVariant.hash}`;
  window.history.replaceState(null, '', url.toString());
}

function isRecord(value) {
  return typeof value === 'object' && value !== null;
}
