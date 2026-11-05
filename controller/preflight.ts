// Copyright The Linux Foundation and each contributor to LFX.
// SPDX-License-Identifier: MIT
export type Review = {
  id: number;
  state: string;
  body: string | null;
  commit_id?: string | null;
  submitted_at?: string | null;
  user: { login: string } | null;
};
export type Comment = {
  id: number;
  body?: string;
  html_url?: string;
  updated_at: string;
  user: { login: string } | null;
};
export type Event = {
  lfx_review_agent_event?: string;
  action?: string;
  number?: number;
  repository?: {
    full_name?: string;
    owner?: { login?: string };
    name?: string;
  };
  pull_request?: { number?: number; updated_at?: string };
  issue?: {
    number?: number;
    pull_request?: unknown;
    html_url?: string;
    user?: { login?: string };
  };
  comment?: {
    id?: number;
    body?: string;
    created_at?: string;
    author_association?: string;
    user?: { login?: string };
  };
};
export type Pr = {
  number: number;
  state: string;
  draft?: boolean;
  merged?: boolean;
  head: { sha: string };
  additions?: number;
  deletions?: number;
  changed_files?: number;
  review_comments?: number;
};
export const login = "lfx-one";
const marker = "<!-- lfx-review-agent:review -->";

export function readEvent(text: string): Event {
  const input = text.trim();
  let payload = input;
  if (input.startsWith("* This session was started at ")) {
    payload = input.slice(input.indexOf("\n\n") + 2).trim();
    if (payload.startsWith("```json\n")) {
      const end = payload.indexOf("\n```", 8);
      const block = JSON.parse(payload.slice(8, end));
      if ("workspace_capabilities" in block)
        payload = payload.slice(end + 4).trim();
    }
  }
  if (payload.startsWith("You just received a webhook from "))
    payload = payload.slice(payload.indexOf("```json\n"));
  const raw =
    payload.startsWith("```json\n") && payload.endsWith("\n```")
      ? payload.slice(8, -4)
      : payload;
  const value = JSON.parse(raw);
  return value.type === "text" && typeof value.text === "string"
    ? JSON.parse(value.text)
    : value;
}

export function eventDetails(event: Event, reviewerLogin = login) {
  const [fallbackOwner, fallbackRepo] = (event.repository?.full_name ?? "").split("/");
  const owner = event.repository?.owner?.login ?? fallbackOwner;
  const repo = event.repository?.name ?? fallbackRepo;
  if (owner !== "linuxfoundation" || !/^[A-Za-z0-9._-]+$/.test(repo ?? "")) return null;
  if (
    event.pull_request &&
    ["opened", "synchronize", "ready_for_review"].includes(event.action ?? "")
  ) {
    return {
      owner, repo, kind: event.action!,
      number: event.number ?? event.pull_request.number,
      time: event.pull_request.updated_at,
    };
  }
  const c = event.comment;
  if (
    event.action !== "created" ||
    !c ||
    !event.issue ||
    !(event.issue.pull_request || event.issue.html_url?.includes("/pull/")) ||
    !/^\s*@lfx-one\s+re-review\b/i.test(c.body ?? "") ||
    c.user?.login === reviewerLogin
  )
    return null;
  if (
    c.user?.login !== event.issue.user?.login &&
    c.author_association &&
    !["MEMBER", "OWNER", "COLLABORATOR"].includes(c.author_association)
  )
    return null;
  return { owner, repo, kind: "re-review", number: event.issue.number, time: c.created_at };
}

export function historyScope(kind: string, head: string, reviews: Review[], reviewerLogin = login) {
  const own = reviews.filter(
    (r) => r.user?.login === reviewerLogin && r.body?.includes(marker),
  );
  const relevant = own.filter((r) =>
    ["APPROVED", "CHANGES_REQUESTED", "COMMENTED", "DISMISSED"].includes(
      r.state,
    ),
  );
  const terminal = own.filter(
    (r) =>
      ["APPROVED", "CHANGES_REQUESTED"].includes(r.state) ||
      (r.state === "COMMENTED" &&
        r.body?.includes("<!-- lfx-review-agent:approval-withheld -->")),
  );
  const latest = relevant.toSorted((a, b) =>
    (b.submitted_at ?? "").localeCompare(a.submitted_at ?? ""),
  )[0];
  if (kind === "opened")
    return terminal.length
      ? { mode: "skip", reason: "already reviewed" }
      : { mode: "full" };
  if (!latest)
    return kind === "synchronize"
      ? { mode: "fallback", reason: "check first-review recovery" }
      : { mode: "full" };
  if (kind === "re-review" && (!latest.commit_id || latest.commit_id === head))
    return { mode: "full" };
  if (latest.commit_id === head)
    return { mode: "skip", reason: "head already reviewed" };
  if (!latest.commit_id)
    return { mode: "fallback", reason: "missing prior SHA" };
  return { mode: "delta", from: latest.commit_id, to: head };
}

export function commentClass(c: Comment) {
  const body = c.body ?? "";
  for (const [kind, pattern] of [
    ["excluded", /<!-- lfx-review-agent:excluded rule=\S+ -->/],
    ["cap", /<!-- lfx-review-agent:cap -->/],
    ["debounce", /<!-- lfx-review-agent:debounce -->/],
    ["skip", /<!-- lfx-review-agent:skip comment=\d+ -->/],
    ["stalled", /<!-- lfx-review-agent:stalled -->/],
    ["too-large", /<!-- lfx-review-agent:too-large -->/],
    ["abandoned", /<!-- lfx-review-agent:abandoned review=\d+ started=\S+ -->/],
  ] as const) {
    if (pattern.test(body)) return kind;
  }
  if (!/<!-- lfx-review-agent:session review=\d+ started=\S+ -->/.test(body))
    return "other";
  const summary = [
    "<!-- lfx-review-agent:summary -->", "Questions, problems, or feedback:",
    "*➡️ This auto-review agent is a preview.",
  ].some(s => body.includes(s));
  return summary ? "summary" : "start";
}

type Eligibility = {
  action: "delegate" | "proceed" | "running" | "cooldown";
  pending?: boolean;
  summary?: Comment;
};

export function eligibility(
  kind: string,
  time: string | undefined,
  pr: Pr,
  comments: Comment[],
  reviews: Review[] = [],
  reviewerLogin = login,
): Eligibility {
  if (kind === "re-review" || !time || !Number.isFinite(Date.parse(time)))
    return { action: "delegate" };
  if (
    (pr.additions ?? 0) + (pr.deletions ?? 0) > 20000 ||
    (pr.changed_files ?? 0) > 300 ||
    (pr.review_comments ?? 0) > 150
  )
    return { action: "delegate" };
  const own = comments
    .filter((c) => c.user?.login === reviewerLogin)
    .toSorted((a, b) => b.updated_at.localeCompare(a.updated_at) || b.id - a.id);
  const sessions = own.filter((c) =>
    c.body?.includes("lfx-review-agent:session"),
  );
  if (sessions.length >= 10) return { action: "delegate" };
  if (own.some((c) => c.body?.includes("lfx-review-agent:excluded")))
    return { action: "delegate" };
  const age = (c: Comment) => Math.max(0, Date.parse(time) - Date.parse(c.updated_at));
  const starts = own.filter(c => commentClass(c) === "start");
  if (own.some(c => !Number.isFinite(age(c))) ||
      sessions.some(c => {
        const start = c.body?.match(/<!-- lfx-review-agent:session review=\d+ started=(\S+) -->/);
        return !start || !Number.isFinite(Date.parse(start[1]));
      }) || starts.some(c => age(c) > 45 * 60000)) {
    return { action: "delegate" };
  }
  const live = reviews
    .filter(r => r.user?.login === reviewerLogin &&
      /<!-- lfx-review-agent:(review -->|excluded\b|too-large -->)/.test(r.body ?? "") &&
      ["APPROVED", "CHANGES_REQUESTED"].includes(r.state))
    .toSorted((a, b) => (b.submitted_at ?? "").localeCompare(a.submitted_at ?? "") || b.id - a.id)[0];
  if (starts.length) {
    return { action: live?.state === "APPROVED" ? "delegate" : "running", pending: true };
  }
  const recent = own.find(c => commentClass(c) !== "skip");
  if (kind !== "ready_for_review" && recent && age(recent) < 5 * 60000 &&
      !["abandoned", "stalled", "too-large"].includes(commentClass(recent))) {
    if (live?.state === "APPROVED") return { action: "delegate" };
    const summary = commentClass(recent) === "summary" ? recent : undefined;
    if (summary && !summary.html_url) return { action: "delegate" };
    const latest = reviews.filter(r => r.user?.login === reviewerLogin && r.body?.includes(marker))
      .toSorted((a, b) => (b.submitted_at ?? "").localeCompare(a.submitted_at ?? "") || b.id - a.id)[0];
    return { action: "cooldown", pending: latest?.commit_id !== pr.head.sha, summary };
  }
  return { action: "proceed" };
}
