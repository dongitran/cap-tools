import * as vscode from 'vscode';
import {
  CfAppNode,
  CfOrgNode,
  CfSpaceNode,
  ErrorNode,
  LoadingNode,
  type CfTreeNode,
} from './nodes.js';
import type { CfApp, CfSpace } from '../../types/index.js';
import type { CacheManager } from '../../core/cacheManager.js';
import { cfApps, cfOrgs, cfSpaces, cfTarget } from '../../core/cfClient.js';
import { logger } from '../../core/logger.js';

export class CfTreeProvider implements vscode.TreeDataProvider<CfTreeNode> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<CfTreeNode | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private regionId = 'ap11';

  constructor(private readonly cache: CacheManager) {}

  setRegion(regionId: string): void {
    this.regionId = regionId;
    this.refresh();
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: CfTreeNode): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: CfTreeNode): Promise<CfTreeNode[]> {
    if (!element) {
      return this.getOrgs();
    }
    if (element instanceof CfOrgNode) {
      return this.getSpaces(element.orgName);
    }
    if (element instanceof CfSpaceNode) {
      return this.getApps(element.orgName, element.spaceName);
    }
    return [];
  }

  // ─── Orgs ─────────────────────────────────────────────────────────────────

  private async getOrgs(): Promise<CfTreeNode[]> {
    const cached = this.cache.getOrgs(this.regionId);
    if (cached) {return cached.map(org => new CfOrgNode(org));}

    try {
      const orgs = await cfOrgs();
      this.cache.setOrgs(this.regionId, orgs);
      if (orgs.length === 0) {return [new ErrorNode('No orgs found')];}
      return orgs.map(org => new CfOrgNode(org));
    } catch (err) {
      logger.error('Failed to fetch orgs for tree', err);
      return [new ErrorNode('Failed to load orgs. Are you logged in?')];
    }
  }

  // ─── Spaces ───────────────────────────────────────────────────────────────

  private getSpaces(orgName: string): CfTreeNode[] {
    const cached = this.cache.getSpaces(this.regionId, orgName);
    if (cached) {return this.renderSpaces(cached, orgName);}

    const loader = new LoadingNode(`Loading spaces for ${orgName}...`);
    void this.fetchSpaces(orgName);
    return [loader];
  }

  private async fetchSpaces(orgName: string): Promise<void> {
    try {
      const spaces = await cfSpaces(orgName);
      this.cache.setSpaces(this.regionId, orgName, spaces);
      this._onDidChangeTreeData.fire();
    } catch (err) {
      logger.error(`Failed to fetch spaces for ${orgName}`, err);
    }
  }

  private renderSpaces(spaces: CfSpace[], orgName: string): CfTreeNode[] {
    if (spaces.length === 0) {return [new ErrorNode('No spaces found')];}
    return spaces.map(s => new CfSpaceNode(s, orgName));
  }

  // ─── Apps ─────────────────────────────────────────────────────────────────

  private getApps(orgName: string, spaceName: string): CfTreeNode[] {
    const cached = this.cache.getApps(this.regionId, orgName, spaceName);
    if (cached) {return this.renderApps(cached, orgName, spaceName);}

    void this.fetchApps(orgName, spaceName);
    return [new LoadingNode(`Loading apps in ${spaceName}...`)];
  }

  private async fetchApps(orgName: string, spaceName: string): Promise<void> {
    try {
      await cfTarget(orgName, spaceName);
      const apps = await cfApps();
      this.cache.setApps(this.regionId, orgName, apps, spaceName);
      this._onDidChangeTreeData.fire();
    } catch (err) {
      logger.error(`Failed to fetch apps for ${orgName}/${spaceName}`, err);
    }
  }

  private renderApps(apps: CfApp[], orgName: string, spaceName: string): CfTreeNode[] {
    if (apps.length === 0) {return [new ErrorNode('No apps found')];}
    // Started apps first
    const started = apps.filter(a => a.state === 'STARTED');
    const stopped = apps.filter(a => a.state === 'STOPPED');
    return [...started, ...stopped].map(a => new CfAppNode(a, orgName, spaceName));
  }

  dispose(): void {
    this._onDidChangeTreeData.dispose();
  }
}
