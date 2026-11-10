import assert from "node:assert/strict";
import { test } from "node:test";
import { loadExtension } from "@adanotch/kit/testing";

const rows = (ext: Awaited<ReturnType<typeof loadExtension>>) =>
  (ext.find("list")?.items ?? []).map((item: { title: string }) => item.title);

test("an empty list says so", async () => {
  const ext = await loadExtension({});
  assert.ok(ext.texts().includes("The list is empty."));
});

test("text typed in the field is added and stored", async () => {
  const ext = await loadExtension({});
  await ext.action("add", "Buy milk");
  await ext.action("add", "  Bread  ");
  assert.deepEqual(rows(ext), ["Buy milk", "Bread"]);
  assert.equal((ext.storage.items as unknown[]).length, 2);
});

test("empty or whitespace-only text is not added", async () => {
  const ext = await loadExtension({});
  await ext.action("add", "   ");
  assert.equal(ext.find("list"), null);
});

test("clicking a row checks it, clicking again unchecks it", async () => {
  const ext = await loadExtension({});
  await ext.action("add", "Buy milk");
  const id = (ext.storage.items as { id: string }[])[0].id;
  await ext.action("toggle", id);
  assert.equal(ext.find("list")?.items[0].icon, "checkmark.circle.fill");
  await ext.action("toggle", id);
  assert.equal(ext.find("list")?.items[0].icon, "circle");
});

test("the badge beside the notch shows how many items are open", async () => {
  const ext = await loadExtension({});
  await ext.action("add", "A");
  await ext.action("add", "B");
  const id = (ext.storage.items as { id: string }[])[0].id;
  await ext.action("toggle", id);
  assert.equal(ext.view.compact?.trailing?.text, "1");
});

test("the delete button removes a row and clear drops the completed ones", async () => {
  const ext = await loadExtension({});
  await ext.action("add", "A");
  await ext.action("add", "B");
  await ext.action("add", "C");
  const [a, b] = (ext.storage.items as { id: string }[]).map((item) => item.id);
  await ext.action("remove", a);
  await ext.action("toggle", b);
  await ext.action("clear");
  assert.deepEqual(rows(ext), ["C"]);
});

test("the hide-completed setting shows only open items", async () => {
  const ext = await loadExtension({ settings: { hideDone: true } });
  await ext.action("add", "A");
  await ext.action("add", "B");
  await ext.action("toggle", (ext.storage.items as { id: string }[])[0].id);
  assert.deepEqual(rows(ext), ["B"]);
});

test("an add command from outside adds an item", async () => {
  const ext = await loadExtension({});
  await ext.command("add", "From a shortcut");
  assert.deepEqual(rows(ext), ["From a shortcut"]);
});
