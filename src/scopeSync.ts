import * as vscode from 'vscode';

export interface SharedCfScope {
  readonly regionCode: string;
  readonly orgName: string;
  readonly spaceName: string;
}

export function readCurrentScope(): SharedCfScope | undefined {
  const rawScope = vscode.workspace
    .getConfiguration('sapCap')
    .get<unknown>('currentScope');
  return normalizeSharedScope(rawScope);
}

export async function writeScopeIfChanged(scope: SharedCfScope): Promise<void> {
  const current = readCurrentScope();
  if (
    current?.regionCode === scope.regionCode &&
    current.orgName === scope.orgName &&
    current.spaceName === scope.spaceName
  ) {
    return;
  }

  await vscode.workspace
    .getConfiguration('sapCap')
    .update('currentScope', scope, vscode.ConfigurationTarget.Global);
}

function normalizeSharedScope(value: unknown): SharedCfScope | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const regionCode = readNonEmptyString(value['regionCode'], 64);
  const orgName = readNonEmptyString(value['orgName'], 128);
  const spaceName = readNonEmptyString(value['spaceName'], 128);
  if (regionCode.length === 0 || orgName.length === 0 || spaceName.length === 0) {
    return undefined;
  }

  return {
    regionCode,
    orgName,
    spaceName,
  };
}

function readNonEmptyString(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') {
    return '';
  }

  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > maxLength) {
    return '';
  }

  return normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
