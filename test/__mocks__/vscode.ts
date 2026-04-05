// Minimal VSCode API mock for unit tests

export const window = {
  createOutputChannel: () => ({
    appendLine: () => undefined,
    show: () => undefined,
    dispose: () => undefined,
  }),
  showErrorMessage: () => Promise.resolve(undefined),
  showWarningMessage: () => Promise.resolve(undefined),
  showInformationMessage: () => Promise.resolve(undefined),
  showOpenDialog: () => Promise.resolve(undefined),
  showSaveDialog: () => Promise.resolve(undefined),
};

export const workspace = {
  getConfiguration: () => ({
    get: (_key: string, defaultVal?: unknown) => defaultVal,
    update: () => Promise.resolve(),
  }),
  workspaceFolders: undefined,
  fs: {
    writeFile: () => Promise.resolve(),
  },
  openTextDocument: () => Promise.resolve({}),
};

export const commands = {
  registerCommand: () => ({ dispose: () => undefined }),
  executeCommand: () => Promise.resolve(),
};

export const debug = {
  startDebugging: () => Promise.resolve(true),
};

export const env = {
  clipboard: { writeText: () => Promise.resolve() },
  openExternal: () => Promise.resolve(true),
};

export const Uri = {
  parse: (s: string) => ({ toString: () => s }),
  file: (s: string) => ({ fsPath: s, toString: () => s }),
};

export class TreeItem {
  constructor(
    public label: string,
    public collapsibleState?: number,
  ) {}
}

export const TreeItemCollapsibleState = {
  None: 0,
  Collapsed: 1,
  Expanded: 2,
};

export class ThemeIcon {
  constructor(
    public id: string,
    public color?: unknown,
  ) {}
}

export class ThemeColor {
  constructor(public id: string) {}
}

export class EventEmitter {
  event = () => ({ dispose: () => undefined });
  fire = () => undefined;
  dispose = () => undefined;
}

export class MarkdownString {
  constructor(public value: string) {}
}

export const ConfigurationTarget = {
  Global: 1,
  Workspace: 2,
  WorkspaceFolder: 3,
};

export const CancellationToken = {};
