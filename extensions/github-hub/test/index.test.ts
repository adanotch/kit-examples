// `npm test`: the extension on Adanotch's own runtime, with GitHub's answers mocked.

import assert from "node:assert/strict";
import { test } from "node:test";
import { type MockRequest, type MockResponse, loadExtension } from "@adanotch/kit/testing";

const repoURL = "https://api.github.com/repos/acme/app";

const pr = (id: number, title: string, extra: object = {}) => ({
  id,
  number: id,
  title,
  html_url: `https://github.com/acme/app/pull/${id}`,
  repository_url: repoURL,
  user: { login: "ada" },
  comments: 2,
  updated_at: new Date(Date.now() - 5 * 60_000).toISOString(),
  labels: [],
  pull_request: { url: `${repoURL}/pulls/${id}` },
  ...extra,
});

interface World {
  reviews: object[];
  mine: object[];
  issues: object[];
  inbox: object[];
  checks: { status: string; conclusion: string | null }[];
  calls: string[];
  /** Headers of every request, in the order they were made. */
  sent: Record<string, string>[];
  failWith?: number;
}

function github(world: Partial<World> = {}) {
  const state: World = { reviews: [], mine: [], issues: [], inbox: [], checks: [], calls: [], sent: [], ...world };
  const handler = (request: MockRequest): MockResponse => {
    const url = new URL(request.url);
    state.calls.push(`${request.method} ${url.pathname}${url.search}`);
    state.sent.push(request.headers);
    const rate = { "x-ratelimit-remaining": "4900", "x-ratelimit-limit": "5000" };
    if (state.failWith) return { status: state.failWith, headers: rate, body: { message: "Bad credentials" } };
    const ok = (body: unknown, headers: Record<string, string> = {}): MockResponse => ({ headers: { ...rate, ...headers }, body: body as object });

    if (url.pathname === "/user") return ok({ login: "berat" });
    if (url.pathname === "/search/issues") {
      const q = url.searchParams.get("q") ?? "";
      if (q.includes("review-requested")) return ok({ items: state.reviews });
      if (q.includes("author:")) return ok({ items: state.mine });
      return ok({ items: state.issues });
    }
    if (url.pathname === "/notifications" && request.method === "GET") {
      // Header names reach the host lowercased.
      if (request.headers["if-none-match"] === '"v1"') return { status: 304, headers: rate };
      return ok(state.inbox, { etag: '"v1"' });
    }
    if (url.pathname === "/notifications") return { status: 205, headers: rate };
    if (url.pathname.startsWith("/notifications/threads/")) return { status: 205, headers: rate };
    if (url.pathname === "/graphql") {
      const weeks = [{ contributionDays: Array.from({ length: 28 }, (_, i) => ({ contributionCount: i % 4 })) }];
      return ok({ data: { viewer: { contributionsCollection: { contributionCalendar: { weeks } } } } });
    }
    if (url.pathname.endsWith("/check-runs")) return ok({ check_runs: state.checks });
    if (/\/pulls\/\d+$/.test(url.pathname)) return ok({ head: { sha: "abc123" } });
    if (url.pathname.endsWith("/reviews") || url.pathname.endsWith("/comments")) return ok({ id: 1 });
    if (/\/issues\/\d+$/.test(url.pathname)) {
      return ok({ title: "Fix the thing", state: "open", user: { login: "ada" }, comments: 3 });
    }
    return { status: 404, headers: rate, body: { message: "Not Found" } };
  };
  return { state, handler };
}

const load = (world: Partial<World> = {}, options: Parameters<typeof loadExtension>[0] = {}) => {
  const api = github(world);
  return loadExtension({ secrets: { token: "ghp_test" }, mocks: { fetch: api.handler, "timer.read": () => ({ isRunning: false, isBreak: false }) }, ...options }).then(
    (ext) => ({ ext, ...api }),
  );
};

test("without a token it explains how to connect, and fetches nothing", async () => {
  const api = github();
  const ext = await loadExtension({ mocks: { fetch: api.handler, "timer.read": () => ({ isRunning: false, isBreak: false }) } });
  assert.ok(ext.texts().includes("Connect GitHub Hub"));
  assert.equal(api.state.calls.length, 0);
  await ext.action("open", "https://github.com/settings/tokens/new?scopes=repo");
  assert.deepEqual(ext.opened, ["https://github.com/settings/tokens/new?scopes=repo"]);
});

test("review requests show as a count beside the notch and as rows", async () => {
  const { ext } = await load({ reviews: [pr(1, "Add search"), pr(2, "Fix login")] });
  assert.equal(ext.view.compact?.trailing?.type, "badge");
  assert.equal(ext.view.compact?.trailing?.text, "2");
  assert.ok(ext.texts().includes("Add search"));
  assert.ok(ext.texts().includes("acme/app#2 · @ada"));
});

test("an empty inbox makes the companion happy", async () => {
  const { ext } = await load();
  assert.equal(ext.view.compact?.leading?.type, "pet");
  assert.equal(ext.view.compact?.leading?.value, "happy");
  assert.ok(ext.texts().some((text) => text.startsWith("No pending review")));
});

test("a failing CI run on one of your PRs turns the badge red and shows the failure icon", async () => {
  const { ext } = await load({ mine: [pr(7, "Refactor")], checks: [{ status: "completed", conclusion: "failure" }] });
  assert.equal(ext.view.compact?.trailing?.text, "✗");
  assert.equal(ext.view.compact?.trailing?.tone, "danger");
  const row = ext.find("list", (list) => list.items.some((item: any) => item.title === "Refactor"));
  assert.equal(row?.items[0].icon, "xmark.octagon.fill");
});

test("CI states: running, passed and none", async () => {
  for (const [checks, icon] of [
    [[{ status: "in_progress", conclusion: null }], "clock.fill"],
    [[{ status: "completed", conclusion: "success" }], "checkmark.circle.fill"],
    [[], "circle"],
  ] as const) {
    const { ext } = await load({ mine: [pr(7, "Refactor")], checks: [...checks] });
    const list = ext.find("list", (node) => node.items.some((item: any) => item.title === "Refactor"));
    assert.equal(list?.items[0].icon, icon);
  }
});

test("the first run only remembers; a later new review request toasts, plays a sound and startles the companion", async () => {
  const { ext, state } = await load({ reviews: [pr(1, "Add search")] });
  assert.equal(ext.notifications.length, 0, "nothing announced on the first run");
  assert.deepEqual(ext.sounds, []);

  state.reviews = [pr(2, "Fix login"), pr(1, "Add search")];
  await ext.command("refresh");
  assert.equal(ext.notifications.length, 1);
  assert.match(ext.notifications[0].text, /Fix login/);
  assert.deepEqual(ext.sounds, ["Ping"]);
  assert.equal(ext.view.compact?.leading?.value, "surprised");
});

test("no sound when the sound setting is off", async () => {
  const { ext, state } = await load({ reviews: [pr(1, "Add search")] }, { settings: { sound: false } });
  state.reviews = [pr(2, "Fix login"), pr(1, "Add search")];
  await ext.command("refresh");
  assert.equal(ext.notifications.length, 1);
  assert.deepEqual(ext.sounds, []);
});

test("a focus interval keeps new requests quiet", async () => {
  const { ext, state } = await load({ reviews: [pr(1, "Add search")] });
  await ext.emit("timer.change", { isRunning: true, isBreak: false });
  state.reviews = [pr(2, "Fix login"), pr(1, "Add search")];
  await ext.command("refresh");
  assert.equal(ext.notifications.length, 0);
  assert.equal(ext.view.compact?.leading?.value, "sleep");
});

test("snoozing quiets alerts and counts down; waking brings them back", async () => {
  const { ext, state } = await load({ reviews: [pr(1, "Add search")] });
  await ext.action("snooze", 30);
  assert.ok(ext.find("countdown", () => true), "the Aktivite tab counts the snooze down");
  assert.equal(ext.find("datePicker", () => true), null);
  state.reviews = [pr(2, "Fix login"), pr(1, "Add search")];
  await ext.command("refresh");
  assert.equal(ext.notifications.length, 0);
  assert.equal(ext.view.compact?.trailing?.type, "icon");

  await ext.action("wake");
  assert.equal(ext.view.compact?.trailing?.type, "badge");
});

test("approving takes two taps", async () => {
  const { ext, state } = await load({ reviews: [pr(1, "Add search")] });
  const value = { repo: "acme/app", number: 1 };
  await ext.action("approve", value);
  assert.ok(!state.calls.some((call) => call.endsWith("/reviews")), "first tap only asks");
  assert.ok(ext.texts().includes("Press ✓ once more to approve"));

  await ext.action("approve", value);
  assert.ok(state.calls.includes("POST /repos/acme/app/pulls/1/reviews"));
  assert.ok(ext.notifications.some((note) => note.text.startsWith("Approved")));
});

test("selecting a row opens the composer; ⌘↩ posts the comment and closes it", async () => {
  const { ext, state } = await load({ reviews: [pr(1, "Add search")] });
  await ext.action("select", { repo: "acme/app", number: 1, title: "Add search", url: "u" });
  assert.ok(ext.find("textArea", () => true));
  await ext.action("comment", "Looks good to me");
  assert.ok(state.calls.includes("POST /repos/acme/app/issues/1/comments"));
  assert.equal(ext.find("textArea", () => true), null);
  assert.ok(ext.notifications.some((note) => note.text === "Comment sent"));
});

test("the draft is kept while typing and sent with the button", async () => {
  const { ext, state } = await load();
  await ext.action("select", { repo: "acme/app", number: 5, title: "Bug", url: "u" });
  await ext.action("draft", "half a thought");
  assert.equal(ext.find("textArea", () => true)?.value, "half a thought");
  await ext.action("send");
  assert.ok(state.calls.includes("POST /repos/acme/app/issues/5/comments"));
});

test("the inbox marks one thread, or all, as read", async () => {
  const thread = (id: string) => ({
    id,
    reason: "mention",
    updated_at: new Date().toISOString(),
    subject: { title: `Thread ${id}`, type: "Issue", url: `${repoURL}/issues/${id}` },
    repository: { full_name: "acme/app" },
  });
  const { ext, state } = await load({ inbox: [thread("1"), thread("2")] });
  assert.ok(ext.texts().includes("Thread 1"));
  await ext.action("read", "1");
  assert.ok(state.calls.includes("PATCH /notifications/threads/1"));
  assert.ok(!ext.texts().includes("Thread 1"));
  await ext.action("read-all");
  assert.ok(state.calls.includes("PUT /notifications"));
  assert.ok(ext.texts().some((text) => text.startsWith("No unread notifications")));
});

test("an unchanged inbox is asked with its ETag and answers 304", async () => {
  const { ext, state } = await load({ inbox: [] });
  await ext.command("refresh");
  const inbox = state.calls.flatMap((call, index) =>
    call.includes("/notifications?") ? [state.sent[index]?.["if-none-match"]] : [],
  );
  assert.deepEqual(inbox, [undefined, '"v1"']);
});

test("a bad token shows the reason and keeps what it had", async () => {
  const { ext, state } = await load({ reviews: [pr(1, "Add search")] });
  state.failWith = 401;
  await ext.command("refresh");
  assert.ok(ext.texts().includes("Invalid or expired token"));
  assert.equal(ext.view.compact?.leading?.value, "sad");
});

test("offline: the last good data stays on screen", async () => {
  const api = github({ reviews: [pr(1, "Add search")] });
  let offline = false;
  const ext = await loadExtension({
    secrets: { token: "t" },
    mocks: {
      fetch: (request) => {
        if (offline) throw Object.assign(new Error("no network"), { name: "NetworkError" });
        return api.handler(request);
      },
      "timer.read": () => ({ isRunning: false, isBreak: false }),
    },
  });
  offline = true;
  await ext.command("refresh");
  assert.ok(ext.texts().includes("Add search"));
  assert.ok(ext.texts().includes("Offline"));
});

test("a copied pull request link pops a summary; other text is ignored", async () => {
  const { ext } = await load();
  await ext.emit("clipboard.change", { text: "https://github.com/acme/app/pull/42", kind: "link" });
  const toast = ext.activities.get("github.link");
  assert.ok(toast);
  assert.ok(ext.texts(toast.expanded).includes("Fix the thing"));

  ext.activities.clear();
  await ext.emit("clipboard.change", { text: "https://example.com/x", kind: "link" });
  await ext.emit("clipboard.change", { text: "hello", kind: "text" });
  assert.equal(ext.activities.size, 0);
});

test("the clipboard watcher can be turned off", async () => {
  const { ext } = await load({}, { settings: { watchClipboard: false } });
  await ext.emit("clipboard.change", { text: "https://github.com/acme/app/issues/3", kind: "link" });
  assert.equal(ext.activities.size, 0);
});

test("the activity tab charts 28 days and sums them", async () => {
  const { ext } = await load();
  const chart = ext.find("chart", () => true);
  assert.equal(chart?.values.length, 28);
  const table = ext.find("table", () => true);
  assert.deepEqual(table?.headers, ["Period", "Contributions"]);
  assert.equal(table?.rows[2][1], "42");
});

test("sections the user turned off are not fetched or shown", async () => {
  const { ext, state } = await load({ reviews: [pr(1, "Add search")] }, { settings: { sections: ["reviews"] } });
  assert.ok(!state.calls.some((call) => call.includes("author%3A") || call.includes("assignee")));
  assert.ok(!state.calls.some((call) => call.startsWith("GET /notifications")));
  assert.equal(ext.find("tabs", () => true)?.tabs.length, 2);
});

test("taking permissions away doesn't stop it: no network shows a problem, no timer or clipboard is skipped", async () => {
  const api = github({ reviews: [pr(1, "Add search")] });
  const ext = await loadExtension({ secrets: { token: "t" }, permissions: ["notifications"], mocks: { fetch: api.handler } });
  assert.equal(api.state.calls.length, 0);
  assert.equal(ext.errors.length, 0);
  assert.equal(ext.view.compact?.leading?.value, "sad");
  assert.equal(ext.subscriptions.size, 0, "neither timer.change nor clipboard.change was allowed");
});
