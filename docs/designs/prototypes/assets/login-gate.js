const STORAGE_KEY = 'saptools.prototype.loginGate';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const formElement = document.getElementById('login-gate-form');
const emailInput = document.getElementById('sap-email');
const passwordInput = document.getElementById('sap-password');
const statusElement = document.getElementById('form-status');

if (
  !(formElement instanceof HTMLFormElement) ||
  !(emailInput instanceof HTMLInputElement) ||
  !(passwordInput instanceof HTMLInputElement) ||
  !(statusElement instanceof HTMLElement)
) {
  throw new Error('Login gate form is missing required elements.');
}

hydrateStoredEmail();

formElement.addEventListener('submit', (event) => {
  event.preventDefault();
  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!EMAIL_PATTERN.test(email)) {
    setStatus('Enter a valid SAP email address.', 'error');
    emailInput.focus();
    return;
  }

  if (password.trim().length === 0) {
    setStatus('SAP password is required.', 'error');
    passwordInput.focus();
    return;
  }

  persistState(email);
  setStatus('Credentials saved. Opening Main Menu...', 'success');
  postNavigateToMainMenu();
});

function hydrateStoredEmail() {
  const storedStateRaw = localStorage.getItem(STORAGE_KEY);
  if (storedStateRaw === null) {
    return;
  }

  try {
    const parsed = JSON.parse(storedStateRaw);
    if (isRecord(parsed) && typeof parsed['email'] === 'string') {
      emailInput.value = parsed['email'];
    }
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function persistState(email) {
  const payload = {
    email,
    hasCredentials: true,
    updatedAt: new Date().toISOString(),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function postNavigateToMainMenu() {
  const message = {
    type: 'saptools.prototype.navigate',
    variantId: 'design-34',
  };

  if (window.parent !== window) {
    window.parent.postMessage(message, window.location.origin);
    return;
  }

  window.location.href = './design-34.html';
}

function setStatus(message, status) {
  statusElement.textContent = message;
  statusElement.classList.remove('is-error', 'is-success');
  if (status === 'error') {
    statusElement.classList.add('is-error');
    return;
  }
  statusElement.classList.add('is-success');
}

function isRecord(value) {
  return typeof value === 'object' && value !== null;
}
