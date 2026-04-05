import type { HanaCredentials, VcapServices } from '../../types/index.js';

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

    if (!host || !user || !password) continue;

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
 */
export function parseVcapFromEnvOutput(envOutput: string): VcapServices {
  // VCAP_SERVICES appears as a pretty-printed block after "VCAP_SERVICES:" label
  const match = envOutput.match(/VCAP_SERVICES:\s*(\{[\s\S]*?)(?=\n[A-Z_]+:|\nNo user-|\Z)/m);
  if (!match) return {};
  try {
    return JSON.parse(match[1]) as VcapServices;
  } catch {
    return {};
  }
}
