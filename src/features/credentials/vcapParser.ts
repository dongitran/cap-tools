import type { HanaCredentials, VcapServices } from '../../types/index.js';
import { logger } from '../../core/logger.js';

const HANA_SERVICE_LABELS = ['hana', 'hanatrial', 'hana-cloud'];

/**
 * Extracts HANA credentials from a parsed VCAP_SERVICES object.
 * Returns undefined if no HANA binding is found.
 */
export function extractHanaCredentials(vcap: VcapServices): HanaCredentials | undefined {
  for (const label of HANA_SERVICE_LABELS) {
    const services = vcap[label];
    if (!services?.length) continue;

    const binding = services[0];
    const creds = binding.credentials as Record<string, unknown>;

    const host = String(creds['host'] ?? creds['hostname'] ?? '');
    const port = Number(creds['port'] ?? 443);
    const database = String(creds['schema'] ?? creds['database'] ?? '');
    const user = String(creds['user'] ?? creds['username'] ?? '');
    const password = String(creds['password'] ?? '');

    if (!host || !user || !password) {
      logger.debug(`HANA binding found for label "${label}" but missing required fields (host/user/password)`);
      continue;
    }

    const result: HanaCredentials = { host, port, database, user, password };

    const cert = creds['certificate'] ?? creds['sslCertificate'];
    if (typeof cert === 'string') result.certificate = cert;

    const encrypt = creds['encrypt'] ?? creds['sslEncrypt'];
    if (encrypt !== undefined) result.encrypt = Boolean(encrypt);

    return result;
  }
  return undefined;
}

/**
 * Parses raw `cf env <app>` output and extracts VCAP_SERVICES JSON.
 * Handles multiple CF output formats gracefully.
 */
export function parseVcapFromEnvOutput(envOutput: string): VcapServices {
  // Strategy 1: Lookahead-based match (no 'm' flag — $ must mean end-of-string)
  const match = envOutput.match(/VCAP_SERVICES:\s*(\{[\s\S]*?)(?=\n[A-Z_]+:|\nNo user-|\n\n|$)/);
  if (!match) {
    logger.debug('No VCAP_SERVICES block found in cf env output');
    return {};
  }
  try {
    return JSON.parse(match[1]) as VcapServices;
  } catch {
    // Strategy 2: Try to find and parse the JSON object directly
    const jsonMatch = match[1].match(/(\{[\s\S]*\})/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1]) as VcapServices;
      } catch {
        // fall through
      }
    }
    logger.warn('Found VCAP_SERVICES block but failed to parse as JSON');
    return {};
  }
}
