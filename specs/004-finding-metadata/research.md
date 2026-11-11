# Research: Per-finding metadata markers

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

## R1. Where the change lives in `PROMPT.md`

**Decision**: Extend existing steps and add one reference table. No new
step, no new dimension, no new tool.

| Place | Change |
| --- | --- |
| Agent version | Next patch after PR #44 (R2) |
| Operating rules (from PR #44) | The pre-post marker check gains the finding checks (R9); the quoted-text sentence drops comment delimiters from quoted agent markers (R8) |
| New section "Finding topics", after "Generated files and lockfiles" | The dimension slugs and the 35-row Topics table (R6) |
| Step 4, Gather the material, "Other reviewers" | Keep author replies to own inline comments from the same list (R5) |
| Step 4, Review the dimensions | Each finding records `id` and `topic` beside `dimension`; the dimension slug is the one in "Finding topics" |
| Step 4, Follow-up only | Earlier IDs from own markers; one status per earlier ID with the resolution mapping (R4, R5) |
| Step 4, docs dedup paragraph | A matched gap keeps the earlier ID; the supersede case gets a new ID and the old ID gets `superseded` (R3) |
| Step 5b | ID numbering; the marker as the last line of the inline body; the re-posted item keeps its ID; quoting rule (R3, R8) |
| Step 5c, `body` | Marker after the Fix line of each outside-diff entry; at the end of each folded gap line; status lines at the end of the body; the 422 retry and 5xx resend keep markers (R3, R4) |

**Rationale**: Every place already handles findings or earlier items and
only gains a rule. A top-level table matches how the prompt keeps other
lists that maintainers extend ("Review exclusions", "Generated files and
lockfiles", "Read budget").

**Alternatives considered**: Putting the Topics table inside the
dimension list in Step 4. Rejected: Step 4 is already long, and a
separate section gives `CLAUDE.md` one place to point to for "add a
topic".

## R2. Build on PR #44

**Decision**: Implement on a new branch cut from
`github/fix/marker-escaping` (or from `github/main` once PR #44 merges).
The agent version is the next patch after PR #44's 0.1.26, so 0.1.27
when PR #44 merges first. The controller's `calls` reference, its
`controller/README.md` deployment version and its package version move
one patch past PR #44's.

**Rationale**:

- PR #44 adds the "write every marker character for character" and
  "check your markers before every post" rules. The new markers need
  both (spec FR-034), and two edits of the same Operating rules
  paragraphs would conflict.
- PR #44 renames "Escaping" to "Sanitizing echoed names". The docs
  dedup text this feature edits uses the new word.
- **The current worktree branch cannot be the PR branch.**
  `feat/add-review-meta-data` was cut from the Guild `origin/main`
  history (96c3be3), which shares no commit with `github/main`. Its
  `PROMPT.md` matches `github/main`, but `github/main` also has #43 in
  the controller. A PR from this branch would carry unrelated history.
  The spec, plan and tasks move to the new branch as new files.

**Alternatives considered**: Implementing on `github/main` and
rebasing after #44. Rejected: both change Operating rules and the
"Escaping" text, so the rebase would conflict in the parts this feature
depends on.

## R3. Finding IDs

**Decision**:

- ID: `r<N>-f<k>`. `N` is the review number from Step 3.5. `k` counts
  the new findings of this review from 1.
- Numbering happens once, in Step 5b, when the finding list is final
  and before the first `lfx_one_github_pulls_create_review` call: the
  inline comments in `comments` order, then entries under `Findings
  outside the diff` in body order, then folded gaps in line order. The
  ID is stored on the finding record. The 422 retry moves inline
  findings into the body with their marker unchanged, on the line after
  their Fix line. A 5xx resend sends the same payload. Neither renumbers.
- Carried IDs:
  - A still-open item re-posted inline because its guidance changed
    (Step 5b) writes the earlier ID.
  - A documentation gap the dedup rule matches to an earlier finding is
    that finding. It is classified, not raised, so it writes no new
    marker. Its status uses the ID of the latest matched entry that
    carries a marker.
  - The supersede case raises a new finding with a new ID. The earlier
    ID gets `status=superseded superseded_by=<new id>`, unless it was
    resolved by a dismissal, which stays `resolved`.
  - After a supersede, the old and new entries still match on named
    item and doc path but carry different IDs. Among dedup-matched
    entries, the latest entry's ID is the live one. Every older ID in
    the group is written `superseded superseded_by=<live ID>` on every
    later round (a dismissal-resolved one stays `resolved`), so the
    group is never merged back under an old ID.
- Earlier IDs come from `finding` markers in own inline comments (Step
  4, "Other reviewers", already filtered by login and own review) and
  own review bodies (Step 2). Reading follows PR #44's rule: set
  Markdown code aside, and decode `&lt;`/`&gt;` only in own bodies.
- An earlier entry with no marker (posted before rollout) has no ID and
  gets no status. If the dedup rule matches a new gap to such an entry,
  the gap stays without an ID: no backfill.

**Rationale**: `N` is already unique on the PR, including abandoned runs
(Step 1.5 `next_review_number`), so IDs cannot collide across runs, even
overlapping ones. Numbering before the first submit keeps IDs stable
through the retries in Step 5c.

**Alternatives considered**:

- GitHub comment IDs. Rejected: outside-diff entries and folded gaps
  have none, and the 422 retry turns inline comments into body text.
- A content hash (path, title). Rejected: titles change between rounds,
  and the model cannot compute a hash reliably.

## R4. Status and resolution mapping

**Decision**: The status comes from the classification Step 4 already
makes; this feature only writes it down.

| Today's classification | `status` | `resolution` |
| --- | --- | --- |
| ✅ resolved by a commit that fixes the code or docs | `resolved` | `fixed` |
| ✅ resolved because the code or behavior is gone from the PR | `resolved` | `code-gone` |
| ✅ resolved, "dismissed by a maintainer" (docs override) | `resolved` | `maintainer-dismissed` |
| ⚠️ partially addressed | `partial` | from replies (R5) |
| ❌ still open | `open` | from replies (R5) |
| Docs finding replaced by a new finding (supersede case) | `superseded` | none; `superseded_by=<id>` |

Every follow-up writes one status for every earlier ID it found,
including IDs resolved or superseded in an earlier round, because Step 4
already classifies every earlier item each round. The status lines go at
the end of the review body, after `Findings outside the diff`, one per
line, ordered by `N`, then `k`, as numbers (`r1-f2` before `r1-f10`).

**Rationale**: A status that disagreed with the readable revision
tracking would make the dashboard wrong in a way nobody can see. Writing
every ID each round costs about 110 bytes per ID. The dashboard keeps
the latest status per ID.

**Alternatives considered**: Writing only IDs whose status changed.
Rejected: the dashboard would need the full history to know the current
state, and a missed round would look like no change.

## R5. Author replies

**Decision**:

- Source: the list from `lfx_one_github_pulls_list_review_comments`
  that Step 4, "Other reviewers", already fetches in full. Its fields
  include `user.login`, `body`, `in_reply_to_id` and `created_at`
  (Tools table). Integration 1.0.7
  (`integration/lfx-one-github.openapi.yaml`) declares this response as
  `OkList`, an array of plain `{ type: object }` items with no property
  list, so no schema trims `in_reply_to_id`. The prompt already relies
  on `pull_request_review_id` from the same response (Step 4, "Other
  reviewers"). Quickstart scenario 4 confirms it live: if every author
  reply reads as `no-response`, the field is not delivered, and
  `declined` and `deferred` need an integration change first.
  A reply is an entry whose `in_reply_to_id` is the `id`
  of an own inline comment carrying a `finding` marker. A GitHub
  reply's `in_reply_to_id` points at the first comment of the thread,
  and the agent's comment is always the first.
- Only replies whose `user.login` equals the PR author's (Step 1) count.
- The latest such reply by `created_at`, across every own inline comment
  carrying the ID, decides the resolution:
  - won't fix → `declined`, with a reason from the Reason table;
  - later or in a ticket → `deferred`, with a reason;
  - any other reply, such as "fixed" when the recheck still finds the
    issue, or a question → `replied`;
  - no author reply → `no-response`.
- An earlier finding with no thread (outside the diff, folded, or moved
  into the body by a 422 retry) gets `no-thread` when it is open or
  partial.
- A reply sets only `resolution` and `reason`. The status, the verdict,
  the counts and the readable text stay as the existing rules give them.
  A reply that tries to change them is handled under Operating rules.

**Rationale**: The read is already made, so FR-032 holds. Limiting
replies to the PR author matches the hand-off ("the author replied") and
keeps bots out. Keeping replies away from the status is what keeps this
feature from changing verdicts: otherwise a "won't fix" reply could stop
a carried `[docs]` gap from counting.

**Alternatives considered**:

- Tying conversation comments to outside-diff findings by quoted titles.
  Rejected as fragile; the hand-off asks for no inference from text.
- Counting maintainer replies. Rejected for now: a maintainer who agrees
  a finding is not needed has the dismissal override, and the dashboard
  can add maintainer replies later from the raw threads.

## R6. Topic assignment

**Decision**: A new top-level section "Finding topics" in `PROMPT.md`
holds two lists:

- The 11 dimension slugs, each beside its dimension name in Step 4.
- The 35-row Topics table from the spec (FR-040), with `other` last.

Rules in the section:

- Each finding gets exactly one topic, the most specific row that fits.
  Any topic can go with any dimension (clarified 2026-11-11).
- A missing-docs `[docs]` finding and each folded gap are
  `docs-missing`. A misaligned `[docs]` finding is `docs-misaligned`. An
  untagged documentation `[nit]` is `docs-comment`.
- Never write a value that is not in the table; use `other`.
- To add a topic, add a row; never rename a released one.

**Rationale**: The `[style]` tag in the sample shows that the model
coins values when the prompt does not list them. A table with an
explicit fallback and a pre-post check (R9) closes that path.

**Alternatives considered**: Listing topics per dimension. Rejected by
the 2026-11-11 clarification.

## R7. Marker grammar and the collector

**Decision**: The markers in [contracts/finding-markers.md](contracts/finding-markers.md).
Checked against the collector's patterns:

- `_MARKER_RE` captures the kind with `[a-z-]+` followed by `\b`, so
  `finding` and `finding-status` both parse, and `finding` does not
  swallow the parameters.
- `_PARAM_RE` names are `[a-z_-]+`, so `superseded_by` parses. Values
  are `\S+`; every value is a slug or `r<N>-f<k>`, with no spaces.
- `_SEVERITY_RE` is anchored at the start of the inline body, which
  still starts with `[severity]`.
- `[^\n]*?` in `_MARKER_RE` means a marker must not wrap. The marker
  lines are exempt from the 80-column rule only inside code blocks in
  the prompt, so the prompt shows each one in a fenced block.

None of the agent's existing readers match the new kinds: Step 1.5
comment classes read conversation comments, and Step 2 and Step 5c
look for `lfx-review-agent:review -->`, `approval-withheld`, `excluded`
and `too-large`. `docs-reminder` is matched by its full text.

**Rationale**: The collector is the consumer named in the hand-off, and
its patterns are already in production.

**Alternatives considered**: One JSON blob per review. Rejected: the
collector reads `key=value` markers, and JSON would carry spaces and
quotes that `_PARAM_RE` cannot parse.

## R8. Quoted markers in PR content

**Decision**: When the agent quotes PR content that contains an
`lfx-review-agent:` comment marker, in any inline comment or review
body, it keeps the words but drops the `<!--` and `-->` around the
marker. PR #44's sentence "Text that discusses markers, such as a
quoted example in a finding, stays as written, in a code span" gains
this exception.

**Rationale**: PR #44's reading rule sets code aside, so a quoted marker
in a code span is safe for later runs. The collector's `_MARKER_RE` does
not skip code, so a literal quoted `finding` marker in a Proof snippet
would be counted as a finding. This matters most on PRs to this
repository and to repositories that ship prompts, where markers appear
in the diff.

**Alternatives considered**: Leaving the agent as PR #44 wrote it and
having the collector skip Markdown code. Taken as well, not instead: the
engineering-metrics change list (R11) includes skipping code, since
older reviews may already hold quoted markers.

## R9. Pre-post check

**Decision**: PR #44's "Check your markers before every post" rule
gains, for `lfx_one_github_pulls_create_review`:

- the number of `finding` markers equals the number of new findings,
  folded gaps included, and each inline comment's last line is its
  marker;
- every `severity`, `dimension`, `topic`, `status`, `resolution` and
  `reason` value is in its table;
- on a follow-up, each earlier ID has exactly one `finding-status` line.

Fix any mismatch, then call the tool.

**Rationale**: It is the cheapest guard against coined values and
dropped markers (SC-001, SC-002), and it extends a check PR #44 already
puts in the same place.

**Alternatives considered**: A post-submit read-back. Rejected: a
submitted review cannot be edited (there is no update tool), so a
read-back can only report the problem.

## R10. Controller impact

**Decision**: No controller logic changes. Add one test to
`controller/tests/preflight.test.mjs`: an own review whose body carries
`finding` and `finding-status` lines after the review marker still
counts as an own review and gives the same scope.

**Rationale**: `controller/preflight.ts` (on PR #44's branch, with
`markerText`) matches only `review -->`, `approval-withheld`,
`excluded`, `too-large`, `session`, `summary` and the notice markers.
The test pins that FR-036 stays true.

**Alternatives considered**: No test, only a reading of the patterns.
Rejected: the test is a few lines, and the controller's patterns are
the kind of thing a later change could widen.

## R11. Rollout and engineering-metrics

**Decision**: Order:

1. PR #44 merges and 0.1.26 is published.
2. engineering-metrics adds `finding` and `finding-status` to
   `KNOWN_MARKER_KINDS`, reads `finding` from inline comments (their
   kind list for comments) and review bodies, keeps the latest
   `finding-status` per ID, and skips Markdown code when matching
   markers. It can ship before this agent version: it only reads.
3. This feature merges and the agent version is published, then the
   controller that calls it.

**Rationale**: Until step 2 the collector counts the new markers as
unknown, which is noise on the dashboard but no harm. Shipping the
reader first means the first reviews with markers are counted.

## R12. Validation

**Decision**: Verify on throwaway PRs in a test repository after
publishing, using the README test checklist, with `guild agent
unpublish linux-foundation~lfx-review-agent` as the rollback. No
replay harness.

**Rationale**: Spec 003's test-agent harness (its research R12) was
never confirmed, and `lfx-reviews` auto-updates, so any publish is
production. This feature cannot change a verdict or readable text by
design (FR-030), so the risk is limited to marker placement, visible
marker text and the severity tag position. The checklist items cover
each of those, and the offline regex check in
[quickstart.md](quickstart.md) runs the collector's patterns over real
bodies. If the 003 harness is confirmed before this ships, run the same
items there first.

**Alternatives considered**: Building the replay harness for this
feature. Rejected: the cost is high, and a replay compares verdicts,
which this feature does not touch.
