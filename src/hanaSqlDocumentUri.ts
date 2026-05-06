import { tmpdir } from 'node:os';
import * as vscode from 'vscode';

export function buildHanaSqlDocumentFileUri(fileName: string): vscode.Uri {
  const workspaceFolder = vscode.workspace.workspaceFolders?.find((folder) => {
    return folder.uri.scheme === 'file';
  });
  const baseUri = workspaceFolder?.uri ?? vscode.Uri.file(tmpdir());
  return vscode.Uri.joinPath(baseUri, `saptools-${fileName}.sql`);
}
