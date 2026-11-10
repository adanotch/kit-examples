import assert from "node:assert/strict";
import { test } from "node:test";
import { loadExtension } from "@adanotch/kit/testing";
import { dayLabel, formatTime, wallClock } from "../src/clock.ts";

/** 2026-03-10 12:00 UTC. */
const NOON_UTC = Date.UTC(2026, 2, 10, 12, 0);

test("the time shifts by the city's UTC offset", () => {
  assert.equal(formatTime(wallClock(NOON_UTC, 540), false), "21:00"); // Tokyo
  assert.equal(formatTime(wallClock(NOON_UTC, 180), false), "15:00"); // Istanbul
  assert.equal(formatTime(wallClock(NOON_UTC, -180), false), "09:00"); // São Paulo
  assert.equal(formatTime(wallClock(NOON_UTC, 330), false), "17:30"); // Kolkata: a half-hour offset
});

test("the 12-hour clock writes 12 for midnight and noon", () => {
  assert.equal(formatTime(wallClock(Date.UTC(2026, 2, 10, 0, 5), 0), true), "12:05 AM");
  assert.equal(formatTime(wallClock(Date.UTC(2026, 2, 10, 12, 0), 0), true), "12:00 PM");
  assert.equal(formatTime(wallClock(Date.UTC(2026, 2, 10, 15, 30), 0), true), "3:30 PM");
});

test("the day label says today, tomorrow or yesterday relative to your day", () => {
  const mine = wallClock(Date.UTC(2026, 2, 10, 22, 0), 0); // March 10, 22:00
  assert.equal(dayLabel(wallClock(Date.UTC(2026, 2, 10, 22, 0), 0), mine), "Today");
  assert.equal(dayLabel(wallClock(Date.UTC(2026, 2, 10, 22, 0), 540), mine), "Tomorrow"); // Tokyo, March 11 07:00
  assert.equal(dayLabel(wallClock(Date.UTC(2026, 2, 10, 2, 0), -180), mine), "Yesterday"); // São Paulo, March 9 23:00
});

test("the open card lists every chosen city in order", async () => {
  const ext = await loadExtension({ settings: { cities: ["istanbul", "sao-paulo"], hour12: false } });
  const items = ext.find("list")?.items as { title: string; trailing: string }[];
  assert.deepEqual(items.map((item) => item.title), ["Istanbul", "São Paulo"]);
  assert.ok(items.every((item) => /^\d{2}:\d{2}$/.test(item.trailing)));
});

test("the first city's time shows beside the notch", async () => {
  const ext = await loadExtension({ settings: { cities: ["tokyo", "istanbul"], hour12: false } });
  assert.match(ext.view.compact?.trailing?.value, /^\d{2}:\d{2}$/);
});

test("the 12-hour setting changes the format", async () => {
  const ext = await loadExtension({ settings: { cities: ["istanbul"], hour12: true } });
  assert.match(ext.view.compact?.trailing?.value, /^\d{1,2}:\d{2} (AM|PM)$/);
});

test("with no city chosen it points to the settings", async () => {
  const ext = await loadExtension({ settings: { cities: [], hour12: false } });
  assert.ok(ext.texts().includes("Pick a city in the settings."));
});
