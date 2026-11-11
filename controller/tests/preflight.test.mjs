// Copyright The Linux Foundation and each contributor to LFX.
// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import test from "node:test";
import {
  eligibility,
  eventDetails,
  historyScope,
  login,
  readEvent,
} from "../dist/preflight.js";
const canSkipScope = (...args) => eligibility(...args).action === "proceed";

test("webhook payload survives the Guild chat JSON envelope and preamble", () => {
  const payload = { action: "opened", number: 15 };
  const wrapped = JSON.stringify({
    type: "text",
    text: JSON.stringify(payload),
  });
  assert.deepEqual(readEvent(JSON.stringify(payload)), payload);
  assert.deepEqual(
    readEvent(
      '* This session was started at 01:00.\n\n```json\n{"workspace_capabilities":{}}\n```\n\n{\n"action": "opened",\n\n"number": 15\n}',
    ),
    payload,
  );
  assert.deepEqual(
    readEvent(
      '* This session was started at 01:00.\n\n```json\n{"workspace_capabilities":{}}\n```\n\n' +
        JSON.stringify(payload),
    ),
    payload,
  );
  assert.deepEqual(
    readEvent(
      "* This session was started at 01:00.\n\n```json\n" + wrapped + "\n```",
    ),
    payload,
  );
  assert.throws(() => readEvent("not a webhook payload"), SyntaxError);
});
test("default webhook prompt yields its full payload", () => {
  const payload = { action: "opened", number: 15, pull_request: { body: "```json\n{}\n```" } };
  const prompt = `\nYou just received a webhook from lfx-one-github. The webhook is of event "pull_request"\nand the action is "opened". The payload is:\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\`\n`;
  assert.deepEqual(readEvent(prompt), payload);
});
const marked = (state, sha = "a", extra = {}) => ({
  id: 1,
  state,
  commit_id: sha,
  submitted_at: "2026-11-04T00:00:00Z",
  user: { login },
  body: "<!-- lfx-review-agent:review -->",
  ...extra,
});
const pr = { number: 15, state: "open", head: { sha: "a" } };
const event = {
  repository: { full_name: "linuxfoundation/lfx-test" },
  action: "created",
  issue: { number: 15, pull_request: {}, user: { login: "author" } },
  comment: {
    body: "@lfx-one re-review",
    user: { login: "author" },
    created_at: "2026-11-04T01:00:00Z",
  },
};
test("explicit request permits the PR author and rejects own or ordinary comments", () => {
  assert.equal(eventDetails(event).kind, "re-review");
  assert.equal(
    eventDetails({ ...event, comment: { ...event.comment, user: { login } } }),
    null,
  );
  assert.equal(
    eventDetails({
      ...event,
      comment: { ...event.comment, body: "looks good" },
    }),
    null,
  );
  assert.equal(
    eventDetails({
      ...event,
      comment: {
        ...event.comment,
        user: { login: "outsider" },
        author_association: "NONE",
      },
    }),
    null,
  );
  assert.equal(
    eventDetails({
      ...event,
      repository: { full_name: "other-org/lfx-test" },
    }),
    null,
  );
});
test("unknown commenter association proceeds for authenticated history resolution", () => {
  assert.equal(
    eventDetails({
      ...event,
      comment: { ...event.comment, user: { login: "unknown" } },
    }).kind,
    "re-review",
  );
});
test("same HEAD skips automatic review but explicit re-review is full scope", () => {
  const reviews = [marked("APPROVED")];
  assert.equal(historyScope("synchronize", "a", reviews).mode, "skip");
  assert.equal(historyScope("re-review", "a", reviews).mode, "full");
  assert.deepEqual(historyScope("synchronize", "b", reviews), {
    mode: "delta",
    from: "a",
    to: "b",
  });
});
test("dismissed and partial reviews advance scope independently of the verdict", () => {
  const reviews = [
    marked("APPROVED"),
    marked("DISMISSED", "b", { id: 2, submitted_at: "2026-11-04T00:01:00Z" }),
  ];
  assert.equal(historyScope("synchronize", "b", reviews).mode, "skip");
  reviews.push(
    marked("COMMENTED", "c", { id: 3, submitted_at: "2026-11-04T00:02:00Z" }),
  );
  assert.deepEqual(historyScope("synchronize", "d", reviews), {
    mode: "delta",
    from: "c",
    to: "d",
  });
  assert.equal(
    historyScope("ready_for_review", "x", [
      marked("DISMISSED", undefined, { commit_id: undefined }),
    ]).mode,
    "undecided",
  );
});
test("other tools using the same account do not count as own reviews", () => {
  assert.equal(
    historyScope("opened", "a", [
      marked("APPROVED", "a", { body: "another tool" }),
    ]).mode,
    "full",
  );
  assert.equal(
    historyScope("opened", "a", [
      marked("APPROVED", "a", { user: { login: "other" } }),
    ]).mode,
    "full",
  );
  assert.equal(historyScope("opened", "a", [marked("COMMENTED")]).mode, "full");
  assert.equal(
    historyScope("opened", "a", [
      marked("COMMENTED", "a", {
        body: "<!-- lfx-review-agent:review --> <!-- lfx-review-agent:approval-withheld -->",
      }),
    ]).mode,
    "skip",
  );
});
test("missing first review delegates recovery instead of skipping", () => {
  assert.equal(historyScope("synchronize", "a", []).mode, "undecided");
});
test("HTML-encoded own markers count as markers; other logins still do not", () => {
  const encode = (s) => s.replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  const review = encode("<!-- lfx-review-agent:review --> <!-- lfx-review-agent:review-of review=1 -->");
  assert.deepEqual(historyScope("synchronize", "b", [marked("CHANGES_REQUESTED", "a", { body: review })]), {
    mode: "delta", from: "a", to: "b",
  });
  assert.equal(
    historyScope("synchronize", "b", [marked("CHANGES_REQUESTED", "a", { body: review, user: { login: "other" } })]).mode,
    "undecided",
  );
  const time = "2026-11-04T01:00:00Z";
  const start = encode("<!-- lfx-review-agent:session review=2 started=2026-11-04T00:58:00Z -->");
  const own = (body) => ({ id: 2, body, updated_at: "2026-11-04T00:58:30Z", user: { login }, html_url: "https://example.test/c" });
  const prB = { ...pr, head: { sha: "b" } };
  assert.equal(eligibility("synchronize", time, prB, [own(start)]).action, "running");
  assert.equal(
    eligibility("synchronize", time, prB, [own(start + encode("\n<!-- lfx-review-agent:summary -->"))]).action,
    "cooldown",
  );
  // Markdown code is never a marker, literal or encoded, in any code form.
  const summary = start + "\n<!-- lfx-review-agent:summary -->\n";
  for (const quoted of [
    "Changed: `&lt;!-- lfx-review-agent:stalled --&gt;`",
    "Quoted: `<!-- lfx-review-agent:stalled -->`",
    "Quoted: `` a`b <!-- lfx-review-agent:stalled --> ``",
    "Quoted: `first line\n&lt;!-- lfx-review-agent:stalled --&gt;`",
    "```text\n&lt;!-- lfx-review-agent:skip comment=1 --&gt;\n```",
    "~~~\n<!-- lfx-review-agent:too-large -->\n~~~",
    "````md\n```\n&lt;!-- lfx-review-agent:abandoned review=1 started=x --&gt;\n````",
    "```text\n&lt;!-- lfx-review-agent:too-large --&gt;",
    "\n    &lt;!-- lfx-review-agent:stalled --&gt;",
    "\n\t<!-- lfx-review-agent:stalled -->",
    "> ```\n> &lt;!-- lfx-review-agent:stalled --&gt;\n> ```",
    ">\n>     &lt;!-- lfx-review-agent:stalled --&gt;",
    // A `>` line inside a fence is code content, not a closing fence.
    "```\n> ```\n&lt;!-- lfx-review-agent:stalled --&gt;\n```",
    "> ~~~\n> > ~~~\n> &lt;!-- lfx-review-agent:stalled --&gt;\n> ~~~",
  ]) {
    assert.equal(eligibility("synchronize", time, prB, [own(summary + quoted)]).action, "cooldown", quoted);
  }
  // A stray backtick does not hide a marker in a later paragraph.
  assert.equal(eligibility("synchronize", time, prB, [own(start + "\nRun `x\n\n" + encode("<!-- lfx-review-agent:summary -->"))]).action, "cooldown");
  // Indentation that continues a paragraph is not code, and a fence ends with
  // the blockquote that holds it.
  for (const body of [
    start + "\nSee below\n    " + encode("<!-- lfx-review-agent:summary -->"),
    start + "\n> ```\n> x\n\n" + encode("<!-- lfx-review-agent:summary -->"),
  ]) {
    assert.equal(eligibility("synchronize", time, prB, [own(body)]).action, "cooldown", body);
  }
  assert.equal(
    historyScope("synchronize", "b", [marked("CHANGES_REQUESTED", "a", { body: "`&lt;!-- lfx-review-agent:review --&gt;`" })]).mode,
    "undecided",
  );
});
test("safe skips preserve cap, recent-comment, in-progress and exclusion side effects", () => {
  const comment = {
    id: 1,
    user: { login },
    updated_at: "2026-11-04T00:00:00Z",
    body: "<!-- lfx-review-agent:session review=1 started=2026-11-04T00:00:00Z --> <!-- lfx-review-agent:summary -->",
  };
  const now = "2026-11-04T00:10:00Z";
  assert.equal(canSkipScope("synchronize", now, pr, [comment]), true);
  assert.equal(canSkipScope("re-review", now, pr, [comment]), false);
  assert.equal(
    canSkipScope("synchronize", "2026-11-04T00:02:00Z", pr, [comment]),
    false,
  );
  assert.equal(
    canSkipScope("synchronize", now, pr, [
      { ...comment, body: "<!-- lfx-review-agent:session review=1 -->" },
    ]),
    false,
  );
  assert.equal(
    canSkipScope("synchronize", now, pr, [
      {
        ...comment,
        body: "<!-- lfx-review-agent:excluded rule=meeting-ics -->",
      },
    ]),
    false,
  );
  assert.equal(
    canSkipScope("synchronize", now, pr, Array(10).fill(comment)),
    false,
  );
  assert.equal(
    canSkipScope("synchronize", now, { ...pr, additions: 20001 }, []),
    false,
  );
  assert.equal(canSkipScope("synchronize", "invalid", pr, []), false);
  assert.equal(
    canSkipScope("ready_for_review", "2026-11-04T00:02:00Z", pr, [comment]),
    true,
  );
});
