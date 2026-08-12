import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type * as vscode from 'vscode';

/**
 * Which CF_HOME a caller gets. The targeted org/space lives in that directory's
 * `.cf/config.json`, so everything sharing one directory also shares one target.
 *
 * `interactive` is the shared default for anything the user triggered.
 * `sync` isolates the background topology sync, which walks every org and space
 * in the account: on the shared directory its `cf target` churn would land in
 * the middle of the user's own CF commands and point them at the wrong space.
 */
export type CfHomeOwner = 'interactive' | 'sync';

export async function ensureCfHomeDir(
  context: vscode.ExtensionContext,
  owner: CfHomeOwner = 'interactive'
): Promise<string> {
  const dirName = owner === 'interactive' ? 'cf-home' : `cf-home-${owner}`;
  const cfHomeDir = join(context.globalStorageUri.fsPath, dirName);
  await mkdir(cfHomeDir, { recursive: true });
  return cfHomeDir;
}

