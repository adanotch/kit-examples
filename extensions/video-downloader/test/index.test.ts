import assert from "node:assert/strict";
import { test } from "node:test";
import { loadExtension } from "@adanotch/kit/testing";

test("renders downloader empty state", async () => { const ext=await loadExtension(); assert.ok(ext.texts().some(t=>t.includes("Video Downloader"))); assert.ok(ext.texts().some(t=>t.includes("queue is empty"))); });
test("rejects invalid URLs", async () => { const ext=await loadExtension(); await ext.action("setUrl","not a url"); await ext.action("inspect"); await ext.settle(); assert.ok(ext.texts().some(t=>t.includes("valid http(s)"))); });
test("inspects a URL and creates a queue item", async () => { const ext=await loadExtension(); await ext.action("setUrl","https://example.com/video"); await ext.action("inspect"); await ext.settle(); const stored=ext.storage.video_downloader_state as {items:unknown[]}; assert.equal(stored.items.length,1); assert.ok(ext.texts().some(t=>t.includes("example.com"))); });
test("copies a safe yt-dlp command", async () => { const ext=await loadExtension(); await ext.action("setUrl","https://example.com/video"); await ext.action("inspect"); await ext.settle(); const item=(ext.storage.video_downloader_state as any).items[0]; await ext.action("download",item.id); await ext.settle(); assert.ok(ext.clipboard.writes.some((v:string)=>v.includes("yt-dlp") && v.includes("example.com/video"))); });
