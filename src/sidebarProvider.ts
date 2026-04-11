import * as vscode from 'vscode';

import {
  REGION_AREAS,
  SAP_BTP_REGIONS,
  type RegionArea,
  type SapBtpRegion,
} from './regions';

export const REGION_VIEW_ID = 'sapTools.regionView';
export const SELECT_REGION_FROM_SIDEBAR_COMMAND =
  'sapTools.selectRegionFromSidebar';

type RegionTreeItem = RegionGroupTreeItem | RegionLeafTreeItem;

class RegionGroupTreeItem extends vscode.TreeItem {
  readonly area: RegionArea;

  constructor(area: RegionArea) {
    super(area, vscode.TreeItemCollapsibleState.Expanded);
    this.area = area;
    this.contextValue = 'sapToolsRegionArea';
    this.iconPath = new vscode.ThemeIcon('folder-opened');
  }
}

class RegionLeafTreeItem extends vscode.TreeItem {
  readonly region: SapBtpRegion;

  constructor(region: SapBtpRegion, isSelected: boolean) {
    super(region.displayName, vscode.TreeItemCollapsibleState.None);
    this.region = region;
    this.description = isSelected
      ? `${region.id} · ${region.provider} · selected`
      : `${region.id} · ${region.provider}`;
    this.tooltip = `${region.displayName} (${region.id})`;
    this.iconPath = new vscode.ThemeIcon(isSelected ? 'check' : 'location');
    this.command = {
      command: SELECT_REGION_FROM_SIDEBAR_COMMAND,
      title: 'Select SAP BTP Region',
      arguments: [region],
    };
    this.contextValue = isSelected
      ? 'sapToolsRegionSelected'
      : 'sapToolsRegionUnselected';
  }
}

function getRegionsByArea(area: RegionArea): readonly SapBtpRegion[] {
  return SAP_BTP_REGIONS.filter((region) => region.area === area);
}

export class RegionSidebarProvider
  implements vscode.TreeDataProvider<RegionTreeItem>, vscode.Disposable
{
  private readonly treeDataEmitter = new vscode.EventEmitter<
    RegionTreeItem | undefined
  >();
  private selectedRegionId: string | undefined;

  readonly onDidChangeTreeData = this.treeDataEmitter.event;

  getTreeItem(element: RegionTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: RegionTreeItem): RegionTreeItem[] {
    if (element === undefined) {
      return REGION_AREAS.map((area) => new RegionGroupTreeItem(area));
    }

    if (element instanceof RegionGroupTreeItem) {
      return this.buildRegionItems(element.area);
    }

    return [];
  }

  setSelectedRegion(region: SapBtpRegion): void {
    this.selectedRegionId = region.id;
    this.treeDataEmitter.fire(undefined);
  }

  dispose(): void {
    this.treeDataEmitter.dispose();
  }

  private buildRegionItems(area: RegionArea): RegionLeafTreeItem[] {
    const regionsInArea = getRegionsByArea(area);

    return regionsInArea.map((region) => {
      const isSelected = this.selectedRegionId === region.id;
      return new RegionLeafTreeItem(region, isSelected);
    });
  }
}
