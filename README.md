# linux-foundation~lfx-review-agent

An automated pull request reviewer for LFX repositories, built as a
[Guild.ai](https://guild.ai) Native agent. It reviews pull requests as the
`lfx-one` GitHub account, through a custom Guild integration (see Reviewer
identity).
`PROMPT.md` is the system prompt; `guild.yaml` is the Guild manifest.

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
| `REVIEWER_LOGIN` | The GitHub login the credential posts as: `lfx-one`. |
| `REVIEW_AGENT_HELP_URL` | `https://github.com/linuxfoundation/lfx-review-agent/issues`. Used in the cap notice and the preview disclaimer. |

If `REVIEWER_LOGIN` does not match the account that posts, the agent stops
after its first comment and reports a configuration fault (Step 3.5,
identity check). Until the variable is fixed, each new
event posts another stray session-start comment, because the own-comment
filter cannot see the earlier ones.

## Triggers

Webhook events reach the agent through the Guild GitHub App
(`guildai~github`), not through the `lfx-one` token. The app only delivers
events for repositories it can see, so before creating triggers:

- An organization owner installs the Guild GitHub App on the `linuxfoundation`
  organization and enables it for each repository.
- The workspace and the app installation must use the same GitHub
  connection. If a trigger never fires and no session appears, ask Guild
  which connection the trigger is bound to.
- The repository dropdown in the Guild trigger editor may not list the
  repository even when the app is installed. A trigger created with the CLI
  is not checked against that list, and it fires normally.

Create three webhook triggers, each scoped to one repository with
`--service-config` and leaving `agent_input` empty so the raw payload is
forwarded. Trigger names must be unique within the workspace. Repeat per
repository.

```bash
WS=<workspace-id>
REPO=linuxfoundation/<repo>

for action in opened synchronize; do
  guild trigger create \
    --workspace "$WS" \
    --type webhook \
    --integration github \
    --event pull_request \
    --action "$action" \
    --agent linux-foundation~lfx-review-agent \
    --name "lfx-review-agent ${REPO##*/} $action" \
    --service-config "{\"repo\": \"$REPO\"}"
done

guild trigger create \
  --workspace "$WS" \
  --type webhook \
  --integration github \
  --event issue_comment \
  --action created \
  --agent linux-foundation~lfx-review-agent \
  --name "lfx-review-agent ${REPO##*/} re-review comment" \
  --service-config "{\"repo\": \"$REPO\"}"
```

Create triggers only for repositories the `lfx-one` token covers. A trigger
on any other repository fails its first GitHub read, and the session stops
with a configuration fault before anything is posted.

The `issue_comment` trigger fires on every comment, including issue
comments. Step 0 drops anything that is not `@lfx-one re-review` on a pull
request.

## Credential policy

A new credential starts with an allow-all policy. Create a policy that
allows only the operations in `guild.yaml`, scoped to this agent and
workspace, then delete the allow-all policy so anything unmatched is denied.
With allow-all gone, merge, push, and delete operations are refused by
default. Operation names are the bare names below, without the
`lfx_one_github_` tool prefix. Add explicit `DENY` policies only after
checking the names against the integration, since a misspelled name matches
nothing.

```bash
CRED=<credential-id>   # guild credentials list --owner linux-foundation

guild credentials policy create "$CRED" \
  --decision ALLOW \
  --operations pulls_get,pulls_list_files,pulls_list_commits,pulls_list_reviews,pulls_list_review_comments,pulls_create_review,issues_list_comments,issues_create_comment,issues_update_comment,repos_compare_commits,repos_get_content,users_get_by_username \
  --workspaces <workspace-uuid> \
  --agents <agent-uuid>

guild credentials policy list "$CRED"
guild credentials policy delete <allow-all-policy-id>
```

`--workspaces` takes a UUID or `<owner>~<name>`, not a bare workspace name.
If the credential is deleted and reconnected, its policies are gone and this
step must be repeated for the new credential ID. A session that cannot
resolve the credential stops at its first call with `401 Unauthorized:
Integration credentials not configured for lfx-one-github`.

## Reviewer identity

Reviews and comments post as the `lfx-one` GitHub account (a regular user
account, shown as "LFX One [bot]"). Guild's shared `guildai~github`
integration connects as the Guild GitHub App instead, so this agent uses a
custom integration, `linux-foundation~lfx-one-github`.

- The integration wraps the 12 GitHub REST operations the agent uses. The
  OpenAPI spec is `integration/lfx-one-github.openapi.yaml`. The spec
  declares an HTTP bearer security scheme. In Guild the connection uses the
  API Key auth type with the header `Authorization: Bearer {token}`.
- The credential is a fine-grained personal access token owned by
  `lfx-one`, with resource owner `linuxfoundation`. Grant it read and write
  on Pull requests and Issues, read on Contents, and access to each
  repository the agent reviews. An organization owner must approve it.
  Connect it from your shell and never commit it:
  `guild integration connect linux-foundation~lfx-one-github --owner
  linux-foundation`.
- Set `REVIEWER_LOGIN` to `lfx-one`. The re-review phrase is
  `@lfx-one re-review`.
- An `APPROVE` from `lfx-one` counts toward required reviews only if the
  account is in a team that branch protection or CODEOWNERS accepts.
  Otherwise it is advisory.

To use the Guild App bot instead, point `guild.yaml` back at
`guildai~github` and set `REVIEWER_LOGIN` to the App's bot login
(`<app-slug>[bot]`).

## Author organization gate

Step 5a.1 approves only when the PR's `author_association` is `MEMBER` or
`OWNER`. A member whose org membership is private can show as
`CONTRIBUTOR`. That fails safe: the review still runs, but approval is
withheld until a maintainer approves. Making membership public fixes it.

## Test checklist

Run these on a throwaway PR before enabling triggers on a real repository.

1. Confirm the delivered payload has the fields Step 0 reads:
   `pull_request.updated_at`, `repository.owner.login`, and for
   `issue_comment`, `comment.created_at` and `comment.id`. Guild trims the
   `issue_comment` payload: `comment.author_association` and
   `issue.pull_request` are not delivered, so Step 0 and Step 1.5 take the
   commenter's association from `issues_list_comments` instead.
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

- **Gatekeeper (highest priority).** The `issue_comment` trigger fires on
  every comment on every watched repository, and each one starts a full
  model run that Step 0 then ends. A trigger-level filter on `comment.body`
  matching `@lfx-one re-review` (case-insensitive) would reject those
  events before any run starts. It is not built: `guild trigger create`
  offers only `--event`, `--action` and a repo-scoped `--service-config`,
  and no body filter is documented. Open question for Guild: does
  `--service-config` accept a payload filter? If not, the fallback is a
  cheap pre-check agent that forwards only matching events, if Guild
  allows one agent to start another. Drafts and closed PRs could use the
  same gate.
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
