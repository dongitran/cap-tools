import { describe, expect, it, vi } from 'vitest';
import type * as vscode from 'vscode';

interface SecretStorageBehaviors {
  readonly get?: (key: string) => Promise<string | undefined>;
  readonly store?: (key: string, value: string) => Promise<void>;
  readonly delete?: (key: string) => Promise<void>;
}

function createMockContext(
  behaviors: SecretStorageBehaviors = {}
): vscode.ExtensionContext {
  return {
    secrets: {
      get: vi.fn(async (key: string) => {
        if (behaviors.get === undefined) {
          return undefined;
        }
        return behaviors.get(key);
      }),
      store: vi.fn(async (key: string, value: string) => {
        if (behaviors.store !== undefined) {
          await behaviors.store(key, value);
        }
      }),
      delete: vi.fn(async (key: string) => {
        if (behaviors.delete !== undefined) {
          await behaviors.delete(key);
        }
      }),
    },
  } as unknown as vscode.ExtensionContext;
}

async function loadCredentialStoreModule(): Promise<typeof import('./credentialStore')> {
  vi.resetModules();
  return import('./credentialStore');
}

function resetCredentialEnv(): void {
  delete process.env['SAP_EMAIL'];
  delete process.env['SAP_PASSWORD'];
  delete process.env['SAP_TOOLS_FORCE_LOGIN_GATE'];
  delete process.env['SAP_TOOLS_E2E'];
}

describe('credentialStore', () => {
  it('returns env credentials when SAP_EMAIL and SAP_PASSWORD are set', async () => {
    resetCredentialEnv();
    const module = await loadCredentialStoreModule();
    process.env['SAP_EMAIL'] = 'dev@example.com';
    process.env['SAP_PASSWORD'] = 'dev-password';

    expect(module.getEnvCredentials()).toEqual({
      email: 'dev@example.com',
      password: 'dev-password',
    });
  });

  it('returns null from getEffectiveCredentials when login gate is forced', async () => {
    resetCredentialEnv();
    const module = await loadCredentialStoreModule();
    process.env['SAP_EMAIL'] = 'dev@example.com';
    process.env['SAP_PASSWORD'] = 'dev-password';
    process.env['SAP_TOOLS_FORCE_LOGIN_GATE'] = '1';

    const context = createMockContext();
    await expect(module.getEffectiveCredentials(context)).resolves.toBeNull();
  });

  it('uses e2e fallback storage when secure storage throws', async () => {
    resetCredentialEnv();
    const module = await loadCredentialStoreModule();
    process.env['SAP_TOOLS_E2E'] = '1';

    const context = createMockContext({
      store: async () => {
        throw new Error('Keyring unavailable');
      },
      get: async () => {
        throw new Error('Keyring unavailable');
      },
      delete: async () => {
        throw new Error('Keyring unavailable');
      },
    });

    await expect(
      module.storeCredentials(context, {
        email: 'test@example.com',
        password: 'test-password',
      })
    ).resolves.toBeUndefined();

    await expect(module.getStoredCredentials(context)).resolves.toEqual({
      email: 'test@example.com',
      password: 'test-password',
    });

    await expect(module.clearCredentials(context)).resolves.toBeUndefined();
    await expect(module.getStoredCredentials(context)).resolves.toBeNull();
  });

  it('throws when secure storage fails outside e2e mode', async () => {
    resetCredentialEnv();
    const module = await loadCredentialStoreModule();

    const context = createMockContext({
      store: async () => {
        throw new Error('Keyring unavailable');
      },
    });

    await expect(
      module.storeCredentials(context, {
        email: 'prod@example.com',
        password: 'prod-password',
      })
    ).rejects.toThrow('Failed to store credentials in VSCode secure storage.');
  });
});
