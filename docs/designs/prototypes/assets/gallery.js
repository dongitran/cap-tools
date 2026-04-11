import { DESIGN_CATALOG, formatDesignFilename } from './design-catalog.js';

const frameElement = document.getElementById('prototype-frame');
const previousButton = document.getElementById('previous-design');
const nextButton = document.getElementById('next-design');

if (
  !(frameElement instanceof HTMLIFrameElement) ||
  !(previousButton instanceof HTMLButtonElement) ||
  !(nextButton instanceof HTMLButtonElement)
) {
  throw new Error('Prototype gallery is missing required DOM nodes.');
}

let currentDesignIndex = resolveInitialDesignIndex();
renderCurrentDesign();

previousButton.addEventListener('click', () => {
  currentDesignIndex = wrapIndex(currentDesignIndex - 1);
  renderCurrentDesign();
});

nextButton.addEventListener('click', () => {
  currentDesignIndex = wrapIndex(currentDesignIndex + 1);
  renderCurrentDesign();
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

function renderCurrentDesign() {
  const design = DESIGN_CATALOG[currentDesignIndex];
  const variantPath = `./variants/${formatDesignFilename(design.id)}`;

  frameElement.src = variantPath;

  const hashValue = `design-${String(design.id).padStart(2, '0')}`;
  window.history.replaceState(null, '', `#${hashValue}`);
}
