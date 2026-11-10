// What the island shows. Pure functions of a `Model`; index.ts owns the state and the network.

import type { Activity, Ci, Issue, Pull, Thread } from "./github";

const { ui } = AdanotchKit;

export interface Cache {
  login: string | null;
  reviews: Pull[];
  mine: Pull[];
  issues: Issue[];
  inbox: Thread[];
  inboxEtag: string | null;
  activity: Activity | null;
  fetchedAt: number;
}

export interface Selection {
  repo: string;
  number: number;
  title: string;
  url: string;
}

export interface Model {
  cache: Cache;
  sections: string[];
  max: number;
  /** Why the numbers might be stale: offline, bad token, rate limit. */
  problem: string | null;
  snooze: { start: number; end: number } | null;
  focusing: boolean;
  pose: Adanotch.PetPose;
  selected: Selection | null;
  draft: string;
  /** "repo#number" waiting for a second tap on ✓. */
  confirm: string | null;
  rate: { remaining: number | null; limit: number | null };
}

export function ago(iso: string, now = Date.now()): string {
  const minutes = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours} h` : `${Math.round(hours / 24)} d`;
}

const CI_ICON: Record<Ci, { icon: string; tone: Adanotch.Tone }> = {
  success: { icon: "checkmark.circle.fill", tone: "success" },
  failure: { icon: "xmark.octagon.fill", tone: "danger" },
  pending: { icon: "clock.fill", tone: "warning" },
  none: { icon: "circle", tone: "secondary" },
};

const REASONS: Record<string, string> = {
  review_requested: "review",
  mention: "mention",
  assign: "assigned",
  author: "author",
  comment: "comment",
  ci_activity: "CI",
  subscribed: "subscribed",
  team_mention: "team",
};

// MARK: Compact

export function compact(model: Model): Adanotch.Compact {
  const { cache } = model;
  const failing = cache.mine.filter((pull) => pull.ci === "failure").length;
  const trailing = model.snooze
    ? ui.icon("bell.slash.fill", { tone: "secondary" })
    : cache.reviews.length > 0
      ? ui.badge(String(cache.reviews.length), { tone: "warning" })
      : failing > 0
        ? ui.badge("✗", { tone: "danger" })
        : cache.inbox.length > 0
          ? ui.text(String(cache.inbox.length), { style: "caption", tone: "secondary" })
          : null;
  return { leading: ui.pet("active", model.pose), trailing };
}

// MARK: Expanded

export function expanded(model: Model): Adanotch.Node {
  const tabs: Adanotch.Tab[] = [];
  if (model.sections.includes("reviews")) tabs.push({ title: "Reviews", icon: "eye", content: reviewsTab(model) });
  if (model.sections.includes("mine")) tabs.push({ title: "My PRs", icon: "arrow.triangle.pull", content: minePullsTab(model) });
  if (model.sections.includes("issues")) tabs.push({ title: "Issues", icon: "exclamationmark.circle", content: issuesTab(model) });
  if (model.sections.includes("inbox")) tabs.push({ title: "Inbox", icon: "tray", content: inboxTab(model) });
  tabs.push({ title: "Activity", icon: "chart.bar", content: activityTab(model) });

  return ui.stack(
    [header(model), ui.tabs(tabs), model.selected && composer(model, model.selected)],
    { spacing: 8 },
  );
}

function header(model: Model): Adanotch.Node {
  const { cache, snooze } = model;
  return ui.stack(
    [
      ui.text("GitHub", { style: "title" }),
      cache.login ? ui.text(`@${cache.login}`, { style: "caption", tone: "secondary" }) : null,
      model.focusing && ui.badge("Focus", { tone: "accent" }),
      model.problem ? ui.badge(model.problem, { tone: "danger" }) : null,
      ui.spacer(),
      model.rate.remaining !== null &&
        ui.text(`API ${model.rate.remaining}/${model.rate.limit ?? "?"}`, { style: "caption", tone: "secondary" }),
      snooze
        ? ui.button("", "wake", { icon: "bell.fill" })
        : ui.button("", "snooze", { icon: "bell.slash", value: 60 }),
      ui.button("", "refresh", { icon: "arrow.clockwise" }),
    ],
    { axis: "h", spacing: 8, align: "center" },
  );
}

function openButton(url: string) {
  return { icon: "arrow.up.right.square", label: "Open in browser", action: "open", value: url };
}

function selectValue(repo: string, number: number, title: string, url: string) {
  return { repo, number, title, url };
}

function empty(model: Model, text: string, pose: Adanotch.PetPose = "happy"): Adanotch.Node {
  return ui.stack([ui.pet("active", pose, { size: 44 }), ui.text(text, { tone: "secondary" })], {
    axis: "h",
    spacing: 12,
    align: "center",
  });
}

function reviewsTab(model: Model): Adanotch.Node {
  const items = model.cache.reviews.slice(0, model.max);
  if (items.length === 0) return empty(model, "No pending review requests. Inbox zero!");
  return ui.list(
    items.map((pull) => {
      const key = `${pull.repo}#${pull.number}`;
      const confirming = model.confirm === key;
      return {
        title: pull.title,
        subtitle: confirming
          ? "Press ✓ once more to approve"
          : `${pull.repo}#${pull.number} · @${pull.author}${pull.draft ? " · draft" : ""}`,
        icon: pull.draft ? "pencil.circle" : "eye.circle.fill",
        tone: confirming ? "danger" : "warning",
        trailing: ago(pull.updatedAt),
        action: "select",
        value: selectValue(pull.repo, pull.number, pull.title, pull.url),
        buttons: [
          openButton(pull.url),
          confirming
            ? { icon: "checkmark.circle.fill", label: "Approve (are you sure?)", action: "approve", value: { repo: pull.repo, number: pull.number } }
            : { icon: "checkmark.circle", label: "Approve", action: "approve", value: { repo: pull.repo, number: pull.number } },
        ],
      };
    }),
  );
}

function minePullsTab(model: Model): Adanotch.Node {
  const items = model.cache.mine.slice(0, model.max);
  if (items.length === 0) return empty(model, "You have no open PRs.", "idle");
  return ui.list(
    items.map((pull) => {
      const ci = CI_ICON[pull.ci ?? "none"];
      return {
        title: pull.title,
        subtitle: `${pull.repo}#${pull.number}${pull.draft ? " · draft" : ""} · ${pull.comments} comment${pull.comments === 1 ? "" : "s"}`,
        icon: ci.icon,
        tone: ci.tone,
        trailing: ago(pull.updatedAt),
        action: "select",
        value: selectValue(pull.repo, pull.number, pull.title, pull.url),
        buttons: [openButton(pull.url)],
      };
    }),
  );
}

function issuesTab(model: Model): Adanotch.Node {
  const items = model.cache.issues.slice(0, model.max);
  if (items.length === 0) return empty(model, "No open issues assigned to you.");
  return ui.list(
    items.map((issue) => ({
      title: issue.title,
      subtitle: `${issue.repo}#${issue.number} · ${issue.comments} comment${issue.comments === 1 ? "" : "s"}`,
      swatch: issue.color ?? undefined,
      icon: "exclamationmark.circle",
      trailing: ago(issue.updatedAt),
      action: "select",
      value: selectValue(issue.repo, issue.number, issue.title, issue.url),
      buttons: [openButton(issue.url)],
    })),
  );
}

function inboxTab(model: Model): Adanotch.Node {
  const items = model.cache.inbox.slice(0, model.max);
  if (items.length === 0) return empty(model, "No unread notifications.");
  return ui.stack(
    [
      ui.list(
        items.map((thread) => ({
          title: thread.title,
          subtitle: `${thread.repo} · ${REASONS[thread.reason] ?? thread.reason}`,
          icon: thread.type === "PullRequest" ? "arrow.triangle.pull" : "bell",
          trailing: ago(thread.updatedAt),
          action: "open",
          value: thread.url,
          buttons: [{ icon: "checkmark", label: "Mark as read", action: "read", value: thread.id }],
        })),
      ),
      ui.button("Mark all as read", "read-all", { icon: "checkmark.circle" }),
    ],
    { spacing: 6 },
  );
}

function activityTab(model: Model): Adanotch.Node {
  const { activity } = model.cache;
  const now = Date.now();
  const days = activity?.days ?? [];
  const sum = (count: number) => days.slice(-count).reduce((total, value) => total + value, 0);
  return ui.stack(
    [
      activity
        ? ui.stack(
            [
              ui.chart(days, { style: "bar", min: 0, tone: "success" }),
              ui.table(
                ["Period", "Contributions"],
                [
                  ["Today", sum(1)],
                  ["Last 7 days", sum(7)],
                  ["Last 28 days", activity.total],
                ],
              ),
            ],
            { spacing: 8 },
          )
        : ui.text("Loading contribution chart…", { tone: "secondary" }),
      model.snooze
        ? ui.countdown(model.snooze.start, model.snooze.end, { label: "Notifications snoozed", tone: "warning" })
        : ui.datePicker("snooze-until", now + 3_600_000, { mode: "dateTime", label: "Snooze notifications until" }),
    ],
    { spacing: 10 },
  );
}

function composer(model: Model, selected: Selection): Adanotch.Node {
  return ui.stack(
    [
      ui.divider(),
      ui.stack(
        [
          ui.icon("text.bubble", { tone: "accent" }),
          ui.text(`${selected.repo}#${selected.number} · ${selected.title}`, { style: "caption", tone: "secondary" }),
          ui.spacer(),
          ui.button("", "cancel", { icon: "xmark" }),
        ],
        { axis: "h", spacing: 6, align: "center" },
      ),
      ui.textArea("comment", { value: model.draft, placeholder: "Write a comment… (⌘↩ to send)", changeAction: "draft", lines: 3 }),
      ui.stack(
        [
          ui.button("Send", "send", { icon: "paperplane.fill", primary: true }),
          ui.button("Open", "open", { icon: "arrow.up.right.square", value: selected.url }),
        ],
        { axis: "h", spacing: 8 },
      ),
    ],
    { spacing: 6 },
  );
}

export function onboarding(): Adanotch.View {
  return {
    compact: { leading: ui.icon("key.fill", { tone: "warning" }) },
    expanded: ui.stack(
      [
        ui.text("Connect GitHub Hub", { style: "title" }),
        ui.markdown(
          "You need a **personal access token** with the `repo`, `notifications` and `read:user` scopes. " +
            "Paste it in Settings › Extensions › GitHub Hub; it is stored in the Keychain.",
        ),
        ui.button("Create a token", "open", {
          icon: "key",
          primary: true,
          value: "https://github.com/settings/tokens/new?scopes=repo,notifications,read:user&description=Adanotch",
        }),
      ],
      { spacing: 10 },
    ),
  };
}
