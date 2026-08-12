import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prepareCfCliSessionMock, runWithCfTargetMock } = vi.hoisted(() => ({
  prepareCfCliSessionMock: vi.fn(),
  // Pass-through so the retry/backoff logic under test is observable; holding
  // the CF_HOME slot around the operation is covered in cfClient.test.ts.
  runWithCfTargetMock: vi.fn(
    async (_params: unknown, operation: () => Promise<unknown>) => operation()
  ),
}));

vi.mock('./cfClient', () => ({
  prepareCfCliSession: prepareCfCliSessionMock,
  runWithCfTarget: runWithCfTargetMock,
}));

import {
  isRecoverableCfCliAuthError,
  runWithCfCliAuthRecovery,
} from './cfCliAuthRecovery';

const session = {
  apiEndpoint: 'https://api.cf.us10.hana.ondemand.com',
  email: 'test@example.com',
  password: 'super-secret-password',
  orgName: 'finance-services-prod',
  spaceName: 'uat',
  cfHomeDir: '/tmp/sap-tools-cf-home',
};

beforeEach(() => {
  prepareCfCliSessionMock.mockReset();
  runWithCfTargetMock.mockReset();
  runWithCfTargetMock.mockImplementation(
    async (_params: unknown, operation: () => Promise<unknown>) => operation()
  );
});

describe('isRecoverableCfCliAuthError', () => {
  it('recognizes stale CF CLI login and target errors', () => {
    expect(isRecoverableCfCliAuthError(new Error('Not logged in. Use cf login.'))).toBe(true);
    expect(isRecoverableCfCliAuthError(new Error('No API endpoint set.'))).toBe(true);
    expect(isRecoverableCfCliAuthError(new Error('No org and space targeted.'))).toBe(true);
    expect(isRecoverableCfCliAuthError(new Error('CF SSH failed (cli: 401 unauthorized)'))).toBe(true);
    expect(isRecoverableCfCliAuthError(new Error('CF SSH failed (cli: not authorized)'))).toBe(true);
    expect(isRecoverableCfCliAuthError(new Error('Refresh token expired.'))).toBe(true);
  });

  it('does not recover invalid credentials or non-auth CLI failures', () => {
    expect(
      isRecoverableCfCliAuthError(
        new Error('Failed to authenticate Cloud Foundry CLI. (cli: credentials were rejected)')
      )
    ).toBe(false);
    expect(isRecoverableCfCliAuthError(new Error('Invalid SAP credentials.'))).toBe(false);
    expect(isRecoverableCfCliAuthError(new Error('No such file or directory'))).toBe(false);
    expect(isRecoverableCfCliAuthError(new Error('ssh is disabled for this app'))).toBe(false);
    expect(
      isRecoverableCfCliAuthError(new Error('Failed to parse default-env.json for "app-401".'))
    ).toBe(false);
  });
});

describe('runWithCfCliAuthRecovery', () => {
  it('uses the cached session path for the initial operation', async () => {
    const operation = vi.fn().mockResolvedValue('ok');

    await expect(runWithCfCliAuthRecovery(session, operation)).resolves.toBe('ok');

    // Default path does NOT hold the CF_HOME slot: the operation may be a long
    // artifact export, and holding it would stall every other CF feature.
    expect(prepareCfCliSessionMock).toHaveBeenCalledWith(session);
    expect(runWithCfTargetMock).not.toHaveBeenCalled();
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('re-authenticates and retries twice before succeeding', async () => {
    const operation = vi.fn()
      .mockRejectedValueOnce(new Error('CF SSH failed (cli: not authorized)'))
      .mockRejectedValueOnce(new Error('CF SSH failed (cli: 401 unauthorized)'))
      .mockResolvedValueOnce('ok');

    await expect(runWithCfCliAuthRecovery(session, operation)).resolves.toBe('ok');

    expect(prepareCfCliSessionMock).toHaveBeenNthCalledWith(1, session);
    expect(prepareCfCliSessionMock).toHaveBeenNthCalledWith(2, { ...session, forceReauth: true });
    expect(prepareCfCliSessionMock).toHaveBeenNthCalledWith(3, { ...session, forceReauth: true });
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it('holds the CF_HOME slot across the operation when holdTarget is set', async () => {
    const operation = vi.fn().mockResolvedValue('ok');

    await expect(
      runWithCfCliAuthRecovery(session, operation, { holdTarget: true })
    ).resolves.toBe('ok');

    expect(runWithCfTargetMock).toHaveBeenCalledWith(session, operation);
    expect(prepareCfCliSessionMock).not.toHaveBeenCalled();
  });

  it('keeps retrying under holdTarget', async () => {
    const operation = vi.fn()
      .mockRejectedValueOnce(new Error('CF SSH failed (cli: not authorized)'))
      .mockResolvedValueOnce('ok');

    await expect(
      runWithCfCliAuthRecovery(session, operation, { holdTarget: true })
    ).resolves.toBe('ok');

    expect(runWithCfTargetMock).toHaveBeenNthCalledWith(2, { ...session, forceReauth: true }, operation);
  });
});
