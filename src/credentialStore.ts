import type * as vscode from 'vscode';

const EMAIL_SECRET_KEY = 'sapTools.cf.email';
const PASSWORD_SECRET_KEY = 'sapTools.cf.password';
let e2eFallbackCredentials: CfCredentials | null = null;

export interface CfCredentials {
  readonly email: string;
  readonly password: string;
}

/**
 * Read credentials from environment variables SAP_EMAIL and SAP_PASSWORD.
 * These take priority over stored secrets when both are set.
 */
export function getEnvCredentials(): CfCredentials | null {
  const email = process.env['SAP_EMAIL'];
  const password = process.env['SAP_PASSWORD'];

  if (
    typeof email === 'string' &&
    email.length > 0 &&
    typeof password === 'string' &&
    password.length > 0
  ) {
    return { email, password };
  }

  return null;
}

/**
 * Read credentials from VSCode's encrypted secret storage.
 */
export async function getStoredCredentials(
  context: vscode.ExtensionContext
): Promise<CfCredentials | null> {
  if (isE2eMode()) {
    return e2eFallbackCredentials;
  }

  try {
    const email = await context.secrets.get(EMAIL_SECRET_KEY);
    const password = await context.secrets.get(PASSWORD_SECRET_KEY);

    if (
      typeof email === 'string' &&
      email.length > 0 &&
      typeof password === 'string' &&
      password.length > 0
    ) {
      return { email, password };
    }
  } catch {
    if (!isE2eMode()) {
      throw new Error('Failed to read credentials from VSCode secure storage.');
    }
  }

  if (isE2eMode() && e2eFallbackCredentials !== null) {
    return e2eFallbackCredentials;
  }

  return null;
}

/**
 * Persist credentials in VSCode's encrypted secret storage.
 */
export async function storeCredentials(
  context: vscode.ExtensionContext,
  credentials: CfCredentials
): Promise<void> {
  if (isE2eMode()) {
    e2eFallbackCredentials = credentials;
    return;
  }

  try {
    await context.secrets.store(EMAIL_SECRET_KEY, credentials.email);
    await context.secrets.store(PASSWORD_SECRET_KEY, credentials.password);
  } catch {
    if (!isE2eMode()) {
      throw new Error('Failed to store credentials in VSCode secure storage.');
    }
  }
}

/**
 * Remove stored credentials from VSCode's encrypted secret storage.
 */
export async function clearCredentials(context: vscode.ExtensionContext): Promise<void> {
  if (isE2eMode()) {
    e2eFallbackCredentials = null;
    return;
  }

  try {
    await context.secrets.delete(EMAIL_SECRET_KEY);
    await context.secrets.delete(PASSWORD_SECRET_KEY);
  } catch {
    if (!isE2eMode()) {
      throw new Error('Failed to clear credentials from VSCode secure storage.');
    }
  }
}

/**
 * Return the first available credentials: env vars take priority over stored secrets.
 */
export async function getEffectiveCredentials(
  context: vscode.ExtensionContext
): Promise<CfCredentials | null> {
  if (isLoginGateForced()) {
    return null;
  }

  const envCredentials = getEnvCredentials();
  if (envCredentials !== null) {
    return envCredentials;
  }

  return getStoredCredentials(context);
}

function isLoginGateForced(): boolean {
  return process.env['SAP_TOOLS_FORCE_LOGIN_GATE'] === '1';
}

function isE2eMode(): boolean {
  return process.env['SAP_TOOLS_E2E'] === '1';
}
