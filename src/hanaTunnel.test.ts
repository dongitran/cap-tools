import { EventEmitter } from 'node:events';
import { createServer, type Server } from 'node:net';

import { afterEach, describe, expect, it, vi } from 'vitest';

const { spawnForwardMock } = vi.hoisted(() => ({ spawnForwardMock: vi.fn() }));

// Keep the manager off the real `cf` CLI and the on-disk registry: a forward is
// simulated by a real local listener so the manager's port-readiness probe
// (`waitForLocalPort`) succeeds without spawning anything.
vi.mock('./cfClient', () => ({
  prepareCfCliSession: vi.fn(async () => undefined),
  spawnCfSshPortForward: spawnForwardMock,
}));

vi.mock('./hanaTunnelRegistry', () => ({
  recordTunnelForward: vi.fn(async () => undefined),
  removeTunnelForwardByPid: vi.fn(async () => undefined),
  removeTunnelForwardsByOwner: vi.fn(async () => undefined),
}));

import { HanaTunnelManager } from './hanaTunnel';

const SESSION = {
  apiEndpoint: 'https://api.cf.us20.hana.ondemand.com',
  email: 'e',
  password: 'p',
  orgName: 'o',
  spaceName: 's',
  cfHomeDir: '/tmp/cf-home-tunnel-test',
};
const HOST = 'guid.hna0.example.hanacloud.ondemand.com';

const openServers: Server[] = [];

/** A fake `cf ssh -L` forward: a real listener on the requested local port. */
function fakeForward(localPort: number): {
  localPort: number;
  process: EventEmitter;
  stop: () => void;
} {
  const server = createServer();
  // Guard the tiny window between the manager's findFreePort() releasing the port
  // and this listener binding it: an unhandled 'error' would otherwise crash the
  // test. waitForLocalPort retries, so a rare miss just fails the assertion.
  server.on('error', () => undefined);
  server.listen(localPort, '127.0.0.1');
  openServers.push(server);
  const process = Object.assign(new EventEmitter(), {
    stderr: new EventEmitter(),
    pid: 4242,
  });
  return {
    localPort,
    process,
    stop: vi.fn(() => {
      server.close();
    }),
  };
}

/** A `cf ssh` that the server rejects (e.g. SSH disabled for the app): the
 * process exits before the local port is ready. */
function failingForward(): { localPort: number; process: EventEmitter; stop: () => void } {
  const process = Object.assign(new EventEmitter(), { stderr: new EventEmitter(), pid: 99 });
  // setImmediate ensures openForward has attached its 'exit' listener first.
  setImmediate(() => process.emit('exit'));
  return { localPort: 9, process, stop: vi.fn() };
}

afterEach(() => {
  for (const server of openServers.splice(0)) {
    server.close();
  }
  spawnForwardMock.mockReset();
});

describe('HanaTunnelManager', () => {
  it('leaves a direct connection untouched when no tunnel is active', () => {
    const manager = new HanaTunnelManager(() => undefined);
    const direct = { host: HOST, port: 443, user: 'u', password: 'p' };

    // Same object reference back => the non-tunnel path is provably never altered.
    expect(manager.buildTunneledConnection(direct)).toBe(direct);
    expect(manager.isActive(HOST)).toBe(false);
  });

  it('opens a single forward and routes through it with disableCloudRedirect', async () => {
    spawnForwardMock.mockImplementation((params: { localPort: number }) =>
      fakeForward(params.localPort)
    );
    const manager = new HanaTunnelManager(() => undefined);

    const tunnel = await manager.ensureTunnel(SESSION, HOST, ['app1']);
    if (tunnel === null) {
      throw new Error('expected a tunnel to open');
    }
    expect(manager.isActive(HOST)).toBe(true);
    // Exactly ONE forward — no second forward for a redirect host.
    expect(spawnForwardMock).toHaveBeenCalledTimes(1);

    const tunneled = manager.buildTunneledConnection({
      host: HOST,
      port: 443,
      user: 'u',
      password: 'p',
      database: 'SHOULD_NOT_PROPAGATE',
    });
    expect(tunneled).toMatchObject({
      host: '127.0.0.1',
      port: tunnel.localPort,
      servername: HOST,
      forceTls: true,
      validateCertificate: false,
      disableCloudRedirect: true,
    });
    // databaseName must NOT be carried onto the tunnel (it would re-trigger an
    // MDC redirect to an unreachable host).
    expect(tunneled).not.toHaveProperty('database');

    manager.dispose();
    expect(manager.isActive(HOST)).toBe(false);
  });

  it('reuses the open tunnel for the same host without spawning another forward', async () => {
    spawnForwardMock.mockImplementation((params: { localPort: number }) =>
      fakeForward(params.localPort)
    );
    const manager = new HanaTunnelManager(() => undefined);

    const first = await manager.ensureTunnel(SESSION, HOST, ['app1']);
    const second = await manager.ensureTunnel(SESSION, HOST, ['app2']);

    expect(first).not.toBeNull();
    expect(second).toEqual(first);
    expect(spawnForwardMock).toHaveBeenCalledTimes(1);

    manager.dispose();
  });

  it('remembers the jump-host per host and keeps the hint across invalidate', async () => {
    spawnForwardMock.mockImplementation((params: { localPort: number }) =>
      fakeForward(params.localPort)
    );
    const manager = new HanaTunnelManager(() => undefined);

    await manager.ensureTunnel(SESSION, HOST, ['ssh-app']);
    expect(manager.preferredJumpApp(HOST)).toBe('ssh-app');

    manager.invalidate(HOST);
    expect(manager.isActive(HOST)).toBe(false);
    // Hint survives invalidate so a rebuild can reuse the SSH-capable app.
    expect(manager.preferredJumpApp(HOST)).toBe('ssh-app');

    manager.dispose();
    expect(manager.preferredJumpApp(HOST)).toBeUndefined();
  });

  it('skips an app without SSH access and remembers the one that works', async () => {
    spawnForwardMock.mockImplementation((params: { appName: string; localPort: number }) =>
      params.appName === 'no-ssh' ? failingForward() : fakeForward(params.localPort)
    );
    const manager = new HanaTunnelManager(() => undefined);

    const tunnel = await manager.ensureTunnel(SESSION, HOST, ['no-ssh', 'has-ssh']);
    if (tunnel === null) {
      throw new Error('expected a tunnel via the SSH-capable app');
    }

    expect(spawnForwardMock).toHaveBeenCalledTimes(2);
    expect(manager.preferredJumpApp(HOST)).toBe('has-ssh');

    manager.dispose();
  });

  it('refuses to open a tunnel after dispose (no orphaned forward)', async () => {
    spawnForwardMock.mockImplementation((params: { localPort: number }) =>
      fakeForward(params.localPort)
    );
    const manager = new HanaTunnelManager(() => undefined);
    manager.dispose();

    const tunnel = await manager.ensureTunnel(SESSION, HOST, ['app1']);

    expect(tunnel).toBeNull();
    expect(spawnForwardMock).not.toHaveBeenCalled();
    expect(manager.isActive(HOST)).toBe(false);
  });
});
