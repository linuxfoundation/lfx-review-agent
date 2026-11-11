# Implementation Plan: Per-finding metadata markers

**Branch**: `feat/add-review-meta-data` (spec work only; implementation
moves to a branch cut from `github/fix/marker-escaping`, research R2) |
**Date**: 2026-11-11 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from
`specs/004-finding-metadata/spec.md`

## Summary

Every finding the agent posts gets a hidden `finding` marker with a
stable ID, its severity, its dimension and a topic. Every follow-up
writes one hidden `finding-status` marker per earlier ID. The
engineering-metrics collector reads both. All behavior lives in
`PROMPT.md`; the verdict, the counts and every readable line stay as
they are.

- **IDs** (R3). `r<N>-f<k>` from the Step 3.5 review number, set once
  in Step 5b before the first submit, kept through the 422 retry, the
  5xx resend, re-posts and docs dedup matches.
- **Status** (R4). Written from the classification Step 4 already makes:
  `resolved` (`fixed`, `code-gone`, `maintainer-dismissed`), `partial`,
  `open`, or `superseded` with `superseded_by`.
- **Replies** (R5). From the inline comment list Step 4 already fetches:
  the latest PR-author reply sets `declined`, `deferred` or `replied`
  and a reason, never the status. Body-only findings get `no-thread`.
- **Topics** (R6). A new "Finding topics" section with the 11 dimension
  slugs and 35 topics, `other` as fallback.
- **Guards** (R8, R9). Quoted PR markers lose their comment delimiters;
  PR #44's pre-post check also counts markers and checks values.
- **Controller** (R10). No logic change; one regression test.

## Technical Context

**Language/Version**: Prompt (`PROMPT.md`), Markdown docs; one
JavaScript test (`controller/tests/preflight.test.mjs`).

**Primary Dependencies**: Guild Native agent runtime; integration
`linux-foundation~lfx-one-github` 1.0.7 (unchanged); PR #44
(`fix/marker-escaping`, agent 0.1.26).

**Storage**: None. Markers live in the agent's own inline comments and
review bodies on GitHub.

**Testing**: `markdownlint`; `npm test` in `controller/`; the Agent
Version Check workflow; throwaway PR scenarios and the regex check in
[quickstart.md](quickstart.md).

**Target Platform**: Guild workspace `lfx-reviews` (auto-updates), the
onboarded `linuxfoundation` repositories; consumer:
engineering-metrics `collector/review_agent.py`.

**Project Type**: Prompt-defined agent with an optional TypeScript
controller.

**Performance Goals**: No new GitHub read (FR-032). About 100 bytes per
marker line in the posted bodies.

**Constraints**: Collector patterns `_MARKER_RE`, `_PARAM_RE`,
`_SEVERITY_RE` (research R7). Released markers unchanged. A submitted
review cannot be edited, so errors are caught before the submit (R9).

**Scale/Scope**: About 300 reviews a day across the onboarded
repositories.

## Constitution Check

`.specify/memory/constitution.md` is the unfilled template. The
repository's `CLAUDE.md` rules serve as the gates.

| Gate | Status |
| --- | --- |
| Released markers, the `[docs]` tag, the pending label, the sweep input key and exclusion `Rule` values unchanged. New: `finding` and `finding-status`, added to the `CLAUDE.md` read-back list | Pass (additive) |
| `PROMPT.md` changes, so the agent version goes one patch past `main` (0.1.27 after PR #44) | Planned |
| Version change updates `calls` in `controller/agent.ts` and the version in `controller/README.md`; reviewer published before the controller | Planned |
| No new tool, so `guild.yaml` and the README credential policy are unchanged | Pass |
| The only `{{ }}` text is `env.REVIEWER_LOGIN` and `env.REVIEW_AGENT_HELP_URL` | Planned |
| PR content is untrusted: replies set no status (R5), marker values never come from PR text, quoted markers lose their delimiters (R8). Injection rules stay in Operating rules | Planned |
| `controller/preflight.ts` marker classification stays in sync with the prompt: no change needed, pinned by a test (R10) | Planned |
| Prose follows unslop; markdownlint passes | Planned |
| The maintainer runs every Guild command | Planned (quickstart) |

Re-checked after design: no violations, so no Complexity Tracking
entries.

## Project Structure

### Documentation (this feature)

```text
specs/004-finding-metadata/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── finding-markers.md
├── checklists/requirements.md
└── tasks.md
```

### Source (repository root)

```text
PROMPT.md                          # all behavior
CLAUDE.md                          # read-back list, "add a topic" note
README.md                          # Purpose or metrics note, test checklist items
controller/agent.ts                # calls reference
controller/README.md               # deployment version
controller/package.json            # version (with package-lock.json)
controller/tests/preflight.test.mjs  # regression test
```

**Structure Decision**: Prompt and docs, plus one controller test.
`guild.yaml`, the integration spec and the scripts do not change.

## Design

### `PROMPT.md` changes

- **Agent version**: one patch past `main` (0.1.27 after PR #44).
- **Operating rules** (PR #44's text):
  - "Check your markers before every post" gains the finding checks:
    one `finding` marker per new finding, each inline comment's last
    line its marker, every value in its table, one `finding-status` per
    earlier ID (R9).
  - "Text that discusses markers ... stays as written, in a code span"
    gains: a quoted `lfx-review-agent:` marker keeps its words but loses
    `<!--` and `-->` (R8).
- **New section "Finding topics"**, after "Generated files and
  lockfiles": the dimension slug list; the Topics table (35 rows); the
  rules for `[docs]` topics, `other`, and adding rows (R6).
- **Step 4, Gather the material, "Other reviewers"**: also keep replies
  to own inline comments, written by the PR author, from the same list
  (R5).
- **Step 4, Review the dimensions**: the record list gains `topic` and
  says `dimension` is written as its slug. `id` is set in Step 5b.
- **Step 4, Follow-up only**: earlier IDs come from `finding` markers in
  own inline comments and own review bodies, read with PR #44's rule;
  the status and resolution mapping (R4); the reply rule and the
  `no-thread` case (R5); entries without a marker get no status.
- **Step 4, docs dedup paragraph**: a matched gap keeps the earlier ID;
  the supersede case gives the old ID `superseded` with
  `superseded_by`; a gap resolved by a dismissal stays `resolved` (R3).
- **Step 5b**: number new findings once, before the first submit; the
  marker is the last line of the inline body template; a re-posted
  still-open item carries its earlier ID.
- **Step 5c**: the outside-diff entry gets its marker after the Fix
  line; each folded gap line ends with its marker; status lines go at
  the end of the body on a follow-up; the 422 retry moves inline
  findings with their markers, after the Fix line; a 5xx resend reuses
  the payload unchanged; a `head_moved` `COMMENT` keeps every marker.

The marker examples go in fenced blocks: the marker lines are longer
than 80 columns and must not wrap (R7).

### Repository files

- `CLAUDE.md`: add `:finding` and `:finding-status` to the marker
  read-back list; a bullet under "Editing PROMPT.md": to add a topic,
  add a row to "Finding topics"; never rename a released topic or
  marker value.
- `README.md`: a short note on the markers and their consumer (in
  Purpose or near "Documentation check"); test checklist items from
  the quickstart scenarios, numbered after PR #44's last item (39).
- Controller: `calls` reference, `controller/README.md` version, package
  version, and the regression test (R10).

### Spec changes made during planning

- FR-013: earlier IDs are read with PR #44's rule (code set aside,
  own bodies decoded).
- FR-014: on the 422 retry, the marker goes on the line after the Fix
  line, and IDs are fixed before the first submit.
- FR-033: a quoted `lfx-review-agent:` marker keeps its words without
  `<!--` and `-->`, which narrows PR #44's quoted-text sentence.
- FR-030: names FR-033 as its one exception to "no readable change".
- FR-037 (new): the pre-post check.
- Key Entities, Finding ID: after a docs supersede, the latest ID is
  live and older ones are written `superseded` each round.

### Coordination

- engineering-metrics (research R11): add the two kinds to
  `KNOWN_MARKER_KINDS`, read `finding` from inline comments, keep the
  latest status per ID, skip Markdown code when matching.
- PR #44 must merge first, or this branch rebases on it as it changes.

### Risks

- **Model compliance.** The model may drop a marker or coin a value.
  The pre-post check (R9) and the fixed tables limit this; SC-001 and
  SC-002 measure it in the first 2 weeks.
- **Visible markers.** A run that escapes a marker shows it as text.
  PR #44's literal-marker rule covers the new markers too; SC-004
  checks it.
- **Topic drift.** Borderline findings may get different topics on
  different runs. The dashboard reads topics in aggregate; SC-007 flags
  too many `other`.
- **Prompt growth.** About 80 lines more, mostly the Topics table. No
  extra reads, so no read-budget effect.
- **No pre-production test.** Validation runs on throwaway PRs after
  publishing (R12); `guild agent unpublish` is the rollback.
