import * as vscode from 'vscode';

const HANA_SQL_SHORTCUT_NOTIFICATION_MS = 4500;

export function showHanaSqlShortcutNotification(): void {
  const shortcut = process.platform === 'darwin' ? 'Cmd+E Cmd+E' : 'Ctrl+E Ctrl+E';
  void vscode.window.withProgress(
    {
      cancellable: false,
      location: vscode.ProgressLocation.Notification,
      title: `Select SQL and press ${shortcut} to run.`,
    },
    async (): Promise<void> => {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, HANA_SQL_SHORTCUT_NOTIFICATION_MS);
      });
    }
  );
}
