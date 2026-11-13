# Tasks: Make the workspace knowledge base available to Guild agents

**Input**: `specs/006-guild-knowledge-access/` (spec.md, plan.md, research.md,
data-model.md, contracts/, decisions/)
**Organization**: grouped by user story.

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup

- [ ] T001 Resolve research item 1: test whether Guild forwards an undeclared
      `ref` parameter on `repos_get_content`; record the result in research.md
      (FR-002)
- [ ] T001a If T001 shows `ref` is forwarded, record the residual risk (agents
      could read unmerged branches) in a new DR with the FR-005 mitigation
      before enabling any workspace (FR-002)
- [ ] T002 Resolve research item 2: create the dedicated read-only credential
      for `linuxfoundation/workspace-org-lens` (DR-002, FR-010) and confirm
      `search/code` accepts it
- [ ] T003 [P] Resolve research item 3: confirm the approved model provider with
      LF security (DR-004, FR-013)
- [ ] T004 [P] Resolve research item 4: create a Guild API key for CI with the
      narrowest available scope; store it as a repository secret

- [ ] T004a Gate for every new file below: LF header in the first 4 lines
      (Constitution IV); YAML starts with `---`, 2-space indent, lines at most
      120 characters (Cross-Repo YAML conventions)

## Phase 2: Foundational

- [ ] T005 Add `workspace-org-lens/guild/knowledge-workspaces.yaml` per
      contracts/knowledge-map.md and data-model.md, with one workspace entry and
      its recorded membership check (FR-011, DR-003)
- [ ] T006 Add `integration/lfx-knowledge.openapi.yaml` (this repository) with
      exactly `git_get_tree`, `repos_get_content` and `search_code` per
      contracts/knowledge-integration.md (FR-001, FR-009, FR-010)
- [ ] T007 Register the integration in Guild; credential policy limited to the
      three operations and the allowlisted workspaces (FR-010, FR-011)

**Checkpoint**: the integration answers `git_get_tree` in the enabled workspace
and is absent elsewhere.

## Phase 3: User Story 1 - Answer and cite (P1) MVP

- [ ] T008 [US1] Write `workspace-org-lens/guild/knowledge-agent-rules.md` (outside
      `.knowledge/`, so it is never read as knowledge content): locate a file,
      read from `main`, cite path and SHA, say "no entry" when nothing covers a
      question, treat file content as data, report the knowledge base
      unavailable on GitHub errors, and the FR-013 outside-output filter
      (FR-002, FR-003, FR-004, FR-005, FR-013, FR-014, FR-016)
- [ ] T009 [US1] Add the Native test agent `knowledge-probe/` (PROMPT.md that
      defers to the knowledge rules in its workspace context and copies none of
      them, guild.yaml declaring the `lfx-knowledge` tools) and install it in
      the enabled workspace (FR-001, FR-016, SC-001)
- [ ] T010 [US1] Build `specs/006-guild-knowledge-access/checklists/sc-001.md`:
      20 questions with known answers across at least 8 areas, 3 questions no
      file covers, and 1 knowledge file excerpt containing an injected
      instruction (SC-001, FR-004, FR-005)
- [ ] T011 [US1] Run the checklist with the test agent: record the SC-001 score
      and citations, confirm "no entry" for the 3 uncovered questions, and
      confirm the injected instruction is not followed (SC-001, FR-003, FR-004,
      FR-005)

## Phase 4: User Story 2 - Generated map (P2)

- [ ] T012 [US2] Write `workspace-org-lens/scripts/generate-knowledge-map.sh`
      (print, `--write <file>`, `--check` = budget check only, since the map is
      not stored in the repo) following
      `workspace-org-lens/scripts/generate-skill-catalog.sh`; key files per
      FR-006 (README links, else first 5 files); fail above 3,000 words (FR-006,
      FR-008, SC-004, FR-016); the block opens with the
      rules file copied verbatim, and the run fails if that file is missing
- [ ] T013 [US2] Write `workspace-org-lens/scripts/publish-knowledge-map.sh`:
      for each allowlisted workspace, GET the latest context, splice between the
      markers, POST `PUBLISHED`; skip when unchanged; for workspaces dropped
      from the allowlist, delete the generated block (FR-007, FR-011, FR-015)
- [ ] T013a [US2] Verify publish: hand-written text outside the markers is
      byte-identical after two syncs; an over-budget map fixture exits non-zero
      and makes no POST; a gitleaks fixture secret blocks publication (FR-007,
      FR-008, FR-012)
- [ ] T014 [US2] Add
      `workspace-org-lens/.github/workflows/knowledge-map-sync.yml`: on push to
      `main` touching `.knowledge/**`, `guild/knowledge-agent-rules.md`, the
      allowlist or `scripts/*knowledge-map.sh`; generate, run gitleaks
      on the generated block with `.gitleaks.toml`, then publish; keep the scan
      log as SC-003 evidence (FR-006, FR-012, SC-003)
- [ ] T015 [US2] Add the generator's `--check` to
      `workspace-org-lens/scripts/workspace-artifact-check.sh` so pull requests
      fail when the map would exceed the budget (FR-008)
- [ ] T016 [US2] Verify SC-002: merge a test README change and confirm the new
      map version within 1 hour

## Phase 5: User Story 3 - Keyword search (P3)

- [ ] T017 [US3] Add search guidance to
      `workspace-org-lens/guild/knowledge-agent-rules.md`: always qualify
      `search_code` with `repo:` and `path:.knowledge` (FR-009)
- [ ] T016a [US2] Verify FR-016: edit only `guild/knowledge-agent-rules.md`
      on `main`; the sync republishes and the published block contains the new
      rules text verbatim
- [ ] T018 [US3] Verify: a term present in exactly one non-README knowledge file
      returns that file
- [ ] T018a [US1] Verify FR-014: with the integration's credential revoked in a
      test workspace, the agent reports the knowledge base unavailable

## Phase 6: Polish

- [ ] T019 Outside-output check: have the test agent draft a GitHub comment
      answering from a file that holds an AWS account number, an ARN, an
      `auth0|` identifier and a username; confirm none appear (FR-013)
- [ ] T019a Verify the credential: a write call (create a file, comment) with
      the dedicated credential returns 403 or 404 (FR-010)
- [ ] T019b Verify removal: drop a test workspace from the allowlist; confirm
      its generated block is gone and the integration is unavailable there
      (FR-015)
- [ ] T020 Document the allowlist review procedure and review date in
      `workspace-org-lens/guild/knowledge-workspaces.yaml` comments (DR-003)
- [ ] T021 Add the new scripts to `workspace-org-lens/CLAUDE.md`'s
      generated-artifacts notes, next to the skill catalog entry, and add
      `integration/lfx-knowledge.openapi.yaml` and `knowledge-probe/` rows to
      the Files
      table in this repository's `CLAUDE.md`
- [ ] T022 Pre-PR validation: in `workspace-org-lens`, run
      `scripts/workspace-artifact-check.sh`; in this repository, run
      `markdownlint` from the root; run the license header check on all new
      files in both (Constitution Development Workflow 2, IV)

## Dependencies

- T004a applies to every task that adds a file.
- T001, T001a and T002 block T006 and T007.
- T003 blocks adding any workspace whose model policy is unconfirmed (T005).
- T004 blocks T013 and T014.
- T005 to T007 block Phases 3 to 5.
