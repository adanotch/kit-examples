// Mole System Cleaner & Monitor for Adanotch
// Seamless dynamic island companion for Tw93's Mole (mo) CLI utility.

import {
  calculateTotalJunk,
  formatBytes,
  getDefaultState,
  getOptimizationTasks,
} from "./mole.js";
import type {
  CleanableCategories,
  CleanupRecord,
  MoleSettings,
  MoleStoredState,
  ProcessUsage,
  SyncCommandPayload,
} from "./types.js";
import { renderCompact, renderExpanded } from "./views.js";

const { activity, system, clipboard, notify, sound, events } = AdanotchKit;

const STORAGE_KEY = "mole_state";

function loadState(storage: Adanotch.Storage): MoleStoredState {
  const existing = storage.get<MoleStoredState>(STORAGE_KEY);
  if (!existing) return getDefaultState();

  const defaults = getDefaultState();
  return {
    ...defaults,
    ...existing,
    cleanable: { ...defaults.cleanable, ...(existing.cleanable || {}) },
  };
}

function saveState(storage: Adanotch.Storage, state: MoleStoredState): void {
  storage.set(STORAGE_KEY, state);
}

// In-memory cache for live process metrics delivered via sync command
let latestProcesses: ProcessUsage[] | undefined;

activity<MoleSettings>({
  setup(ctx) {
    // 1. External sync bridge from Mole CLI / daemon:
    // e.g.: adanotch ext local.adanotch.mole sync '{"cleanable":{"userCaches":1200000000}}'
    events.on("command", ({ name, data }) => {
      const state = loadState(ctx.storage);

      if (name === "sync" && typeof data === "object" && data !== null) {
        const payload = data as SyncCommandPayload;
        if (payload.cleanable) {
          state.cleanable = { ...state.cleanable, ...payload.cleanable };
        }
        if (Array.isArray(payload.devTargets)) {
          state.devTargets = payload.devTargets;
        }
        if (Array.isArray(payload.topProcesses)) {
          latestProcesses = payload.topProcesses;
        }
        state.lastScannedAt = payload.timestamp || Date.now();
        state.cliConnected = true;
        saveState(ctx.storage, state);
        ctx.refresh();
      } else if (name === "cleaned") {
        const payload = (typeof data === "object" && data !== null ? data : {}) as { reclaimedBytes?: number };
        const reclaimed = Number(payload.reclaimedBytes || calculateTotalJunk(state.cleanable));
        state.totalReclaimedBytes += reclaimed;
        state.lastCleanedAt = Date.now();
        state.lastActionMessage = `✓ Reclaimed ${formatBytes(reclaimed)} via Mole CLI`;
        state.lastActionTimestamp = Date.now();
        state.cleanable = {
          userCaches: 0,
          systemLogs: 0,
          trash: 0,
          browserData: 0,
          packageManagers: 0,
          xcodeDerivedData: 0,
        };
        saveState(ctx.storage, state);
        ctx.refresh();
      } else if (name === "scan") {
        ctx.refresh();
      }
    });

    // 2. Refresh immediately upon system wake
    events.on("system.wake", () => ctx.refresh());
  },

  async update(ctx) {
    let stats: Adanotch.SystemStats | null = null;
    try {
      stats = await system.stats();
    } catch {
      // Fallback if system.stats is unavailable
    }

    const state = loadState(ctx.storage);

    // Auto-dismiss transient feedback message after 12 seconds
    if (state.lastActionTimestamp && Date.now() - state.lastActionTimestamp > 12000) {
      state.lastActionMessage = null;
      state.lastActionTimestamp = null;
      saveState(ctx.storage, state);
    }

    const totalJunk = calculateTotalJunk(state.cleanable);
    const totalJunkGB = totalJunk / (1024 * 1024 * 1024);
    const isHigh = totalJunkGB >= ctx.settings.warnThresholdGB;

    // Trigger one-time island notification when junk crosses warning threshold
    if (isHigh && !state.warned && ctx.settings.notifyOnJunkAlert) {
      state.warned = true;
      saveState(ctx.storage, state);
      try {
        notify.island({
          text: `Mole: ${formatBytes(totalJunk)} cleanable junk`,
          icon: "trash.circle.fill",
          tone: "warning",
          duration: 5,
        });
      } catch {}
      if (ctx.settings.soundEffects) {
        sound.play("Purr").catch(() => {});
      }
    } else if (!isHigh && state.warned) {
      state.warned = false;
      saveState(ctx.storage, state);
    }

    const viewContext = {
      state,
      settings: ctx.settings,
      stats,
      topProcesses: latestProcesses,
    };

    return {
      compact: renderCompact(viewContext),
      expanded: renderExpanded(viewContext),
    };
  },

  async onAction(action, ctx, value) {
    const state = loadState(ctx.storage);

    if (action === "refresh") {
      ctx.refresh();
      return;
    }

    if (action === "dismissActionMessage") {
      state.lastActionMessage = null;
      state.lastActionTimestamp = null;
      saveState(ctx.storage, state);
      return;
    }

    if (action === "cleanAll") {
      const reclaimed = calculateTotalJunk(state.cleanable);
      state.totalReclaimedBytes += reclaimed;
      state.lastCleanedAt = Date.now();
      state.lastActionMessage = `✓ Cleaned ${formatBytes(reclaimed)}! 'mo clean' copied to clipboard.`;
      state.lastActionTimestamp = Date.now();

      const record: CleanupRecord = {
        id: `${Date.now()}`,
        timestamp: Date.now(),
        reclaimedBytes: reclaimed,
        category: "All",
      };
      state.cleanHistory = [record, ...state.cleanHistory.slice(0, 9)];

      // Reset cleanable categories
      state.cleanable = {
        userCaches: 0,
        systemLogs: 0,
        trash: 0,
        browserData: 0,
        packageManagers: 0,
        xcodeDerivedData: 0,
      };
      state.warned = false;
      saveState(ctx.storage, state);

      try {
        await clipboard.writeText("mo clean");
      } catch (err) {
        console.warn("clipboard write error:", err);
      }

      try {
        notify.island({
          text: `Cleaned ${formatBytes(reclaimed)}! ('mo clean' copied)`,
          icon: "sparkles",
          tone: "success",
          duration: 4,
        });
      } catch {}

      if (ctx.settings.soundEffects) {
        sound.play("Pop").catch(() => {});
      }
      return;
    }

    if (action === "cleanCategory") {
      const catKey = String(value) as keyof CleanableCategories;
      const reclaimed = state.cleanable[catKey] || 0;
      state.cleanable[catKey] = 0;
      state.totalReclaimedBytes += reclaimed;
      state.lastCleanedAt = Date.now();
      state.lastActionMessage = `✓ Cleaned ${formatBytes(reclaimed)} (${catKey})`;
      state.lastActionTimestamp = Date.now();
      saveState(ctx.storage, state);

      try {
        await clipboard.writeText(`mo clean --${catKey}`);
      } catch {}

      try {
        notify.island({
          text: `Cleaned ${formatBytes(reclaimed)}`,
          icon: "trash",
          tone: "success",
          duration: 3,
        });
      } catch {}

      if (ctx.settings.soundEffects) {
        sound.play("Pop").catch(() => {});
      }
      return;
    }

    if (action === "dryRun") {
      state.lastActionMessage = "📋 Copied 'mo clean --dry-run' to clipboard. Run in Terminal to preview.";
      state.lastActionTimestamp = Date.now();
      saveState(ctx.storage, state);

      try {
        await clipboard.writeText("mo clean --dry-run");
      } catch {}

      try {
        notify.island({
          text: "Copied 'mo clean --dry-run' to clipboard",
          icon: "doc.on.doc",
          tone: "accent",
          duration: 3,
        });
      } catch {}
      return;
    }

    if (action === "analyze") {
      state.lastActionMessage = "📊 Copied 'mo analyze' to clipboard. Run in Terminal to launch disk treemap.";
      state.lastActionTimestamp = Date.now();
      saveState(ctx.storage, state);

      try {
        await clipboard.writeText("mo analyze");
      } catch {}

      try {
        notify.island({
          text: "Copied 'mo analyze' to clipboard",
          icon: "chart.pie",
          tone: "accent",
          duration: 3,
        });
      } catch {}
      return;
    }

    if (action === "purgeItem") {
      const targetId = String(value);
      const found = state.devTargets.find((t) => t.id === targetId);
      if (found) {
        state.devTargets = state.devTargets.filter((t) => t.id !== targetId);
        state.totalReclaimedBytes += found.bytes;
        state.lastActionMessage = `✓ Purged ${found.name} (${formatBytes(found.bytes)})`;
        state.lastActionTimestamp = Date.now();
        saveState(ctx.storage, state);

        try {
          await clipboard.writeText(`rm -rf "${found.path}"`);
        } catch {}

        try {
          notify.island({
            text: `Purged ${found.name} (${formatBytes(found.bytes)})`,
            icon: "trash",
            tone: "success",
            duration: 3,
          });
        } catch {}

        if (ctx.settings.soundEffects) {
          sound.play("Pop").catch(() => {});
        }
      }
      return;
    }

    if (action === "purgeAllDev") {
      const devTotal = state.devTargets.reduce((sum, t) => sum + t.bytes, 0);
      state.totalReclaimedBytes += devTotal;
      state.devTargets = [];
      state.lastActionMessage = `✓ Purged all build targets (${formatBytes(devTotal)})`;
      state.lastActionTimestamp = Date.now();
      saveState(ctx.storage, state);

      try {
        await clipboard.writeText("mo purge");
      } catch {}

      try {
        notify.island({
          text: `Purged all build targets (${formatBytes(devTotal)})`,
          icon: "trash.circle",
          tone: "success",
          duration: 4,
        });
      } catch {}

      if (ctx.settings.soundEffects) {
        sound.play("Pop").catch(() => {});
      }
      return;
    }

    if (action === "optimize") {
      const taskId = String(value);
      const tasks = getOptimizationTasks();
      const task = tasks.find((t) => t.id === taskId);
      if (task) {
        state.lastActionMessage = `⚡ Copied: ${task.title}`;
        state.lastActionTimestamp = Date.now();
        saveState(ctx.storage, state);

        try {
          await clipboard.writeText(task.command);
        } catch {}

        try {
          notify.island({
            text: `Copied: ${task.title}`,
            icon: "bolt.fill",
            tone: "success",
            duration: 3,
          });
        } catch {}

        if (ctx.settings.soundEffects) {
          sound.play("Hero").catch(() => {});
        }
      }
      return;
    }

    if (action === "copyCommand") {
      const cmd = String(value || "mo");
      state.lastActionMessage = `📋 Copied '${cmd}' to clipboard`;
      state.lastActionTimestamp = Date.now();
      saveState(ctx.storage, state);

      try {
        await clipboard.writeText(cmd);
      } catch {}

      try {
        notify.island({
          text: `Copied '${cmd}' to clipboard`,
          icon: "doc.on.doc",
          tone: "accent",
          duration: 3,
        });
      } catch {}
      return;
    }

    if (action === "clearHistory") {
      state.cleanHistory = [];
      state.totalReclaimedBytes = 0;
      state.lastActionMessage = "Clean history reset";
      state.lastActionTimestamp = Date.now();
      saveState(ctx.storage, state);

      try {
        notify.island({
          text: "Clean history reset",
          icon: "arrow.counterclockwise",
          tone: "default",
          duration: 2,
        });
      } catch {}
      return;
    }
  },
});
