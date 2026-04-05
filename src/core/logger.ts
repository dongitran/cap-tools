import * as vscode from 'vscode';

type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';

class Logger {
  private channel: vscode.OutputChannel | undefined;

  init(): void {
    this.channel = vscode.window.createOutputChannel('SAP Dev Suite', { log: true });
  }

  private write(level: LogLevel, message: string, ...args: unknown[]): void {
    if (!this.channel) {return;}
    const extra = args.length > 0 ? ` ${  args.map(a => JSON.stringify(a)).join(' ')}` : '';
    this.channel.appendLine(`[${level}] ${message}${extra}`);
  }

  info(message: string, ...args: unknown[]): void {
    this.write('INFO', message, ...args);
  }

  warn(message: string, ...args: unknown[]): void {
    this.write('WARN', message, ...args);
  }

  error(message: string, err?: unknown): void {
    const errStr = err instanceof Error ? `: ${err.message}` : (err !== null && err !== undefined) ? `: ${String(err)}` : '';
    this.write('ERROR', `${message}${errStr}`);
    if (err instanceof Error && err.stack !== undefined) {
      this.channel?.appendLine(err.stack);
    }
  }

  debug(message: string, ...args: unknown[]): void {
    this.write('DEBUG', message, ...args);
  }

  show(): void {
    this.channel?.show(true);
  }

  dispose(): void {
    this.channel?.dispose();
  }
}

export const logger = new Logger();
