import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getCfTopologySnapshotSync } from './cfTopology';

const CF_STRUCTURE_PATH_ENV = 'SAP_TOOLS_CF_STRUCTURE_PATH';

let tempDir = '';

function writeStructure(value: unknown): string {
  const filePath = path.join(tempDir, 'cf-structure.json');
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  process.env[CF_STRUCTURE_PATH_ENV] = filePath;
  return filePath;
}

function clearStructurePathEnv(): void {
  delete process.env.SAP_TOOLS_CF_STRUCTURE_PATH;
}

describe('CF topology snapshot parsing', () => {
  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sap-tools-cf-topology-'));
    clearStructurePathEnv();
  });

  afterEach(() => {
    clearStructurePathEnv();
    fs.rmSync(tempDir, { recursive: true, force: true });
    tempDir = '';
  });

  it('reports unavailable topology when no structure file exists', () => {
    process.env[CF_STRUCTURE_PATH_ENV] = path.join(tempDir, 'missing.json');

    expect(getCfTopologySnapshotSync()).toEqual({
      ready: false,
      accounts: [],
    });
  });

  it('reports ready empty topology when a valid sync snapshot has no org accounts', () => {
    writeStructure({
      syncedAt: '2026-05-09T00:00:00.000Z',
      regions: [
        {
          key: 'us10',
          label: 'US East (VA) - AWS (us10)',
          apiEndpoint: 'https://api.cf.us10.hana.ondemand.com',
          accessible: true,
          orgs: [],
        },
      ],
    });

    expect(getCfTopologySnapshotSync()).toEqual({
      ready: true,
      accounts: [],
    });
  });

  it('returns accessible org accounts with space names from a valid sync snapshot', () => {
    writeStructure({
      syncedAt: '2026-05-09T00:00:00.000Z',
      regions: [
        {
          key: 'br10',
          label: 'Brazil (Sao Paulo) - AWS (br10)',
          apiEndpoint: 'https://api.cf.br10.hana.ondemand.com',
          accessible: true,
          orgs: [
            {
              name: 'finance-services-prod',
              spaces: [{ name: 'prod' }, { name: 'uat' }],
            },
          ],
        },
      ],
    });

    expect(getCfTopologySnapshotSync()).toEqual({
      ready: true,
      accounts: [
        {
          regionKey: 'br10',
          regionLabel: 'Brazil (Sao Paulo) - AWS (br10)',
          apiEndpoint: 'https://api.cf.br10.hana.ondemand.com',
          orgName: 'finance-services-prod',
          spaces: ['prod', 'uat'],
        },
      ],
    });
  });
});
