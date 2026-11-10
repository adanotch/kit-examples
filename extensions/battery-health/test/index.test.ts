// `npm test` runs the extension on Adanotch's own runtime, in Node. What Adanotch would answer is mocked.

import assert from "node:assert/strict";
import { test } from "node:test";
import { loadExtension } from "@adanotch/kit/testing";

const state = (over: Record<string, unknown> = {}) => () => ({
  percentage: 80,
  isCharging: false,
  isPluggedIn: false,
  hasInternalBattery: true,
  minutesRemaining: 200,
  devices: [],
  ...over,
});

test("the percentage shows beside the notch", async () => {
  const ext = await loadExtension({ mocks: { "battery.read": state() } });
  assert.equal(ext.view.compact?.trailing?.value, "80%");
  assert.equal(ext.view.compact?.trailing?.tone, "default");
});

test("time left is shown in hours and minutes", async () => {
  const ext = await loadExtension({ mocks: { "battery.read": state({ minutesRemaining: 200 }) } });
  assert.ok(ext.texts().some((text) => text.includes("3 h 20 min left")));
});

test("charging changes the status and the colour", async () => {
  const ext = await loadExtension({ mocks: { "battery.read": state({ isCharging: true, minutesRemaining: 45 }) } });
  assert.ok(ext.texts().some((text) => text.includes("Charging · full in 45 min")));
  assert.equal(ext.view.compact?.leading?.tone, "success");
});

test("it warns once when the level drops below the threshold, not again while it stays low", async () => {
  const ext = await loadExtension({ mocks: { "battery.read": state({ percentage: 15 }) } });
  assert.equal(ext.notifications.length, 1);
  assert.equal(ext.view.compact?.trailing?.tone, "warning");

  await ext.emit("battery.change", { percentage: 14 });
  await ext.settle();
  assert.equal(ext.notifications.length, 1);
});

test("changing the threshold setting changes when it warns", async () => {
  const ext = await loadExtension({ settings: { warnPercent: 10 }, mocks: { "battery.read": state({ percentage: 15 }) } });
  assert.equal(ext.notifications.length, 0);
});

test("connected devices' batteries can be hidden with a setting", async () => {
  const devices = [{ name: "AirPods", percentage: 64 }];
  const ext = await loadExtension({ mocks: { "battery.read": state({ devices }) } });
  assert.ok(ext.find("list"));

  await ext.setSettings({ showDevices: false });
  assert.equal(ext.find("list"), null);
});

test("a Mac without a battery shows AC", async () => {
  const ext = await loadExtension({ mocks: { "battery.read": state({ hasInternalBattery: false }) } });
  assert.equal(ext.view.compact?.trailing?.value, "AC");
});
