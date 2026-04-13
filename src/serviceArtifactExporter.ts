import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  fetchDefaultEnvJsonFromTarget,
  fetchPnpmLockFromTarget,
  prepareCfCliSession,
} from './cfClient';

export interface ServiceExportSession {
  readonly apiEndpoint: string;
  readonly email: string;
  readonly password: string;
  readonly orgName: string;
  readonly spaceName: string;
  readonly cfHomeDir: string;
}

export interface ServiceArtifactExportOptions {
  readonly appName: string;
  readonly targetFolderPath: string;
  readonly session: ServiceExportSession;
  readonly includeDefaultEnv: boolean;
  readonly includePnpmLock: boolean;
}

export interface ServiceArtifactExportResult {
  readonly writtenFiles: readonly string[];
}

export async function exportServiceArtifacts(
  options: ServiceArtifactExportOptions
): Promise<ServiceArtifactExportResult> {
  if (!options.includeDefaultEnv && !options.includePnpmLock) {
    throw new Error('At least one artifact must be selected for export.');
  }

  await prepareCfCliSession({
    apiEndpoint: options.session.apiEndpoint,
    email: options.session.email,
    password: options.session.password,
    orgName: options.session.orgName,
    spaceName: options.session.spaceName,
    cfHomeDir: options.session.cfHomeDir,
  });

  const writtenFiles: string[] = [];

  if (options.includeDefaultEnv) {
    const defaultEnvJson = await fetchDefaultEnvJsonFromTarget({
      appName: options.appName,
      cfHomeDir: options.session.cfHomeDir,
    });
    const outputPath = join(options.targetFolderPath, 'default-env.json');
    await writeFile(outputPath, defaultEnvJson, 'utf8');
    writtenFiles.push(outputPath);
  }

  if (options.includePnpmLock) {
    const pnpmLockContent = await fetchPnpmLockFromTarget({
      appName: options.appName,
      cfHomeDir: options.session.cfHomeDir,
    });
    const outputPath = join(options.targetFolderPath, 'pnpm-lock.yaml');
    await writeFile(outputPath, pnpmLockContent, 'utf8');
    writtenFiles.push(outputPath);
  }

  return { writtenFiles };
}
