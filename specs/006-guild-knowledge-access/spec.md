# Feature Specification: Make the workspace knowledge base available to Guild agents

**Feature Branch**: `feature/guild-tracer-knowledge-specs`
**Created**: 2026-11-12
**Status**: Draft
**Input**: User description: "workspace-org-lens has a knowledge base, well
curated and growing. Find a way to provide it to Guild agents."

## Context

Paths in this spec that start with `.knowledge/`, `scripts/`, `guild/` or
`.github/` are in `linuxfoundation/workspace-org-lens`. Paths under
`integration/` and `knowledge-probe/` are in this repository.

`workspace-org-lens/.knowledge/` is the team's curated platform knowledge: 380
tracked files, 332 of them Markdown, about 317,000 words, in 19 directories
that each have a `README.md` (for example `v2/nats`, `v2/v2-design`,
`v2/org-lens`). It
changed in 129 commits in the 30 days before 2026-11-12. The repository is
private.

Guild agents cannot use it today. Guild has no built-in retrieval store: its
documentation index lists no knowledge base, embedding or vector search
feature. Guild offers three ways to give an agent knowledge
([docs.guild.ai](https://docs.guild.ai/llms.txt)):

- **Workspace context**: one Markdown document injected verbatim into every
  agent's prompt. Native agents receive it in the first message of a session
  only.
- **Skills**: Markdown packages an agent loads on demand from a catalog.
  Documented for TypeScript `llmAgent`, Goose and OpenClaw agents; the docs do
  not say whether Native agents can use them.
- **Integrations**: live calls to external APIs. The `lfx-one-github`
  integration already declares `git_get_tree` and `repos_get_content`.

At about 420,000 tokens, the knowledge base is far too large for workspace
context, and it changes too often to copy by hand.

## Clarifications

### Session 2026-11-12 (auto mode, recommended answers accepted)

- Q: What is the map's size budget? -> A: 3,000 words (about 4,000 tokens).
  Workspace context goes into every agent's first prompt, and the docs warn
  that long context degrades agents. The 19 area READMEs produce an estimated
  1,000-word map, and the agent rules add about 300 words (FR-016), well inside
  the budget.
- Q: Which Guild workspaces are enabled? -> A: Only workspaces listed in a
  reviewed allowlist file in `workspace-org-lens`. Each entry records a check
  that
  every member can read the repository on GitHub. Start with one workspace.
- Q: May knowledge content reach the model provider unredacted? -> A: Yes, but
  only in workspaces whose model policy is limited to providers already
  approved for `workspace-org-lens`. Replies outside the enabled population are
  filtered (FR-013).
- Q: Which credential reads the repository? -> A: A dedicated read-only
  credential scoped to `workspace-org-lens`, behind its own integration, so the
  review agent's credential does not gain reach.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - An agent answers and cites the file (Priority: P1)

A Guild agent in an LFX workspace (for example the data tracer of spec 005)
gets a question such as "how do I connect to NATS in Development?". It finds
the relevant knowledge file, reads it, answers, and cites the file path and the
commit it read.

**Why this priority**: This is the whole value. Every other story supports it.

**Independent Test**: In a test workspace, ask an agent three questions whose
answers live in three different knowledge areas. Each reply cites the correct
file path and a commit SHA from `main`, and the content matches that file.

**Acceptance Scenarios**:

1. **Given** a question covered by a knowledge file, **When** an agent answers,
   **Then** the reply names the file path and the `main` commit SHA it read.
2. **Given** a question the knowledge base does not cover, **When** an agent
   answers, **Then** it says the knowledge base has no entry rather than
   inventing one.
3. **Given** a knowledge file changed on `main` an hour ago, **When** an agent
   reads it, **Then** it reads the current version, not a copy.

---

### User Story 2 - Agents start from an up-to-date map (Priority: P2)

Every agent in an enabled workspace starts with a short map of the knowledge
base: each area, what it covers, and its key files. When knowledge changes on
`main`, the map updates without anyone editing Guild by hand.

**Why this priority**: Without a map, an agent must list the whole tree on
every question, which is slow and costly.

**Independent Test**: Merge a change that adds a knowledge area. Confirm the
published workspace context lists the new area within one hour, with no manual
step.

**Acceptance Scenarios**:

1. **Given** a merge to `main` that changes an area README, **When** the sync
   runs, **Then** a new workspace context version is published that reflects it.
2. **Given** a generated map larger than the size budget, **When** the sync
   runs, **Then** it fails and publishes nothing.

---

### User Story 3 - Agents find a file by keyword (Priority: P3)

An agent that cannot place a question in an area from the map searches the
knowledge base by keyword and gets matching file paths.

**Why this priority**: The map covers most questions; search catches the rest.

**Independent Test**: Search for a term that appears in exactly one knowledge
file outside its area README. Confirm that file is returned.

**Acceptance Scenarios**:

1. **Given** a keyword present in knowledge files, **When** an agent searches,
   **Then** it gets matching paths limited to `.knowledge/`.

---

### Edge Cases

- A knowledge file contains an AWS account number or an Auth0 identifier
  (21 and 13 files respectively on 2026-11-12): what an agent may repeat
  depends on who can see its reply (see Authorization & Privacy).
- A pull request branch changes knowledge files: agents read `main` only
  (FR-002). Whether the integration can enforce this is open (research item 1);
  if it cannot, the residual risk is recorded before enabling (task T001a).
- GitHub is unreachable or rate-limited: the agent says the knowledge base is
  unavailable and does not answer from memory as if it had read it.
- A knowledge file is moved or renamed: the next map update reflects it; a
  stale path from an old session returns "not found", not old content.
- Knowledge text contains instructions ("ignore previous rules"): agents treat
  file content as data, never as instructions.

## Requirements *(mandatory)*

### Functional Requirements

#### Reading

- **FR-001**: Agents MUST be able to list knowledge files and read any file
  under `.knowledge/` in `linuxfoundation/workspace-org-lens`.
- **FR-002**: Agents MUST read from the `main` branch only.
- **FR-003**: Every answer that uses knowledge MUST cite the file path and the
  commit SHA read.
- **FR-004**: When no file covers a question, the agent MUST say so.
- **FR-005**: Agents MUST treat knowledge file content as untrusted data, not
  instructions.
- **FR-014**: When GitHub is unreachable or rate-limited, the agent MUST say
  the knowledge base is unavailable and MUST NOT present an answer as read
  from it.

#### Map

- **FR-006**: A map of the knowledge base MUST be generated on every merge to
  `main` that touches `.knowledge/`, the agent rules file, the allowlist or the
  map scripts. Each area's summary comes from its README;
  its key files are the Markdown files the README links, or, when it links
  none, the first five Markdown files in the directory by name.
- **FR-007**: The map MUST be published as the workspace context of each
  enabled workspace, replacing only its generated section and preserving
  hand-written context.
- **FR-008**: The map MUST stay within a size budget; a sync that exceeds it
  MUST fail and publish nothing. Budget: 3,000 words (see Clarifications),
  rules included.
- **FR-016**: The generated block MUST contain the complete agent rules that
  FR-002 to FR-005, FR-009, FR-013 and FR-014 place on agents, copied verbatim
  from `guild/knowledge-agent-rules.md`, which lives outside `.knowledge/`.
  Agents MUST NOT depend on loading any file path to learn these rules: a
  Native agent can only read its prompt and its workspace context. A sync that
  cannot read the rules file MUST fail and publish nothing (DR-005).

#### Search

- **FR-009**: Agents MUST be able to search knowledge files by keyword, and
  MUST qualify every search with `workspace-org-lens` and the `.knowledge/`
  path.
  The hard limit is the credential's single-repository scope (FR-010); the path
  qualifier is an agent rule, because Guild does not enforce request values.

#### Access and privacy

- **FR-010**: The GitHub credential used MUST be able to read this
  repository's contents and MUST NOT be able to write to it. It MUST be a
  dedicated credential scoped to `workspace-org-lens`, not the `lfx-one` review
  credential (DR-002).
- **FR-011**: Only workspaces whose members can all already read
  `linuxfoundation/workspace-org-lens` on GitHub MAY be enabled. Enabled
  workspaces are listed in a reviewed allowlist file; adding one requires a
  recorded membership check (DR-003).
- **FR-015**: Removing a workspace from the allowlist MUST remove the
  generated map block from its workspace context and remove it from the
  integration's credential policy on the next sync.
- **FR-012**: Before publishing the map, the sync MUST run a secret scan
  over its output and fail on any finding.
- **FR-013**: In any output an agent sends outside a Guild session of an
  enabled workspace (GitHub issue or pull request comments, Slack messages,
  email), it MUST NOT include, from knowledge files: 12-digit AWS account
  numbers, AWS ARNs, `auth0|` identifiers, or GitHub or LFX usernames.
  Knowledge content MAY reach the workspace's model provider unredacted only
  when the workspace's model policy is limited to providers LF security has
  approved for `workspace-org-lens`, recorded in the allowlist entry (DR-004).

### Key Entities

- **Knowledge file**: a Markdown file under `.knowledge/`, identified by path
  and commit SHA.
- **Area**: a directory with a `README.md` describing its scope.
- **Knowledge map**: generated summary of areas and key files, published as
  workspace context.
- **Enabled workspace**: a Guild workspace listed in the allowlist file;
  "allowlisted" means the same thing.

## Authorization & Privacy

### Per-fact authorization table

| Fact (field) | Grain | Subject | PII? | Gate of record | Read path | Parity argument / gate applied |
|---|---|---|---|---|---|---|
| Knowledge file content | per-object | the repository | no (mostly) | GitHub read access to the private repository | Guild agent via the dedicated knowledge credential (DR-002) | The credential reads on behalf of every workspace member, so enabled-workspace membership MUST be a subset of repository readers (FR-011) |
| AWS account numbers, cluster ARNs | per-object | LF infrastructure | no | Same | Same | Repeated only to the enabled population (FR-013) |
| Auth0 identifiers, usernames in examples | per-person | a named user | yes | Same | Same | Not repeated outside the enabled population (FR-013); model provider limited by DR-004 |
| Knowledge map | rollup | the repository | no | Same | Workspace context | Published only to enabled workspaces (FR-007, FR-011); secret-scanned (FR-012) |

**Cross-lens navigation**: None.

**Decisions**: recorded in `decisions/` (see Decision records).

### Decision records

| Record | Settles | Status |
|---|---|---|
| [DR-001](decisions/DR-001-live-read-plus-map.md) | Read knowledge live from GitHub with a generated map in workspace context; no skills copy, no vector index | Accepted |
| [DR-002](decisions/DR-002-dedicated-read-credential.md) | Dedicated read-only, single-repository credential and integration, not the `lfx-one` review credential | Accepted |
| [DR-003](decisions/DR-003-workspace-allowlist.md) | Enabled workspaces come from a reviewed allowlist with a recorded membership check | Accepted |
| [DR-004](decisions/DR-004-model-provider.md) | Knowledge may reach the model unredacted only under an approved model policy; replies are filtered by audience | Accepted |
| [DR-005](decisions/DR-005-rules-in-generated-block.md) | Agent rules ship verbatim inside the generated block, sourced from `workspace-org-lens` | Accepted |

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For 20 questions with known answers across at least 8 areas, an
  agent cites the correct file in at least 17.
- **SC-002**: A knowledge change merged to `main` appears in the published map
  within 1 hour, in every enabled workspace.
- **SC-003**: Zero map publications contain a secret, measured by the sync's
  scan log.
- **SC-004**: The map adds no more context than the size budget to any agent
  prompt.

## Assumptions

- Area READMEs stay the authoritative description of each area; the map is
  generated from them.
- A dedicated read-only credential can be granted to `workspace-org-lens` alone
  (DR-002).
- Guild workspace context can be published from CI with an API key through
  the REST API (`POST /workspaces/{id}/contexts`, `status: PUBLISHED`).
- A vector index or other semantic search service is out of scope; keyword
  search plus the map is the design. Revisit only if SC-001 fails.
