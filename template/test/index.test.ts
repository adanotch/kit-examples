// `npm test` runs the extension under Node, on the runtime Adanotch uses. What Adanotch would answer is mocked.

import assert from "node:assert/strict";
import { test } from "node:test";
import { loadExtension } from "@adanotch/kit/testing";

const stats = (cpuPercent: number) => () => ({ cpuPercent, ramPercent: 50, usedMemoryGB: 8, totalMemoryGB: 16 });

test("CPU shows beside the notch", async () => {
  const ext = await loadExtension({ mocks: { "system.stats": stats(42) } });
  assert.equal(ext.view.compact?.trailing?.value, "42%");
  assert.equal(ext.view.compact?.trailing?.tone, "default");
});

test("CPU above 80% turns to the warning tone", async () => {
  const ext = await loadExtension({ mocks: { "system.stats": stats(95) } });
  assert.equal(ext.view.compact?.trailing?.tone, "warning");
});

test("the RAM ring follows its setting", async () => {
  const ext = await loadExtension({ settings: { showMemory: false }, mocks: { "system.stats": stats(10) } });
  assert.equal(ext.find("ring", (ring) => ring.label === "RAM"), null);

  await ext.setSettings({ showMemory: true });
  assert.ok(ext.find("ring", (ring) => ring.label === "RAM"));
});

test("clicks are counted and stored", async () => {
  const ext = await loadExtension({ storage: { clicks: 2 }, mocks: { "system.stats": stats(10) } });
  await ext.action("click");
  assert.equal(ext.storage.clicks, 3);
  assert.ok(ext.texts().includes("3 clicks"));
});

test("the reset command clears the counter", async () => {
  const ext = await loadExtension({ storage: { clicks: 5 }, mocks: { "system.stats": stats(10) } });
  await ext.command("reset");
  assert.equal(ext.storage.clicks, undefined);
  assert.ok(ext.texts().includes("0 clicks"));
});

test("without the permission it fails with a clear error", async () => {
  await assert.rejects(loadExtension({ permissions: [] }), /PermissionError: 'system\.stats' is not granted/);
});
