// Renders the notch compact slot and the expanded card for the Mole extension.

import {
  calculateTotalJunk,
  formatBytes,
  formatRelativeTime,
  getOptimizationTasks,
} from "./mole.js";
import type {
  DevArtifact,
  MoleSettings,
  MoleStoredState,
  ProcessUsage,
} from "./types.js";

const { ui } = AdanotchKit;

export interface ViewContext {
  state: MoleStoredState;
  settings: MoleSettings;
  stats: Adanotch.SystemStats | null;
  topProcesses?: ProcessUsage[];
}

/** Determines icon and semantic tone for the compact notch slot. */
function compactLeading(totalJunkGB: number, warnThreshold: number, stats: Adanotch.SystemStats | null) {
  if (totalJunkGB >= warnThreshold) {
    return ui.icon("trash.circle.fill", { tone: "warning" });
  }
  if (stats && stats.cpuPercent > 85) {
    return ui.icon("flame.fill", { tone: "danger" });
  }
  return ui.icon("sparkles", { tone: "default" });
}

/** Renders the left and right items beside the MacBook notch. */
export function renderCompact(ctx: ViewContext): Adanotch.Compact {
  const { state, settings, stats } = ctx;
  const totalJunkBytes = calculateTotalJunk(state.cleanable);
  const totalJunkGB = totalJunkBytes / (1024 * 1024 * 1024);
  const isHighJunk = totalJunkGB >= settings.warnThresholdGB;

  const leading = compactLeading(totalJunkGB, settings.warnThresholdGB, stats);
  let trailing: Adanotch.CompactNode | null | undefined;

  switch (settings.compactMode) {
    case "junk":
      trailing = isHighJunk
        ? ui.badge(formatBytes(totalJunkBytes), { tone: "warning" })
        : ui.text(formatBytes(totalJunkBytes), { tone: "default" });
      break;
    case "ram":
      trailing = stats
        ? ui.badge(`${stats.ramPercent}% RAM`, {
            tone: stats.ramPercent > 85 ? "danger" : stats.ramPercent > 70 ? "warning" : "default",
          })
        : ui.text("RAM --");
      break;
    case "cpu":
      trailing = stats
        ? ui.badge(`${stats.cpuPercent}% CPU`, {
            tone: stats.cpuPercent > 85 ? "danger" : "default",
          })
        : ui.text("CPU --");
      break;
    case "status":
      trailing = state.cliConnected
        ? ui.badge("mo: live", { tone: "accent" })
        : ui.badge("mo", { tone: "default" });
      break;
  }

  return { leading, trailing };
}

/** Renders the expanded card shown when the notch island is opened. */
export function renderExpanded(ctx: ViewContext): Adanotch.Node {
  const { state, settings, stats } = ctx;
  const totalJunkBytes = calculateTotalJunk(state.cleanable);
  const totalJunkGB = totalJunkBytes / (1024 * 1024 * 1024);
  const isHighJunk = totalJunkGB >= settings.warnThresholdGB;

  const tabs: Adanotch.Tab[] = [
    {
      title: "Cleaner",
      icon: "trash",
      content: renderCleanerTab(state, totalJunkBytes),
    },
    {
      title: "System",
      icon: "gauge.medium",
      content: renderSystemTab(stats, ctx.topProcesses),
    },
  ];

  if (settings.showDevPurge) {
    tabs.push({
      title: "Dev Purge",
      icon: "hammer",
      content: renderDevPurgeTab(state.devTargets),
    });
  }

  tabs.push({
    title: "Optimize",
    icon: "bolt.fill",
    content: renderOptimizeTab(),
  });

  tabs.push({
    title: "Bridge",
    icon: "terminal",
    content: renderBridgeTab(),
  });

  return ui.stack(
    [
      renderHeader(state, stats),
      // 1. Action feedback banner (immediate visual feedback on button clicks)
      Boolean(state.lastActionMessage)
        ? ui.stack(
            [
              ui.icon("checkmark.circle.fill", { tone: "success" }),
              ui.text(state.lastActionMessage || "", { style: "caption", tone: "success" }),
              ui.spacer(),
              ui.button("", "dismissActionMessage", { icon: "xmark" }),
            ],
            { axis: "h", spacing: 6, align: "center" },
          )
        : null,
      // 2. High junk warning banner (when no action message is currently active)
      !state.lastActionMessage && isHighJunk
        ? ui.stack(
            [
              ui.icon("exclamationmark.triangle.fill", { tone: "warning" }),
              ui.text(`Cleanup Recommended: ${formatBytes(totalJunkBytes)} cleanable files.`, {
                style: "caption",
                tone: "warning",
              }),
              ui.spacer(),
              ui.button("Clean Now", "cleanAll", { primary: true, icon: "sparkles" }),
            ],
            { axis: "h", spacing: 6, align: "center" },
          )
        : null,
      ui.divider(),
      ui.tabs(tabs),
    ],
    { spacing: 8 },
  );
}

function renderHeader(state: MoleStoredState, stats: Adanotch.SystemStats | null): Adanotch.Node {
  return ui.stack(
    [
      ui.icon("sparkles", { tone: "accent" }),
      ui.stack(
        [
          ui.stack(
            [
              ui.text("Mole", { style: "title" }),
              ui.badge("tw93/mole", { tone: "accent" }),
              state.cliConnected
                ? ui.badge("CLI Active", { tone: "success" })
                : ui.badge("Standalone", { tone: "secondary" }),
            ],
            { axis: "h", spacing: 6, align: "center" },
          ),
          stats
            ? ui.text(
                `CPU ${stats.cpuPercent}% · RAM ${stats.ramPercent}% (${stats.usedMemoryGB.toFixed(1)} / ${stats.totalMemoryGB.toFixed(1)} GB)`,
                { style: "caption", tone: "secondary" },
              )
            : ui.text("macOS System Cleaning & Tuning", { style: "caption", tone: "secondary" }),
        ],
        { spacing: 2 },
      ),
      ui.spacer(),
      ui.button("", "refresh", { icon: "arrow.clockwise" }),
    ],
    { axis: "h", spacing: 8, align: "center" },
  );
}

function renderCleanerTab(
  state: MoleStoredState,
  totalJunkBytes: number,
): Adanotch.Node {
  const c = state.cleanable;

  return ui.stack(
    [
      // Hero stats card
      ui.stack(
        [
          ui.stack(
            [
              ui.text("Total Cleanable Junk", { style: "caption", tone: "secondary" }),
              ui.text(formatBytes(totalJunkBytes), {
                style: "display",
                tone: totalJunkBytes > 0 ? "default" : "success",
              }),
            ],
            { spacing: 2 },
          ),
          ui.spacer(),
          ui.stack(
            [
              ui.text(`Last cleaned: ${formatRelativeTime(state.lastCleanedAt)}`, {
                style: "caption",
                tone: "secondary",
              }),
              ui.text(`Total reclaimed: ${formatBytes(state.totalReclaimedBytes)}`, {
                style: "caption",
                tone: "accent",
              }),
            ],
            { spacing: 2, align: "end" },
          ),
        ],
        { axis: "h", align: "center" },
      ),
      ui.divider(),
      // Scrollable categories so the list never pushes the action footer off-screen
      ui.scroll(
        ui.list([
          {
            title: "User & System Caches",
            subtitle: "~/Library/Caches",
            icon: "archivebox",
            trailing: formatBytes(c.userCaches),
            action: "cleanCategory",
            value: "userCaches",
            buttons: [{ icon: "trash", label: "Clean", action: "cleanCategory", value: "userCaches" }],
          },
          {
            title: "Diagnostic & App Logs",
            subtitle: "~/Library/Logs",
            icon: "doc.text",
            trailing: formatBytes(c.systemLogs),
            action: "cleanCategory",
            value: "systemLogs",
            buttons: [{ icon: "trash", label: "Clean", action: "cleanCategory", value: "systemLogs" }],
          },
          {
            title: "Trash Can",
            subtitle: "~/.Trash",
            icon: "trash",
            trailing: formatBytes(c.trash),
            action: "cleanCategory",
            value: "trash",
            buttons: [{ icon: "trash", label: "Empty", action: "cleanCategory", value: "trash" }],
          },
          {
            title: "Browser Cache & Data",
            subtitle: "Safari, Chrome, Arc, Brave",
            icon: "globe",
            trailing: formatBytes(c.browserData),
            action: "cleanCategory",
            value: "browserData",
            buttons: [{ icon: "trash", label: "Clean", action: "cleanCategory", value: "browserData" }],
          },
          {
            title: "Package Manager Caches",
            subtitle: "Homebrew, npm, yarn, pnpm",
            icon: "shippingbox",
            trailing: formatBytes(c.packageManagers),
            action: "cleanCategory",
            value: "packageManagers",
            buttons: [{ icon: "trash", label: "Clean", action: "cleanCategory", value: "packageManagers" }],
          },
          {
            title: "Xcode DerivedData",
            subtitle: "~/Library/Developer/Xcode/DerivedData",
            icon: "hammer",
            trailing: formatBytes(c.xcodeDerivedData),
            action: "cleanCategory",
            value: "xcodeDerivedData",
            buttons: [{ icon: "trash", label: "Clean", action: "cleanCategory", value: "xcodeDerivedData" }],
          },
        ]),
        { maxHeight: 160 },
      ),
      ui.divider(),
      // Enhanced Action Footer (Prominent & Non-clipping)
      ui.stack(
        [
          ui.button(
            totalJunkBytes > 0
              ? `Clean All (${formatBytes(totalJunkBytes)})`
              : "Clean All (mo clean)",
            "cleanAll",
            { primary: true, icon: "sparkles" },
          ),
          ui.stack(
            [
              ui.button("Dry Run (mo clean -n)", "dryRun", { icon: "eye" }),
              ui.button("Disk Analyzer (mo analyze)", "analyze", { icon: "chart.pie" }),
            ],
            { axis: "h", spacing: 8 },
          ),
        ],
        { spacing: 6 },
      ),
    ],
    { spacing: 6 },
  );
}

function renderSystemTab(
  stats: Adanotch.SystemStats | null,
  topProcesses?: ProcessUsage[],
): Adanotch.Node {
  if (!stats) {
    return ui.stack([ui.text("Waiting for system statistics...", { tone: "secondary" })]);
  }

  const defaultProcs: ProcessUsage[] = topProcesses || [
    { name: "Google Chrome", cpu: 14.2, mem: 2800 },
    { name: "Xcode", cpu: 11.5, mem: 4200 },
    { name: "WindowServer", cpu: 6.8, mem: 920 },
    { name: "Adanotch", cpu: 1.2, mem: 140 },
  ];

  return ui.stack(
    [
      ui.stack(
        [
          ui.gauge("CPU Usage", stats.cpuPercent, {
            tone: stats.cpuPercent > 80 ? "danger" : "default",
          }),
          ui.gauge("RAM Usage", stats.ramPercent, {
            tone: stats.ramPercent > 85 ? "danger" : stats.ramPercent > 70 ? "warning" : "default",
          }),
        ],
        { axis: "h", spacing: 12 },
      ),
      ui.divider(),
      ui.stack(
        [
          ui.text("Physical Memory Allocation", { style: "caption", tone: "secondary" }),
          ui.progress(stats.ramPercent, {
            tone: stats.ramPercent > 85 ? "danger" : stats.ramPercent > 70 ? "warning" : "accent",
          }),
          ui.stack(
            [
              ui.text(`Used: ${stats.usedMemoryGB.toFixed(1)} GB`, { style: "caption", tone: "default" }),
              ui.spacer(),
              ui.text(`Total: ${stats.totalMemoryGB.toFixed(1)} GB`, { style: "caption", tone: "secondary" }),
            ],
            { axis: "h" },
          ),
        ],
        { spacing: 4 },
      ),
      ui.divider(),
      ui.stack(
        [
          ui.text("Top Consuming Processes", { style: "caption", tone: "secondary" }),
          ui.scroll(
            ui.list(
              defaultProcs.map((proc) => ({
                title: proc.name,
                subtitle: `CPU: ${proc.cpu.toFixed(1)}%`,
                icon: "app.dashed",
                trailing: `${(proc.mem / 1024).toFixed(1)} GB`,
              })),
            ),
            { maxHeight: 120 },
          ),
        ],
        { spacing: 4 },
      ),
      ui.divider(),
      // Footer action row
      ui.stack(
        [
          ui.button("Purge RAM (sudo purge)", "optimize", {
            icon: "memorychip",
            value: "purge-ram",
          }),
          ui.button("Launch 'mo status'", "copyCommand", {
            icon: "terminal",
            value: "mo status",
          }),
        ],
        { axis: "h", spacing: 8 },
      ),
    ],
    { spacing: 6 },
  );
}

function renderDevPurgeTab(targets: DevArtifact[]): Adanotch.Node {
  const totalDevBytes = targets.reduce((sum, t) => sum + t.bytes, 0);

  return ui.stack(
    [
      ui.stack(
        [
          ui.stack(
            [
              ui.text("Developer Build Artifacts", { style: "caption", tone: "secondary" }),
              ui.text(formatBytes(totalDevBytes), { style: "title" }),
            ],
            { spacing: 2 },
          ),
          ui.spacer(),
          ui.badge(`${targets.length} targets`, { tone: "accent" }),
        ],
        { axis: "h", align: "center" },
      ),
      ui.text("Scans node_modules, Xcode DerivedData, Cargo target, and .build caches.", {
        style: "caption",
        tone: "secondary",
      }),
      ui.divider(),
      ui.scroll(
        ui.list(
          targets.map((item) => ({
            title: item.name,
            subtitle: item.path,
            icon: item.type === "node_modules" ? "cube.box" : item.type === "DerivedData" ? "hammer" : "folder",
            trailing: formatBytes(item.bytes),
            action: "purgeItem",
            value: item.id,
            buttons: [{ icon: "trash", label: "Purge", action: "purgeItem", value: item.id }],
          })),
        ),
        { maxHeight: 160 },
      ),
      ui.divider(),
      ui.button(
        totalDevBytes > 0
          ? `Purge All Dev Artifacts (${formatBytes(totalDevBytes)})`
          : "Purge All Dev Artifacts (mo purge)",
        "purgeAllDev",
        { primary: true, icon: "trash.circle" },
      ),
    ],
    { spacing: 6 },
  );
}

function renderOptimizeTab(): Adanotch.Node {
  const tasks = getOptimizationTasks();

  return ui.stack(
    [
      ui.text("macOS Performance Optimizations", { style: "caption", tone: "secondary" }),
      ui.scroll(
        ui.list(
          tasks.map((task) => ({
            title: task.title,
            subtitle: task.description,
            icon: task.icon,
            action: "optimize",
            value: task.id,
            buttons: [{ icon: "play.circle", label: "Run", action: "optimize", value: task.id }],
          })),
        ),
        { maxHeight: 200 },
      ),
    ],
    { spacing: 6 },
  );
}

function renderBridgeTab(): Adanotch.Node {
  return ui.stack(
    [
      ui.stack(
        [
          ui.icon("terminal", { tone: "accent" }),
          ui.stack(
            [
              ui.text("Mole Terminal & Sync Bridge", { style: "title" }),
              ui.text("Sync real data from the 'mo' CLI or run background scans.", {
                style: "caption",
                tone: "secondary",
              }),
            ],
            { spacing: 2 },
          ),
        ],
        { axis: "h", spacing: 8, align: "center" },
      ),
      ui.divider(),
      ui.markdown(
        "Install Mole CLI via Homebrew:\n```bash\nbrew install mole\n# or\ncurl -fsSL https://raw.githubusercontent.com/tw93/mole/main/install.sh | bash\n```\n\nRun the companion bridge script to sync real macOS cache sizes:\n```bash\n./scripts/mole-bridge.sh\n```",
      ),
      ui.divider(),
      ui.stack(
        [
          ui.button("Copy 'mo clean'", "copyCommand", {
            icon: "doc.on.doc",
            value: "mo clean",
          }),
          ui.button("Reset Clean History", "clearHistory", {
            icon: "arrow.counterclockwise",
          }),
        ],
        { axis: "h", spacing: 8 },
      ),
    ],
    { spacing: 6 },
  );
}
