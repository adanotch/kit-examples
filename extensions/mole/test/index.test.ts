// Comprehensive tests for the Mole extension running on Adanotch's runtime.

import assert from "node:assert/strict";
import { test } from "node:test";
import { loadExtension } from "@adanotch/kit/testing";

const mockStats = (over: Record<string, unknown> = {}) => () => ({
  cpuPercent: 28,
  ramPercent: 64,
  usedMemoryGB: 20.5,
  totalMemoryGB: 32.0,
  ...over,
});

test("renders compact slot with cleanable junk by default", async () => {
  const ext = await loadExtension({
    mocks: { "system.stats": mockStats() },
  });

  assert.ok(ext.view.compact?.leading);
  assert.equal(ext.view.compact?.leading?.type, "icon");
  assert.ok(ext.view.compact?.trailing);
  // Default total junk exceeds default threshold (7.3 GB > 5 GB) so it renders as a badge with warning tone
  assert.equal(ext.view.compact?.trailing?.type, "badge");
  assert.equal(ext.view.compact?.trailing?.tone, "warning");
});

test("compact slot respects mode settings (ram and cpu)", async () => {
  const extRam = await loadExtension({
    settings: { compactMode: "ram" },
    mocks: { "system.stats": mockStats({ ramPercent: 75 }) },
  });
  assert.ok(extRam.view.compact?.trailing);
  assert.equal(extRam.view.compact?.trailing?.type, "badge");
  assert.equal(extRam.view.compact?.trailing?.text, "75% RAM");

  const extCpu = await loadExtension({
    settings: { compactMode: "cpu" },
    mocks: { "system.stats": mockStats({ cpuPercent: 42 }) },
  });
  assert.ok(extCpu.view.compact?.trailing);
  assert.equal(extCpu.view.compact?.trailing?.type, "badge");
  assert.equal(extCpu.view.compact?.trailing?.text, "42% CPU");
});

test("warns once when cleanable junk exceeds threshold", async () => {
  const ext = await loadExtension({
    settings: { warnThresholdGB: 5, notifyOnJunkAlert: true },
    mocks: { "system.stats": mockStats() },
  });

  // Since default junk is > 7 GB, it should send a warning notification
  assert.ok(ext.notifications.length >= 1);
  assert.ok(ext.notifications.some((n) => n.text.includes("cleanable junk")));
  assert.ok(ext.texts().some((t) => t.includes("Cleanup Recommended:")));
});

test("action: cleanAll reclaims junk, sets in-card feedback, copies 'mo clean', and notifies", async () => {
  const ext = await loadExtension({
    mocks: { "system.stats": mockStats() },
  });

  const notifCountBefore = ext.notifications.length;
  await ext.action("cleanAll");
  await ext.settle();

  // Storage should be cleared for categories
  const stored = ext.storage.mole_state as {
    cleanable: Record<string, number>;
    totalReclaimedBytes: number;
    lastActionMessage: string;
  };
  assert.equal(stored.cleanable.userCaches, 0);
  assert.equal(stored.cleanable.trash, 0);
  assert.ok(stored.totalReclaimedBytes > 0);
  assert.ok(stored.lastActionMessage.includes("Cleaned"));

  // Check in-card UI text feedback
  assert.ok(ext.texts().some((t) => t.includes("Cleaned") && t.includes("'mo clean' copied")));

  // New notification added for completion
  assert.ok(ext.notifications.length > notifCountBefore);
  assert.ok(ext.notifications.some((n) => n.text.includes("Cleaned")));
});

test("action: dismissActionMessage clears in-card feedback banner", async () => {
  const ext = await loadExtension({
    mocks: { "system.stats": mockStats() },
  });

  await ext.action("cleanAll");
  await ext.settle();
  assert.ok(ext.texts().some((t) => t.includes("'mo clean' copied")));

  await ext.action("dismissActionMessage");
  await ext.settle();
  assert.ok(!ext.texts().some((t) => t.includes("'mo clean' copied")));
});

test("action: cleanCategory cleans only the specified target and shows feedback", async () => {
  const ext = await loadExtension({
    mocks: { "system.stats": mockStats() },
  });

  await ext.action("cleanCategory", "trash");
  await ext.settle();

  const stored = ext.storage.mole_state as {
    cleanable: Record<string, number>;
    lastActionMessage: string;
  };
  assert.equal(stored.cleanable.trash, 0);
  assert.ok(stored.cleanable.userCaches > 0);
  assert.ok(stored.lastActionMessage.includes("trash"));
  assert.ok(ext.texts().some((t) => t.includes("Cleaned") && t.includes("trash")));
});

test("action: dryRun and analyze notify user and update card feedback", async () => {
  const ext = await loadExtension({
    mocks: { "system.stats": mockStats() },
  });

  await ext.action("dryRun");
  await ext.settle();
  assert.ok(ext.notifications.some((n) => n.text.includes("mo clean --dry-run")));
  assert.ok(ext.texts().some((t) => t.includes("mo clean --dry-run")));

  await ext.action("analyze");
  await ext.settle();
  assert.ok(ext.notifications.some((n) => n.text.includes("mo analyze")));
  assert.ok(ext.texts().some((t) => t.includes("mo analyze")));
});

test("action: purgeAllDev clears project targets and updates card", async () => {
  const ext = await loadExtension({
    mocks: { "system.stats": mockStats() },
  });

  await ext.action("purgeAllDev");
  await ext.settle();

  const stored = ext.storage.mole_state as {
    devTargets: unknown[];
    lastActionMessage: string;
  };
  assert.equal(stored.devTargets.length, 0);
  assert.ok(stored.lastActionMessage.includes("Purged all build targets"));
  assert.ok(ext.notifications.some((n) => n.text.includes("Purged all build targets")));
});

test("action: optimize copies specific system maintenance command", async () => {
  const ext = await loadExtension({
    mocks: { "system.stats": mockStats() },
  });

  await ext.action("optimize", "flush-dns");
  await ext.settle();
  assert.ok(ext.notifications.some((n) => n.text.includes("Flush DNS Cache")));
  assert.ok(ext.texts().some((t) => t.includes("Flush DNS Cache")));
});

test("external sync command updates state dynamically", async () => {
  const ext = await loadExtension({
    mocks: { "system.stats": mockStats() },
  });

  await ext.emit("command", {
    name: "sync",
    data: {
      cleanable: {
        userCaches: 500 * 1024 * 1024,
        trash: 100 * 1024 * 1024,
      },
    },
  });
  await ext.settle();

  const stored = ext.storage.mole_state as {
    cleanable: Record<string, number>;
    cliConnected: boolean;
  };
  assert.equal(stored.cleanable.userCaches, 500 * 1024 * 1024);
  assert.equal(stored.cleanable.trash, 100 * 1024 * 1024);
  assert.equal(stored.cliConnected, true);
});

test("external cleaned command records total reclaimed bytes", async () => {
  const ext = await loadExtension({
    mocks: { "system.stats": mockStats() },
  });

  await ext.emit("command", {
    name: "cleaned",
    data: { reclaimedBytes: 3500000000 },
  });
  await ext.settle();

  const stored = ext.storage.mole_state as {
    totalReclaimedBytes: number;
    cleanable: Record<string, number>;
  };
  assert.equal(stored.totalReclaimedBytes, 3500000000);
  assert.equal(stored.cleanable.userCaches, 0);
});
