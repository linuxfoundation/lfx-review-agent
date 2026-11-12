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
// Keep limits and marker classification in sync with PROMPT.md.
const MAX_DIFF_LINES = 20000;
const MAX_FILES = 300;
const MAX_REVIEW_COMMENTS = 150;
const MAX_REVIEWS = 10;
const STALE_START_MS = 45 * 60000;
const COOLDOWN_MS = 5 * 60000;

// Text used for marker matching (PROMPT.md "Read encoded markers as markers").
// Markdown code is removed first: this agent never writes a marker in code,
// while echoed or quoted text always sits there and may hold a literal or,
// from before 0.1.26, an encoded marker. Some runs posted markers
// HTML-encoded (`&lt;!-- ... --&gt;`); outside code those count as markers.
// For each line of `body`, whether it is Markdown block code: a fenced
// block (fences included) or an indented code block. Inline spans are
// handled by INLINE_SPAN below.
function codeLines(body: string): boolean[] {
  const code: boolean[] = [];
  let fence: { run: string; depth: number } | undefined;
  let indented = false;
  let blank = true;
  let prevDepth = 0;
  for (const line of body.split("\n")) {
    if (fence) {
      // Inside a fence, only the blockquote levels that hold it are
      // containers; any further `>` is code content, so it can't close it.
      const held = line.match(new RegExp(`^(?: {0,3}> ?){${fence.depth}}`));
      if (held) {
        const close = line.slice(held[0].length).match(/^ {0,3}(`{3,}|~{3,})\s*$/);
        prevDepth = fence.depth;
        if (close && close[1][0] === fence.run[0] && close[1].length >= fence.run.length) fence = undefined;
        blank = true;
        code.push(true);
        continue;
      }
      // A fence also ends with the blockquote that holds it.
      fence = undefined;
    }
    // Blockquote prefixes are containers: code inside them is still code.
    const quote = line.match(/^(?: {0,3}> ?)*/)![0];
    const depth = (quote.match(/>/g) ?? []).length;
    const inner = line.slice(quote.length);
    // A fence can open a list item (`- ~~~html`); its closing fence is
    // indented to the item's content, within the 0-3 spaces allowed.
    const open = inner.match(/^ {0,3}(?:(?:[-*+]|\d{1,9}[.)])[ \t]+)?(`{3,}|~{3,})(.*)$/);
    if (open && !(open[1][0] === "`" && open[2].includes("`"))) {
      fence = { run: open[1], depth };
      indented = false;
      code.push(true);
      continue;
    }
    // An indented code block starts a block (after a blank line, a fence or
    // a change of blockquote level; it can't interrupt a paragraph) and runs
    // until a non-blank line with less indentation.
    const isBlank = inner.trim() === "";
    if (depth !== prevDepth) blank = true;
    prevDepth = depth;
    if (!isBlank) indented = /^(?: {4}|\t| {0,3}\t)/.test(inner) && (indented || blank);
    blank = isBlank;
    code.push(indented);
  }
  return code;
}
// An inline span closes with a backtick run of the same length, within one
// paragraph, so a stray backtick can't hide markers further down.
const INLINE_SPAN = String.raw`(?<!\`)(\`+)(?!\`)(?:(?!\n[ \t]*\n)[\s\S])*?(?<!\`)\1(?!\`)`;
export function markerText(body: string | null | undefined) {
  const lines = (body ?? "").split("\n");
  const code = codeLines(body ?? "");
  return lines.filter((_, i) => !code[i]).join("\n")
    .replace(new RegExp(INLINE_SPAN, "g"), " ")
    .replaceAll("&lt;", "<").replaceAll("&gt;", ">");
}
// `body` with every HTML-escaped agent marker outside Markdown code written
// literally, or null when there is none. Escaped text in code is quoted
// content and stays as it is; only the marker's own `&lt;!--` and `--&gt;`
// change.
export function literalMarkers(body: string | null | undefined): string | null {
  if (!body?.includes("&lt;!--")) return null;
  const lines = body.split("\n");
  const code = codeLines(body);
  const pattern = new RegExp(`${INLINE_SPAN}|&lt;!--(\\s*lfx-review-agent:[a-z-]+\\b[^\\n]*?\\s*)--&gt;`, "g");
  const out: string[] = [];
  let run: string[] = [];
  const flush = () => {
    if (!run.length) return;
    out.push(run.join("\n").replace(pattern, (match, ticks, inner) => ticks ? match : `<!--${inner}-->`));
    run = [];
  };
  lines.forEach((line, i) => {
    if (code[i]) {
      flush();
      out.push(line);
    } else run.push(line);
  });
  flush();
  const fixed = out.join("\n");
  return fixed === body ? null : fixed;
}
// Review IDs the reviewer's Step 7 report links for this pull request
// (`.../pull/<n>#pullrequestreview-<id>`): the reviews this run posted.
// Plain arrays, not Sets: the controller's state is saved as JSON between
// tool calls.
export function reportedReviewIds(text: string, owner: string, repo: string, number: number): number[] {
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const url = new RegExp(`github\\.com/${esc(owner)}/${esc(repo)}/pull/${number}#pullrequestreview-(\\d+)`, "gi");
  return [...new Set([...text.matchAll(url)].map((m) => Number(m[1])))];
}
// Own reviews this run posted (linked in its report and absent from the
// list read before the reviewer ran) whose body carries an escaped marker,
// with the literal body. Every other review is left alone.
export function escapedNewReviews(
  after: Review[], beforeIds: number[], postedIds: number[], reviewerLogin = login,
): { id: number; body: string }[] {
  return after.flatMap((r) => {
    if (r.user?.login !== reviewerLogin || beforeIds.includes(r.id) || !postedIds.includes(r.id)) return [];
    const body = literalMarkers(r.body);
    return body ? [{ id: r.id, body }] : [];
  });
}

// Decodes only this agent's own bodies; other accounts' text stays as written.
function decodeOwn<T extends { body?: string | null; user: { login: string } | null }>(
  items: T[], reviewerLogin: string,
): T[] {
  return items.map((i) => i.user?.login === reviewerLogin ? { ...i, body: markerText(i.body) } : i);
}

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

export function historyScope(kind: string, head: string, history: Review[], reviewerLogin = login) {
  const reviews = decodeOwn(history, reviewerLogin);
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
      ? { mode: "undecided", reason: "check first-review recovery" }
      : { mode: "full" };
  if (kind === "re-review" && (!latest.commit_id || latest.commit_id === head))
    return { mode: "full" };
  if (latest.commit_id === head)
    return { mode: "skip", reason: "head already reviewed" };
  if (!latest.commit_id)
    return { mode: "undecided", reason: "missing prior SHA" };
  return { mode: "delta", from: latest.commit_id, to: head };
}

export function commentClass(c: Comment) {
  const body = markerText(c.body);
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
  history: Comment[],
  reviewHistory: Review[] = [],
  reviewerLogin = login,
): Eligibility {
  const comments = decodeOwn(history, reviewerLogin);
  const reviews = decodeOwn(reviewHistory, reviewerLogin);
  if (kind === "re-review" || !time || !Number.isFinite(Date.parse(time)))
    return { action: "delegate" };
  if (
    (pr.additions ?? 0) + (pr.deletions ?? 0) > MAX_DIFF_LINES ||
    (pr.changed_files ?? 0) > MAX_FILES ||
    (pr.review_comments ?? 0) > MAX_REVIEW_COMMENTS
  )
    return { action: "delegate" };
  const own = comments
    .filter((c) => c.user?.login === reviewerLogin)
    .toSorted((a, b) => b.updated_at.localeCompare(a.updated_at) || b.id - a.id);
  const sessions = own.filter((c) =>
    c.body?.includes("lfx-review-agent:session"),
  );
  if (sessions.length >= MAX_REVIEWS) return { action: "delegate" };
  if (own.some((c) => c.body?.includes("lfx-review-agent:excluded")))
    return { action: "delegate" };
  const age = (c: Comment) => Math.max(0, Date.parse(time) - Date.parse(c.updated_at));
  const starts = own.filter(c => commentClass(c) === "start");
  if (own.some(c => !Number.isFinite(age(c))) ||
      sessions.some(c => {
        const start = c.body?.match(/<!-- lfx-review-agent:session review=\d+ started=(\S+) -->/);
        return !start || !Number.isFinite(Date.parse(start[1]));
      }) || starts.some(c => age(c) > STALE_START_MS)) {
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
  if (kind !== "ready_for_review" && recent && age(recent) < COOLDOWN_MS &&
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
