// ─── CF Domain Types ──────────────────────────────────────────────────────────

export interface CfRegion {
  id: string;
  label: string;
  apiEndpoint: string;
}

export interface CfOrg {
  name: string;
  guid: string;
}

export interface CfSpace {
  name: string;
  guid: string;
}

export interface CfApp {
  name: string;
  state: 'STARTED' | 'STOPPED';
  urls: string[];
}

// ─── HANA / VCAP Types ────────────────────────────────────────────────────────

export interface HanaCredentials {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  certificate?: string;
  encrypt?: boolean;
}

export interface AppHanaEntry {
  appName: string;
  creds: HanaCredentials;
}

export interface VcapService {
  name: string;
  label: string;
  credentials: Record<string, unknown>;
}

export type VcapServices = Record<string, VcapService[] | undefined>;

// ─── SQLTools Integration ─────────────────────────────────────────────────────

export interface SqlToolsConnection {
  name: string;
  driver: string;
  server: string;
  port: number;
  database: string;
  username: string;
  password: string;
  connectionTimeout?: number;
  [key: string]: unknown;
}

// ─── Cache Types ──────────────────────────────────────────────────────────────

export interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}

export interface OrgCache {
  [orgName: string]: {
    spaces: CacheEntry<CfSpace[]>;
    apps: {
      [spaceName: string]: CacheEntry<CfApp[]> | undefined;
    };
  } | undefined;
}

export interface RegionCache {
  [regionId: string]: {
    orgs: CacheEntry<CfOrg[]>;
    orgData: OrgCache;
  } | undefined;
}

export interface AppCache {
  version: 2;
  regions: RegionCache;
  syncProgress?: SyncProgress;
}

export interface SyncProgress {
  status: 'idle' | 'running' | 'done' | 'error';
  currentRegion?: string;
  currentOrg?: string;
  done: number;
  total: number;
  startedAt?: number;
  error?: string;
}

// ─── Config Types ─────────────────────────────────────────────────────────────

export interface LoginConfig {
  apiEndpoint: string;
  regionId: string;
  email: string;
}

export interface OrgFolderMapping {
  cfOrg: string;
  groupFolderPath: string;
}

export interface ExtensionConfig {
  login?: LoginConfig;
  orgMappings: OrgFolderMapping[];
  selectedOrg?: string;
}

// ─── Logs Types ───────────────────────────────────────────────────────────────

export type LogSourceType = 'APP' | 'RTR' | 'API' | 'CELL' | 'SSH' | 'STG' | 'LGR' | 'OTHER';
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
export type LogSessionStatus = 'IDLE' | 'CONNECTING' | 'STREAMING' | 'STOPPED' | 'ERROR';

export interface LogEntry {
  id: number;
  timestamp: string;
  source: string;
  sourceType: LogSourceType;
  stream: 'OUT' | 'ERR';
  message: string;
  level?: LogLevel;
  jsonData?: Record<string, unknown>;
}

// ─── Debug Session Types ───────────────────────────────────────────────────────

export type DebugSessionStatus =
  | 'TUNNELING'
  | 'ATTACHING'
  | 'ATTACHED'
  | 'ERROR'
  | 'EXITED';

export interface DebugSession {
  appName: string;
  port: number;
  status: DebugSessionStatus;
  pid?: number;
  appUrl?: string;
  error?: string;
}

// ─── Webview Message Types ─────────────────────────────────────────────────────

// Extension → Webview
export type ExtensionMessage =
  | { type: 'init'; payload: { config: ExtensionConfig | null; syncProgress: SyncProgress } }
  | { type: 'loginResult'; payload: { ok: boolean; orgs?: CfOrg[]; error?: string } }
  | { type: 'orgs'; payload: CfOrg[] }
  | { type: 'apps'; payload: { orgName: string; apps: CfApp[] } }
  | { type: 'spaces'; payload: { orgName: string; spaces: CfSpace[] } }
  | { type: 'spacesApps'; payload: { orgName: string; spaceName: string; apps: CfApp[] } }
  | { type: 'folderSelected'; payload: { path: string } }
  | { type: 'debugStatus'; payload: DebugSession }
  | { type: 'syncProgress'; payload: SyncProgress }
  | { type: 'credentialResult'; payload: CredentialResult }
  | { type: 'appEnv'; payload: { appName: string; vcap: VcapServices; env: Record<string, string> } }
  | { type: 'error'; payload: { message: string; context?: string } }
  | { type: 'logEntry'; payload: LogEntry }
  | { type: 'logStatus'; payload: { status: LogSessionStatus; error?: string } };

// Webview → Extension
export type WebviewMessage =
  | { type: 'ready' }
  | { type: 'login'; payload: { regionId: string; customEndpoint?: string } }
  | { type: 'selectOrg'; payload: { orgName: string } }
  | { type: 'backToOrgSelect' }
  | { type: 'browseFolder' }
  | { type: 'loadApps'; payload: { orgName: string } }
  | { type: 'loadSpaces'; payload: { orgName: string } }
  | { type: 'loadSpaceApps'; payload: { orgName: string; spaceName: string } }
  | { type: 'startDebug'; payload: { appNames: string[] } }
  | { type: 'stopDebug'; payload: { appName: string } }
  | { type: 'stopAllDebug' }
  | { type: 'extractCreds'; payload: { spaceName: string; appNames: string[]; output: CredentialOutputMode } }
  | { type: 'triggerSync' }
  | { type: 'updateSettings'; payload: Partial<SettingsPayload> }
  | { type: 'resetConfig' }
  | { type: 'getAppEnv'; payload: { appName: string; orgName: string } }
  | { type: 'changeTab'; payload: { tab: MainTab } }
  | { type: 'startLogs'; payload: { appName: string } }
  | { type: 'stopLogs' }
  | { type: 'loadRecentLogs'; payload: { appName: string } }
  | { type: 'clearLogs' }
  | { type: 'exportLogs' };

export type MainTab = 'debug' | 'credentials' | 'logs' | 'settings';

export type CredentialOutputMode = 'sqltools' | 'json' | 'clipboard';

export interface CredentialResult {
  appName: string;
  ok: boolean;
  error?: string;
  connection?: SqlToolsConnection;
}

export interface SettingsPayload {
  autoSync: boolean;
  syncInterval: number;
  sqlToolsIntegration: boolean;
  defaultRegion: string;
}
