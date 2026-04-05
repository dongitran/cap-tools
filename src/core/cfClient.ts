import { execFile } from 'child_process';
import { promisify } from 'util';
import type { CfApp, CfOrg, CfSpace, VcapServices } from '../types/index.js';
import { logger } from './logger.js';

const execFileAsync = promisify(execFile);

export class CfError extends Error {
  constructor(
    message: string,
    public readonly command: string,
    public readonly stderr: string,
  ) {
    super(message);
    this.name = 'CfError';
  }
}

interface ExecOptions {
  cfHome?: string;
  timeout?: number;
}

async function cf(args: string[], opts: ExecOptions = {}): Promise<string> {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...(opts.cfHome ? { CF_HOME: opts.cfHome } : {}),
  };

  const cmd = `cf ${args.join(' ')}`;
  logger.debug(`Running: ${cmd}`);

  try {
    const { stdout } = await execFileAsync('cf', args, {
      env,
      timeout: opts.timeout ?? 30_000,
      maxBuffer: 10 * 1024 * 1024,
    });
    return stdout.trim();
  } catch (err: unknown) {
    const e = err as { message: string; stderr?: string };
    const stderr = e.stderr ?? '';
    throw new CfError(`CF command failed: ${cmd}`, cmd, stderr);
  }
}

// ─── Authentication ───────────────────────────────────────────────────────────

export async function cfSetApi(apiEndpoint: string, opts?: ExecOptions): Promise<void> {
  await cf(['api', apiEndpoint, '--skip-ssl-validation'], opts);
}

export async function cfAuth(email: string, password: string, opts?: ExecOptions): Promise<void> {
  await cf(['auth', email, password], opts);
}

export async function cfLogout(opts?: ExecOptions): Promise<void> {
  try {
    await cf(['logout'], opts);
  } catch {
    // ignore logout errors
  }
}

// ─── Orgs & Spaces ───────────────────────────────────────────────────────────

export async function cfOrgs(opts?: ExecOptions): Promise<CfOrg[]> {
  const raw = await cf(['orgs'], opts);
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
  // Skip header lines ("Getting orgs...", "OK", empty, then org names)
  const headerEnd = lines.findIndex(l => l === 'OK');
  const orgLines = headerEnd >= 0 ? lines.slice(headerEnd + 1) : lines.slice(2);
  return orgLines.filter(l => l && !l.startsWith('Getting')).map(name => ({ name, guid: '' }));
}

export async function cfSpaces(org: string, opts?: ExecOptions): Promise<CfSpace[]> {
  await cfTarget(org, undefined, opts);
  const raw = await cf(['spaces'], opts);
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
  const headerEnd = lines.findIndex(l => l === 'OK');
  const spaceLines = headerEnd >= 0 ? lines.slice(headerEnd + 1) : lines.slice(2);
  return spaceLines.filter(l => l && !l.startsWith('Getting')).map(name => ({ name, guid: '' }));
}

export async function cfTarget(org: string, space?: string, opts?: ExecOptions): Promise<void> {
  const args = ['target', '-o', org];
  if (space) args.push('-s', space);
  await cf(args, opts);
}

// ─── Apps ─────────────────────────────────────────────────────────────────────

export async function cfApps(opts?: ExecOptions): Promise<CfApp[]> {
  const raw = await cf(['apps'], opts);
  return parseCfAppsOutput(raw);
}

export function parseCfAppsOutput(raw: string): CfApp[] {
  const lines = raw.split('\n');
  // Find the table header line that starts with "name"
  const headerIdx = lines.findIndex(l => /^name\s+requested state/i.test(l.trim()));
  if (headerIdx < 0) return [];

  const apps: CfApp[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = line.split(/\s{2,}/);
    if (cols.length < 2) continue;
    const name = cols[0];
    const state = cols[1]?.toUpperCase() === 'STARTED' ? 'STARTED' : 'STOPPED';
    const urlsCol = cols[5] ?? '';
    const urls = urlsCol ? urlsCol.split(',').map(u => u.trim()).filter(Boolean) : [];
    apps.push({ name, state, urls });
  }
  return apps;
}

// ─── Environment ──────────────────────────────────────────────────────────────

export async function cfEnv(appName: string, opts?: ExecOptions): Promise<string> {
  return cf(['env', appName], opts);
}

export function parseVcapServices(envOutput: string): VcapServices {
  const vcapMatch = envOutput.match(/VCAP_SERVICES:\s*(\{[\s\S]*?\})\n\n/);
  if (!vcapMatch) return {};
  try {
    return JSON.parse(vcapMatch[1]) as VcapServices;
  } catch {
    return {};
  }
}

export function parseEnvVars(envOutput: string): Record<string, string> {
  const result: Record<string, string> = {};
  // Match "User-Provided:" section
  const userSection = envOutput.match(/User-Provided:\n([\s\S]*?)(?:\n\n|\n[A-Z])/);
  if (!userSection) return result;
  for (const line of userSection[1].split('\n')) {
    const eq = line.indexOf(':');
    if (eq > 0) {
      result[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
    }
  }
  return result;
}

// ─── App URLs ─────────────────────────────────────────────────────────────────

export async function cfAppUrl(appName: string, opts?: ExecOptions): Promise<string | undefined> {
  try {
    const raw = await cf(['app', appName], opts);
    const match = raw.match(/routes:\s+(.+)/i);
    if (match) {
      const route = match[1].trim().split(',')[0].trim();
      return `https://${route}`;
    }
  } catch {
    // ignore
  }
  return undefined;
}
