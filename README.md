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
- Checks the change against the repository's own rule files (`CLAUDE.md`,
  `AGENTS.md`, `CONTRIBUTING.md`, `.claude/rules/`), read from the target
  branch so a PR can't change the rules it is judged by. It reviews each
  repository within the architecture it already uses.
- Posts one formal review with inline comments on the changed lines. Each
  finding is labeled `[blocking]`, `[minor]`, `[nit]`, or `[question]`.
- Posts a conversation comment with a short Summary of the change, a
  Decision (approved, approved with minor comments, or needs changes) with
  a tally of the findings, and the full recap in a collapsed Details block.
- Flags in-repo docs that a PR leaves missing or contradicts, names the
  gaps at the top of the summary, and reminds the author about docs
  outside the repository that it can't read (see "Documentation check").
- Follows up on later pushes by reviewing only the new commits, and
  reconciles what other reviewers and bots have already said.
- Approves only PRs authored by org members. For anyone else it still
  reviews, but withholds approval until a maintainer approves.

It is built to run unattended. Pull request content is treated as data, so
text in a diff or comment that tries to steer the verdict is reported as a
security finding instead of followed. Prompts that a repository ships as
its product are reviewed as code. It also limits itself: a cap on review
rounds per PR, a debounce on rapid pushes, and a check that skips drafts and
closed PRs.

Some areas always need a human reviewer. The "Review exclusions" table in
`PROMPT.md` lists them; today it has one rule, meeting calendar (ICS)
downloads. When a PR touches a listed area, the agent posts a note saying
why it won't review the PR and skips every later push on it. If it had
approved an earlier commit, it replaces that approval with a "changes
requested" review so the PR can't merge without a human. To ask for a fresh
check, a maintainer deletes that note and then pushes a commit, or
converts the PR to a draft and marks it ready again (needed when the agent
never reviewed the PR, since a push then starts nothing). The agent reviews
the PR only if it no longer changes an excluded area.

## When it runs

It runs from GitHub webhook events delivered by Guild: `pull_request`
(`opened`, `synchronize`, `ready_for_review`) and `issue_comment`
(`created`, a PR comment that starts with `@lfx-one re-review`). A Guild
comment filter on the `issue_comment` trigger drops every other comment
before a session starts; see the Triggers section below.

An hourly Guild time trigger also starts a sweep. It reviews at most one
PR an hour that is owed a review: a push dropped because a review was
running or the agent had just commented, a review that did not finish, or
a PR opened in the last 7 days that never got one. The agent marks PRs
that may be owed a review with the label `lfx-review-agent-pending` and
removes it when a review finishes on the current head. Removing it by hand
only takes that PR out of the sweep. Never rename it: open PRs carry it.

## Repository

GitHub (`linuxfoundation/lfx-review-agent`) is the source of truth and the
backup of the Guild setup. Guild's own git host is a deploy target:
`guild agent save` pushes there. Keep both remotes on the same history.

```bash
git remote add github git@github.com:linuxfoundation/lfx-review-agent.git
```

Changes go through a pull request on GitHub. Each PR that changes
`PROMPT.md` or `guild.yaml` bumps the version in the "Agent version" section
of `PROMPT.md`, which the start comment shows; the Agent Version Check
workflow fails the PR otherwise. After merging such a PR, pull `main` and
publish with that version:

```bash
guild agent save --publish --version-number <version> -m "<summary> (PR #<n>)"
```

`guild.json` (the Guild agent ID) stays untracked, as Guild's
`.git/info/exclude` sets up; the agent is `linux-foundation~lfx-review-agent`.

## Time source

A Native agent has no clock and cannot run commands. The prompt uses the
webhook's own timestamp as "now" for the whole run: `pull_request.updated_at`
for `opened` / `synchronize` / `ready_for_review`, and `comment.created_at`
for `re-review`. That value drives the Step 1.5 age checks and the `started`
field in Step 3.5.

A sweep has no webhook. It reads "now" from the first line Guild writes in
every session, `* This session was started at HH:MM:SS (24h, UTC) on
...`, confirmed by a probe run on 2026-11-03.

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
| `REVIEW_AGENT_HELP_URL` | `https://github.com/linuxfoundation/lfx-review-agent/issues`. Used in the cap notice, the start comment, and the summary footer. |

If `REVIEWER_LOGIN` does not match the account that posts, the agent stops
after its first comment and reports a configuration fault (Step 3.5,
identity check). Until the variable is fixed, each new
event posts another stray session-start comment, because the own-comment
filter cannot see the earlier ones.

## Onboarding a repository

Do these in order. Steps 1 to 3 need an organization owner or the
repository's admins. Step 4 starts live reviews on the repository's next
PR event, so do it last.

1. **Guild GitHub App.** An organization owner enables the Guild GitHub App
   (`guildai~github`) for the repository, so webhook events reach Guild.
   See Triggers.
2. **`lfx-one` token.** Add the repository to the existing `lfx-one`
   fine-grained token. Edit the token; do not regenerate it, or the Guild
   credential and its policies stop working. An organization owner must
   approve the change. See Reviewer identity.
3. **CODEOWNERS.** Add `lfx-one` to the team the repository's CODEOWNERS
   or branch protection accepts, with write access. Without it, the
   agent's approvals are advisory.
4. **Triggers.** Run `scripts/onboard-repo.sh` for the repository, then
   `scripts/sweep-trigger.sh --apply` so the hourly sweep covers it. The
   sweep checks up to 30 repositories for PRs that never got a review;
   past that, raise the search limit in `PROMPT.md` Step 0.3. See
   Triggers.

No agent, prompt, or credential policy change is needed. The review
exclusions in `PROMPT.md` apply to every repository; add a rule there first
if the new repository has code the agent must not review.

## Triggers

For a controller pilot, see
[rollout and rollback](controller/README.md#pilot-replacement-and-rollback).

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

Each repository needs four webhook triggers, one per event the agent
handles. Each is scoped to one repository with `--service-config` and
leaves `agent_input` empty so the raw payload is forwarded. Trigger names
must be unique within the workspace.

| Event | Action | Trigger name | Starts |
| --- | --- | --- | --- |
| `pull_request` | `opened` | `lfx-review-agent <repo> opened` | the initial review |
| `pull_request` | `synchronize` | `lfx-review-agent <repo> synchronize` | a follow-up review after a push |
| `pull_request` | `ready_for_review` | `lfx-review-agent <repo> ready_for_review` | the review of a PR that was a draft |
| `issue_comment` | `created` | `lfx-review-agent <repo> re-review comment` | a review on a comment that starts with `@lfx-one re-review` (comment filter below) |
| time, hourly at :17 | | `lfx-review-agent sweep` (one per workspace) | the sweep (`scripts/sweep-trigger.sh`) |

`scripts/onboard-repo.sh` creates them. It takes one or more repository
names, checks them all before creating anything, and skips any trigger
that already exists for this agent, matched on repository, event, action
and agent, so it is safe to run again. It needs `jq`.

```bash
WS=<workspace-id> scripts/onboard-repo.sh lfx-v2-example-service lfx-v2-other-service
guild trigger list --workspace <workspace-id> --limit 200
```

Without the `ready_for_review` trigger, a PR opened as a draft gets no
review, and commits pushed
while a PR is a draft are never reviewed, so an earlier approval stays in
place.

When the agent starts handling another event, add it to `TRIGGERS` in
`scripts/onboard-repo.sh` and to the table above, then rerun the script
for every onboarded repository. It creates only the missing trigger.

The sweep is one time trigger for the whole workspace. Its input is
`{"lfx_review_agent_event": "sweep", "repos": [...]}`, and
`scripts/sweep-trigger.sh` builds `repos` from the active `synchronize`
triggers, so the list never goes into this repository. Without `--apply`
it only prints what it would do. It updates the existing trigger in place,
keeping its active or inactive state, or creates it when there is none
(a new trigger starts active). When no `synchronize` trigger is left, it
deactivates the sweep instead. Guild has no trigger delete; use
`guild trigger deactivate <id>` to stop the sweep. When a repository
leaves the review, rerun the script and delete the
`lfx-review-agent-pending` label in that repository. The sweep removes the
label from pull requests outside its list, but only while the token can
still reach them.

```bash
WS=<workspace-id> scripts/sweep-trigger.sh            # dry run
WS=<workspace-id> scripts/sweep-trigger.sh --apply
guild trigger activate <sweep-trigger-id>
```

Create triggers only for repositories the `lfx-one` token covers. A trigger
on any other repository fails its first GitHub read, and the session stops
with a configuration fault before anything is posted.

### Re-review comment filter

Without a filter, the `issue_comment` trigger fires on every comment,
including issue comments and the agent's own, and each one starts a full
model run that Step 0 then ends. On 2026-10-28 that was 1,369 runs across
the onboarded repositories, almost none of them re-review requests, so
the triggers were deactivated on 2026-10-29.

Guild's GitHub triggers now check the comment text before starting a
session. Two `service_config` keys control it: `required_text`, and
`required_text_regex`, which makes `required_text` an RE2 pattern
searched anywhere in the comment body, ignoring case. Every re-review
trigger uses:

```json
{"repo": "linuxfoundation/<repo>", "required_text": "^\\s*@lfx-one\\s+re-review\\b", "required_text_regex": true}
```

The `^` anchor means the comment must start with the phrase, after any
leading whitespace. A phrase later in the comment, a quote reply
(`> @lfx-one re-review`), and `re-reviewed` do not start a session. Step 0
in `PROMPT.md` applies the same starts-with check. In the Guild trigger
editor, these keys are **Require text in comment** and **Use regex**.

`scripts/onboard-repo.sh` creates the trigger with the filter.
`scripts/re-review-trigger.sh` adds it to existing triggers that lack it,
reads the saved filter back, and only then activates the trigger, for
every repository that still has an active `synchronize` trigger. Without
`--apply` it only prints what it would do.

```bash
WS=<workspace-id> scripts/re-review-trigger.sh            # dry run
WS=<workspace-id> scripts/re-review-trigger.sh --apply
```

`guild trigger update --service-config` replaces the whole config, so a
manual update must include `repo` as well as the filter keys.

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
  --operations pulls_get,pulls_list_files,pulls_list_commits,pulls_list_reviews,pulls_list_review_comments,pulls_create_review,issues_list_comments,issues_create_comment,issues_update_comment,issues_create_reaction,repos_compare_commits,repos_get_content,git_get_tree,users_get_by_username,repos_get_branch,repos_get_branch_rules,checks_list_for_ref,repos_get_combined_status,search_issues,issues_add_labels,issues_remove_label \
  --workspaces <workspace-uuid> \
  --agents <agent-uuid>

guild credentials policy list "$CRED"
guild credentials policy delete <allow-all-policy-id>
```

There is no command to update a policy. To allow a new operation on an
existing credential, create another `ALLOW` policy with only the new
operations, for example the CI check reads added in 0.1.15, the sweep
operations added in 0.1.18, and the tree read added in 0.1.21:

```bash
guild credentials policy create "$CRED" \
  --decision ALLOW \
  --operations repos_get_branch,repos_get_branch_rules,checks_list_for_ref,repos_get_combined_status \
  --workspaces <workspace-uuid> \
  --agents <agent-uuid>

guild credentials policy create "$CRED" \
  --decision ALLOW \
  --operations search_issues,issues_add_labels,issues_remove_label \
  --workspaces <workspace-uuid> \
  --agents <agent-uuid>

guild credentials policy create "$CRED" \
  --decision ALLOW \
  --operations git_get_tree \
  --workspaces <workspace-uuid> \
  --agents <agent-uuid>
```

Guild does not enforce `enum` values in a request: an enum in the
integration spec documents the intended value only. `issues_add_labels`,
`issues_remove_label` and `issues_create_reaction` rely on the prompt to
send the intended value. Putting the label name in the remove operation's
path broke Guild's operation generation (1.0.6), so 1.0.7 keeps the
`{name}` parameter.

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

- The integration wraps the 20 GitHub REST operations the agent uses. The
  OpenAPI spec is `integration/lfx-one-github.openapi.yaml`. The spec
  declares an HTTP bearer security scheme. In Guild the connection uses the
  API Key auth type with the header `Authorization: Bearer {token}`.
- The credential is a fine-grained personal access token owned by
  `lfx-one`, with resource owner `linuxfoundation`. Grant it read and write
  on Pull requests and Issues, read on Contents and Commit statuses, and
  access to each repository the agent reviews. Without Commit statuses,
  the CI check reads fail and the agent reviews as before, without the CI
  check gate. Fine-grained tokens have no Checks permission, so check runs
  can't be read on private and internal repositories; there the gate uses
  commit statuses only, and says nothing about check runs. An
  organization owner must approve it. Connect it from your shell and
  never commit it: `guild integration connect
  linux-foundation~lfx-one-github --owner linux-foundation`.
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

## Documentation check

The Documentation dimension checks a PR's docs as well as its code.

- **What it decides.** From the diff, not the title or labels, whether
  the PR adds a feature, fixes or changes behavior, or changes nothing a
  user relies on, and which named items it adds, renames, removes or
  changes: flags, environment variables, config keys, routes, endpoints,
  UI text, defaults, CLI options.
- **Misaligned docs**, on every PR: a doc the agent read that still names
  something the PR renamed or removed, or a doc the PR changes that
  disagrees with the PR's code. The finding cites both places.
- **Missing docs**, only on a PR that changes behavior: no doc covers the
  change, in the knowledge base (README, CHANGELOG, `docs/`, ADRs), user
  docs, help text and i18n strings, or reference material (OpenAPI, Helm
  values docs, CLI help). At most 3 get their own comment; the rest fold
  into one item, each gap on its own line.
- **Severity.** Both kinds are `[minor][docs]`. More than 2 `[minor]`
  findings request changes, as for any other dimension.
- **Carry-forward.** On a follow-up, an earlier `[docs]` finding that is
  still open keeps counting as a `[minor]` until the PR fixes it. The
  agent checks this from the PR's file list and patches, with no extra
  reads.
- **No opt-out.** Labels, checkboxes and PR text that say docs are not
  needed have no effect. When docs really are not needed, a maintainer
  dismisses the agent's review that requested changes: its `[docs]`
  findings are then resolved and stop counting. Approving the PR does not
  clear the agent's review.
- **Summary.** The Decision section names the gaps in a "Documentation
  gaps" line, and says when they are what blocks approval.
- **Reminder.** When a PR changes behavior, the review body has a
  Documentation section that names the changed behaviors and asks the
  author to check docs the agent can't read, such as product pages and
  docs sites. It is not a finding. A follow-up repeats it only for newly
  changed behaviors. The section carries the
  `<!-- lfx-review-agent:docs-reminder -->` marker.
- **Reads.** The agent reads only the root README and declared doc files,
  at the target branch, within the read budget, and only when the diff
  gives a reason. A dependency bump reads no docs. Other doc locations
  are checked from directory listings, for existence only.

### Declaring a repository's docs

A repository can tell the agent where its docs live with a section in a
rule file the agent already reads: the root or a top-level directory's
`CLAUDE.md` or `AGENTS.md`, or a file in `.claude/rules/`.

```markdown
## Documentation

- In-repo: `docs/`, `charts/app/README.md`, `src/assets/i18n/`
- Docs site: https://docs.example.org/app (owner: docs-team)
- Product page: https://www.example.org/products/app (owner: product-marketing)
```

- The heading is `Documentation`, at any level. Only bullets that start
  with `In-repo:`, `Docs site:` or `Product page:` are read.
- `In-repo:` takes comma-separated paths from the repository root; a path
  ending in `/` is a directory. At most 10 paths are used.
- `Docs site:` and `Product page:` take one URL each, with an optional
  owner. At most 5 sites in total are used. The reminder names them and
  their owners in code spans, so GitHub sends no notification. The agent
  never fetches them.
- The section is read from the target branch, so a PR that adds or edits
  it is judged by the version already merged. It can't relax any rule or
  turn the check off.

## Finding metadata

Each finding and each follow-up outcome is recorded in a hidden marker
that renders as nothing on GitHub. The engineering-metrics Review Agent
page reads them to count what kinds of issues the agent catches and what
happens to each one. The formats are in
[`specs/004-finding-metadata/contracts/finding-markers.md`](specs/004-finding-metadata/contracts/finding-markers.md).

- **`finding`**: one per finding, on the last line of an inline comment,
  after the Fix line of an entry outside the diff, or at the end of a
  folded documentation gap's line. It carries an ID (`r<N>-f<k>`, from
  the review number), the severity, the dimension and a topic from the
  "Finding topics" table in `PROMPT.md`.
- **`finding-status`**: on every follow-up, one line per earlier ID at
  the end of the review body. It records the status (`resolved`,
  `partial`, `open`, `superseded`) and how the finding got there, such as
  `fixed`, `code-gone`, `declined` or `no-thread`.
- **Author replies.** The PR author's latest reply on an inline finding
  sets `declined`, `deferred` or `replied`, with a reason. A reply never
  changes the status, the verdict or any count.
- **Nothing visible changes.** The verdict, the `[minor]` count, the
  issue lines and revision tracking are the same as without the markers.
  Findings posted before 0.1.27 carry no marker and get no status.

## Test checklist

Run these on a throwaway PR before enabling triggers on a real repository.

1. Confirm the delivered payload has the fields Step 0 reads:
   `pull_request.updated_at`, `repository.owner.login`, and for
   `issue_comment`, `comment.created_at`, `comment.id`, and `issue.html_url`
   containing `/pull/`. Guild trims the `issue_comment` payload:
   `comment.author_association` and `issue.pull_request` are not delivered,
   so Step 0 uses `issue.html_url` to recognize a pull request, and Step 0
   and Step 1.5 take the commenter's association from `issues_list_comments`
   instead.
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
   approval. Then post an ordinary comment, a comment with the phrase
   after other text, and a quote reply of the phrase, and confirm
   `guild trigger sessions <id>` shows no new session for any of them.
7. After an approval, push another commit. Confirm a follow-up review
   scoped to the commits after the approved SHA.
8. Add an inline comment anchored outside the diff (for example, a finding
   in an unchanged caller). Confirm it lands under `Findings outside the
   diff` and the review still posts.
9. Open a PR from an account outside the org. Confirm the review is
   `COMMENTED` with the approval-withheld marker, never `APPROVED`.
10. Open a PR that changes `ics.helper.ts`. Confirm the exclusion notice,
    no session comment, and no review. Push again: confirm no review and
    no reply. Then, on a PR the agent approved, push an ICS change:
    confirm a `REQUEST_CHANGES` review replaces the approval.
11. On the approved PR that got the ICS change, delete the exclusion
    notice first, then push a commit that reverts the ICS change (a push
    made while the notice exists is stopped by gate A0). Confirm a normal
    follow-up review runs.
12. Open a PR as a draft. Confirm no review. Mark it ready for review and
    confirm a session appears for the `ready_for_review` trigger
    (`guild trigger sessions <id>`), the payload carries
    `pull_request.updated_at` and `number`, and an initial review runs.
    Then, on a PR the agent approved, convert it to draft, push a commit,
    and mark it ready again: confirm a follow-up review scoped to that
    commit.
13. On a reviewed PR, merge the target branch into the PR branch (for
    example, with "Update branch") after the target has moved. Confirm the
    session makes no `last_reviewed_sha...head_sha` compare call
    (`guild session events <id> --events all`), the follow-up reviews the
    whole PR diff, and the recap says the merge widened the scope.
14. On a public repository PR whose review would approve, make a
    required check fail (for example, a commit without a DCO sign-off).
    Confirm a `COMMENTED` review with the approval-withheld marker, the
    ⚠️ **Review passed, required check failed** decision, and a
    failed-checks line. On a PR with only a failing check that is not
    required (lf-dbt's `dbt Cloud`), confirm the review still approves and
    the line marks it not required. On a private or internal repository,
    confirm the recap does not mention the expected check-run 403 or list
    unmatched required checks as pending. Required checks with matching
    pending commit statuses should still be listed as pending.
15. On an lf-dbt PR, confirm the Details block ends with a **Rule files:**
    line that lists `CLAUDE.md` and `AGENTS.md` as read. On an
    lfx-self-serve PR, confirm the line lists `AGENTS.md` and the
    `.claude/rules/` files as read and `CONTRIBUTING.md` as skipped (over
    the 80,000-byte total). Confirm follow-up reviews carry the line too.
16. When two runs post a cap or debounce notice at the same moment, confirm
    the later one is rewritten to the `superseded notice=` marker and the
    earlier one is left as is.
17. Sweep, dropped push: on a test PR, push while a review is running.
    Confirm the PR gets `lfx-review-agent-pending`, the next sweep runs a
    follow-up whose start comment says the hourly check started it, and
    the label is gone after the recap. Confirm a push during Step 6 leaves
    the label in place.
18. Sweep, blocked PRs: put the label on a draft, a PR at 10 reviews, an
    excluded PR and an up-to-date PR. Confirm the sweep posts nothing on
    them and removes the label from each.
19. Sweep, idle hour: with no labeled PR and no never-reviewed PR, confirm
    the session posts nothing and its tool output is small (one tenth of a
    follow-up review or less).
20. Sweep, never reviewed: in an onboarded repository, with a non-draft PR
    under 7 days old that has no agent review or comment and has been
    quiet for 10 minutes, confirm the next sweep runs its initial review.
21. Sweep, reviews keep dying: on a PR with 2 abandoned reviews since its
    last summary and the pending label, confirm the sweep posts one
    `lfx-review-agent:stalled` notice and removes the label. Put the label
    back and confirm the next sweep posts no second notice. Push within 5
    minutes of the notice and confirm a review starts (no debounce).
22. Tail read: on a PR with more than 10 reviews, confirm the Step 5c
    `pulls_list_reviews` calls use `per_page: 10` from page
    `floor(review_count / 10) + 1`, not page 1.
23. Too large: on a test PR over 20,000 changed lines, push a commit.
    Confirm one `lfx-review-agent:too-large` notice, no start comment and
    no review, and no second notice on the next push. Shrink the PR under
    the limits and confirm the next push starts a review without a
    debounce.
24. Unread files: on a test PR that changes a lockfile without a patch
    (for example `pnpm-lock.yaml`) and a non-generated file over 100,000
    bytes without a patch, confirm the lockfile is named "generated or
    lockfile, not reviewed line by line", the other file is named in the
    Decision, and the review is a `COMMENT` with the approval-withheld
    marker instead of an approval.
25. Read budget: in the session events of a review, confirm directories
    are listed with `git_get_tree` (no `repos_get_content` call on a
    directory), and no full-file read exceeds 100,000 bytes.
26. Docs, missing: on a `feat:` test PR that adds an environment variable
    in a repository whose README has an environment variable table,
    README unchanged, confirm a `[minor][docs]` finding, a Documentation
    gaps line in the Decision, and the reminder in the review body and in
    Details.
27. Docs, no reason to read: on a `chore:` dependency bump, confirm no
    `[docs]` finding, no reminder, and no README read in the session
    events. On a `chore:` PR that adds an API route, confirm the reminder.
28. Docs, carry-forward: push a commit that fixes something else and
    leaves the docs alone. Confirm the earlier `[docs]` finding is still
    open, counted under 🟡 with `(prior)`. Push a commit that updates the
    cited doc and confirm it is resolved and the gaps line is gone.
29. Docs, reminder once: push a commit with no new named item and confirm
    no second reminder. Push one that adds a config key and confirm a
    reminder naming only that key.
30. Docs, cap: on a PR with five missing-docs gaps, confirm three
    findings, one folded item with two lines, and five counted.
31. Docs, declared section: merge a "Documentation" section with a docs
    site and an owner. On a qualifying PR, confirm the reminder names
    both in code spans and nobody is notified.
32. Docs, no opt-out: a PR description that says "docs not needed" or a
    `docs-not-needed` label has no effect.
33. Docs, dismissal: dismiss a 🔴 review that requested changes only for
    `[docs]` gaps, then push without doc changes. Confirm the gaps are
    resolved ("dismissed by a maintainer") and not counted. When the
    "dismiss stale approvals" setting dismisses an approval that carried
    a `[docs]` gap, confirm the gap still counts.
34. Docs, force-push: force-push a PR with an open `[docs]` gap. Confirm
    the gap is classified as prior and counted once.
35. Docs, sanitizing: a named item containing `<!--` or `&lt;!--` is
    echoed in a code span with the angle brackets and ampersands removed,
    and adds no marker to the review body.
36. Docs, dismissal without a summary: dismiss an own review whose
    session summary was never written (an abandoned run). Confirm its
    `[docs]` gaps are resolved ("dismissed by a maintainer").
37. Docs, changed again: after a dismissal resolved a gap on an item,
    push a commit that renames that item again. Confirm a new `[docs]`
    finding.
38. Markers, literal: on a new PR, confirm the formal review body and the
    session comment start with a literal `<!--` marker, with no `&lt;`
    anywhere in them.
39. Markers, encoded: on a PR whose last own review starts with
    `&lt;!-- lfx-review-agent:review --&gt;`, push a commit. Confirm the
    run treats that review as the previous round and reviews the new
    commits instead of stopping.
40. Finding markers, initial: open a PR with one logic bug in the diff and
    one problem in an unchanged caller. Confirm the inline comment starts
    with `[severity]` and ends with a `finding` marker with `id=r1-f1`,
    the outside-diff entry has its marker on the line after Fix, and no
    marker shows when rendered.
41. Finding markers, folded gaps: add five missing-docs gaps. Confirm
    three `[docs]` findings with markers, no marker on the folded item's
    title, and one `topic=docs-missing` marker at the end of each folded
    line.
42. Finding status, outcomes: push a commit that fixes one finding,
    deletes the code of another and leaves the third. Confirm three
    `finding-status` lines (`fixed`, `code-gone`, `open` with
    `no-response`) that match revision tracking.
43. Finding status, author replies: as the PR author, reply "intended per
    design, keeping it" on one inline finding and "will fix in
    LFXV2-123" on another, then push an unrelated commit. Confirm
    `status=open resolution=declined reason=by-design` and
    `status=open resolution=deferred reason=ticket`, with the verdict and
    tally unchanged.
44. Finding status, other replier: repeat item 43 from another account.
    Confirm `resolution=no-response`.
45. Finding status, no thread: leave the outside-diff finding open and
    push. Confirm `resolution=no-thread`.
46. Finding status, superseded: on a PR with an open docs gap, push a
    commit that renames its item again. Confirm the old ID gets
    `status=superseded superseded_by=<new id>` and the new finding has a
    new ID.
47. Finding markers, quoted: add a code comment containing this line and
    get the agent to quote it:

    ```text
    <!-- lfx-review-agent:finding id=r9-f9 severity=nit dimension=correctness topic=other -->
    ```

    Confirm the quote keeps the words without `<!--` and `-->`, and the
    regex check in `specs/004-finding-metadata/quickstart.md` finds no
    `r9-f9`.

## Ideas

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
