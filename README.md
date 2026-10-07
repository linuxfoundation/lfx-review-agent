# linux-foundation~lfx-review-agent

An automated pull request reviewer for LFX repositories, built as a
[Guild.ai](https://guild.ai) Native agent. It reviews pull requests as the
GitHub user `lfx-one`. `PROMPT.md` is the system prompt; `guild.yaml` is the
Guild manifest.

## Purpose

LFX teams open many pull requests across many repositories, and every one
needs a first pass for the same classes of problems. This agent does that
first pass automatically, so human reviewers start from a reviewed change
instead of a blank diff. It assists other reviewers and does not replace
them.

What it does on each review:

- Reads the diff and the commit messages, and reviews them in one pass for
  correctness, security, performance, test coverage, documentation, and the
  data privacy, data subject rights, and data residency concerns that apply
  to LFX services.
- Posts one formal review with inline comments on the changed lines. Each
  finding is labeled `[blocking]`, `[minor]`, `[nit]`, or `[question]`.
- Posts a conversation comment that summarizes the change, the findings,
  and a clear decision: approved, approved with minor comments, or needs
  changes.
- Follows up on later pushes by reviewing only the new commits, and
  reconciles what other reviewers and bots have already said.
- Approves only PRs authored by org members. For anyone else it still
  reviews, but withholds approval until a maintainer approves.

It is built to run unattended. Pull request content is treated as data, so
text in a diff or comment that tries to steer the verdict is reported as a
security finding instead of followed. It also limits itself: a cap on review
rounds per PR, a debounce on rapid pushes, and a check that skips drafts and
closed PRs.

## When it runs

It runs from GitHub webhook events delivered by Guild: `pull_request`
(`opened`, `synchronize`) and `issue_comment` (`created`, with
`@lfx-one re-review` on a PR). The setup commands are in the Triggers
section below.

## Repository

GitHub (`linuxfoundation/lfx-review-agent`) is the source of truth and the
backup of the Guild setup. Guild's own git host is a deploy target:
`guild agent save` pushes there. Keep both remotes on the same history.

```bash
git remote add github git@github.com:linuxfoundation/lfx-review-agent.git
```

Changes go through a pull request on GitHub. After merge, pull `main` and run
`guild agent save` to publish the new version. `guild.json` (the Guild agent
ID) stays untracked, as Guild's `.git/info/exclude` sets up; the agent is
`linux-foundation~lfx-review-agent`.

## Time source

A Native agent has no clock and cannot run commands. The prompt uses the
webhook's own timestamp as "now" for the whole run: `pull_request.updated_at`
for `opened` / `synchronize`, and `comment.created_at` for `re-review`. That
value drives the Step 1.5 age checks and the `started` field in Step 3.5.

### Fallback: custom time integration

Use this only if test runs show those timestamps are missing from the
payload Guild delivers, or are too stale to trust.

- Wrap a JSON time API (one `GET` that returns the current UTC time) as a
  custom Guild integration with `guild integration`. The base URL is frozen
  on first publish, so pick a stable endpoint.
- Add it to `guild.yaml` and change Step 0 "Current time" to call it once at
  the start of the run, falling back to the webhook timestamp if the call
  fails.
- Do not scrape the `Date` header from `www.google.com` or parse Cloudflare
  `cdn-cgi/trace`. Neither is a documented API, and a Native agent cannot
  run `curl` or `date` anyway.

## Workspace variables

The prompt reads two workspace variables. Guild only checks at build time
that the references are well formed, so set both before enabling triggers.

| Variable | Value |
| --- | --- |
| `REVIEWER_LOGIN` | The GitHub login the credential posts as. With the Guild GitHub App this is the App's bot login (`<app-slug>[bot]`), not `lfx-one`. |
| `REVIEW_AGENT_HELP_URL` | `https://github.com/linuxfoundation/lfx-review-agent/issues`. Used in the cap notice and the preview disclaimer. |

If `REVIEWER_LOGIN` does not match the account that posts, the agent stops
after its first comment and reports a configuration fault (Step 3.5,
identity check). Until the variable is fixed, each new
event posts another stray session-start comment, because the own-comment
filter cannot see the earlier ones.

## Triggers

Create three webhook triggers, each scoped to one repository with
`--service-config` and leaving `agent_input` empty so the raw payload is
forwarded. Repeat per repository. `--agent` takes an agent identifier;
the name below is a placeholder, and the `agent_id` in `guild.json` also
identifies this agent.

```bash
for action in opened synchronize; do
  guild trigger create \
    --type webhook \
    --integration github \
    --event pull_request \
    --action "$action" \
    --agent linux-foundation~lfx-review-agent \
    --service-config '{"repo": "linuxfoundation/<repo>"}'
done

guild trigger create \
  --type webhook \
  --integration github \
  --event issue_comment \
  --action created \
  --agent linux-foundation~lfx-review-agent \
  --service-config '{"repo": "linuxfoundation/<repo>"}'
```

The `issue_comment` trigger fires on every comment, including issue
comments. Step 0 drops anything that is not `@lfx-one re-review` on a pull
request.

## Credential policy

A new GitHub credential starts with an allow-all policy. Replace it with
rules that allow only the operations in `guild.yaml`, then delete the
allow-all policy so anything unmatched is denied. With allow-all gone,
merge, push, and delete operations are refused by default. Add explicit
`DENY` rules only after checking the operation names against the
integration, since a misspelled name matches nothing.

```yaml
github:
  - decision: ALLOW
    operations:
      - pulls_get
      - pulls_list_files
      - pulls_list_commits
      - pulls_list_reviews
      - pulls_list_review_comments
      - pulls_create_review
      - issues_list_comments
      - issues_create_comment
      - issues_update_comment
      - repos_compare_commits
      - repos_get_content
      - users_get_by_username
    resources:
      repos: ["linuxfoundation/*"]
```

Scope the rules to this agent with `--agents <agent-id>` so other agents on
the same credential keep their own policies.

## Reviewer identity

Guild connects to GitHub as a GitHub App, so reviews and comments are
posted by the App's bot account. Two options:

- **A. Use the App bot.** Set `REVIEWER_LOGIN` to the bot login. No extra
  integration work. Reviews show as the bot, and an `APPROVE` from an App
  may not count toward branch protection, depending on repo settings.
- **B. Post as `lfx-one`.** Build a custom integration that uses the
  `lfx-one` token. That also exposes `GET /user` and org membership checks,
  but the tool names change and `guild.yaml` and `PROMPT.md` must follow.

The re-review phrase stays `@lfx-one re-review` either way; it is matched as
text, not as a mention.

## Author organization gate

Step 5a.1 approves only when the PR's `author_association` is `MEMBER` or
`OWNER`. A member whose org membership is private can show as
`CONTRIBUTOR`. That fails safe: the review still runs, but approval is
withheld until a maintainer approves. Making membership public fixes it.

## Test checklist

Run these on a throwaway PR before enabling triggers on a real repository.

1. Confirm the delivered payload has the fields Step 0 reads:
   `pull_request.updated_at`, `repository.owner.login`, and for
   `issue_comment`, `issue.pull_request`, `comment.created_at`,
   `comment.author_association`.
2. Open a PR with a deliberate issue. Confirm the session comment is
   posted, its `user.login` matches `REVIEWER_LOGIN`, and the review is
   `REQUEST_CHANGES` (do not test `APPROVE` first).
3. Confirm Step 6 edits the same comment: the `id` is unchanged and the
   recap is appended below the start line.
4. Push a fix. Confirm a follow-up review scoped to the new commits, and a
   debounce notice if you push again within 5 minutes.
5. Force-push. Confirm the follow-up falls back to a whole-PR review and
   the recap says history was rewritten.
6. Comment `@lfx-one re-review`. Confirm it runs a review even after an
   approval.
7. After an approval, push another commit. Confirm a follow-up review
   scoped to the commits after the approved SHA.
8. Add an inline comment anchored outside the diff (for example, a finding
   in an unchanged caller). Confirm it lands under `Findings outside the
   diff` and the review still posts.
9. Open a PR from an account outside the org. Confirm the review is
   `COMMENTED` with the approval-withheld marker, never `APPROVED`.

## Ideas

- **Gatekeeper.** A cheap pre-check agent (or trigger filter) that drops
  events the main agent would stop on anyway (drafts, closed PRs,
  non-matching comments), to save a full model run per event.
- **Scheduled sweep.** Stall detection and Slack notification of an
  unresolved cycle need a schedule trigger and are not handled yet.

## History

This agent is a port of the `dd-pr-review-auto-cloud` Claude Code routine.
Behavior carried over from that routine was checked against real review
history:

- Bot `COMMENTED` and `DISMISSED` reviews interleave with real verdicts
  (`linuxfoundation/lfx-v2-campaign-service` PR #99), so Step 2 excludes them
  from the terminal set.
- An `APPROVED` review can become `DISMISSED` after later pushes
  (`linuxfoundation/lfx-self-serve` PR #2979), so Step 3 treats a dismissed
  review as evidence that a first review ran.

## License

Copyright The Linux Foundation and each contributor to LFX.

This project's source code is licensed under the MIT License. A copy of the
license is available in LICENSE.

This project's documentation is licensed under the Creative Commons
Attribution 4.0 International License (CC-BY-4.0). A copy of the license is
available in LICENSE-docs.
