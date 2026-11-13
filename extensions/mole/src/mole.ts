// Helper functions, unit formatters, and Mole CLI command builders.

import type { CleanableCategories, DevArtifact, MoleStoredState } from "./types.js";

const ONE_KB = 1024;
const ONE_MB = 1024 * ONE_KB;
const ONE_GB = 1024 * ONE_MB;

/** Formats byte counts into human-readable strings like "1.4 GB" or "420 MB". */
export function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  if (bytes < ONE_MB) {
    const kb = Math.round(bytes / ONE_KB);
    return `${kb} KB`;
  }
  if (bytes < ONE_GB) {
    const mb = (bytes / ONE_MB).toFixed(1);
    return `${mb} MB`;
  }
  const gb = (bytes / ONE_GB).toFixed(1);
  return `${gb} GB`;
}

/** Formats a timestamp into a human relative string ("5 min ago", "just now", "Never"). */
export function formatRelativeTime(timestamp: number | null): string {
  if (!timestamp) return "Never";
  const diffSec = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (diffSec < 45) return "Just now";
  if (diffSec < 3600) {
    const min = Math.floor(diffSec / 60);
    return `${min}m ago`;
  }
  if (diffSec < 86400) {
    const hrs = Math.floor(diffSec / 3600);
    return `${hrs}h ago`;
  }
  const days = Math.floor(diffSec / 86400);
  return `${days}d ago`;
}

/** Sums up all cleanable category sizes. */
export function calculateTotalJunk(categories: CleanableCategories): number {
  return (
    (categories.userCaches || 0) +
    (categories.systemLogs || 0) +
    (categories.trash || 0) +
    (categories.browserData || 0) +
    (categories.packageManagers || 0) +
    (categories.xcodeDerivedData || 0)
  );
}

/** Default cleanable estimates when no CLI sync has occurred yet. */
export function getDefaultCleanable(): CleanableCategories {
  return {
    userCaches: 1.8 * ONE_GB,
    systemLogs: 420 * ONE_MB,
    trash: 650 * ONE_MB,
    browserData: 890 * ONE_MB,
    packageManagers: 1.2 * ONE_GB,
    xcodeDerivedData: 2.4 * ONE_GB,
  };
}

/** Default sample dev purge targets (e.g., node_modules, Xcode build caches). */
export function getDefaultDevTargets(): DevArtifact[] {
  return [
    {
      id: "target-1",
      name: "node_modules (adanotch-web)",
      path: "~/Projects/adanotch-web/node_modules",
      type: "node_modules",
      bytes: 840 * ONE_MB,
    },
    {
      id: "target-2",
      name: "Xcode DerivedData (AdanotchApp)",
      path: "~/Library/Developer/Xcode/DerivedData/Adanotch-*",
      type: "DerivedData",
      bytes: 2.4 * ONE_GB,
    },
    {
      id: "target-3",
      name: "Cargo Target (Rust Tools)",
      path: "~/Projects/tools/target",
      type: "target",
      bytes: 650 * ONE_MB,
    },
    {
      id: "target-4",
      name: "Swift Package .build Cache",
      path: "~/Projects/adanotch-app/.build",
      type: ".build",
      bytes: 410 * ONE_MB,
    },
  ];
}

/** Initial storage state when extension starts up fresh. */
export function getDefaultState(): MoleStoredState {
  return {
    cleanable: getDefaultCleanable(),
    lastCleanedAt: null,
    lastScannedAt: Date.now(),
    totalReclaimedBytes: 0,
    devTargets: getDefaultDevTargets(),
    cleanHistory: [],
    cliConnected: false,
    warned: false,
    lastActionMessage: null,
    lastActionTimestamp: null,
  };
}

/** Builds Mole CLI command lines to be copied or executed. */
export function getMoleCommand(action: string, options?: { dryRun?: boolean; target?: string }): string {
  switch (action) {
    case "clean":
      return options?.dryRun ? "mo clean --dry-run" : "mo clean";
    case "purge":
      return options?.dryRun ? "mo purge --dry-run" : "mo purge";
    case "optimize":
      return "mo optimize";
    case "status":
      return "mo status";
    case "analyze":
      return "mo analyze";
    case "clean-category":
      if (options?.target === "caches") return "mo clean --caches";
      if (options?.target === "logs") return "mo clean --logs";
      if (options?.target === "trash") return "mo clean --trash";
      if (options?.target === "browser") return "mo clean --browsers";
      return "mo clean";
    default:
      return "mo";
  }
}

export interface OptimizationOption {
  id: string;
  title: string;
  description: string;
  command: string;
  icon: string;
}

/** Pre-configured macOS system optimization routines supported by Mole. */
export function getOptimizationTasks(): OptimizationOption[] {
  return [
    {
      id: "flush-dns",
      title: "Flush DNS Cache",
      description: "Clears macOS resolver cache and restarts mDNSResponder",
      command: "sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder",
      icon: "network",
    },
    {
      id: "purge-ram",
      title: "Purge Inactive Memory",
      description: "Forces macOS disk cache to flush and frees inactive RAM",
      command: "sudo purge",
      icon: "memorychip",
    },
    {
      id: "rebuild-ls",
      title: "Rebuild LaunchServices",
      description: "Fixes duplicate 'Open With' entries and file associations",
      command: "/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -kill -r -domain local -domain system -domain user",
      icon: "arrow.triangle.2.circlepath",
    },
    {
      id: "reset-quicklook",
      title: "Reset QuickLook Cache",
      description: "Reloads QuickLook thumbnail generation services",
      command: "qlmanage -r && qlmanage -r cache",
      icon: "eye",
    },
    {
      id: "touchid-sudo",
      title: "Touch ID for sudo",
      description: "Enables fingerprint authentication for terminal sudo commands",
      command: "mo touchid",
      icon: "touchid",
    },
  ];
}
