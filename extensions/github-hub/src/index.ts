// GitHub Hub: review requests, your PRs with CI state, assigned issues and the notification inbox in the island,
// with quick approve and comment, a contribution chart, a toast for GitHub links you copy, and quiet while you focus.

import * as github from "./github";
import { type Cache, type Model, type Selection, compact, expanded, onboarding } from "./views";

const { activity, secrets, events, notify, sound, island, open, timer } = AdanotchKit;

interface Settings {
  sections: string[];
  maxItems: number;
  ciChecks: boolean;
  sound: boolean;
  watchClipboard: boolean;
}

const KEY = {
  cache: "cache",
  seen: "seen",
  alertAt: "alertAt",
  snooze: "snooze",
  selected: "selected",
  draft: "draft",
  confirm: "confirm",
};

/** Fresher than this, `update()` redraws from the cache instead of asking GitHub again (actions re-run `update`). */
const FRESH_MS = 90_000;
const CONFIRM_MS = 8_000;
const ACTIVITY_MS = 30 * 60_000;

const emptyCache = (): Cache => ({
  login: null,
  reviews: [],
  mine: [],
  issues: [],
  inbox: [],
  inboxEtag: null,
  activity: null,
  fetchedAt: 0,
});

let focusing = false;
let forceFetch = true;
let problem: string | null = null;
let clipboardCtx: Adanotch.Context<Settings> | null = null;

activity<Settings>({
  async setup(ctx) {
    clipboardCtx = ctx;

    // Quiet while a Focus interval runs. The Timer module may be off; that's fine.
    try {
      const state = await timer.read();
      focusing = state.isRunning && !state.isBreak;
    } catch {
      focusing = false;
    }
    subscribe("timer.change", (state) => {
      focusing = state.isRunning && !state.isBreak;
      ctx.refresh();
    });

    subscribe("clipboard.change", async ({ text, kind }) => {
      if (kind !== "link" || !text || !ctx.settings.watchClipboard) return;
      await showLinkSummary(text);
    });

    // `adanotch ext local.adanotch.githubhub refresh`, `… snooze 30` (minutes), `… wake`
    events.on("command", ({ name, data }) => {
      if (name === "refresh") forceFetch = true;
      if (name === "snooze") startSnooze(ctx, typeof data === "number" ? data : 60);
      if (name === "wake") ctx.storage.remove(KEY.snooze);
      ctx.refresh();
    });
  },

  async update(ctx) {
    const token = await secrets.get("token");
    if (!token) return onboarding();

    let cache = ctx.storage.get<Cache>(KEY.cache) ?? emptyCache();
    if (forceFetch || Date.now() - cache.fetchedAt > FRESH_MS) {
      cache = await refreshCache(ctx, token, cache);
      forceFetch = false;
    }
    await alertOnNewReviews(ctx, cache);

    const model = buildModel(ctx, cache);
    return { compact: compact(model), expanded: expanded(model) };
  },

  async onAction(action, ctx, value) {
    const token = await secrets.get("token");
    try {
      await handle(action, value, ctx, token);
    } catch (error) {
      toast({ text: (error as Error).message, icon: "exclamationmark.triangle.fill", tone: "danger", duration: 4 });
    }
  },

  onSettingsChange() {
    forceFetch = true;
  },
});

// MARK: Permissions the user may take away

/** `events.on` throws a PermissionError without the event's permission; losing one must not stop the extension. */
function subscribe<E extends keyof Adanotch.Events>(
  event: E,
  handler: (payload: Adanotch.Events[E], ctx: Adanotch.Context<Settings>) => void | Promise<void>,
) {
  try {
    events.on(event, handler);
  } catch (error) {
    if ((error as Error).name !== "PermissionError") throw error;
  }
}

/** A toast, or nothing when the "notifications" permission was turned off. */
function toast(notification: Adanotch.IslandNotification) {
  try {
    notify.island(notification);
  } catch (error) {
    if ((error as Error).name !== "PermissionError") throw error;
  }
}

// MARK: Actions

async function handle(action: string, value: Adanotch.JSONValue, ctx: Adanotch.Context<Settings>, token: string | null) {
  switch (action) {
    case "open":
      if (typeof value === "string") await open(value);
      return;
    case "refresh":
      forceFetch = true;
      return;
    case "snooze":
      startSnooze(ctx, typeof value === "number" ? value : 60);
      return;
    case "snooze-until":
      if (typeof value === "number" && value > Date.now()) {
        ctx.storage.set(KEY.snooze, { start: Date.now(), end: value });
      }
      return;
    case "wake":
      ctx.storage.remove(KEY.snooze);
      return;
    case "select":
      ctx.storage.set(KEY.selected, value);
      ctx.storage.remove(KEY.draft);
      return;
    case "cancel":
      ctx.storage.remove(KEY.selected);
      ctx.storage.remove(KEY.draft);
      return;
    case "draft":
      ctx.storage.set(KEY.draft, String(value));
      return;
  }
  if (!token) return;

  const cache = ctx.storage.get<Cache>(KEY.cache) ?? emptyCache();
  switch (action) {
    case "approve": {
      const { repo, number } = value as { repo: string; number: number };
      const key = `${repo}#${number}`;
      const pending = ctx.storage.get<{ key: string; at: number }>(KEY.confirm);
      if (pending?.key === key && Date.now() - pending.at < CONFIRM_MS) {
        await github.approve(token, repo, number);
        ctx.storage.remove(KEY.confirm);
        cache.reviews = cache.reviews.filter((pull) => !(pull.repo === repo && pull.number === number));
        ctx.storage.set(KEY.cache, cache);
        toast({ text: `Approved: ${key}`, icon: "checkmark.seal.fill", tone: "success", duration: 3 });
        forceFetch = true;
      } else {
        // Two taps on purpose: an approval can't be taken back.
        ctx.storage.set(KEY.confirm, { key, at: Date.now() });
      }
      return;
    }
    case "read": {
      await github.markThreadRead(token, String(value));
      cache.inbox = cache.inbox.filter((thread) => thread.id !== value);
      ctx.storage.set(KEY.cache, cache);
      return;
    }
    case "read-all": {
      await github.markAllRead(token);
      cache.inbox = [];
      cache.inboxEtag = null;
      ctx.storage.set(KEY.cache, cache);
      return;
    }
    case "comment":
    case "send": {
      const selected = ctx.storage.get<Selection>(KEY.selected);
      const text = (action === "comment" ? String(value) : ctx.storage.get<string>(KEY.draft) ?? "").trim();
      if (!selected || !text) return;
      await github.comment(token, selected.repo, selected.number, text);
      ctx.storage.remove(KEY.selected);
      ctx.storage.remove(KEY.draft);
      toast({ text: "Comment sent", icon: "text.bubble.fill", tone: "success", duration: 3 });
      return;
    }
  }
}

function startSnooze(ctx: Adanotch.Context<Settings>, minutes: number) {
  const start = Date.now();
  ctx.storage.set(KEY.snooze, { start, end: start + Math.min(Math.max(minutes, 1), 24 * 60) * 60_000 });
}

// MARK: Data

async function refreshCache(ctx: Adanotch.Context<Settings>, token: string, previous: Cache): Promise<Cache> {
  const cache: Cache = { ...previous };
  const { sections, maxItems } = ctx.settings;
  const limit = Math.min(Math.max(Math.round(maxItems), 1), 20);
  problem = null;

  try {
    cache.login ??= await github.whoAmI(token);
  } catch (error) {
    return fail(ctx, cache, error);
  }
  const login = cache.login;

  // Each section fails on its own; the others keep their fresh data and the failed one its cache.
  const jobs: Promise<void>[] = [];
  const guard = (run: () => Promise<void>) => jobs.push(run().catch((error) => void (problem ??= describe(error))));
  if (sections.includes("reviews")) guard(async () => void (cache.reviews = await github.reviewRequests(token, login, limit)));
  if (sections.includes("mine")) guard(async () => void (cache.mine = await github.myPulls(token, login, limit)));
  if (sections.includes("issues")) guard(async () => void (cache.issues = await github.assignedIssues(token, login, limit)));
  if (sections.includes("inbox")) {
    guard(async () => {
      const result = await github.notifications(token, cache.inboxEtag, limit);
      if (result !== "unchanged") {
        cache.inbox = result.threads;
        cache.inboxEtag = result.etag;
      }
    });
  }
  await Promise.all(jobs);

  if (ctx.settings.ciChecks) await attachCI(token, cache);

  if (!cache.activity || Date.now() - cache.activity.fetchedAt > ACTIVITY_MS) {
    try {
      cache.activity = await github.contributions(token);
    } catch (error) {
      problem ??= describe(error);
    }
  }

  cache.fetchedAt = Date.now();
  ctx.storage.set(KEY.cache, cache);
  return cache;
}

/** CI state for the first few of your PRs: two requests each, two PRs at a time (the runtime allows six at once). */
async function attachCI(token: string, cache: Cache) {
  const pulls = cache.mine.slice(0, 6);
  for (let index = 0; index < pulls.length; index += 2) {
    await Promise.all(
      pulls.slice(index, index + 2).map(async (pull) => {
        try {
          pull.ci = await github.ciState(token, pull);
        } catch {
          pull.ci = undefined;
        }
      }),
    );
  }
}

function fail(ctx: Adanotch.Context<Settings>, cache: Cache, error: unknown): Cache {
  problem = describe(error);
  cache.fetchedAt = Date.now();
  ctx.storage.set(KEY.cache, cache);
  return cache;
}

function describe(error: unknown): string {
  const name = (error as Error).name;
  if (name === "NetworkError" || name === "TimeoutError") return "Offline";
  return (error as Error).message;
}

// MARK: Alerts

/** A new review request: a toast, a sound and a startled companion, unless snoozed or in a focus interval. */
async function alertOnNewReviews(ctx: Adanotch.Context<Settings>, cache: Cache) {
  const known = ctx.storage.get<number[]>(KEY.seen);
  const ids = cache.reviews.map((pull) => pull.id);
  ctx.storage.set(KEY.seen, ids);
  if (!known) return; // first run: remember what's there, don't announce it

  const fresh = cache.reviews.filter((pull) => !known.includes(pull.id));
  if (fresh.length === 0 || focusing || isSnoozed(ctx)) return;

  ctx.storage.set(KEY.alertAt, Date.now());
  toast({
    text: fresh.length === 1 ? `New review request: ${fresh[0].title}` : `${fresh.length} new review requests`,
    icon: "eye.fill",
    tone: "warning",
    duration: 6,
  });
  if (ctx.settings.sound) await sound.play("Ping").catch(() => undefined);
}

function isSnoozed(ctx: Adanotch.Context<Settings>): boolean {
  const snooze = ctx.storage.get<{ start: number; end: number }>(KEY.snooze);
  if (snooze && snooze.end <= Date.now()) ctx.storage.remove(KEY.snooze);
  return Boolean(snooze && snooze.end > Date.now());
}

// MARK: Model

function buildModel(ctx: Adanotch.Context<Settings>, cache: Cache): Model {
  const snooze = isSnoozed(ctx) ? ctx.storage.get<{ start: number; end: number }>(KEY.snooze) : null;
  const alertAt = ctx.storage.get<number>(KEY.alertAt) ?? 0;
  const confirm = ctx.storage.get<{ key: string; at: number }>(KEY.confirm);

  let pose: Adanotch.PetPose = "idle";
  if (problem) pose = "sad";
  else if (Date.now() - alertAt < 90_000) pose = "surprised";
  else if (focusing || snooze) pose = "sleep";
  else if (cache.reviews.length === 0 && cache.inbox.length === 0) pose = "happy";

  return {
    cache,
    sections: ctx.settings.sections,
    max: Math.min(Math.max(Math.round(ctx.settings.maxItems), 1), 20),
    problem,
    snooze,
    focusing,
    pose,
    selected: ctx.storage.get<Selection>(KEY.selected),
    draft: ctx.storage.get<string>(KEY.draft) ?? "",
    confirm: confirm && Date.now() - confirm.at < CONFIRM_MS ? confirm.key : null,
    rate: { remaining: github.rate.remaining, limit: github.rate.limit },
  };
}

// MARK: Copied links

/** Copy a pull request or issue link and the island shows its title, state and author for a few seconds. */
async function showLinkSummary(text: string) {
  const link = github.parseGitHubLink(text);
  const token = await secrets.get("token");
  if (!link || !token) return;
  try {
    const item = await github.summarize(token, link.repo, link.number);
    const state = item.merged ? "merged" : item.state === "open" ? "open" : "closed";
    island.show({
      id: "github.link",
      duration: 8,
      compact: {
        leading: AdanotchKit.ui.icon(link.kind === "pull" ? "arrow.triangle.pull" : "exclamationmark.circle", { tone: "accent" }),
        trailing: AdanotchKit.ui.badge(state, { tone: item.merged ? "accent" : item.state === "open" ? "success" : "secondary" }),
      },
      expanded: AdanotchKit.ui.stack(
        [
          AdanotchKit.ui.text(item.title, { style: "title" }),
          AdanotchKit.ui.text(`${link.repo}#${link.number} · @${item.author} · ${item.comments} comment${item.comments === 1 ? "" : "s"}`, {
            style: "caption",
            tone: "secondary",
          }),
        ],
        { spacing: 4 },
      ),
    });
  } catch {
    // Not reachable or no access: a copied link is not worth an error.
  }
}
