import * as vscode from 'vscode';
import type { CfApp, CfOrg, CfSpace } from '../../types/index.js';

export type NodeKind = 'org' | 'space' | 'app-started' | 'app-stopped' | 'loading' | 'error';

export class CfOrgNode extends vscode.TreeItem {
  readonly kind = 'org' as const;
  readonly orgName: string;

  constructor(org: CfOrg) {
    super(org.name, vscode.TreeItemCollapsibleState.Collapsed);
    this.orgName = org.name;
    this.contextValue = 'cfOrg';
    this.iconPath = new vscode.ThemeIcon('organization');
    this.tooltip = `CF Org: ${org.name}`;
  }
}

export class CfSpaceNode extends vscode.TreeItem {
  readonly kind = 'space' as const;
  readonly orgName: string;
  readonly spaceName: string;

  constructor(space: CfSpace, orgName: string) {
    super(space.name, vscode.TreeItemCollapsibleState.Collapsed);
    this.spaceName = space.name;
    this.orgName = orgName;
    this.contextValue = 'cfSpace';
    this.iconPath = new vscode.ThemeIcon('folder');
    this.tooltip = `CF Space: ${space.name}`;
  }
}

export class CfAppNode extends vscode.TreeItem {
  readonly kind: 'app-started' | 'app-stopped';
  readonly appName: string;
  readonly orgName: string;
  readonly spaceName: string;
  readonly appUrls: string[];

  constructor(app: CfApp, orgName: string, spaceName: string) {
    super(app.name, vscode.TreeItemCollapsibleState.None);
    this.appName = app.name;
    this.orgName = orgName;
    this.spaceName = spaceName;
    this.appUrls = app.urls;
    this.kind = app.state === 'STARTED' ? 'app-started' : 'app-stopped';
    this.contextValue = this.kind === 'app-started' ? 'cfApp-started' : 'cfApp-stopped';

    this.iconPath = new vscode.ThemeIcon(
      app.state === 'STARTED' ? 'circle-filled' : 'circle-outline',
      new vscode.ThemeColor(app.state === 'STARTED' ? 'testing.iconPassed' : 'disabledForeground'),
    );

    const urlHint = app.urls[0] ? `\n🔗 ${app.urls[0]}` : '';
    this.tooltip = new vscode.MarkdownString(
      `**${app.name}** — ${app.state}${urlHint}`,
    );
    this.description = app.state === 'STARTED' ? undefined : 'stopped';
  }
}

export class LoadingNode extends vscode.TreeItem {
  readonly kind = 'loading' as const;

  constructor(label = 'Loading...') {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon('loading~spin');
    this.contextValue = 'loading';
  }
}

export class ErrorNode extends vscode.TreeItem {
  readonly kind = 'error' as const;

  constructor(message: string) {
    super(message, vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon('error', new vscode.ThemeColor('errorForeground'));
    this.contextValue = 'cfError';
    this.tooltip = message;
  }
}

export type CfTreeNode = CfOrgNode | CfSpaceNode | CfAppNode | LoadingNode | ErrorNode;
