# Feature Specification: Per-finding metadata markers

**Feature Branch**: `feat/add-review-meta-data`

**Created**: 2026-11-10

**Status**: Draft

**Input**: Hand-off "per-finding metadata in lfx-one reviews", written
2026-11-10 from an engineering-metrics session. Every finding the agent
posts carries a hidden marker with a stable ID, its severity, its
dimension and a topic. Every follow-up records, per earlier finding ID,
its status and how it got there. The engineering-metrics Review Agent
page reads these markers.

## Context

The engineering-metrics dashboard has a Review Agent page. Its collector
(`collector/review_agent.py` in engineering-metrics) counts reviews,
verdicts and findings by severity. It cannot answer two questions:

- **What kinds of issues does the agent catch?** The most common kinds
  should feed back into the review skills and each repository's local
  skills, so authors catch them before opening a PR.
- **What happens to each finding?** Fixed in the PR, declined with a
  reason, deferred, or ignored. Documentation findings in particular
  should be fixed in the same PR.

Inferring either from comment text would be fragile. The agent knows
both at review time, so it writes them down as hidden markers.

A sample of the last 25 PRs in `linuxfoundation/lfx-self-serve`
(2026-11-10) found 36 findings in 23 reviewed PRs. Only 3 carried a
category tag, and one of those (`[style]`) is a tag the prompt does not
define. About 23 of the 36 fall under Correctness, which mixes logic
bugs, RxJS cancellation and accessibility, so the dimension alone is too
coarse. Author replies fell into fixed (~24), already fixed before the
review ran (~7), declined with a reason (2), deferred (1) and no reply
(1).

### What the prompt already has

The hand-off left several questions open. Checked against `PROMPT.md`
(agent 0.1.25):

- **Dimensions.** Step 4, "Review the dimensions", records `dimension`
  on every finding and lists 11 dimensions. The inline template (Step 5b)
  never writes it out. The slugs in FR-004 map one to one onto that
  list.
- **Author replies are already fetched.** Step 4, "Other reviewers",
  calls `lfx_one_github_pulls_list_review_comments` and keeps the whole
  list. Each entry has `user.login`, `body`, `in_reply_to_id` and
  `created_at`, so a reply on the agent's own inline thread is in hand
  with no new read. The prompt never tells the agent to use replies when
  it classifies earlier findings. This feature adds that rule. Findings
  outside the diff and folded documentation gaps live in the review body
  and have no thread, so a reply to them cannot be tied to a finding
  (FR-028).
- **A review number already exists.** Step 3.5 assigns each review a
  number `N` that is unique on the PR and stays taken by an abandoned
  run. It is the base of the finding ID (FR-010).
- **Documentation findings already dedup.** Step 4, "Follow-up only",
  treats entries with the same named item and the same doc path as one
  finding, and has one supersede case. The ID follows those rules
  (FR-012, FR-024).
- **The controller is not affected.** `controller/preflight.ts` matches
  only `review`, `approval-withheld`, `session`, `summary` and the notice
  markers. None of its patterns matches the new kinds (FR-036).

### The consumer's contract

The collector parses markers with these patterns:

```text
_MARKER_RE   = <!--\s*lfx-review-agent:([a-z-]+)\b([^\n]*?)\s*-->
_PARAM_RE    = ([a-z_-]+)=(\S+)
_SEVERITY_RE = ^\s*\[(blocking|minor|nit|question)\]   (case-insensitive)
```

So each marker sits on one line, is written raw (never HTML-escaped),
and carries only values without spaces. The severity tag stays the first
thing in an inline comment body, so the new marker goes on its last line.

### Differences from the hand-off

- `resolution=no-thread` is added for open findings that have no reply
  thread (FR-028). Reporting `no-response` there would claim the author
  said nothing, which the agent cannot know.
- `resolution=replied` is added for an author reply that neither
  declines nor defers, for example "fixed" when the recheck still finds
  the issue (FR-027). Without it such a reply would be miscounted as
  `declined` or `no-response`.
- `superseded_by=<id>` is added to a `superseded` status, so the
  dashboard can follow a documentation gap to the finding that replaced
  it (FR-024).

## Clarifications

### Session 2026-11-11

- Q: Which topic list goes into `PROMPT.md`, and can any topic go with
  any dimension? → A: The hand-off's 14 seed topics plus the 21
  additions taken from the Security, Data Privacy, Data Subject Rights,
  Data Residency, Architecture, API Compliance and Performance rules and
  the Operating rules, 35 in all. Any topic can go with any dimension
  (FR-040 to FR-042).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Every finding says what kind of issue it is (Priority: P1)

David wants to know which kinds of issues the agent catches most, so he
can add them to the review skills and to each repository's local skills.
Today a finding carries only its severity in readable form. With this
feature, every finding the agent posts carries a hidden marker with a
stable ID, its severity, its dimension and a topic from a fixed list.
The dashboard groups findings by dimension and topic.

**Why this priority**: It answers the first question on its own, it
needs no follow-up run, and the second story builds on its IDs.

**Independent Test**: Open a test PR with one logic bug in the diff, one
problem in an unchanged caller, and five missing-docs gaps. Confirm that
the review posts one inline comment per in-diff finding whose last line
is a `finding` marker and whose first line is still the severity tag;
one marker after the Fix line of the outside-diff entry; and one marker
per folded documentation gap. Run the three collector patterns over the
review and inline comment bodies and confirm every marker parses and
every value is in its list.

**Acceptance Scenarios**:

1. **Given** a finding anchored in the diff, **When** the agent posts
   it, **Then** the inline body starts with `[severity]` as today and
   ends with one `finding` marker line.
2. **Given** a finding outside the diff, **When** the agent posts it,
   **Then** its entry under `Findings outside the diff` has one
   `finding` marker on the line after its Fix line.
3. **Given** five missing-docs gaps, two of them folded, **When** the
   agent posts the review, **Then** each folded gap carries its own
   marker and the folded item's title line carries none.
4. **Given** an RxJS subscription that is never torn down, **When** the
   agent records the finding, **Then** the marker has
   `dimension=correctness` and the topic the Topics table gives for
   stream lifecycle problems.
5. **Given** a finding that fits no topic in the table, **When** the
   agent records it, **Then** the topic is `other`; the agent never
   writes a value that is not in the table.
6. **Given** any review, **When** a reader views it on GitHub, **Then**
   no marker text is visible and the readable text is what the agent
   would have posted without this feature.

---

### User Story 2 - Follow-ups record each finding's outcome (Priority: P1)

David wants to know what happens to each finding: fixed, partly fixed,
still open, or replaced. The agent already classifies every earlier item
as resolved, partially addressed or still open on each follow-up. With
this feature, the follow-up review body also carries one hidden
`finding-status` marker per earlier finding ID with that classification
and how it got there.

**Why this priority**: It answers the second question and is the only
way the dashboard can follow a finding across rounds.

**Independent Test**: On a test PR whose first review raised three
findings, push a commit that fixes one, deletes the code behind the
second and leaves the third. Confirm the follow-up body carries three
`finding-status` markers: `resolved` with `fixed`, `resolved` with
`code-gone`, and `open` with `no-response`, each with the ID from the
first review, and that the readable revision tracking agrees.

**Acceptance Scenarios**:

1. **Given** a follow-up with earlier findings that carry IDs, **When**
   the agent posts the review, **Then** the body carries exactly one
   `finding-status` marker per earlier ID.
2. **Given** an earlier finding classified ✅ resolved, ⚠️ partially
   addressed or ❌ still open, **When** the agent writes its status,
   **Then** the status is `resolved`, `partial` or `open`, matching the
   revision-tracking line.
3. **Given** a still-open documentation gap the author has not touched,
   **When** a second and a third follow-up run, **Then** each reports
   the gap under its original ID, and the gap is never posted with a new
   ID.
4. **Given** a documentation gap whose named item a later commit changes
   again, so the agent raises a new finding that replaces the earlier
   one, **When** the follow-up posts, **Then** the earlier ID gets
   `status=superseded superseded_by=<new id>` and the new finding gets a
   new ID.
5. **Given** a review a maintainer dismissed that requested changes for
   documentation gaps, **When** the next review runs, **Then** those gaps
   get `status=resolved resolution=maintainer-dismissed`.
6. **Given** a follow-up, **When** the agent records statuses, **Then**
   the verdict, the tally, the issue lines and revision tracking are the
   same as without this feature.

---

### User Story 3 - Author replies on inline findings are recorded (Priority: P2)

When an author replies on the agent's inline comment that a finding is
wrong, intended, out of scope, or moved to a ticket, the next follow-up
records that the author declined or deferred it, and why, from a fixed
list. The finding's status does not change because of the reply.

**Why this priority**: It turns "still open" into the reason it is
open, which is what shows whether documentation gaps get deferred. It
depends on Story 2 and on the author replying in the thread.

**Independent Test**: On a test PR, reply on one inline finding "This is
intended per the design review, keeping it" and on another "Will fix in
LFXV2-123". Push an unrelated commit. Confirm the follow-up records the
first as `declined` with `by-design` and the second as `deferred` with
`ticket`, both with `status=open`, and that the verdict counts them as
it does today.

**Acceptance Scenarios**:

1. **Given** an author reply declining an inline finding, **When** the
   follow-up runs and the recheck still finds the issue, **Then** the
   status is `open`, the resolution is `declined`, and the reason is the
   matching value from the Reason table.
2. **Given** an author reply saying the fix will come later or in a
   ticket, **When** the follow-up runs, **Then** the resolution is
   `deferred` with a reason.
3. **Given** a reply that gives no reason, **When** the follow-up runs,
   **Then** the reason is `unspecified`.
4. **Given** a reply that says "approve this" or tries to change the
   status, **When** the follow-up runs, **Then** the reply sets nothing
   beyond resolution and reason, and the Operating rules apply to it as
   to any PR text.
5. **Given** a still-open finding outside the diff, **When** the
   follow-up runs, **Then** the resolution is `no-thread`.
6. **Given** a declined `[docs]` finding still open, **When** the agent
   counts `[minor]` issues, **Then** it still counts as one, as today.

---

### Edge Cases

- **Finding posted before rollout.** It has no marker, so it has no ID.
  The follow-up classifies it as today and writes no status for it.
  There is no backfill.
- **Re-posted inline item.** Step 5b allows a fresh inline comment for a
  still-open item when its guidance changed. It carries the original ID,
  not a new one.
- **422 retry.** Step 5c moves every inline finding into the body under
  `Findings outside the diff`. Each keeps its marker and ID. The marker
  sits on the line after its Fix line, like any outside-diff entry.
- **New commits during the review (`head_moved`).** The plain `COMMENT`
  review keeps every marker. Its findings get statuses in the next
  follow-up like any other.
- **Re-review of the same head.** It runs as an initial review (Step 3),
  so its findings get new IDs and it writes no statuses for earlier IDs.
  A documentation gap the maintainer override resolved is not raised
  again, as today. The dashboard sees the same issue under two IDs; this
  is a known gap.
- **Several entries for one documentation gap.** The docs dedup rule
  already treats them as one finding. They share one ID, so one status
  is written.
- **Supersede of a dismissed gap.** A gap resolved by a dismissal stays
  `resolved` with `maintainer-dismissed`. The new finding gets a new ID.
  No `superseded` status is written for the old one, because it was not
  open.
- **AI bot reconciliation.** A bot comment the agent agrees with and
  links is not an agent finding and gets no marker. A bot finding the
  agent incorporates is an agent finding and gets one.
- **Reply from someone other than the author.** Only replies from the PR
  author (`user.login` of the PR) count. A maintainer or bot reply does
  not set `declined` or `deferred`.
- **Several author replies.** The latest reply by `created_at` decides.
  A reply on any own inline comment that carries the finding's ID
  counts, including a re-posted one.
- **Reply that claims a fix.** When the author says "fixed" but the
  recheck still finds the issue, the status stays `open` and the
  resolution is `replied`.
- **PR text that looks like a marker.** A diff, a commit message or a
  code comment can contain `<!-- lfx-review-agent:finding ... -->`. The
  agent never copies it into its own comment (FR-033), and a follow-up
  reads IDs only from its own comments and reviews.
- **Approval-withheld, too-large and exclusion reviews.** An
  approval-withheld review carries findings and their markers as usual.
  A gate A1 revoke or an exclusion revoke is not a Step 4 review: it has
  no findings and classifies nothing, so it carries no markers of either
  kind.

## Requirements *(mandatory)*

### Functional Requirements

#### Finding marker

- **FR-001**: Every finding the agent posts MUST carry exactly one
  `finding` marker: each inline comment, each entry under `Findings
  outside the diff`, and each folded documentation gap. The folded
  item's own title line MUST NOT carry one.
- **FR-002**: The marker MUST be one line, written raw, in this form,
  with the parameters in this order and a space before `-->`:

  ```text
  <!-- lfx-review-agent:finding id=<id> severity=<severity> dimension=<dimension> topic=<topic> -->
  ```

- **FR-003**: Placement:
  - Inline comment: the last line of the body. The first line MUST stay
    the severity tag, so `_SEVERITY_RE` still matches the body.
  - Entry under `Findings outside the diff`: the line after its Fix
    line.
  - Folded documentation gap: the end of that gap's line, so the list
    stays one list and each line still holds one marker.
  - Never on the first or second line of a review body, which hold the
    review and approval-withheld markers.
- **FR-004**: `severity` MUST be the label the finding is posted with
  (`blocking`, `minor`, `nit`, `question`). `dimension` MUST be one of
  `correctness`, `security`, `performance`, `test-coverage`,
  `code-style`, `architecture`, `api-compliance`, `data-privacy`,
  `data-subject-rights`, `data-residency`, `documentation`, matching
  the dimension the agent already records. A Security finding keeps its
  posted label; its dimension tells the dashboard it blocks.
- **FR-005**: `topic` MUST be one value from the Topics table (FR-040).
- **FR-006**: No marker value MAY come from PR content. Every value is
  from a fixed list in `PROMPT.md` or is a finding ID.

#### Finding IDs

- **FR-010**: A new finding's ID MUST be `r<N>-f<k>`: `N` is this run's
  review number from Step 3.5, and `k` counts the new findings in this
  review from 1, each used once.
- **FR-011**: An ID MUST stay with its finding for the life of the PR.
  An item re-posted inline because its guidance changed (Step 5b) MUST
  reuse its ID.
- **FR-012**: A documentation gap that the docs dedup rule matches to an
  earlier finding (same named item after escaping, same doc path) MUST
  keep the earlier finding's ID. Only the supersede case gets a new ID.
- **FR-013**: A follow-up MUST learn earlier IDs from the `finding`
  markers in the agent's own inline comments and own review bodies that
  it already holds (Step 2 and Step 4, "Other reviewers"). It MUST NOT
  make a new GitHub read for this. It MUST read them as PR #44 reads
  every marker: Markdown code set aside, and `&lt;`/`&gt;` decoded only
  in own bodies.
- **FR-014**: IDs MUST be assigned once, before the first submit call.
  When the 422 retry moves inline findings into the body, each MUST keep
  its marker unchanged, on the line after its Fix line. A 5xx resend
  MUST reuse the same IDs.

#### Finding-status marker

- **FR-020**: Every review Step 5c submits on a follow-up MUST carry one
  `finding-status` marker per earlier finding ID, in the review body,
  each on its own line, after the rest of the body. When one ID appears
  on several own entries, it gets one status.
- **FR-021**: The marker MUST be one line, written raw, in this form:

  ```text
  <!-- lfx-review-agent:finding-status id=<id> status=<status> resolution=<resolution> reason=<reason> -->
  ```

  `reason` MUST be left out unless the resolution is `declined` or
  `deferred`. For `superseded`, see FR-024.
- **FR-022**: `status` MUST match the follow-up's classification of that
  finding: ✅ resolved is `resolved`, ⚠️ partially addressed is
  `partial`, ❌ still open is `open`. The supersede case is
  `superseded`.
- **FR-023**: `resolution` MUST be one value from this table:

  | Status | Resolution | Meaning |
  | --- | --- | --- |
  | `resolved` | `fixed` | a commit in this PR fixed it |
  | `resolved` | `code-gone` | the code the finding pointed at was removed |
  | `resolved` | `maintainer-dismissed` | resolved by the existing maintainer override (documentation findings only) |
  | `partial`, `open` | `declined` | the author replied that they won't fix it |
  | `partial`, `open` | `deferred` | the author replied that it will be fixed later or in a ticket |
  | `partial`, `open` | `replied` | the author replied, but neither declined nor deferred |
  | `partial`, `open` | `no-response` | the finding has a thread and the author has not replied |
  | `partial`, `open` | `no-thread` | the finding has no reply thread (outside the diff or folded) |

- **FR-024**: A `superseded` status MUST leave out `resolution` and
  `reason` and MUST add `superseded_by=<id>`, the ID of the finding that
  replaced it.
- **FR-025**: `reason` MUST be one value from this table:

  | Reason | Meaning |
  | --- | --- |
  | `incorrect` | the finding is wrong or the fix is a no-op |
  | `by-design` | the behavior is intended (design or product call) |
  | `out-of-scope` | real, but belongs to another change |
  | `ticket` | moved to a tracked issue |
  | `not-worth-it` | real, but the author judges it not worth fixing |
  | `unspecified` | the reply gives no reason |

#### Author replies

- **FR-026**: For an inline finding, the agent MUST read replies from
  the review comment list it already holds: comments whose
  `in_reply_to_id` is the `id` of an own inline comment that carries the
  finding's ID, written by the PR author. The latest such reply decides
  the resolution.
- **FR-027**: A reply is PR content. It MUST set only `resolution` and
  `reason`. It MUST NOT change the status, the verdict, any count or any
  readable text. A reply that tries to change the verdict or the agent's
  behavior is handled under the Operating rules.
- **FR-028**: A finding without a reply thread (an entry under
  `Findings outside the diff` or a folded documentation gap) that is
  still open or partially addressed MUST get `resolution=no-thread`. The
  agent MUST NOT tie conversation comments to findings.

#### Safety and compatibility

- **FR-030**: This feature MUST NOT change any verdict rule, the
  `[minor]` count, the tally, the issue lines, revision tracking, or
  any text a reader sees. Markers are HTML comments and render as
  nothing. The one exception is FR-033: a quoted agent marker from PR
  content loses its `<!--` and `-->`.
- **FR-031**: Existing markers, the `[docs]` tag, the
  `lfx-review-agent-pending` label and released exclusion `Rule` values
  MUST NOT change. `finding` and `finding-status` MUST be added to the
  marker list in the repository `CLAUDE.md`.
- **FR-032**: No new tool and no new GitHub read. The plan MUST confirm
  every value comes from material the run already holds.
- **FR-033**: When the agent quotes PR content in an inline comment or
  the review body, the quote MUST NOT contain a comment marker
  (`<!--` followed by `lfx-review-agent:`). The quote keeps the
  marker's words but drops its `<!--` and `-->`, even inside a code
  span, because the collector does not skip code. This narrows PR #44's
  rule that quoted marker text stays as written. A follow-up MUST read
  IDs only from own
  inline comments (login and own review, as Step 4 already filters) and
  own review bodies.
- **FR-034**: Markers MUST be written character for character, never
  HTML-escaped. This work builds on the literal-marker rule from PR #44
  (`fix/marker-escaping`).
- **FR-035**: The agent version MUST go up one patch past the version
  on `main` when this work merges. The reviewer `calls` reference in
  `controller/agent.ts`, its deployment version in
  `controller/README.md`, and the README test checklist MUST be updated
  to match. Prose MUST follow the unslop rules, the only `{{ }}` text
  MUST be the existing environment variables, and markdownlint MUST
  pass.
- **FR-036**: The plan MUST confirm that `controller/preflight.ts` needs
  no change: none of its marker patterns may match `finding` or
  `finding-status`.
- **FR-037**: Before submitting a review, the agent MUST check the body
  and comments it is about to send: one `finding` marker per new
  finding (folded gaps included), each inline comment ending with its
  marker, every value in its table, and on a follow-up one
  `finding-status` line per earlier ID. It corrects any mismatch before
  the call.

#### Topics

- **FR-040**: `PROMPT.md` MUST carry a Topics table: each topic's slug
  and what it covers. `other` is the fallback. The table holds the 35
  topics below: the 14 seed topics and the 21 additions. To add a topic
  later, add a row; never rename a released topic, since recorded
  findings carry it.
- **FR-041**: Each finding MUST get exactly one topic: the most specific
  row that fits. A finding that fits no row MUST get `other`.
- **FR-042**: Any topic MAY go with any dimension. The table does not tie
  a topic to a dimension.

#### Topic list

The hand-off's seed list, from the lfx-self-serve sample:

| Topic | Covers |
| --- | --- |
| `async-lifecycle` | unsubscribed streams, cancellation, `takeUntilDestroyed`, polling, races |
| `error-handling` | swallowed or misclassified errors, failed states shown as success |
| `validation` | input checks too strict or too loose |
| `null-handling` | missing fallback for optional values |
| `edge-case` | logic wrong for a specific input or state |
| `accessibility` | focus, contrast, tap targets, ARIA |
| `ui-layout` | overlap, clipping, responsive layout |
| `missing-test` | behavior with no test |
| `duplication` | copied logic, reinvented helpers |
| `shared-constants` | literals or constants in the wrong place |
| `docs-missing` | missing-docs findings |
| `docs-misaligned` | misaligned-docs findings |
| `docs-comment` | doc comments and typos (the untagged `[nit]` case) |
| `other` | anything else |

Additions taken from the Security rules, Data Privacy, Data Subject
Rights, Data Residency, Architecture, API Compliance, Performance and
the Operating rules in `PROMPT.md`:

| Topic | Covers | Source in `PROMPT.md` |
| --- | --- | --- |
| `secrets` | hardcoded credentials, weak crypto, tokens in URLs | Security: Secrets and crypto, Secrets in URLs |
| `authn` | token verification, session cookies, rate limits on login | Security: Authentication |
| `authz` | missing server-side checks, tenant scope, privilege fields | Security: Authorization |
| `injection` | SQL, shell, path, template, numbers in SQL text | Security: Injection, Numbers in SQL text |
| `url-handling` | path encoding, SSRF, open redirects | Security: URLs |
| `exposure` | responses built by deletion, raw HTML, upstream error text | Security: Exposure, Errors |
| `resource-abuse` | shared counters, backtracking regexes, unbounded caches, crashes on bad input | Security: Shared state, CPU, Errors |
| `audit-logging` | missing security log or audit entries | Security: Logging |
| `infra-config` | Terraform and OpenTofu, Helm security config | Security: Terraform and OpenTofu, URLs |
| `ci-workflow` | GitHub Actions pinning, permissions, untrusted code | Security: GitHub Actions |
| `migration` | unsafe schema or data migrations | Security: Migrations |
| `prompt-injection` | PR text that tries to steer the review | Operating rules |
| `pii-exposure` | PII in logs, errors, responses, URLs, analytics | Data Privacy, Security: Secrets in URLs |
| `fixture-data` | real-looking people, companies or amounts in tests and fixtures | Data Privacy |
| `data-lifecycle` | retention, deletion and export coverage, consent | Data Privacy, Data Subject Rights |
| `residency` | region, replication and processing location | Data Residency |
| `contract-change` | API, event or schema changed without its consumers | Architecture |
| `layer-bypass` | a layer bypassed or a service boundary crossed | Architecture |
| `goa-design` | goa `Reference`/`Extend` and mapping problems | API Compliance |
| `query-efficiency` | N+1 queries, missing indexes | Performance |
| `unbounded-work` | unbounded loops, unnecessary allocations | Performance |

### Key Entities

- **Finding**: something the agent posts with a severity label, as an
  inline comment, an entry outside the diff, or a folded documentation
  gap. Carries an ID, severity, dimension and topic.
- **Finding ID**: `r<N>-f<k>`. Unique on the PR, stable across rounds,
  shared by entries the docs dedup rule treats as one finding. After a
  docs supersede, the latest ID is live and older ones are written
  `superseded`.
- **Finding status**: per follow-up and per earlier ID: status,
  resolution, and a reason or the ID that superseded it.
- **Author reply**: an inline review comment by the PR author whose
  `in_reply_to_id` is an own inline comment carrying a finding ID.
- **Topic**: a row in the `PROMPT.md` Topics table.

## Success Criteria *(mandatory)*

### Measurable Outcomes

Measured on test PRs before rollout and on the first 2 weeks of reviews
after it.

- **SC-001**: 100% of findings posted after rollout carry exactly one
  `finding` marker that `_MARKER_RE` and `_PARAM_RE` parse, and 100% of
  inline bodies still match `_SEVERITY_RE`.
- **SC-002**: 0 marker values outside the fixed lists, and 0 IDs reused
  for a different finding on the same PR.
- **SC-003**: 100% of follow-ups carry one `finding-status` per earlier
  ID, and each status agrees with the readable revision tracking.
- **SC-004**: 0 markers visible as text in a rendered comment or review,
  HTML-escaped ones included.
- **SC-005**: On the test PRs, a maintainer checking each review finds
  no verdict, count or readable text that differs from what the current
  rules give for the same findings.
- **SC-006**: On the test PRs with scripted author replies, every
  declined or deferred reply is recorded with the expected resolution
  and reason, and none changes a status.
- **SC-007**: In the first 100 findings after rollout, at most 20% get
  `topic=other`. More is a signal to add topics, not a failure of the
  markers.

## Assumptions

- Every follow-up writes a status for every earlier ID, including ones
  resolved in an earlier round, because Step 4 already classifies every
  earlier item each round. The dashboard keeps the latest status per ID.
- A finding's topic is the agent's judgment from a fixed list, like its
  dimension. Two runs may pick different topics for borderline findings;
  the dashboard reads them in aggregate.
- engineering-metrics adds `finding` and `finding-status` to
  `KNOWN_MARKER_KINDS` and reads the new parameters. Until then the
  collector counts them as unknown markers. The rollout is coordinated
  with that change.
- PR #44 (`fix/marker-escaping`) merges first, or this work builds on
  its branch. PR #44 renames the "Escaping" rule to "Sanitizing echoed
  names"; FR-012's "after escaping" follows whatever name is on `main`.
- The hand-off file `HANDOFF-finding-metadata.md` was not committed to
  this repository; its text came in with the request, so there is no
  file to delete.

### Out of scope

- Any change to verdicts, `[minor]` counting or approval rules. Whether
  documentation findings should block approval (PR #5502 was approved
  with one open) is a separate verdict-policy decision for its own spec.
- Backfill of past reviews.
- Statuses for findings that never get a follow-up: a last reply with no
  later push, or a merge with no further review. engineering-metrics
  treats those as "no recorded outcome".
- "Already fixed before the review ran". The review body's "covers
  `<sha>` only" line already tells the dashboard.
- Linking conversation comments to findings outside the diff.
