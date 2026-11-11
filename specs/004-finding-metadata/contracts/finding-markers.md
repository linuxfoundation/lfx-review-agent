# Contract: finding and finding-status markers

The interface between the review agent and the engineering-metrics
collector (`collector/review_agent.py`). The agent writes these markers;
the collector and later agent runs read them. Changing a marker name, a
parameter name or a released value breaks readers of open PRs and past
data.

## Shared rules

- One marker per line. Written raw: `<!--`, never `&lt;!--`. Never in a
  code span or code block.
- Parameters in the order shown, separated by one space, with a space
  before `-->`.
- Every value is a slug from the tables below, or a finding ID. No value
  comes from PR content.
- Only markers in the agent's own inline comments and own review bodies
  count (`user.login` is `REVIEWER_LOGIN`). Readers skip Markdown code,
  as PR #44's reading rule does.

## finding

```text
<!-- lfx-review-agent:finding id=<id> severity=<severity> dimension=<dimension> topic=<topic> -->
```

| Parameter | Values |
| --- | --- |
| `id` | `r<N>-f<k>`: `N` the review number, `k` from 1 within that review |
| `severity` | `blocking`, `minor`, `nit`, `question`: the label the finding is posted with |
| `dimension` | `correctness`, `security`, `performance`, `test-coverage`, `code-style`, `architecture`, `api-compliance`, `data-privacy`, `data-subject-rights`, `data-residency`, `documentation` |
| `topic` | a row of the Topics list in [spec.md](../spec.md) (FR-040), `other` as fallback |

Dimension slugs map to the Step 4 names: Correctness, Security,
Performance, Test Coverage, Code Style & Consistency, Architecture, API
Compliance (Go + goa), Data Privacy, Data Subject Rights, Data
Residency, Documentation.

### Placement

Inline comment: the last line. The first line stays the severity tag.

```text
[minor] Subscription never torn down

Issue: The polling stream in `loadStatus()` is never unsubscribed.
Proof: `interval(5000).pipe(switchMap(...))` at `status.component.ts:42` has no `takeUntilDestroyed`.
Why it matters: Each visit to the page adds another poller.
Fix: Add `takeUntilDestroyed(this.destroyRef)` before `subscribe`.
<!-- lfx-review-agent:finding id=r1-f1 severity=minor dimension=correctness topic=async-lifecycle -->
```

Entry under `Findings outside the diff`: the line after its Fix line.

```text
[blocking] `src/routes/projects.ts:88` Handler skips the tenant check

Issue: ...
Proof: ...
Why it matters: ...
Fix: ...
<!-- lfx-review-agent:finding id=r1-f3 severity=blocking dimension=security topic=authz -->
```

Folded documentation gaps: at the end of each gap's line. The folded
item's title line has no marker.

```text
[minor][docs] 2 more documentation gaps

- `RETRY_BACKOFF` (`src/config.ts:41`) is not in the environment table in `README.md` <!-- lfx-review-agent:finding id=r1-f4 severity=minor dimension=documentation topic=docs-missing -->
- `--verbose` (`cmd/root.go:88`) is not in `docs/cli.md` <!-- lfx-review-agent:finding id=r1-f5 severity=minor dimension=documentation topic=docs-missing -->
```

Never on the first or second line of a review body.

## finding-status

```text
<!-- lfx-review-agent:finding-status id=<id> status=<status> resolution=<resolution> reason=<reason> -->
<!-- lfx-review-agent:finding-status id=<id> status=superseded superseded_by=<id> -->
```

| Parameter | Values | Present |
| --- | --- | --- |
| `id` | an earlier finding's ID | always |
| `status` | `resolved`, `partial`, `open`, `superseded` | always |
| `resolution` | see below | unless `superseded` |
| `reason` | see below | only with `declined` or `deferred` |
| `superseded_by` | the ID of the finding that replaced it | only with `superseded` |

| `status` | `resolution` | Meaning |
| --- | --- | --- |
| `resolved` | `fixed` | a commit in this PR fixed it |
| `resolved` | `code-gone` | the code the finding pointed at was removed |
| `resolved` | `maintainer-dismissed` | the maintainer override resolved it (documentation findings only) |
| `partial`, `open` | `declined` | the PR author replied that they won't fix it |
| `partial`, `open` | `deferred` | the PR author replied that it will be fixed later or in a ticket |
| `partial`, `open` | `replied` | the PR author replied, but neither declined nor deferred |
| `partial`, `open` | `no-response` | the finding has a thread and the PR author has not replied |
| `partial`, `open` | `no-thread` | the finding has no reply thread (outside the diff, folded, or moved into the body by a retry) |

| `reason` | Meaning |
| --- | --- |
| `incorrect` | the finding is wrong or the fix is a no-op |
| `by-design` | the behavior is intended (design or product call) |
| `out-of-scope` | real, but belongs to another change |
| `ticket` | moved to a tracked issue |
| `not-worth-it` | real, but the author judges it not worth fixing |
| `unspecified` | the reply gives no reason |

### Placement and frequency

- In the review body of every follow-up the agent submits in Step 5c,
  after `Findings outside the diff`, one line per earlier ID, ordered by
  `N`, then `k`, as numbers.
- After a docs supersede, the old and new IDs describe the same gap. The
  latest ID is live; each older one is written `superseded` with
  `superseded_by` set to the live ID on every later round.
- Every earlier ID, every follow-up, including IDs already resolved or
  superseded. Readers keep the latest status per ID.
- A re-review of the same head, an initial review, a gate A1 revoke and
  an exclusion revoke write none.

Example, follow-up review 2:

```text
<!-- lfx-review-agent:review --> <!-- lfx-review-agent:review-of review=2 -->
Two of the three earlier findings are fixed; one is still open.

<!-- lfx-review-agent:finding-status id=r1-f1 status=resolved resolution=fixed -->
<!-- lfx-review-agent:finding-status id=r1-f2 status=resolved resolution=code-gone -->
<!-- lfx-review-agent:finding-status id=r1-f3 status=open resolution=declined reason=by-design -->
```

## Parsing check

Every marker above must parse with the collector's patterns:

```python
_MARKER_RE = re.compile(r"<!--\s*lfx-review-agent:([a-z-]+)\b([^\n]*?)\s*-->")
_PARAM_RE = re.compile(r"([a-z_-]+)=(\S+)")
_SEVERITY_RE = re.compile(r"^\s*\[(blocking|minor|nit|question)\]", re.IGNORECASE)
```

`_SEVERITY_RE` must still match every inline comment body.

## Reader notes for engineering-metrics

- Add `finding` and `finding-status` to `KNOWN_MARKER_KINDS`, and
  `finding` to the kinds read from inline comments.
- Skip Markdown code when matching, as the agent does since PR #44:
  older reviews may quote markers in code spans.
- An ID appears on one `finding` marker, or on several when an item was
  re-posted (same ID, later round). Count the finding once.
- A finding with no `finding-status` at merge has no recorded outcome.
- Findings posted before rollout carry no marker and are not counted.
