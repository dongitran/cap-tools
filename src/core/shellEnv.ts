import { execSync } from 'child_process';
import { logger } from './logger.js';

interface ShellCredentials {
  email: string | undefined;
  password: string | undefined;
}

let cachedCreds: ShellCredentials | undefined;

/**
 * Reads SAP_EMAIL and SAP_PASSWORD from the user's login shell environment.
 * Results are cached for the extension lifetime (cleared on resetConfig).
 */
export function readShellCredentials(): ShellCredentials {
  if (cachedCreds) {return cachedCreds;}

  try {
    const shell = process.env.SHELL ?? '/bin/bash';
    const output = execSync(`${shell} -l -c 'echo SAP_EMAIL=$SAP_EMAIL; echo SAP_PASSWORD=$SAP_PASSWORD'`, {
      encoding: 'utf8',
      timeout: 8000,
      env: { ...process.env, PATH: process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin' },
    });

    const vars: Record<string, string> = {};
    for (const line of output.split('\n')) {
      const eq = line.indexOf('=');
      if (eq > 0) {
        vars[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
      }
    }

    cachedCreds = {
      email: vars['SAP_EMAIL'] || undefined,
      password: vars['SAP_PASSWORD'] || undefined,
    };
  } catch (err) {
    logger.warn('Failed to read shell credentials, falling back to process.env', err);
    cachedCreds = {
      email: process.env['SAP_EMAIL'],
      password: process.env['SAP_PASSWORD'],
    };
  }

  return cachedCreds;
}

export function clearCachedCredentials(): void {
  cachedCreds = undefined;
}
