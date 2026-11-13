# Research: Make the workspace knowledge base available to Guild agents

## Verified facts

- `.knowledge/`: 380 tracked files, 332 Markdown, about 317,000 words, 15 area
  READMEs, 129 commits in 30 days (counted 2026-11-12).
- No secret patterns (private keys, Slack, GitHub or AWS access keys) matched
  in `.knowledge/`; 21 files hold AWS account numbers and 13 hold Auth0
  identifiers.
- Guild REST API: `POST /workspaces/{workspace_id_or_name}/contexts` takes
  `context`, `status` (`PUBLISHED` or `DRAFT`) and `summary`
  (docs.guild.ai/openapi.json).
- Native agents receive workspace context in a session's first message only
  (docs.guild.ai/guide/native-agents.md).
- GitHub `search/code` with `repo:linuxfoundation/workspace-org-lens
  path:.knowledge` returned 106 hits for "NATS" (user token).
- This repository's `CLAUDE.md`: Guild does not enforce `enum` values in a
  request, and a fixed value in an operation path broke operation generation.
- Existing gitleaks job: `workspace-org-lens/.github/workflows/artifacts.yml`
  `secret-scan`, with `.gitleaks.toml` at that repository's root.
- Map budget: 19 area READMEs; first paragraphs are 5 to 53 words; estimated
  map about 1,000 words, plus about 300 words of agent rules (FR-016), against
  the 3,000-word budget (measured 2026-11-12).

## Analysis (2026-11-12, pass 2)

The speckit-analyze passes (duplication, ambiguity, underspecification,
constitution, coverage, inconsistency) found 5 HIGH, 7 MEDIUM and 2 LOW issues,
no CRITICAL. All were remediated in spec.md, plan.md, data-model.md,
contracts/knowledge-map.md and tasks.md.

## Open questions (resolve before implementation)

1. **Can the integration pin `ref` to `main` and `path` to `.knowledge/`?**
   Guild does not enforce enums. Test whether an undeclared `ref` query
   parameter is forwarded; if it is, FR-002 relies on the agent prompt plus
   the credential (see analysis remediation in tasks).
2. **Does `search/code` accept the dedicated credential type?** Test with a
   fine-grained token and with a GitHub App installation token.
3. **Approved model provider for `workspace-org-lens`** (DR-004). Ask LF
   security.
4. **Guild API key scope for CI.** Can an organization API key be limited to
   context writes on allowlisted workspaces?
5. **Do Native agents use skills?** Not needed for this design; recorded for a
   possible later skills option (DR-001 option 2).
