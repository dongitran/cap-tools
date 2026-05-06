import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as vscode from 'vscode';

export function buildHanaSqlDocumentFileUri(fileName: string): vscode.Uri {
  const workspaceFolder = vscode.workspace.workspaceFolders?.find((folder) => {
    return folder.uri.scheme === 'file';
  });
  const baseUri = workspaceFolder?.uri ?? vscode.Uri.file(tmpdir());
  return vscode.Uri.joinPath(baseUri, `saptools-${fileName}.sql`);
}

export function resolveHanaSqlDocumentOpenUri(fileUri: vscode.Uri): vscode.Uri {
  if (fileUri.scheme === 'file' && existsSync(fileUri.fsPath)) {
    return fileUri;
  }
  return fileUri.with({ scheme: 'untitled' });
}
