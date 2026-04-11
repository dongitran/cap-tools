const frameElement = document.getElementById('prototype-frame');
const previousButton = document.getElementById('previous-design');
const nextButton = document.getElementById('next-design');
const themeButton = document.getElementById('theme-cycle');
const prototypeKind = document.getElementById('prototype-kind');

const GALLERY_THEME_CLASS_PREFIX = 'gallery-theme-';
const PROTOTYPE_THEME_CLASS_PREFIX = 'vscode-';

const PROTOTYPE_VARIANTS = [
  {
    id: 'sidebar',
    hash: 'sidebar',
    label: 'Prototype: Sidebar',
    framePath: './variants/design-34.html?v=20260411c',
  },
  {
    id: 'cf-logs-panel',
    hash: 'cf-logs-panel',
    label: 'Prototype: CFLogs Panel',
    framePath: './variants/cf-logs-panel.html?v=20260411a',
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
  !(previousButton instanceof HTMLButtonElement) ||
  !(nextButton instanceof HTMLButtonElement) ||
  !(themeButton instanceof HTMLButtonElement) ||
  !(prototypeKind instanceof HTMLElement)
) {
  throw new Error('Prototype gallery is missing required DOM nodes.');
}

let currentVariantIndex = resolveInitialVariantIndex();
let currentThemeIndex = resolveInitialThemeIndex();
frameElement.addEventListener('load', () => {
  applyThemeToPrototypeFrame();
});

previousButton.addEventListener('click', () => {
  currentVariantIndex = wrapVariantIndex(currentVariantIndex - 1);
  renderCurrentVariant();
});

nextButton.addEventListener('click', () => {
  currentVariantIndex = wrapVariantIndex(currentVariantIndex + 1);
  renderCurrentVariant();
});

themeButton.addEventListener('click', () => {
  currentThemeIndex = wrapThemeIndex(currentThemeIndex + 1);
  applyGalleryTheme();
  applyThemeToPrototypeFrame();
  updateUrlState();
});

window.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowLeft') {
    currentVariantIndex = wrapVariantIndex(currentVariantIndex - 1);
    renderCurrentVariant();
  }

  if (event.key === 'ArrowRight') {
    currentVariantIndex = wrapVariantIndex(currentVariantIndex + 1);
    renderCurrentVariant();
  }
});

applyGalleryTheme();
renderCurrentVariant();

function resolveInitialVariantIndex() {
  const hashValue = window.location.hash.replace('#', '').toLowerCase();
  if (hashValue === 'design-34') {
    return 0;
  }

  const hashWithoutPrefix = hashValue.replace('prototype-', '');
  const indexByHash = PROTOTYPE_VARIANTS.findIndex(
    (variant) => variant.hash === hashWithoutPrefix
  );
  if (indexByHash >= 0) {
    return indexByHash;
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

  frameElement.src = variant.framePath;
  prototypeKind.textContent = variant.label;
  updateUrlState();
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
