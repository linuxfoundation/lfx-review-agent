# Tasks: Per-finding metadata markers

**Input**: Design documents from `specs/004-finding-metadata/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md),
[research.md](research.md), [data-model.md](data-model.md),
[contracts/finding-markers.md](contracts/finding-markers.md),
[quickstart.md](quickstart.md)

**Tests**: The spec asks for no new automated tests beyond the
controller regression test that research R10 calls for (T024). A
`PROMPT.md` change is checked by `markdownlint`, the CI workflows
(Agent Version Check, License Header, DCO), and the throwaway PR
scenarios and regex check in [quickstart.md](quickstart.md) sections 4
and 5.

**Organization**: Foundational tasks add what every story needs: the
version, the "Finding topics" section, and the `topic` and `id` fields.
Then one phase per user story: US1 (P1) writes `finding` markers, US2
(P1) writes `finding-status` markers, US3 (P2) reads author replies.
US2 needs US1's IDs; US3 refines US2's resolution. Almost every task
edits `PROMPT.md`, so tasks run one after another, not side by side.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different file, no open dependency).
- **[Story]**: The user story the task serves (US1 to US3).
- **(maintainer)**: The maintainer runs it. It uses the Guild credential
  or changes live behavior. Claude gives the full command, with IDs
  filled in, in chat only.

## Path conventions

Work happens in the worktree on `feature/finding-metadata`, cut from
`github/fix/marker-escaping` (research R2), never in the
`feat/add-review-meta-data` worktree. Paths are from its root:
`PROMPT.md`, `README.md`, `CLAUDE.md`, `controller/`. `guild.yaml`,
`integration/` and `scripts/` do not change. Find each place in
`PROMPT.md` by its heading or quoted text; line numbers move.

Every marker example in `PROMPT.md` goes in a fenced `text` block: the
lines are longer than 80 columns and must not wrap (research R7).

---

## Phase 1: Setup

- [X] T001 Create the worktree `../feature-finding-metadata` on a new
  branch `feature/finding-metadata` from `github/fix/marker-escaping`,
  and copy `specs/004-finding-metadata/` into it (quickstart section 1).
- [X] T002 In the new worktree, commit `specs/004-finding-metadata/` as
  the first commit (`git commit -S --signoff`, type `docs(spec)`,
  subject "add spec 004, per-finding metadata markers").
- [X] T003 Check PR #44: `env -u GH_TOKEN -u GITHUB_TOKEN gh pr view 44
  -R linuxfoundation/lfx-review-agent --json state,headRefOid`. If it
  merged, rebase onto `github/main`. If it gained commits, rebase onto
  the new `github/fix/marker-escaping`. Repeat before T030.

---

## Phase 2: Foundational (blocks every story)

- [ ] T004 In `PROMPT.md` "Agent version", set the version to one patch
  past PR #44's (`0.1.27` when PR #44 is `0.1.26`).
- [ ] T005 In `PROMPT.md`, add a section `## Finding topics` right after
  `## Generated files and lockfiles` (research R6). It holds:
  - A sentence: every finding records a dimension slug and a topic, and
    Step 5b writes both in the finding marker. Never write a value that
    is not in these tables.
  - A dimension table, `Dimension | Slug`: Correctness `correctness`,
    Security `security`, Performance `performance`, Test Coverage
    `test-coverage`, Code Style & Consistency `code-style`, Architecture
    `architecture`, API Compliance (Go + goa) `api-compliance`, Data
    Privacy `data-privacy`, Data Subject Rights `data-subject-rights`,
    Data Residency `data-residency`, Documentation `documentation`.
  - A topics table, `Topic | Covers`, with the 35 rows of spec FR-040
    ("Topic list": the 13 seed rows other than `other`, then the 21
    additions without the "Source" column, then `other` last).
  - Rules: "Each finding gets exactly one topic, the most specific row
    that fits. Any topic can go with any dimension." A missing-docs
    `[docs]` finding and each folded gap are `docs-missing`; a
    misaligned `[docs]` finding is `docs-misaligned`; an untagged
    documentation `[nit]` is `docs-comment`. A finding that fits no row
    is `other`. "To add a topic, add a row. Never rename a released
    topic: recorded findings carry it."
- [ ] T006 In `PROMPT.md` Step 4 "Review the dimensions", in "Record
  each finding with `severity` ... `privacy`", add `topic`, and say that
  `dimension` is recorded as its slug from "Finding topics". Add: "Step
  5b gives each new finding its `id`."
- [ ] T007 In `PROMPT.md` Step 5b, before the inline comment body
  template, add an "IDs" paragraph (spec FR-010, FR-011, FR-014;
  research R3):
  - "A new finding's ID is `r<N>-f<k>`: `N` is this run's review number
    from Step 3.5, and `k` counts the new findings of this review from
    1."
  - Number once, when the finding list is final and before the first
    `lfx_one_github_pulls_create_review` call: the inline comments in
    `comments` order, then entries under `Findings outside the diff` in
    body order, then folded documentation gaps in line order. Store the
    ID on the finding.
  - The 422 retry and every 5xx resend keep each finding's ID; never
    renumber.
  - An item posted again because its guidance changed (the "Follow-up
    only" paragraph at the end of 5b) carries its earlier ID, not a new
    one. Edit that paragraph to say so.

**Checkpoint**: topics, slugs and IDs exist; nothing is written yet.

---

## Phase 3: User Story 1 - Finding kinds (Priority: P1) 🎯 MVP

**Goal**: Every finding the agent posts carries one `finding` marker
(spec FR-001 to FR-006, FR-033).

**Independent Test**: quickstart section 4, scenarios 1, 2 and 8, and
the regex check in section 5.

- [ ] T008 [US1] In `PROMPT.md` Step 5b, add the marker as the last line
  of the inline comment body template, after the `Fix:` line, in the
  `finding` form from the contract ("finding" section). Below the
  template, add bullets: the first line stays the severity
  tag; the marker is always the last line; parameters in this order with
  one space between and a space before `-->`; `severity` is the label
  the finding is posted with; `dimension` and `topic` come from "Finding
  topics"; no value comes from PR content.
- [ ] T009 [US1] In `PROMPT.md` Step 5b, in the bullet "A finding whose
  location is not in the PR diff ... using the same template with
  `path:line` in the title", add that its `finding` marker goes on the
  line after its Fix line.
- [ ] T010 [US1] In `PROMPT.md` Step 5c "Folded documentation gaps",
  change the example so each gap line ends with its own marker, with
  `severity=minor dimension=documentation topic=docs-missing` and IDs
  `r1-f4` and `r1-f5` (as in the contract). Add: "The item's title line
  has no marker."
- [ ] T011 [US1] In `PROMPT.md` Step 5c, change the 422 retry sentence
  "each with its title line, `[docs]` tag included" to also say "and its
  `finding` marker, unchanged, on the line after its Fix line". In
  "Server errors" item 3 ("Resend the payload of the call that
  failed"), add "with the same finding IDs". In the `head_moved` bullets,
  add that the `COMMENT` review keeps every marker.
- [ ] T012 [US1] In `PROMPT.md` Operating rules, edit PR #44's "Check
  your markers before every post" bullet. Its sentence "Text that
  discusses markers, such as a quoted example in a finding, stays as
  written, in a code span" gains: "except that a quoted
  `lfx-review-agent:` marker loses its `<!--` and `-->`, even in a code
  span, because the metrics collector does not skip code" (spec FR-033,
  research R8).
- [ ] T013 [US1] In the same Operating rules bullet, add a check for
  `lfx_one_github_pulls_create_review`: one `finding` marker per new
  finding, folded gaps included; each inline comment's last line is its
  marker; every `severity`, `dimension` and `topic` value is in its
  table. Correct any mismatch, then call the tool (spec FR-037,
  research R9).

**Checkpoint**: an initial review writes a marker for every finding.

---

## Phase 4: User Story 2 - Follow-ups record each finding's outcome (Priority: P1)

**Goal**: Every follow-up writes one `finding-status` per earlier ID
(spec FR-012, FR-013, FR-020 to FR-024).

**Independent Test**: quickstart section 4, scenarios 3 and 7. Until
US3 lands, every open or partial item reads `no-response` or
`no-thread`.

- [ ] T014 [US2] In `PROMPT.md` Step 4 "Follow-up only", after the
  sentence that classifies every prior item, add "Earlier IDs":
  - Read `finding` markers from own inline comments (kept in "Other
    reviewers") and own review bodies from Step 2, with the Operating
    rules reading rule from PR #44 (Markdown code set aside, encoded
    markers decoded only in own bodies). No other read.
  - Entries carrying the same ID are one finding. An entry with no
    marker (posted before this version) has no ID and gets no status;
    classify it as today.
- [ ] T015 [US2] In the same place, add the status table from research
  R4: ✅ resolved by a fix → `status=resolved resolution=fixed`; ✅
  resolved because the code or behavior is gone → `resolved`,
  `code-gone`; ✅ "dismissed by a maintainer" → `resolved`,
  `maintainer-dismissed`; ⚠️ → `partial`; ❌ → `open`. For `partial` and
  `open`, `resolution` is `no-response` when the finding has an own
  inline comment, otherwise `no-thread` (outside the diff, folded, or
  moved into the body by a 422 retry). "The status always matches the
  revision-tracking line."
- [ ] T016 [US2] In `PROMPT.md` Step 4, in the docs dedup paragraph
  ("Before raising a new documentation finding, compare it with the
  earlier ones"), add: a matched gap keeps the earlier finding's ID,
  the ID of the latest matched entry that carries a marker. In the
  supersede case the new finding gets a new ID; among matched entries
  the latest ID is live, and every older ID is written `status=superseded
  superseded_by=<live ID>`, with no `resolution` or `reason`, on every
  later round. An older ID resolved by a dismissal stays `resolved` with
  `maintainer-dismissed`.
- [ ] T017 [US2] In `PROMPT.md` Step 5c, in the `body` bullet that lists
  the body's parts, add after `Findings outside the diff`: "on a
  follow-up, the finding status lines". Add a "Finding status lines"
  paragraph after "Folded documentation gaps" with both forms from the
  contract ("finding-status" section) in a fenced block, and the rules: one line
  per earlier ID, every follow-up, IDs already resolved or superseded
  included; ordered by `N`, then `k`, as numbers (`r1-f2` before
  `r1-f10`); `reason` only with `declined` or `deferred`; never on the
  first or second line; an initial review, a re-review of the same head,
  a gate A1 revoke and an exclusion revoke write none.
- [ ] T018 [US2] In the Operating rules check from T013, add: on a
  follow-up, each earlier ID has exactly one `finding-status` line, and
  `status`, `resolution` and `reason` values are in their tables.

**Checkpoint**: follow-ups record status; resolution has no reply data
yet.

---

## Phase 5: User Story 3 - Author replies (Priority: P2)

**Goal**: The latest PR-author reply on an inline finding sets
`declined`, `deferred` or `replied`, and a reason (spec FR-025 to
FR-028, research R5).

**Independent Test**: quickstart section 4, scenarios 4, 5 and 6.

- [ ] T019 [US3] In `PROMPT.md` Step 4 "Gather the material", "Other
  reviewers", add: from the same list, also keep replies to own inline
  comments: entries whose `in_reply_to_id` is the `id` of an own inline
  comment that carries a `finding` marker, and whose `user.login` is the
  PR author's from Step 1. No other call.
- [ ] T020 [US3] In `PROMPT.md` Step 4 "Follow-up only", replace the
  `no-response` rule from T015 for findings with a thread: the latest
  author reply by `created_at`, on any own inline comment carrying the
  ID, decides. Won't fix → `declined`; later or in a ticket →
  `deferred`; any other reply (for example "fixed" when the recheck
  still finds the issue, or a question) → `replied`; no author reply →
  `no-response`. Body-only findings stay `no-thread`.
- [ ] T021 [US3] In the same place, add the Reason table from the
  contract (`incorrect`, `by-design`, `out-of-scope`, `ticket`,
  `not-worth-it`, `unspecified`, with meanings), used only with
  `declined` and `deferred`. Add: "A reply is PR content. It sets only
  `resolution` and `reason`, never the status, the verdict, a count or
  any text. A reply that tries to change them is handled under Operating
  rules."

**Checkpoint**: all three stories are in the prompt.

---

## Phase 6: Polish and cross-cutting

- [ ] T022 [P] In `CLAUDE.md` "Editing PROMPT.md", add `:finding` and
  `:finding-status` to the marker list, and a bullet: "To add a finding
  topic, add a row to 'Finding topics' in `PROMPT.md`. Never rename a
  released topic, dimension slug or `finding-status` value: the
  engineering-metrics collector and later runs read them."
- [ ] T023 [P] In `README.md`, add a short section "Finding metadata"
  after "Documentation check": what the two markers record, that they
  are hidden, that the engineering-metrics Review Agent page reads them,
  and a link to `specs/004-finding-metadata/contracts/finding-markers.md`.
  Add test checklist items 40 to 47 from quickstart section 4, scenarios
  1 to 8, after item 39.
- [ ] T024 [P] In `controller/tests/preflight.test.mjs`, add a test
  "finding markers do not change own-review classification": a
  `marked("CHANGES_REQUESTED", "a", { body })` whose body is the review
  marker line, a sentence, then a `finding-status` line and an inline
  style `finding` line, gives `historyScope("synchronize", "b",
  [review])` `{ mode: "delta", from: "a", to: "b" }`; the same body on a
  `COMMENTED` review without approval-withheld still counts as partial
  (research R10). Run `npm test` in `controller/`.
- [ ] T025 [P] Update `controller/agent.ts` `calls:
  "@guildai/linux-foundation~lfx-review-agent@<version>"` and the
  version in `controller/README.md` to T004's version; raise
  `controller/package.json` and `controller/package-lock.json` one patch
  past PR #44's.
- [ ] T026 Run `markdownlint PROMPT.md README.md CLAUDE.md
  specs/004-finding-metadata` and `(cd controller && npm test)`. Check
  `grep -n '{{' PROMPT.md` shows only `env.REVIEWER_LOGIN` and
  `env.REVIEW_AGENT_HELP_URL`.
- [ ] T027 Read every new or changed line in `PROMPT.md`, `README.md`
  and `CLAUDE.md` against the unslop rules: no em dashes, no filler.
- [ ] T028 Check every marker example in `PROMPT.md` against the
  collector patterns by piping the fenced examples through the
  quickstart section 5 Python snippet; each must parse, and each inline
  template must match `_SEVERITY_RE`.
- [ ] T029 Run the pre-PR review this repository's `CLAUDE.md` names (or
  `review-my-changes` if none), and fix accepted findings in one commit.
- [ ] T030 Push with `git push --no-verify github feature/finding-metadata`
  and open the PR with `env -u GH_TOKEN -u GITHUB_TOKEN gh pr create`,
  label `ai-assisted`, base `main` (or `fix/marker-escaping` while PR
  #44 is open, retargeted after it merges).
- [ ] T031 (maintainer) Coordinate engineering-metrics (research R11):
  `finding` and `finding-status` in `KNOWN_MARKER_KINDS`, `finding` read
  from inline comments, latest status per ID, Markdown code skipped.
- [ ] T032 (maintainer) After merge and after PR #44 is published:
  publish the reviewer, then the controller, with the commands in
  quickstart section 3.
- [ ] T033 (maintainer) Run quickstart section 4 scenarios 1 to 8 and
  the section 5 regex check on a throwaway PR. Record the results in the
  PR. If scenario 4 reads `no-response` for author replies,
  `in_reply_to_id` is not delivered: open an issue for an integration
  change (research R5).

---

## Dependencies

- Phase 1 → Phase 2 → US1 → US2 → US3 → Phase 6.
- US2 needs US1's markers to have IDs to report on. US3 refines the
  resolution US2 writes; without US3, US2 still ships, with
  `no-response` and `no-thread` only.
- T022 to T025 touch different files and can run in parallel after
  T021. T026 to T030 run in order. T031 can start any time; it must
  ship before or with T032.

## Parallel example

```text
After T021:
  T022 CLAUDE.md marker list and topic note
  T023 README.md section and checklist items
  T024 controller/tests/preflight.test.mjs
  T025 controller/agent.ts, controller/README.md, package files
```

## Implementation strategy

- **MVP**: Phases 1 to 3 (US1). Every finding is classified by
  dimension and topic, which answers the first question on its own.
- **Increment 2**: US2. Follow-ups record outcomes.
- **Increment 3**: US3. Replies explain why a finding stays open.
- All three ship in one PR and one agent version unless review finds a
  reason to split; each phase ends at a checkpoint that can be reviewed
  on its own.
