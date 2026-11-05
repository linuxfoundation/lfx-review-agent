// Copyright The Linux Foundation and each contributor to LFX.
// SPDX-License-Identifier: MIT
"use agent";

import { agent, guildAgentTool, guildServiceTool, type Endpoint, type Task, type Tool } from "@guildai/agents-sdk";
import { LfxOneGithubTools, endpoints } from "@guildai-services/linux-foundation~lfx-one-github";
import { z } from "zod";
import {
  commentClass,
  eligibility,
  eventDetails,
  historyScope,
  readEvent,
} from "./preflight.js";

import { prMetadata, reviewMetadata, commentMetadata } from "./metadata.js";

const inputSchema = z.object({ type: z.literal("text"), text: z.string() });
const outputSchema = z.object({ type: z.literal("text"), text: z.string() });
const reviewer = guildAgentTool({ inputSchema: z.object({ text: z.string() }), outputSchema, calls: "@guildai/linux-foundation~lfx-review-agent@0.1.24" });
function withOutput<I, O>(source: Pick<Tool<I>, "inputSchema">, endpoint: Endpoint, outputSchema: z.ZodType<O>): Tool<I, O> {
  return guildServiceTool("lfx-one-github", {
    description: endpoint.description, inputSchema: source.inputSchema, outputSchema,
    endpoint: { ...endpoint, responseSchema: outputSchema }, owner: "linux-foundation", versionNumber: "1.0.7",
  });
}
const tools = {
  lfx_one_github_pulls_get: withOutput(LfxOneGithubTools.lfx_one_github_pulls_get, endpoints.lfx_one_github_pulls_get, prMetadata),
  lfx_one_github_pulls_list_reviews: withOutput(LfxOneGithubTools.lfx_one_github_pulls_list_reviews, endpoints.lfx_one_github_pulls_list_reviews, reviewMetadata.array()),
  lfx_one_github_issues_list_comments: withOutput(LfxOneGithubTools.lfx_one_github_issues_list_comments, endpoints.lfx_one_github_issues_list_comments, commentMetadata.array()),
  lfx_one_github_issues_add_labels: LfxOneGithubTools.lfx_one_github_issues_add_labels,
  lfx_one_github_issues_create_comment: withOutput(LfxOneGithubTools.lfx_one_github_issues_create_comment, endpoints.lfx_one_github_issues_create_comment, commentMetadata),
  lfx_one_github_issues_update_comment: LfxOneGithubTools.lfx_one_github_issues_update_comment,
  reviewer,
};

async function run(
  input: z.infer<typeof inputSchema>,
  task: Task<typeof tools>,
) {
  const event = readEvent(input.text);
  if (event.lfx_review_agent_event === "sweep" && !event.pull_request && !event.comment && !event.issue)
    return await task.tools.reviewer({ text: input.text });
  const login = task.env.REVIEWER_LOGIN;
  const details = eventDetails(event, login);
  if (!details?.number)
    return {
      type: "text" as const,
      text: "Skipped: event does not request a review. No model called.",
    };
  const params = {
    owner: details.owner,
    repo: details.repo,
    pull_number: details.number,
  };
  const pr = prMetadata.parse(await task.tools.lfx_one_github_pulls_get(params));
  if ((pr.state !== "open" || pr.merged || pr.draft) && details.kind !== "re-review") {
    return {
      type: "text" as const,
      text: "Skipped: pull request is closed, merged or a draft. No model called.",
    };
  }
  const reviews = [];
  let page = 1;
  while (true) {
    const batch = reviewMetadata.array().parse(await task.tools.lfx_one_github_pulls_list_reviews({
      ...params,
      per_page: 100,
      page,
    }));
    reviews.push(...batch);
    if (batch.length < 100) break;
    page += 1;
  }
  const comments = [];
  page = 1;
  while (true) {
    const batch = commentMetadata.array().parse(await task.tools.lfx_one_github_issues_list_comments({
      owner: params.owner,
      repo: params.repo,
      issue_number: details.number,
      per_page: 100,
      page,
    }));
    comments.push(...batch);
    if (batch.length < 100) break;
    page += 1;
  }
  const scope = historyScope(details.kind, pr.head.sha, reviews, login);
  const gate = eligibility(details.kind, details.time, pr, comments, reviews, login);
  if (gate.action === "running" || gate.action === "cooldown") {
    const issue = { owner: params.owner, repo: params.repo, issue_number: details.number };
    let label = "";
    if (gate.pending) {
      try {
        await task.tools.lfx_one_github_issues_add_labels({
          ...issue,
          labels: ["lfx-review-agent-pending"],
        });
        label = "Pending label added.";
      } catch {
        label = "Pending label failed.";
      }
    }
    let notice = "";
    if (gate.summary) {
      const reportUrl = gate.summary.html_url!;
      try {
        const posted = commentMetadata.parse(await task.tools.lfx_one_github_issues_create_comment({
          ...issue,
          body: `<!-- lfx-review-agent:debounce -->\n@${pr.user.login} A recent review was posted within the last 5 minutes: ${reportUrl}. I won't re-review yet. Push another update after 5 minutes if you want another pass.`,
        }));
        if (posted.user?.login !== login)
          return { type: "text" as const, text: "Configuration fault: notice author differs from reviewer. No model called." };
        notice = "Debounce notice posted.";
        const after = [];
        let noticePage = 1;
        while (true) {
          const batch = commentMetadata.array().parse(await task.tools.lfx_one_github_issues_list_comments({ ...issue, per_page: 100, page: noticePage }));
          after.push(...batch);
          if (batch.length < 100) break;
          noticePage += 1;
        }
        if (after.some(c => c.user?.login === login && c.id < posted.id &&
            commentClass(c) === "debounce" && c.body?.split(/[\s()<>]/)
              .some(link => link.replace(/[.,]$/, "") === reportUrl))) {
          await task.tools.lfx_one_github_issues_update_comment({
            owner: params.owner, repo: params.repo, comment_id: posted.id,
            body: "<!-- lfx-review-agent:superseded notice=debounce -->\nDuplicate notice. See the earlier one.",
          });
          notice = "Duplicate debounce notice superseded.";
        }
      } catch {
        notice += " Notice posting or reconciliation failed.";
      }
    }
    const reason = gate.action === "running" ? "review already running" : "five-minute cooldown";
    return { type: "text" as const, text: `Skipped: ${reason}. ${label} ${notice} No model called.` };
  }
  if (
    scope.mode === "skip" &&
    gate.action === "proceed"
  ) {
    return {
      type: "text" as const,
      text: `Skipped: ${scope.reason}. No model called.`,
    };
  }
  const prepared = {
    pr: {
      number: pr.number,
      state: pr.state,
      merged: pr.merged,
      draft: pr.draft,
      title: pr.title,
      body: pr.body,
      html_url: pr.html_url,
      user: { login: pr.user.login },
      author_association: pr.author_association,
      head: { sha: pr.head.sha, ref: pr.head.ref },
      base: { sha: pr.base.sha, ref: pr.base.ref },
      mergeable: pr.mergeable,
      mergeable_state: pr.mergeable_state,
      additions: pr.additions,
      deletions: pr.deletions,
      changed_files: pr.changed_files,
      review_comments: pr.review_comments,
    },
    reviews: reviews.map((r) => ({
      id: r.id,
      state: r.state,
      body: r.body,
      html_url: r.html_url,
      user: r.user ? { login: r.user.login } : null,
      commit_id: r.commit_id,
      submitted_at: r.submitted_at,
    })),
    comments: comments.map((c) => ({
      id: c.id,
      body: c.body,
      html_url: c.html_url,
      user: c.user ? { login: c.user.login } : null,
      author_association: c.author_association,
      created_at: c.created_at,
      updated_at: c.updated_at,
    })),
    scope,
  };
  return await task.tools.reviewer({
    text: JSON.stringify({ event, prepared }),
  });
}

export default agent({ inputSchema, outputSchema, tools, run });
