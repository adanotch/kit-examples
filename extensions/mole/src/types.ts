// Data contracts and types for the Mole extension.

export interface MoleSettings {
  compactMode: "junk" | "ram" | "cpu" | "status";
  warnThresholdGB: number;
  notifyOnJunkAlert: boolean;
  showDevPurge: boolean;
  terminalApp: "Terminal" | "Ghostty" | "iTerm2" | "Warp" | "Alacritty";
  soundEffects: boolean;
}

export interface ProcessUsage {
  name: string;
  cpu: number;
  mem: number;
  pid?: number;
}

export interface CleanableCategories {
  userCaches: number;
  systemLogs: number;
  trash: number;
  browserData: number;
  packageManagers: number;
  xcodeDerivedData: number;
}

export interface DevArtifact {
  id: string;
  name: string;
  path: string;
  type: "node_modules" | "DerivedData" | "target" | ".build" | ".venv";
  bytes: number;
}

export interface CleanupRecord {
  id: string;
  timestamp: number;
  reclaimedBytes: number;
  category: string;
}

export interface MoleStoredState {
  cleanable: CleanableCategories;
  lastCleanedAt: number | null;
  lastScannedAt: number | null;
  totalReclaimedBytes: number;
  devTargets: DevArtifact[];
  cleanHistory: CleanupRecord[];
  cliConnected: boolean;
  warned: boolean;
  lastActionMessage: string | null;
  lastActionTimestamp: number | null;
}

export interface SyncCommandPayload {
  cleanable?: Partial<CleanableCategories>;
  devTargets?: DevArtifact[];
  topProcesses?: ProcessUsage[];
  reclaimedBytes?: number;
  timestamp?: number;
}
