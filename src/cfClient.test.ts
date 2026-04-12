import { beforeEach, describe, expect, it, vi } from 'vitest';

const { execFileAsyncMock } = vi.hoisted(() => ({
  execFileAsyncMock: vi.fn(),
}));

vi.mock('node:util', () => ({
  promisify: () => execFileAsyncMock,
}));

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

import { fetchStartedAppsViaCfCli, parseCfAppsOutput } from './cfClient';

describe('parseCfAppsOutput', () => {
  it('parses CF v8 processes output and extracts running instances', () => {
    const output = [
      'Getting apps in org sample / space prod as user@example.com...',
      '',
      'name  requested state  processes  routes',
      'web-api  started  web:1/1, worker:0/1  web-api.cfapps.example.com',
      'job-runner  started  web:0/1  ',
      'alerts  stopped  web:0/1  alerts.cfapps.example.com',
      '',
    ].join('\n');

    expect(parseCfAppsOutput(output)).toEqual([
      { name: 'web-api', requestedState: 'started', runningInstances: 1 },
      { name: 'job-runner', requestedState: 'started', runningInstances: 0 },
      { name: 'alerts', requestedState: 'stopped', runningInstances: 0 },
    ]);
  });

  it('parses CF v7 instances output and handles no header', () => {
    const output = [
      'name  requested state  instances  urls',
      'billing-api  started  2/2  billing-api.cfapps.example.com',
      'worker-api  started  0/1  worker-api.cfapps.example.com',
    ].join('\n');

    expect(parseCfAppsOutput(output)).toEqual([
      { name: 'billing-api', requestedState: 'started', runningInstances: 2 },
      { name: 'worker-api', requestedState: 'started', runningInstances: 0 },
    ]);

    expect(parseCfAppsOutput('unexpected output')).toEqual([]);
  });
});

describe('fetchStartedAppsViaCfCli', () => {
  beforeEach(() => {
    execFileAsyncMock.mockReset();
  });

  it('runs cf commands in sequence and returns only started apps with running instances', async () => {
    execFileAsyncMock
      .mockResolvedValueOnce({ stdout: '' }) // cf api
      .mockResolvedValueOnce({ stdout: '' }) // cf auth
      .mockResolvedValueOnce({ stdout: '' }) // cf target
      .mockResolvedValueOnce({
        stdout: [
          'name  requested state  processes  routes',
          'orders-api  started  web:2/2  orders-api.cfapps.example.com',
          'batch-worker  started  web:0/1  ',
          'legacy-api  stopped  web:0/1  legacy-api.cfapps.example.com',
        ].join('\n'),
      }); // cf apps

    const apps = await fetchStartedAppsViaCfCli({
      apiEndpoint: 'https://api.cf.us10.hana.ondemand.com',
      email: 'test@example.com',
      password: 'super-secret-password',
      orgName: 'finance-services-prod',
      spaceName: 'uat',
      cfHomeDir: '/tmp/sap-tools-cf-home',
    });

    expect(apps).toEqual([
      { name: 'orders-api', runningInstances: 2 },
    ]);

    expect(execFileAsyncMock).toHaveBeenNthCalledWith(
      1,
      'cf',
      ['api', 'https://api.cf.us10.hana.ondemand.com'],
      expect.objectContaining({
        maxBuffer: 8 * 1024 * 1024,
        timeout: 30_000,
        env: expect.objectContaining({
          CF_HOME: '/tmp/sap-tools-cf-home',
        }),
      })
    );

    expect(execFileAsyncMock).toHaveBeenNthCalledWith(
      2,
      'cf',
      ['auth', 'test@example.com', 'super-secret-password'],
      expect.any(Object)
    );
    expect(execFileAsyncMock).toHaveBeenNthCalledWith(
      3,
      'cf',
      ['target', '-o', 'finance-services-prod', '-s', 'uat'],
      expect.any(Object)
    );
    expect(execFileAsyncMock).toHaveBeenNthCalledWith(4, 'cf', ['apps'], expect.any(Object));
  });

  it('returns safe auth error message without leaking password from command args', async () => {
    execFileAsyncMock
      .mockResolvedValueOnce({ stdout: '' })
      .mockRejectedValueOnce({
        stderr: 'Credentials were rejected by UAA',
        message: 'Command failed: cf auth test@example.com super-secret-password',
      });

    let errorMessage = '';
    try {
      await fetchStartedAppsViaCfCli({
        apiEndpoint: 'https://api.cf.us10.hana.ondemand.com',
        email: 'test@example.com',
        password: 'super-secret-password',
        orgName: 'finance-services-prod',
        spaceName: 'uat',
      });
      expect.fail('Expected fetchStartedAppsViaCfCli to throw.');
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    }

    expect(errorMessage).toContain('Failed to authenticate Cloud Foundry CLI.');
    expect(errorMessage).toContain('Credentials were rejected by UAA');
    expect(errorMessage).not.toContain('super-secret-password');
  });
});
