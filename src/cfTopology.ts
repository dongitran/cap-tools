import * as fs from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import { homedir } from 'node:os';
import * as path from 'node:path';

const CF_STRUCTURE_PATH_ENV = 'SAP_TOOLS_CF_STRUCTURE_PATH';
const SAPTOOLS_DIR_NAME = '.saptools';
const CF_STRUCTURE_FILE_NAME = 'cf-structure.json';

export interface CfTopologyOrg {
  readonly regionKey: string;
  readonly regionLabel: string;
  readonly apiEndpoint: string;
  readonly orgName: string;
  readonly spaces: readonly string[];
}

export interface CfTopology {
  readonly ready: boolean;
  readonly accounts: readonly CfTopologyOrg[];
}

export const EMPTY_CF_TOPOLOGY: CfTopology = { ready: false, accounts: [] };

interface ParsedSpaceNode {
  readonly name: string;
}

interface ParsedOrgNode {
  readonly name: string;
  readonly spaces: readonly ParsedSpaceNode[];
}

interface ParsedRegionNode {
  readonly key: string;
  readonly label: string;
  readonly apiEndpoint: string;
  readonly accessible: boolean;
  readonly orgs: readonly ParsedOrgNode[];
}

interface ParsedCfStructure {
  readonly syncedAt: string;
  readonly regions: readonly ParsedRegionNode[];
}

function structurePath(): string {
  const override = process.env[CF_STRUCTURE_PATH_ENV];
  if (typeof override === 'string' && override.trim().length > 0) {
    return override;
  }
  return path.join(homedir(), SAPTOOLS_DIR_NAME, CF_STRUCTURE_FILE_NAME);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseSpaceNode(value: unknown): ParsedSpaceNode | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const name = value['name'];
  if (typeof name !== 'string' || name.length === 0) {
    return undefined;
  }
  return { name };
}

function parseOrgNode(value: unknown): ParsedOrgNode | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const name = value['name'];
  const spacesRaw = value['spaces'];
  if (typeof name !== 'string' || name.length === 0 || !Array.isArray(spacesRaw)) {
    return undefined;
  }
  const spaces: ParsedSpaceNode[] = [];
  for (const spaceRaw of spacesRaw) {
    const space = parseSpaceNode(spaceRaw);
    if (space !== undefined) {
      spaces.push(space);
    }
  }
  return { name, spaces };
}

function parseRegionNode(value: unknown): ParsedRegionNode | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const key = value['key'];
  const label = value['label'];
  const apiEndpoint = value['apiEndpoint'];
  const accessible = value['accessible'];
  const orgsRaw = value['orgs'];
  if (
    typeof key !== 'string' ||
    typeof label !== 'string' ||
    typeof apiEndpoint !== 'string' ||
    typeof accessible !== 'boolean' ||
    !Array.isArray(orgsRaw)
  ) {
    return undefined;
  }
  const orgs: ParsedOrgNode[] = [];
  for (const orgRaw of orgsRaw) {
    const org = parseOrgNode(orgRaw);
    if (org !== undefined) {
      orgs.push(org);
    }
  }
  return { key, label, apiEndpoint, accessible, orgs };
}

function parseStructure(value: unknown): ParsedCfStructure | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const syncedAt = value['syncedAt'];
  const regionsRaw = value['regions'];
  if (typeof syncedAt !== 'string' || !Array.isArray(regionsRaw)) {
    return undefined;
  }
  const regions: ParsedRegionNode[] = [];
  for (const regionRaw of regionsRaw) {
    const region = parseRegionNode(regionRaw);
    if (region !== undefined) {
      regions.push(region);
    }
  }
  return { syncedAt, regions };
}

function buildOrgEntry(region: ParsedRegionNode, org: ParsedOrgNode): CfTopologyOrg {
  return {
    regionKey: region.key,
    regionLabel: region.label,
    apiEndpoint: region.apiEndpoint,
    orgName: org.name,
    spaces: org.spaces.map((space) => space.name),
  };
}

function buildOrgEntries(structure: ParsedCfStructure): CfTopologyOrg[] {
  const entries: CfTopologyOrg[] = [];
  for (const region of structure.regions) {
    if (!region.accessible) continue;
    for (const org of region.orgs) {
      entries.push(buildOrgEntry(region, org));
    }
  }
  entries.sort((left, right) => {
    const orgCompare = left.orgName.localeCompare(right.orgName);
    if (orgCompare !== 0) return orgCompare;
    return left.regionKey.localeCompare(right.regionKey);
  });
  return entries;
}

function readStructureSyncSafe(): ParsedCfStructure | undefined {
  try {
    const raw = fs.readFileSync(structurePath(), 'utf8');
    return parseStructure(JSON.parse(raw) as unknown);
  } catch {
    return undefined;
  }
}

async function readStructureAsyncSafe(): Promise<ParsedCfStructure | undefined> {
  try {
    const raw = await fsPromises.readFile(structurePath(), 'utf8');
    return parseStructure(JSON.parse(raw) as unknown);
  } catch {
    return undefined;
  }
}

export function getCfTopologySnapshotSync(): CfTopology {
  const structure = readStructureSyncSafe();
  if (structure === undefined) {
    return EMPTY_CF_TOPOLOGY;
  }
  const accounts = buildOrgEntries(structure);
  return {
    ready: true,
    accounts,
  };
}

export async function getCfTopologySnapshot(): Promise<CfTopology> {
  const structure = await readStructureAsyncSafe();
  if (structure === undefined) {
    return EMPTY_CF_TOPOLOGY;
  }
  const accounts = buildOrgEntries(structure);
  return {
    ready: true,
    accounts,
  };
}
