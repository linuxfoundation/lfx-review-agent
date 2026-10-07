<!-- Copyright The Linux Foundation and each contributor to LFX. -->
<!-- SPDX-License-Identifier: MIT -->

# lfx-review-agent

Guild.ai Native agent `linux-foundation~lfx-review-agent`: an automated PR
reviewer for the LFX organization. It is a port of the
`dd-pr-review-auto-cloud` Claude Code skill. There is no application code;
the agent is a prompt plus a Guild manifest.

## Files

| File | Role |
| --- | --- |
| `PROMPT.md` | The agent's system prompt. All behavior lives here. |
| `guild.yaml` | Guild manifest: the `guildai~github` integration and its 12 `github_*` tools. |
| `README.md` | Setup: workspace variables, triggers, credential policy, test checklist. |
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
- Tool names are the `github_*` names in `guild.yaml`. Adding a tool to the
  prompt means adding it to `guild.yaml` and to the README credential policy.
- Comment and review markers (`<!-- lfx-review-agent:review -->`,
  `:session`, `:superseded`, `:cap`, `:debounce`, `:approval-withheld`) are
  read back by later runs. Changing one breaks cycle state on open PRs.
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
