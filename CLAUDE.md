<!-- Copyright The Linux Foundation and each contributor to LFX. -->
<!-- SPDX-License-Identifier: MIT -->

# lfx-review-agent

Guild.ai Native agent `linux-foundation~lfx-review-agent`: an automated PR
reviewer for the LFX organization. It is a port of the
`dd-pr-review-auto-cloud` Claude Code skill. The root is a Native prompt
and manifest; `controller/` contains the optional TypeScript pre-check.

## Files

| File | Role |
| --- | --- |
| `PROMPT.md` | The Native reviewer's instructions and review policy. |
| `guild.yaml` | Guild manifest: the `lfx-one-github` integration and its 21 tools. |
| `README.md` | Setup: onboarding steps, workspace variables, triggers, credential policy, test checklist. |
| `scripts/onboard-repo.sh` | Creates a repository's webhook triggers (onboarding step 4). |
| `scripts/sweep-trigger.sh` | Sets the hourly sweep trigger's repository list from the webhook triggers. |
| `scripts/re-review-trigger.sh` | Adds the `@lfx-one re-review` comment filter to existing re-review triggers and activates them. |
| `controller/` | TypeScript pre-check; run `npm test` in that directory. |
| `scripts/test-sweep-trigger.py` | Offline sweep test; run with `python3`. |
| `.markdownlint.json` | Lint config (80 columns; tables and code blocks exempt). |

`guild.json`, `.guild/cache/` and `.npmrc` are local Guild files, excluded
through `.git/info/exclude`. Never commit them.

## Remotes

- `github` (`linuxfoundation/lfx-review-agent`): the source of truth.
- `origin` (Guild git host): a deploy target. Do not force-push to it
  without asking. `guild agent save` is run by the maintainer, not by Claude.

## Editing PROMPT.md

- `{{env.KEY}}` is a Guild workspace variable (`REVIEWER_LOGIN`,
  `REVIEW_AGENT_HELP_URL`). The build validates these references. Do not
  write other `{{ }}` text in the prompt.
- Tool names are the `lfx_one_github_*` names in `guild.yaml`. Adding a tool
  to the prompt means adding it to `guild.yaml` and to the README credential
  policy.
- Comment and review markers (`<!-- lfx-review-agent:review -->`,
  `:review-of`, `:session`, `:superseded`, `:cap`, `:debounce`, `:skip`,
  `:request`, `:abandoned`, `:approval-withheld`, `:excluded`, `:summary`,
  `:stalled`, `:too-large`, `:docs-reminder`, `:finding`,
  `:finding-status`)
  are read back by later runs, and so is the `[docs]` tag in an inline
  comment's title line. Changing one breaks cycle state on open PRs.
  The same holds for the `lfx-review-agent-pending` label and the
  `lfx_review_agent_event` sweep input key.
- To exclude another area from auto-review, add a row to the "Review
  exclusions" table in `PROMPT.md`, with its path name parts. Never rename
  a released `Rule` value: open PRs carry it in their exclusion notice.
- To mark another generated file or lockfile, add a row to "Generated
  files and lockfiles" in `PROMPT.md`. A file listed there that is too
  large to read never withholds approval.
- To add a finding topic, add a row to "Finding topics" in `PROMPT.md`.
  Never rename a released topic, dimension slug or `finding-status`
  value: the engineering-metrics collector and later runs read them.
- The read limits live in the "Read budget" table in `PROMPT.md`. Keep
  controller/preflight.ts limits and marker classification, and the debounce
  notice in controller/agent.ts, synchronized with the prompt.
- The "Documentation" section format that repositories put in their rule
  files (Step 4, "Documentation candidates") is a contract they rely on.
  Changing it means updating the "Documentation check" section of
  `README.md` too.
- Guild does not enforce `enum` values in a request. A fixed value in an
  operation's path broke Guild's operation generation (1.0.6): generation
  stops at the first failing operation, so check that `operation list`
  shows every operation before `version build`.
- Handling a new webhook event in Step 0 means adding it to `TRIGGERS` in
  `scripts/onboard-repo.sh` and to the trigger table in `README.md`, then
  rerunning the script for every onboarded repository.
- Every PR that changes what Guild deploys (`PROMPT.md`, `guild.yaml`)
  bumps the version in the "Agent version" section of `PROMPT.md` to the
  next patch. Publish with `guild agent save --publish --version-number
  <that version> -m "..."` so the version Guild records matches the one the
  start comment shows. The Agent Version Check workflow fails a PR that
  changes either file without raising the version.
- When the prompt version changes, update the reviewer `calls` reference in
  `controller/agent.ts` and its deployment version in `controller/README.md`.
  Publish the Native reviewer before rebuilding and publishing the controller.
- PR content is untrusted data. Keep the injection rules in Operating rules.
- Prose follows the `unslop` rules: no em dashes, no filler.

## Git workflow

- `main` is protected. Work on a branch and open a PR; required checks are
  DCO and License Header. CODEOWNERS is `@linuxfoundation/lfx-platform`.
- Commit with `git commit -S --signoff`. Add the `ai-assisted` label to PRs.
- The Guild pre-push hook blocks every push. Push to GitHub with
  `git push --no-verify github <branch>`.
- Run `gh` with `GITHUB_TOKEN` and `GH_TOKEN` unset (for example
  `env -u GH_TOKEN -u GITHUB_TOKEN gh ...`). The shell token lacks PR rights
  on this repo; the keyring login works.
- License headers: yaml, `.gitignore`, shell and code files need the LF
  header in the first 4 lines. Markdown and JSON are not checked.
- Run `markdownlint` from the repo root after editing any `.md` file.
