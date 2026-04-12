import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type * as vscode from 'vscode';

export async function ensureCfHomeDir(
  context: vscode.ExtensionContext
): Promise<string> {
  const cfHomeDir = join(context.globalStorageUri.fsPath, 'cf-home');
  await mkdir(cfHomeDir, { recursive: true });
  return cfHomeDir;
}

