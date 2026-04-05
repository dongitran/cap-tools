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
    this.emit({
      appName,
      port: proc?.port ?? 0,
      status,
      pid: proc?.process.pid,
      ...extra,
    });
  }

  /**
   * Spawns a `cds debug <appName> -f -p <port>` process and monitors it
   * for the "attach a debugger" signal.
   */
  async startDebug(appName: string, port: number): Promise<void> {
    if (this.processes.has(appName)) {
      logger.warn(`Debug session already active for ${appName}, stopping old one`);
      await this.stopDebug(appName);
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

    proc.stdout?.on('data', onData);
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
    this.updateStatus(appName, 'ATTACHED', { appUrl });
  }

  async stopDebug(appName: string): Promise<void> {
    const active = this.processes.get(appName);
    if (!active) return;

    logger.info(`Stopping debug session for ${appName}`);
    this.processes.delete(appName);

    // Kill process group to also stop CF SSH tunnels
    const { process: proc, port } = active;
    try {
      if (proc.pid) {
        process.kill(-proc.pid, 'SIGTERM');
      }
    } catch {
      proc.kill('SIGTERM');
    }

    // Fallback: kill any leftover process on the port
    this.killByPort(port);
  }

  async stopAll(): Promise<void> {
    const appNames = [...this.processes.keys()];
    await Promise.all(appNames.map(name => this.stopDebug(name)));
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
      if (pid) {
        process.kill(Number(pid), 'SIGTERM');
        logger.debug(`Killed process ${pid} on port ${port}`);
      }
    } catch {
      // port not in use or lsof not available — safe to ignore
    }
  }

  dispose(): void {
    this.stopAll().catch(() => undefined);
    this.listeners.clear();
  }
}
