const STORAGE_KEY = 'saptools.prototype.loginGate';
const LOGIN_SUBMIT_MESSAGE_TYPE = 'sapTools.loginSubmit';
const LOGIN_RESULT_MESSAGE_TYPE = 'sapTools.loginResult';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const vscodeApi = resolveVscodeApi();

const formElement = document.getElementById('login-gate-form');
const emailInput = document.getElementById('sap-email');
const passwordInput = document.getElementById('sap-password');
const statusElement = document.getElementById('form-status');
const submitButton = document.getElementById('submit-login-gate');

if (
  !(formElement instanceof HTMLFormElement) ||
  !(emailInput instanceof HTMLInputElement) ||
  !(passwordInput instanceof HTMLInputElement) ||
  !(statusElement instanceof HTMLElement) ||
  !(submitButton instanceof HTMLButtonElement)
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

  if (vscodeApi !== null) {
    // VSCode extension mode: send credentials to the extension host for secure storage.
    setStatus('Saving credentials\u2026', 'success');
    submitButton.disabled = true;
    vscodeApi.postMessage({ type: LOGIN_SUBMIT_MESSAGE_TYPE, email, password });
    return;
  }

  // Browser / prototype gallery mode: persist locally and navigate.
  persistState(email);
  setStatus('Credentials saved. Opening Main Menu\u2026', 'success');
  postNavigateToMainMenu();
});

// Listen for the extension host response (VSCode mode only).
window.addEventListener('message', (event) => {
  const msg = event.data;
  if (!isRecord(msg) || msg.type !== LOGIN_RESULT_MESSAGE_TYPE) {
    return;
  }

  submitButton.disabled = false;

  if (msg.success === true) {
    // The extension will reload the webview HTML automatically.
    setStatus('Credentials saved. Opening Main Menu\u2026', 'success');
    return;
  }

  const errorMessage =
    typeof msg.error === 'string' && msg.error.length > 0
      ? msg.error
      : 'Login failed. Check your credentials.';
  setStatus(errorMessage, 'error');
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

function resolveVscodeApi() {
  if (typeof acquireVsCodeApi !== 'function') {
    return null;
  }

  return acquireVsCodeApi();
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
