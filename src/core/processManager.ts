import { spawn } from 'child_process';
import { execSync } from 'child_process';
import type { ChildProcess } from 'child_process';
import type { DebugSession, DebugSessionStatus } from '../types/index.js';
import { logger } from './logger.js';

type SessionListener = (session: DebugSession) => void;

interface ActiveProcess {
  process: ChildProcess;
  port: number;
  appName: string;
}

export class ProcessManager {
  private processes = new Map<string, ActiveProcess>();
  private listeners = new Set<SessionListener>();

  onSessionUpdate(listener: SessionListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(session: DebugSession): void {
    for (const listener of this.listeners) {
      listener(session);
    }
  }

  private updateStatus(appName: string, status: DebugSessionStatus, extra?: Partial<DebugSession>): void {
    const proc = this.processes.get(appName);
    const session: DebugSession = {
      appName,
      port: proc?.port ?? 0,
      status,
      // exactOptionalPropertyTypes: only set pid when it has a real value
      ...(proc?.process.pid !== undefined ? { pid: proc.process.pid } : {}),
      ...extra,
    };
    this.emit(session);
  }

  /**
   * Spawns a `cds debug <appName> -f -p <port>` process and monitors it
   * for the "attach a debugger" signal.
   */
  startDebug(appName: string, port: number): void {
    if (this.processes.has(appName)) {
      logger.warn(`Debug session already active for ${appName}, stopping old one`);
      this.stopDebug(appName);
    }

    this.updateStatus(appName, 'TUNNELING', { port });

    const proc = spawn('cds', ['debug', appName, '-f', '-p', String(port)], {
      shell: false,
      detached: false,
      env: process.env,
    });

    this.processes.set(appName, { process: proc, port, appName });
    logger.info(`Started cds debug for ${appName} on port ${port} (pid=${proc.pid})`);

    let output = '';

    const onData = (chunk: Buffer | string): void => {
      const text = chunk.toString();
      output += text;
      logger.debug(`[${appName}] ${text.trim()}`);

      if (/now attach a debugger to port/i.test(output)) {
        this.updateStatus(appName, 'ATTACHING', { port });
      }
    };

    // stdout/stderr may be null if spawn is called with stdio: 'ignore'
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    proc.stdout?.on('data', onData);
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    proc.stderr?.on('data', onData);

    proc.on('error', err => {
      logger.error(`cds debug process error for ${appName}`, err);
      this.processes.delete(appName);
      this.updateStatus(appName, 'ERROR', { error: err.message });
    });

    proc.on('close', code => {
      logger.info(`cds debug for ${appName} exited with code ${code}`);
      this.processes.delete(appName);
      this.updateStatus(appName, 'EXITED');
    });
  }

  /**
   * Call this after VSCode has successfully attached the debugger.
   */
  notifyAttached(appName: string, appUrl?: string): void {
    const extra: Partial<DebugSession> = {};
    if (appUrl !== undefined) { extra.appUrl = appUrl; }
    this.updateStatus(appName, 'ATTACHED', extra);
  }

  stopDebug(appName: string): void {
    const active = this.processes.get(appName);
    if (active === undefined) {return;}

    logger.info(`Stopping debug session for ${appName}`);
    this.processes.delete(appName);

    // Kill process group to also stop CF SSH tunnels
    const { process: proc, port } = active;
    try {
      if (proc.pid !== undefined) {
        process.kill(-proc.pid, 'SIGTERM');
      }
    } catch {
      proc.kill('SIGTERM');
    }

    // Fallback: kill any leftover process on the port
    this.killByPort(port);
  }

  stopAll(): void {
    for (const name of this.processes.keys()) {
      this.stopDebug(name);
    }
  }

  isActive(appName: string): boolean {
    return this.processes.has(appName);
  }

  getActiveSessions(): string[] {
    return [...this.processes.keys()];
  }

  private killByPort(port: number): void {
    try {
      const pid = execSync(`lsof -t -i:${port}`, { encoding: 'utf8' }).trim();
      if (pid.length > 0) {
        process.kill(Number(pid), 'SIGTERM');
        logger.debug(`Killed process ${pid} on port ${port}`);
      }
    } catch {
      // port not in use or lsof not available — safe to ignore
    }
  }

  dispose(): void {
    this.stopAll();
    this.listeners.clear();
  }
}
