export type CfCommandLogger = (message: string) => void;

let cfCommandLogger: CfCommandLogger | null = null;

export function configureCfCommandLogger(logger: CfCommandLogger | null): void {
  cfCommandLogger = logger;
}

export function logCfCommand(args: readonly string[]): void {
  if (cfCommandLogger === null) {
    return;
  }

  cfCommandLogger(`[cf-cli] cf ${formatCfCommandArgs(args)}`);
}

function formatCfCommandArgs(args: readonly string[]): string {
  return args.map((arg) => sanitizeCfCommandArg(arg)).join(' ');
}

function sanitizeCfCommandArg(arg: string): string {
  const normalized = arg.replaceAll(/\s+/g, ' ').trim();
  if (normalized.length === 0) {
    return '""';
  }
  if (normalized.length > 120) {
    return `${normalized.slice(0, 117)}...`;
  }
  return normalized;
}
