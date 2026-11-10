// GitHub REST/GraphQL client: one place for headers, rate-limit bookkeeping and the shapes the views need.

export type Ci = "success" | "failure" | "pending" | "none";

export interface Pull {
  id: number;
  number: number;
  repo: string;
  title: string;
  url: string;
  apiUrl: string;
  author: string;
  draft: boolean;
  comments: number;
  updatedAt: string;
  ci?: Ci;
}

export interface Issue {
  id: number;
  number: number;
  repo: string;
  title: string;
  url: string;
  comments: number;
  updatedAt: string;
  /** First label's colour as `#rrggbb`. */
  color: string | null;
}

export interface Thread {
  id: string;
  title: string;
  repo: string;
  reason: string;
  type: string;
  /** The page to open: the subject's API URL turned into its web address. */
  url: string;
  updatedAt: string;
}

export interface Activity {
  /** Contributions per day, oldest first (28 days). */
  days: number[];
  total: number;
  fetchedAt: number;
}

export class GitHubError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "GitHubError";
  }
}

/** The last `X-RateLimit-*` headers seen. */
export const rate: { remaining: number | null; limit: number | null; reset: number | null } = {
  remaining: null,
  limit: null,
  reset: null,
};

const API = "https://api.github.com";

export async function gh(
  token: string,
  path: string,
  init: { method?: string; body?: unknown; etag?: string } = {},
): Promise<Response> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (init.etag) headers["If-None-Match"] = init.etag;
  const response = await fetch(path.startsWith("https://") ? path : API + path, {
    method: init.method ?? "GET",
    headers,
    body: init.body as undefined,
  });
  const number = (name: string) => {
    const value = response.headers.get(name);
    return value === null ? null : Number(value);
  };
  rate.remaining = number("x-ratelimit-remaining") ?? rate.remaining;
  rate.limit = number("x-ratelimit-limit") ?? rate.limit;
  rate.reset = number("x-ratelimit-reset") ?? rate.reset;
  return response;
}

/** `gh` that throws a readable `GitHubError` unless the answer is 2xx (or 304 when `allow304`). */
export async function ghJSON<T>(token: string, path: string, init: Parameters<typeof gh>[2] = {}): Promise<T> {
  const response = await gh(token, path, init);
  if (!response.ok) throw await failure(response);
  return response.json<T>();
}

async function failure(response: Response): Promise<GitHubError> {
  let message = response.statusText || `HTTP ${response.status}`;
  try {
    const body = await response.json<{ message?: string }>();
    if (body.message) message = body.message;
  } catch {
    // not JSON
  }
  if (response.status === 401) message = "Invalid or expired token";
  if (response.status === 403 && rate.remaining === 0) message = "GitHub rate limit reached";
  return new GitHubError(response.status, message);
}

const repoOf = (apiRepoUrl: string) => apiRepoUrl.replace(`${API}/repos/`, "");

interface SearchItem {
  id: number;
  number: number;
  title: string;
  html_url: string;
  repository_url: string;
  user: { login: string };
  draft?: boolean;
  comments: number;
  updated_at: string;
  labels: { color: string }[];
  pull_request?: { url: string };
}

async function search(token: string, query: string, limit: number): Promise<SearchItem[]> {
  const params = new URLSearchParams({ q: query, per_page: String(limit), sort: "updated" });
  return (await ghJSON<{ items: SearchItem[] }>(token, `/search/issues?${params}`)).items;
}

export async function reviewRequests(token: string, login: string, limit: number): Promise<Pull[]> {
  return (await search(token, `is:pr is:open archived:false review-requested:${login}`, limit)).map(toPull);
}

export async function myPulls(token: string, login: string, limit: number): Promise<Pull[]> {
  return (await search(token, `is:pr is:open archived:false author:${login}`, limit)).map(toPull);
}

export async function assignedIssues(token: string, login: string, limit: number): Promise<Issue[]> {
  return (await search(token, `is:issue is:open archived:false assignee:${login}`, limit)).map((item) => ({
    id: item.id,
    number: item.number,
    repo: repoOf(item.repository_url),
    title: item.title,
    url: item.html_url,
    comments: item.comments,
    updatedAt: item.updated_at,
    color: item.labels[0] ? `#${item.labels[0].color}` : null,
  }));
}

function toPull(item: SearchItem): Pull {
  return {
    id: item.id,
    number: item.number,
    repo: repoOf(item.repository_url),
    title: item.title,
    url: item.html_url,
    apiUrl: item.pull_request?.url ?? `${item.repository_url}/pulls/${item.number}`,
    author: item.user.login,
    draft: item.draft ?? false,
    comments: item.comments,
    updatedAt: item.updated_at,
  };
}

/** Roll the check runs of a PR's head commit up into one state. */
export async function ciState(token: string, pull: Pull): Promise<Ci> {
  const detail = await ghJSON<{ head: { sha: string } }>(token, pull.apiUrl);
  const runs = await ghJSON<{ check_runs: { status: string; conclusion: string | null }[] }>(
    token,
    `/repos/${pull.repo}/commits/${detail.head.sha}/check-runs?per_page=50`,
  );
  if (runs.check_runs.length === 0) return "none";
  if (runs.check_runs.some((run) => run.conclusion === "failure" || run.conclusion === "timed_out" || run.conclusion === "cancelled")) {
    return "failure";
  }
  if (runs.check_runs.some((run) => run.status !== "completed")) return "pending";
  return "success";
}

interface NotificationItem {
  id: string;
  reason: string;
  updated_at: string;
  subject: { title: string; type: string; url: string | null };
  repository: { full_name: string };
}

/** Unread notifications. `etag` makes an unchanged inbox a 304, which GitHub doesn't count against the rate limit. */
export async function notifications(
  token: string,
  etag: string | null,
  limit: number,
): Promise<{ threads: Thread[]; etag: string | null } | "unchanged"> {
  const response = await gh(token, `/notifications?per_page=${limit}`, { etag: etag ?? undefined });
  if (response.status === 304) return "unchanged";
  if (!response.ok) throw await failure(response);
  const items = await response.json<NotificationItem[]>();
  return {
    etag: response.headers.get("etag"),
    threads: items.map((item) => ({
      id: item.id,
      title: item.subject.title,
      repo: item.repository.full_name,
      reason: item.reason,
      type: item.subject.type,
      url: webURL(item.subject.url, item.repository.full_name),
      updatedAt: item.updated_at,
    })),
  };
}

/** `https://api.github.com/repos/o/r/pulls/7` → `https://github.com/o/r/pull/7`. */
export function webURL(apiURL: string | null, repo: string): string {
  if (!apiURL) return `https://github.com/${repo}`;
  return apiURL
    .replace(`${API}/repos/`, "https://github.com/")
    .replace("/pulls/", "/pull/")
    .replace("/commits/", "/commit/");
}

export async function markThreadRead(token: string, id: string): Promise<void> {
  const response = await gh(token, `/notifications/threads/${id}`, { method: "PATCH" });
  if (!response.ok && response.status !== 205) throw await failure(response);
}

export async function markAllRead(token: string): Promise<void> {
  const response = await gh(token, "/notifications", { method: "PUT", body: { last_read_at: new Date().toISOString() } });
  if (!response.ok && response.status !== 202 && response.status !== 205) throw await failure(response);
}

export async function approve(token: string, repo: string, number: number): Promise<void> {
  await ghJSON(token, `/repos/${repo}/pulls/${number}/reviews`, { method: "POST", body: { event: "APPROVE" } });
}

export async function comment(token: string, repo: string, number: number, body: string): Promise<void> {
  await ghJSON(token, `/repos/${repo}/issues/${number}/comments`, { method: "POST", body: { body } });
}

export async function whoAmI(token: string): Promise<string> {
  return (await ghJSON<{ login: string }>(token, "/user")).login;
}

/** The last 28 days of contributions, from the GraphQL calendar. */
export async function contributions(token: string): Promise<Activity> {
  const data = await ghJSON<{
    data: {
      viewer: {
        contributionsCollection: {
          contributionCalendar: { weeks: { contributionDays: { contributionCount: number }[] }[] };
        };
      };
    };
  }>(token, "/graphql", {
    method: "POST",
    body: {
      query:
        "{ viewer { contributionsCollection { contributionCalendar { weeks { contributionDays { contributionCount } } } } } }",
    },
  });
  const all = data.data.viewer.contributionsCollection.contributionCalendar.weeks.flatMap((week) =>
    week.contributionDays.map((day) => day.contributionCount),
  );
  const days = all.slice(-28);
  return { days, total: days.reduce((sum, count) => sum + count, 0), fetchedAt: Date.now() };
}

/** `https://github.com/o/r/pull/12` or `/issues/12` from a copied text. */
export function parseGitHubLink(text: string): { repo: string; number: number; kind: "pull" | "issues" } | null {
  const match = /^https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/(pull|issues)\/(\d+)(?:[/?#].*)?$/.exec(text.trim());
  return match ? { repo: match[1], kind: match[2] as "pull" | "issues", number: Number(match[3]) } : null;
}

export interface IssueSummary {
  title: string;
  state: string;
  author: string;
  comments: number;
  merged: boolean;
}

export async function summarize(token: string, repo: string, number: number): Promise<IssueSummary> {
  const item = await ghJSON<{
    title: string;
    state: string;
    user: { login: string };
    comments: number;
    pull_request?: { merged_at: string | null };
  }>(token, `/repos/${repo}/issues/${number}`);
  return {
    title: item.title,
    state: item.state,
    author: item.user.login,
    comments: item.comments,
    merged: Boolean(item.pull_request?.merged_at),
  };
}
