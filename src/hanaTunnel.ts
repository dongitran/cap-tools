import { connect as netConnect, createServer } from 'node:net';

import { prepareCfCliSession, spawnCfSshPortForward, type CfPortForwardHandle } from './cfClient';
import type { HanaConnection } from './hanaSqlService';
import {
  recordTunnelForward,
  removeTunnelForwardByPid,
  removeTunnelForwardsByOwner,
} from './hanaTunnelRegistry';

/**
 * Auto-tunnel for HANA Cloud SQL access.
 *
 * Some HANA Cloud instances are unreachable directly from a developer machine
 * (stopped, IP-allowlisted, or behind a corporate network) — the TLS handshake
 * is reset and table discovery / queries fail. When that happens the SQL
 * workbench falls back here: we open a single `cf ssh` local port-forward
 * through a running app in the same space (whose egress IS allowed to reach
 * HANA) and route the hdb connection through it.
 *
 * One subtlety, proven out against a live instance before this was built: HANA
 * Cloud normally routes by SNI to its gateway (`<guid>.hna0…`) and then
 * REDIRECTS the connection to an internal tenant host (`<guid>-0.<shard>.hna0…`)
 * that is not reachable through the tunnel. Rather than forward that second host
 * too, the tunneled connection sets hdb's `disableCloudRedirect` (see
 * `buildTunneledConnection`): hdb then stays on the gateway endpoint, which
 * serves SQL directly, so ONE forward is enough. (`disableCloudRedirect` is
 * SAP's documented option for exactly this proxy/tunnel scenario.)
 *
 * The tunneled socket targets 127.0.0.1:<ephemeral>, so TLS is forced (hdb only
 * auto-enables it for port 443), SNI stays the real host (gateway routing), and
 * certificate validation is disabled (the cert host differs from 127.0.0.1;
 * bytes still travel end-to-end TLS to the real HANA over the authenticated SSH
 * forward). The normal (non-tunnel) connection path is never altered.
 */

export interface HanaTunnelCfSession {
  readonly apiEndpoint: string;
  readonly email: string;
  readonly password: string;
  readonly orgName: string;
  readonly spaceName: string;
  readonly cfHomeDir: string;
}

export interface ActiveHanaTunnel {
  readonly mainHost: string;
  readonly localPort: number;
}

interface TunnelRecord {
  readonly mainHost: string;
  readonly localPort: number;
  readonly app: string;
  readonly handle: CfPortForwardHandle;
}

const TUNNEL_KEEPALIVE_SECONDS = 6 * 60 * 60;
const TUNNEL_READY_TIMEOUT_MS = 20_000;
const TUNNEL_READY_POLL_MS = 200;

function findFreePort(): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address !== null ? address.port : 0;
      server.close(() => {
        if (port === 0) {
          reject(new Error('Failed to allocate a local port for the HANA tunnel.'));
          return;
        }
        resolve(port);
      });
    });
  });
}

function waitForLocalPort(port: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  return new Promise<boolean>((resolve) => {
    const attempt = (): void => {
      const socket = netConnect({ host: '127.0.0.1', port });
      socket.once('connect', () => {
        socket.destroy();
        resolve(true);
      });
      socket.once('error', () => {
        socket.destroy();
        if (Date.now() >= deadline) {
          resolve(false);
          return;
        }
        setTimeout(attempt, TUNNEL_READY_POLL_MS);
      });
    };
    attempt();
  });
}

export class HanaTunnelManager {
  private readonly tunnels = new Map<string, TunnelRecord>();
  private readonly pending = new Map<string, Promise<ActiveHanaTunnel | null>>();

  constructor(
    private readonly log: (message: string) => void,
    private readonly onClosed: (mainHost: string) => void = () => undefined
  ) {}

  isActive(mainHost: string): boolean {
    return this.tunnels.has(mainHost);
  }

  /**
   * Build the hdb connection that routes through an already-open tunnel for
   * `direct.host`. Returns `direct` unchanged when no tunnel exists.
   */
  buildTunneledConnection(direct: HanaConnection): HanaConnection {
    const tunnel = this.tunnels.get(direct.host);
    if (tunnel === undefined) {
      return direct;
    }
    return {
      host: '127.0.0.1',
      port: tunnel.localPort,
      user: direct.user,
      password: direct.password,
      ...(direct.database !== undefined ? { database: direct.database } : {}),
      servername: direct.host,
      forceTls: true,
      validateCertificate: false,
      // Stay on the gateway endpoint instead of being redirected to an internal
      // tenant host the tunnel cannot reach — so this one forward is sufficient.
      disableCloudRedirect: true,
    };
  }

  async ensureTunnel(
    session: HanaTunnelCfSession,
    mainHost: string,
    appCandidates: readonly string[]
  ): Promise<ActiveHanaTunnel | null> {
    const existing = this.tunnels.get(mainHost);
    if (existing !== undefined) {
      return { mainHost, localPort: existing.localPort };
    }
    const inFlight = this.pending.get(mainHost);
    if (inFlight !== undefined) {
      return inFlight;
    }
    const created = this.createMainTunnel(session, mainHost, appCandidates).finally(() => {
      this.pending.delete(mainHost);
    });
    this.pending.set(mainHost, created);
    return created;
  }

  /** Tear down the tunnel for one host (dead forward, scope change). Idempotent. */
  invalidate(mainHost: string): void {
    const tunnel = this.tunnels.get(mainHost);
    if (tunnel === undefined) {
      return;
    }
    this.tunnels.delete(mainHost);
    tunnel.handle.stop();
    this.forgetForward(tunnel.handle);
    this.log(`[tunnel] closed HANA tunnel for ${mainHost}`);
    this.onClosed(mainHost);
  }

  dispose(): void {
    // Clear the map first so the forwards' 'exit' handlers (which call
    // invalidate) become no-ops and we don't mutate while iterating.
    const records = [...this.tunnels.values()];
    this.tunnels.clear();
    this.pending.clear();
    for (const tunnel of records) {
      tunnel.handle.stop();
    }
    void removeTunnelForwardsByOwner(process.pid);
  }

  private persistForward(
    session: HanaTunnelCfSession,
    mainHost: string,
    remoteHost: string,
    handle: CfPortForwardHandle
  ): void {
    const pid = handle.process.pid;
    if (pid === undefined) {
      return;
    }
    void recordTunnelForward({
      ownerPid: process.pid,
      pid,
      mainHost,
      remoteHost,
      localPort: handle.localPort,
      scope: `${session.orgName}/${session.spaceName}`,
      startedAt: new Date().toISOString(),
    });
  }

  private forgetForward(handle: CfPortForwardHandle): void {
    const pid = handle.process.pid;
    if (pid !== undefined) {
      void removeTunnelForwardByPid(pid);
    }
  }

  private async createMainTunnel(
    session: HanaTunnelCfSession,
    mainHost: string,
    appCandidates: readonly string[]
  ): Promise<ActiveHanaTunnel | null> {
    // Prepare the CF session once (api/auth/target are app-independent), not
    // per app/forward attempt.
    if (!(await this.prepareSession(session))) {
      return null;
    }
    for (const app of appCandidates) {
      const handle = await this.openForward(app, mainHost, session.cfHomeDir);
      if (handle === null) {
        continue;
      }
      const tunnel: TunnelRecord = {
        mainHost,
        localPort: handle.localPort,
        app,
        handle,
      };
      this.tunnels.set(mainHost, tunnel);
      this.persistForward(session, mainHost, mainHost, handle);
      // When the keep-alive ends or the SSH session drops, drop the tunnel so
      // the next operation re-establishes it through the normal fallback.
      handle.process.once('exit', () => {
        this.invalidate(mainHost);
      });
      this.log(
        `[tunnel] opened HANA tunnel for ${mainHost} via app ${app} on 127.0.0.1:${String(handle.localPort)}`
      );
      return { mainHost, localPort: handle.localPort };
    }
    this.log(
      `[tunnel] could not open a HANA tunnel for ${mainHost}: no SSH-capable running app in the space`
    );
    return null;
  }

  private async prepareSession(session: HanaTunnelCfSession): Promise<boolean> {
    try {
      await prepareCfCliSession(session);
      return true;
    } catch (error) {
      this.log(`[tunnel] CF session preparation failed: ${describeError(error)}`);
      return false;
    }
  }

  private async openForward(
    appName: string,
    remoteHost: string,
    cfHomeDir: string
  ): Promise<CfPortForwardHandle | null> {
    let localPort: number;
    try {
      localPort = await findFreePort();
    } catch (error) {
      this.log(`[tunnel] port allocation failed: ${describeError(error)}`);
      return null;
    }

    const handle = spawnCfSshPortForward({
      appName,
      localPort,
      remoteHost,
      remotePort: 443,
      keepAliveSeconds: TUNNEL_KEEPALIVE_SECONDS,
      cfHomeDir,
    });

    let stderr = '';
    const onStderr = (chunk: Buffer): void => {
      if (stderr.length < 4096) {
        stderr += chunk.toString('utf8');
      }
    };
    handle.process.stderr.on('data', onStderr);

    // Race port readiness against the process dying. An app without SSH enabled
    // (or a missing app) makes `cf ssh` exit almost immediately, so racing keeps
    // us from waiting out the full readiness timeout before trying the next app.
    const onFailExit = (): void => {
      resolveFailed();
    };
    let resolveFailed: () => void = () => undefined;
    const failedEarly = new Promise<'failed'>((resolve) => {
      resolveFailed = (): void => {
        resolve('failed');
      };
      handle.process.once('exit', onFailExit);
      handle.process.once('error', onFailExit);
    });
    const outcome = await Promise.race([
      waitForLocalPort(localPort, TUNNEL_READY_TIMEOUT_MS).then((ok) =>
        ok ? ('ready' as const) : ('timeout' as const)
      ),
      failedEarly,
    ]);

    // Stop accumulating stderr / holding the race listeners for the life of a
    // healthy 6-hour forward; the tunnel's own 'exit' handler covers teardown.
    handle.process.stderr.removeListener('data', onStderr);
    handle.process.removeListener('exit', onFailExit);
    handle.process.removeListener('error', onFailExit);

    if (outcome !== 'ready') {
      handle.stop();
      const detail = stderr.trim().split('\n').pop()?.trim() ?? '';
      this.log(
        `[tunnel] forward via ${appName} to ${remoteHost} ${outcome === 'timeout' ? 'timed out' : 'failed'}${detail.length > 0 ? `: ${detail}` : ''}`
      );
      return null;
    }
    return handle;
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
