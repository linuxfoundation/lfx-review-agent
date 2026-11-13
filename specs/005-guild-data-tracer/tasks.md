# Tasks: Guild-hosted LFX data tracer

**Input**: `specs/005-guild-data-tracer/` (spec.md, plan.md, research.md,
data-model.md, decisions/)
**Organization**: grouped by user story. Paths are proposals until research item
1 is resolved.

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup

- [ ] T001 Resolve research item 2 (Guild egress model) and record the answer in
      research.md
- [ ] T002 Resolve research item 1 (read-surface host service) and record the
      answer in research.md
- [ ] T003 Resolve research item 3 (gold and platinum layer names) from `lf-dbt`

## Phase 2: Foundational (blocks all stories)

- [ ] T005 Create the read-only Snowflake role for gold and platinum (DR-001,
      FR-009, FR-013) in lfx-v2-opentofu
- [ ] T006 Add the read-only platform endpoints per contracts/read-surface.md,
      with the asker principal header and the per-object FGA check plus
      allowlist (FR-022, DR-004), (KV get FR-006, FGA check and list FR-007,
      indexed read FR-008) in the host service chosen by T002, with gateway
      authorization (LFX platform constitution I, FR-011)
- [ ] T007 Add a write-verb test that fails if any new endpoint accepts POST,
      PUT, PATCH or DELETE (FR-012)
- [ ] T007a Denied-object tests: a staff asker without project `auditor_guard`
      gets 403 for a committee and a meeting; an unlisted KV bucket gets 403; an
      indexed object the asker cannot audit gets 403; a missing `X-Tracer-Asker`
      gets 403; 403 bodies never confirm existence (FR-022)
- [ ] T007b Request arch review (ADR-0032) for asserted asker principals and
      committee or meeting reads; keep those types disabled until signed off
      (DR-004)
- [ ] T008 Build the staff-only start gate against `lf-staff` (DR-004, FR-015)
      and the verified Slack/GitHub to LFX identity mapping (research item 6)
- [ ] T009 Build the audit record sink to the Guild run log, with a query that
      counts write calls per month as SC-003 evidence (FR-018, SC-003)
- [ ] T009a Pin the tracer to Development: reject any other environment with the
      User Story 4 scenario 1 reply (FR-019, DR-003)
- [ ] T009b [P] GitHub read tool for lfx-self-serve issues and pull requests,
      read-only scope (FR-010)
- [ ] T009c Warehouse reply filter: plain counts only; block per-person rows and
      non-granted aggregates pending arch-review sign-off (FR-017, ADR-0038 (c))

**Checkpoint**: read surface and asker gate pass before any user story starts.

## Phase 3: User Story 1 - Slack trace (P1) MVP

- [ ] T010 [US1] Agent prompt in `tracer/PROMPT.md`: Slack thread trigger, reply
      format and verdict rules (FR-001, FR-003)
- [ ] T011 [US1] Read earlier thread messages for follow-ups (FR-005)
- [ ] T012 [US1] One clarifying question on ambiguous subject (FR-004)
- [ ] T013 [US1] Refuse correction requests and name the owner (User Story 1
      scenario 4)
- [ ] T014 [US1] Failed-hop handling: mark chain incomplete, no verdict for
      unread part (FR-021)
- [ ] T015 [US1] Smoke test in Development on a known organization; capture
      the transcript and the time from question to reply, which must be under
      5 minutes (SC-001)
- [ ] T015a [US1] Run 10 previously solved investigations; record each
      verdict against its known resolution, at least 8 must match (SC-002)

## Phase 4: User Story 2 - Access questions (P2)

- [ ] T016 [US2] FGA check tool with direct versus inherited output (FR-007)
- [ ] T017 [US2] Refuse grant or revoke requests (FR-014)
- [ ] T018 [US2] Smoke test: one granted and one denied pair in Development

## Phase 5: User Story 3 - GitHub trigger (P3)

- [ ] T019 [US3] Trigger phrase at comment start only; ignore quoted or embedded
      phrases (FR-002)
- [ ] T020 [US3] Privacy scan on public replies (FR-016); block on findings
- [ ] T021 [US3] Post the full trace to the private channel and link it from the
      issue (User Story 3)
- [ ] T022 [US3] Refuse non-staff askers with no data (User Story 3 scenario 3)

## Phase 6: User Story 4 - Production (P4), out of release one

- [ ] T023 [US4] Blocked: needs a new DR after the privacy audit (DR-003). Not
      scheduled.

## Phase 7: Polish

- [ ] T024 Privacy audit run over sample replies (SC-004)
- [ ] T025 Spend budget and concurrency limit (FR-020)
- [ ] T026 Injection test: question text asking for a grant must not change
      behaviour (edge case)

## Dependencies

- T001 to T003 block T006 and T005.
- T006, T007a and T008 block all of Phases 3 to 5.
- T007b blocks enabling `committee` and `v1_meeting` in the allowlist.
- T023 is excluded from release one.
