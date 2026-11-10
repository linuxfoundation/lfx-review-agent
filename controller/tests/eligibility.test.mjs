// Copyright The Linux Foundation and each contributor to LFX.
// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import vm from "node:vm";
import * as preflight from "../dist/preflight.js";
import * as metadata from "../dist/metadata.js";
import agent from "../dist/agent.compiled.js";

const code = fs.readFileSync(new URL("../dist/agent.compiled.js", import.meta.url), "utf8");
const factory = vm.runInNewContext(
  code.slice(code.indexOf("function $getStateMachine()")) + "\n$getStateMachine;", { ...preflight, ...metadata },
);
const now = "2026-11-04T01:00:00Z";
const comment = (body, updated_at = now, extra = {}) => ({
  id: 1, body, updated_at, user: { login: preflight.login }, ...extra,
});
const start = "<!-- lfx-review-agent:session review=1 started=2026-11-04T00:30:00Z -->";
const review = (state, extra = {}) => ({
  id: 1, state, body: "<!-- lfx-review-agent:review -->", user: { login: preflight.login },
  commit_id: "a", submitted_at: now, ...extra,
});
const pr = { number: 15, state: "open", head: { sha: "b" }, base: { sha: "base" }, user: { login: "author" } };
const event = {
  repository: { full_name: "linuxfoundation/lfx-test" }, action: "opened",
  number: 15, pull_request: { updated_at: now },
};
const gate = (comments, reviews = [], kind = "opened", metadata = pr) =>
  preflight.eligibility(kind, now, metadata, comments, reviews).action;
const report = "https://github.com/linuxfoundation/lfx-test/pull/15#issuecomment-1";
const summary = comment(start + "<!-- lfx-review-agent:summary -->", now, { html_url: report });

async function dispatch(comments = [], reviews = [], input = event, overrides = {}, reviewerLogin = preflight.login) {
  const calls = [];
  const task = { env: { REVIEWER_LOGIN: reviewerLogin }, tools: Object.fromEntries(Object.entries({
    lfx_one_github_pulls_get: async () => pr,
    lfx_one_github_pulls_list_reviews: async p => reviews.slice((p.page - 1) * 100, p.page * 100),
    lfx_one_github_issues_list_comments: async p => comments.slice((p.page - 1) * 100, p.page * 100),
    lfx_one_github_issues_add_labels: async () => [],
    lfx_one_github_issues_create_comment: async p => comment(p.body, now, { id: 200 }),
    lfx_one_github_issues_update_comment: async () => ({}),
    reviewer: async () => ({ type: "text", text: "reviewed" }),
    ...overrides,
  }).map(([name, fn]) => [name, async p => {
    calls.push([name, JSON.parse(JSON.stringify(p))]);
    const tool = agent.tools[name];
    if (name === "reviewer") assert.deepEqual(Object.keys(p), ["text"]);
    const raw = await fn(tool.inputSchema.parse(p));
    const schema = tool.providerOptions?.guild?.endpoint?.responseSchema;
    return tool.outputSchema.parse(schema ? schema.parse(raw) : raw);
  }])) };
  let machine = factory();
  let result = machine.step({ type: "start", input: [{ type: "text", text: typeof input === "string" ? input : JSON.stringify(input) }, task] });
  while (result.type === "await") {
    let resolution;
    try { resolution = { type: "resolve", value: await result.promise }; }
    catch (error) { resolution = { type: "reject", value: error }; }
    const snapshot = JSON.parse(JSON.stringify(machine.get(), (_, v) => v === task ? { taskReference: true } : v),
      (_, v) => v?.taskReference === true ? task : v);
    machine = factory();
    machine.set(snapshot);
    result = machine.step(resolution);
  }
  assert.equal(result.type, "return");
  return { text: result.value.text, calls, worker: calls.filter(([name]) => name === "reviewer").length };
}

test("running start is independent of newer superseded comments; summaries and foreign markers are not starts", () => {
  assert.equal(gate([comment(start, "2026-11-04T00:30:00Z"), comment("<!-- lfx-review-agent:superseded review=1 -->")]), "running");
  for (const signal of ["<!-- lfx-review-agent:summary -->", "Questions, problems, or feedback:", "*➡️ This auto-review agent is a preview."]) {
    assert.equal(gate([comment(start + signal, "2026-11-04T00:50:00Z")]), "proceed");
  }
  assert.equal(gate([comment(start, now, { user: { login: "other" } })]), "proceed");
  assert.equal(gate([comment("<!-- another-tool:session review=1 -->", "2026-11-04T00:50:00Z")]), "proceed");
  assert.equal(gate([comment(start, "2026-11-04T00:15:00Z")]), "running");
  assert.equal(gate([comment(start, "2026-11-04T01:01:00Z")]), "running");
  assert.equal(gate([comment("<!-- lfx-review-agent:abandoned review=1 started=2026-11-04T00:30:00Z -->", "2026-11-04T00:50:00Z")]), "proceed");
});
test("cooldown follows latest own edit, ignores skip replies, and exempts recovery and ready events", () => {
  assert.equal(gate([summary]), "cooldown");
  assert.equal(gate([{ ...summary, created_at: "2026-10-01T00:00:00Z" }]), "cooldown");
  assert.equal(gate([{ ...summary, updated_at: "2026-11-04T00:55:00Z" }]), "proceed");
  assert.equal(gate([{ ...summary, updated_at: "2026-11-04T01:01:00Z" }]), "cooldown");
  assert.equal(gate([summary], [], "ready_for_review"), "proceed");
  for (const body of ["<!-- lfx-review-agent:skip comment=9 -->", "<!-- lfx-review-agent:stalled -->",
    "<!-- lfx-review-agent:too-large -->", "<!-- lfx-review-agent:abandoned review=1 started=2026-11-04T00:30:00Z -->"]) {
    assert.equal(gate([comment(body)]), "proceed");
  }
  for (const body of ["<!-- lfx-review-agent:debounce -->", "<!-- lfx-review-agent:cap -->", "manual note"]) {
    assert.equal(gate([comment(body)]), "cooldown");
  }
  assert.equal(gate([{ ...summary, html_url: undefined }]), "delegate");
  assert.equal(gate([summary], [review("APPROVED")]), "delegate");
  assert.equal(gate([summary], [review("APPROVED", { user: pr.user })]), "cooldown");
});
test("compiled cooldown publishes one notice, reconciles races and preserves the pending-label rule", async () => {
  const notices = [];
  const overrides = {
    lfx_one_github_issues_create_comment: async p => { const c = comment(p.body, now, { id: 200 }); notices.push(c); return c; },
    lfx_one_github_issues_list_comments: async p => [summary, ...notices].slice((p.page - 1) * 100, p.page * 100),
  };
  const first = await dispatch([summary], [], event, overrides);
  assert.equal(first.worker, 0);
  assert.equal(notices.length, 1);
  assert.match(notices[0].body, /A recent review was posted within the last 5 minutes:/);
  assert.ok(notices[0].body.includes(report));
  assert.match(first.text, /Pending label added/);
  const repeated = await dispatch([summary, ...notices]);
  assert.equal(repeated.worker, 0);
  assert.equal(repeated.calls.some(([n]) => n === "lfx_one_github_issues_create_comment"), false);
  const same = await dispatch([summary], [review("CHANGES_REQUESTED", { commit_id: "b" })], event, overrides);
  assert.equal(same.calls.some(([n]) => n === "lfx_one_github_issues_add_labels"), false);
  for (const duplicate of [false, true]) {
    let reads = 0;
    const raced = await dispatch([summary], [], event, { ...overrides,
      lfx_one_github_issues_list_comments: async p => ++reads === 1 ? [summary] :
        p.page === 1 ? Array(100).fill(comment("unrelated", now, { user: pr.user })) :
          [comment(`<!-- lfx-review-agent:debounce --> ${duplicate ? report : report + "0"}`, now, { id: 199 })],
      lfx_one_github_issues_update_comment: async p => { assert.equal(p.comment_id, 200); assert.match(p.body, /superseded notice=debounce/); return {}; },
    });
    assert.equal(raced.worker, 0);
    assert.doesNotMatch(raced.text, /failed/);
    assert.equal(raced.calls.some(([n]) => n === "lfx_one_github_issues_update_comment"), duplicate);
  }
  for (const tool of ["lfx_one_github_issues_create_comment", "lfx_one_github_issues_list_comments", "lfx_one_github_issues_update_comment"]) {
    let reads = 0;
    const failed = await dispatch([summary], [], event, { ...overrides,
      [tool]: async () => { throw Error("denied"); },
      lfx_one_github_issues_list_comments: async () => {
        if (++reads === 1) return [summary];
        if (tool === "lfx_one_github_issues_list_comments") throw Error("denied");
        return [comment(`<!-- lfx-review-agent:debounce --> ${report}`, now, { id: 199 })];
      },
    });
    assert.equal(failed.worker, 0);
    assert.match(failed.text, /failed/);
  }
  assert.equal((await dispatch([summary], [], { ...event, action: "ready_for_review" })).worker, 1);
  assert.equal((await dispatch([{ ...summary, updated_at: "2026-11-04T00:54:59Z" }])).worker, 1);
  assert.equal((await dispatch([summary], [review("APPROVED")])).worker, 1);
});
test("recovery, manual acknowledgements, prior gates and live approvals remain delegated", async () => {
  for (const reviews of [[], [review("COMMENTED", { body: "<!-- lfx-review-agent:review --> <!-- lfx-review-agent:review-of review=1 -->" })], [review("COMMENTED")]]) {
    assert.equal(gate([comment(start, "2026-11-04T00:14:59Z")], reviews), "delegate");
  }
  assert.equal(gate([comment(start)], [], "re-review"), "delegate");
  assert.equal(gate([comment(start)], [review("APPROVED"), review("COMMENTED", { id: 2, body: "<!-- lfx-review-agent:review --> <!-- lfx-review-agent:approval-withheld -->" })]), "delegate");
  assert.equal(gate([comment(start)], [review("APPROVED", { body: "another tool" })]), "running");
  for (const comments of [Array(10).fill(comment(start)), [comment(start), comment("<!-- lfx-review-agent:excluded rule=meeting-ics -->")], [comment(start, "invalid")]]) {
    assert.equal(gate(comments), "delegate");
  }
  assert.equal(gate([comment(start)], [], "opened", { ...pr, changed_files: 301 }), "delegate");
  const manual = {
    ...event, action: "created", pull_request: undefined,
    issue: { number: 15, pull_request: {}, user: pr.user },
    comment: { id: 7, user: pr.user, body: "@lfx-one re-review", created_at: now },
  };
  assert.equal((await dispatch([comment(start)], [], manual)).worker, 1);
});
test("compiled dispatch restores state, paginates, labels running skips and still invokes eligible reviews", async () => {
  const comments = [...Array.from({ length: 100 }, (_, id) => comment("context", now, { id, user: pr.user })), comment(start)];
  const reviews = Array.from({ length: 101 }, (_, id) => review("COMMENTED", { id, user: pr.user }));
  const stopped = await dispatch(comments, reviews);
  assert.equal(stopped.worker, 0);
  assert.deepEqual(stopped.calls.filter(([n]) => n === "lfx_one_github_issues_list_comments").map(([, p]) => p.page), [1, 2]);
  assert.deepEqual(stopped.calls.filter(([n]) => n === "lfx_one_github_pulls_list_reviews").map(([, p]) => p.page), [1, 2]);
  assert.match(stopped.text, /Pending label added/);
  assert.equal((await dispatch(comments, reviews, event, { lfx_one_github_issues_add_labels: async () => { throw Error("denied"); } })).worker, 0);
  assert.equal((await dispatch([], reviews)).worker, 1);
  assert.equal((await dispatch([comment(start)], [review("APPROVED")])).worker, 1);
  assert.equal((await dispatch([comment(start, "2026-11-04T00:14:59Z")])).worker, 1);
  assert.equal((await dispatch([comment(start)], [review("CHANGES_REQUESTED", { commit_id: "b" })], { ...event, action: "synchronize" })).worker, 0);
});

test("customer repositories, configured identity and flat label arguments reach the compiled controller", async () => {
  const input = { ...event, repository: { owner: { login: "linuxfoundation" }, name: "second-repo" } };
  const result = await dispatch([comment(start, now, { user: { login: "configured-reviewer" } })], [], input, {}, "configured-reviewer");
  assert.equal(result.worker, 0);
  assert.equal(preflight.historyScope("opened", "a", [review("APPROVED", { user: { login: "configured-reviewer" } })], "configured-reviewer").mode, "skip");
  assert.deepEqual(result.calls[0][1], { owner: "linuxfoundation", repo: "second-repo", pull_number: 15 });
  assert.deepEqual(result.calls.find(([n]) => n === "lfx_one_github_issues_add_labels")[1], {
    owner: "linuxfoundation", repo: "second-repo", issue_number: 15, labels: ["lfx-review-agent-pending"],
  });
  assert.equal((await dispatch([comment(start)], [], input, {}, "configured-reviewer")).worker, 1);
  assert.equal((await dispatch([], [], { ...event, repository: { full_name: "other/repo" } })).calls.length, 0);
});
test("draft automatic events stop while manual requests and sweeps preserve reviewer safeguards", async () => {
  const overrides = { lfx_one_github_pulls_get: async () => ({ ...pr, draft: true }) };
  const automatic = await dispatch([], [], event, overrides);
  assert.equal(automatic.calls.length, 1);
  assert.match(automatic.text, /draft/);
  const manual = { ...event, action: "created", pull_request: undefined,
    issue: { number: 15, pull_request: {}, user: pr.user },
    comment: { id: 7, body: "@lfx-one re-review", user: pr.user, created_at: now } };
  const delegated = await dispatch([], [], manual, overrides);
  assert.equal(delegated.worker, 1);
  const envelope = JSON.parse(delegated.calls.find(([n]) => n === "reviewer")[1].text);
  assert.deepEqual(envelope.event, JSON.parse(JSON.stringify(manual)));
  assert.equal(envelope.prepared.pr.draft, true);
  const sweep = '* This session was started at 01:00.\n\n{"lfx_review_agent_event":"sweep","repos":["linuxfoundation/lfx-test"]}';
  const swept = await dispatch([], [], sweep);
  assert.deepEqual(swept.calls, [["reviewer", { text: sweep }]]);
  assert.equal((await dispatch([], [], { ...event, lfx_review_agent_event: "sweep" }, overrides)).worker, 0);
  assert.throws(() => metadata.prMetadata.parse({ state: "open" }));
});


test("compiled history skip avoids reviewer dispatch without a running or cooldown gate", async () => {
  const input = { ...event, action: "ready_for_review" };
  const result = await dispatch([], [review("CHANGES_REQUESTED", { commit_id: "b" })], input);
  assert.equal(result.worker, 0);
  assert.match(result.text, /head already reviewed/);
  assert.equal((await dispatch([], [review("CHANGES_REQUESTED", { commit_id: "a" })], input)).worker, 1);
});
test("compiled handoff preserves repository privacy and undecided scope", async () => {
  const input = { ...event, action: "synchronize" };
  const privacy = { ...pr, base: { ...pr.base, repo: { private: true } } };
  const result = await dispatch([], [], input, { lfx_one_github_pulls_get: async () => privacy });
  assert.equal(result.worker, 1);
  const envelope = JSON.parse(result.calls.find(([name]) => name === "reviewer")[1].text);
  assert.deepEqual(Object.keys(envelope).sort(), ["event", "prepared"]);
  assert.deepEqual(envelope.event, input);
  assert.equal(envelope.prepared.pr.base.repo.private, true);
  assert.equal(envelope.prepared.scope.mode, "undecided");
});
test("failed or malformed GitHub reads hand the original input to the reviewer", async () => {
  const input = { ...event, action: "synchronize" };
  for (const overrides of [
    { lfx_one_github_issues_list_comments: async () => ({ message: "not a list" }) },
    { lfx_one_github_pulls_list_reviews: async () => { throw Error("502 Bad Gateway"); } },
    { lfx_one_github_pulls_get: async () => ({ state: "open" }) },
  ]) {
    const result = await dispatch([comment(start)], [], input, overrides);
    assert.equal(result.worker, 1);
    assert.deepEqual(result.calls.at(-1), ["reviewer", { text: JSON.stringify(input) }]);
    assert.match(result.text, /^Fallback: controller read failed \(.+\)\. reviewed$/);
    assert.equal(result.calls.some(([name]) => name === "lfx_one_github_issues_add_labels"), false);
  }
});
