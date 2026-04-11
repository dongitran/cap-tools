import { DESIGN_CATALOG, formatDesignFilename } from './design-catalog.js';

const frameElement = document.getElementById('prototype-frame');
const previousButton = document.getElementById('previous-design');
const nextButton = document.getElementById('next-design');
const themeButton = document.getElementById('theme-cycle');

const GALLERY_THEME_CLASS_PREFIX = 'gallery-theme-';
const PROTOTYPE_THEME_CLASS_PREFIX = 'vscode-';

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
  !(themeButton instanceof HTMLButtonElement)
) {
  throw new Error('Prototype gallery is missing required DOM nodes.');
}

let currentDesignIndex = resolveInitialDesignIndex();
let currentThemeIndex = resolveInitialThemeIndex();
frameElement.addEventListener('load', () => {
  applyThemeToPrototypeFrame();
});

previousButton.addEventListener('click', () => {
  currentDesignIndex = wrapIndex(currentDesignIndex - 1);
  renderCurrentDesign();
});

nextButton.addEventListener('click', () => {
  currentDesignIndex = wrapIndex(currentDesignIndex + 1);
  renderCurrentDesign();
});

themeButton.addEventListener('click', () => {
  currentThemeIndex = wrapThemeIndex(currentThemeIndex + 1);
  applyGalleryTheme();
  applyThemeToPrototypeFrame();
  updateUrlState();
});

window.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowLeft') {
    currentDesignIndex = wrapIndex(currentDesignIndex - 1);
    renderCurrentDesign();
  }

  if (event.key === 'ArrowRight') {
    currentDesignIndex = wrapIndex(currentDesignIndex + 1);
    renderCurrentDesign();
  }
});

applyGalleryTheme();
renderCurrentDesign();

function resolveInitialDesignIndex() {
  const hashValue = window.location.hash.replace('#design-', '');
  const idFromHash = Number.parseInt(hashValue, 10);
  const indexFromHash = DESIGN_CATALOG.findIndex((design) => design.id === idFromHash);
  if (indexFromHash >= 0) {
    return indexFromHash;
  }

  return 0;
}

function wrapIndex(index) {
  if (index < 0) {
    return DESIGN_CATALOG.length - 1;
  }

  if (index >= DESIGN_CATALOG.length) {
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

function renderCurrentDesign() {
  const design = DESIGN_CATALOG[currentDesignIndex];
  const variantPath = `./variants/${formatDesignFilename(design.id)}`;

  frameElement.src = variantPath;
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
  const design = DESIGN_CATALOG[currentDesignIndex];
  if (design === undefined) {
    return;
  }

  const hashValue = `design-${String(design.id).padStart(2, '0')}`;
  const activeTheme = THEME_VARIANTS[currentThemeIndex];
  if (activeTheme === undefined) {
    return;
  }

  const url = new URL(window.location.href);
  url.searchParams.set('theme', activeTheme.id);
  url.hash = hashValue;
  window.history.replaceState(null, '', url.toString());
}
