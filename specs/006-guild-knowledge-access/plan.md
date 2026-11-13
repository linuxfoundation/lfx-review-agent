# Implementation Plan: Make the workspace knowledge base available to Guild agents

**Branch**: `feature/guild-tracer-knowledge-specs` | **Date**:
2026-11-12 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/006-guild-knowledge-access/spec.md`

## Summary

Agents read `.knowledge/` live from GitHub `main` through a dedicated read-only
integration (DR-001, DR-002). A CI job generates a knowledge map from the area
READMEs on every merge that touches `.knowledge/`, secret-scans it, and
publishes it into the workspace context of allowlisted workspaces (DR-003),
preserving hand-written context.

## Technical Context

**Language/Version**: Bash plus inline Python 3 (the
`scripts/generate-skill-catalog.sh` pattern); GitHub Actions YAML; OpenAPI 3 for
the integration
**Primary Dependencies**: Guild REST API `GET`/`POST /workspaces/{id}/contexts`;
GitHub REST `git/trees`, `contents`, `search/code`; gitleaks 8.24.3 (as in
`artifacts.yml`)
**Storage**: None new. The map lives in Guild workspace context; the allowlist
is a file in `workspace-org-lens`.
**Testing**: `--check` mode for the generator; a dry-run publish; the SC-001
question set in a test workspace
**Target Platform**: GitHub Actions on `linuxfoundation/workspace-org-lens`;
Guild workspaces
**Project Type**: Docs-repo tooling plus a Guild custom integration
**Performance Goals**: Map published within 1 hour of merge (SC-002)
**Constraints**: Map at most 3,000 words (FR-008); read-only, single-repository
credential (FR-010); allowlisted workspaces only (FR-011)
**Scale/Scope**: 19 area READMEs, 332 Markdown files today (estimated map about
1,000 words); one enabled workspace at start

## Constitution Check

The agent side follows this repository's `CLAUDE.md`; the sync side lives in
`workspace-org-lens` and follows the LFX platform constitution
(`workspace-org-lens/.specify/memory/constitution.md`).

- **I. Gateway-Enforced Authorization**: N/A to platform endpoints; the access
  gate here is GitHub repository read access, mirrored by the workspace
  allowlist (DR-003).
- **II, III, V, VI, VII, VIII**: N/A. No services, FGA model, charts, secrets
  in clusters, warehouse data or environments are touched. The Guild API key
  and GitHub credential are CI and Guild secrets, not cluster secrets.
- **IV. License and DCO Compliance**: APPLIES. New script, workflow, OpenAPI
  and YAML files carry the LF header; commits are DCO-signed. YAML follows the
  Cross-Repo conventions (yamllint).
- **This repository's `CLAUDE.md`**: APPLIES to the integration and test
  agent. The root reviewer's `PROMPT.md` and `guild.yaml` are not changed, so
  no agent version bump; Markdown passes `markdownlint`.

### Read-plane authorization gate

- [x] Authorization & Privacy table filled. The protected fact is private
      repository content; its gate is GitHub read access.
- [x] No analytics-lane read. N/A.
- [x] Parity: enabled-workspace membership must be a subset of repository
      readers (FR-011, DR-003).
- [x] Identifiers in knowledge files are not repeated outside the enabled
      population (FR-013, DR-004).
- [x] Gaps routed to DR-001 to DR-004.

## Project Structure

### Documentation (this feature)

```text
specs/006-guild-knowledge-access/
├── spec.md
├── quickstart.md                  # validation steps
├── plan.md
├── research.md
├── data-model.md
├── contracts/
│   ├── knowledge-integration.md   # integration operations
│   └── knowledge-map.md           # map format, markers, allowlist schema
├── checklists/requirements.md     # spec quality checklist
├── checklists/sc-001.md           # 20 questions with known answers, plus 3 uncovered questions
├── decisions/                     # DR-001 to DR-004
└── tasks.md
```

### Source Code

In this repository (`lfx-review-agent`), the agent side:

```text
integration/lfx-knowledge.openapi.yaml       # dedicated integration: tree, content, code search
knowledge-probe/PROMPT.md, guild.yaml        # Native test agent; follows the rules from workspace context; runs SC-001
```

In `workspace-org-lens`, the sync side, next to the knowledge it reads:

```text
scripts/generate-knowledge-map.sh          # print | --write <file> | --check, budget enforced
scripts/publish-knowledge-map.sh           # splice map into each allowlisted workspace context, POST PUBLISHED
guild/knowledge-agent-rules.md             # agent rules, copied verbatim into the generated block (FR-016)
guild/knowledge-workspaces.yaml            # allowlist: workspace id, model policy, membership check, review date
.github/workflows/knowledge-map-sync.yml   # on push to main touching .knowledge/**, the rules, the allowlist or the scripts
```

**Structure Decision**: The integration and the test agent live here with the
other Guild agent sources (`integration/` already holds
`lfx-one-github.openapi.yaml`). The map sync and the agent rules live in
`workspace-org-lens`: the sync reads `.knowledge/` and runs on that
repository's merges, and the rules ride inside the generated block because a
Native agent can read only its prompt and its workspace context (FR-016,
DR-005). The rules file sits outside `.knowledge/`, so it is never read as
knowledge content (FR-005). The test agent `knowledge-probe/` measures SC-001;
other agents (for example spec 005's tracer) adopt the integration in their own
features and get the rules from the same workspace context.

## Complexity Tracking

| Violation | Why needed | Simpler alternative rejected because |
|---|---|---|
| A second GitHub credential | Keeps the review credential's reach unchanged (DR-002) | Reusing `lfx-one` extends a write-capable token to `workspace-org-lens` |
