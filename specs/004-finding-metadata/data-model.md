# Data Model: Per-finding metadata markers

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

There is no store. Every entity below lives as text in the agent's own
inline comments and review bodies on GitHub, and is rebuilt by each run
from material it already reads. The marker grammar is in
[contracts/finding-markers.md](contracts/finding-markers.md).

## Finding record (in a run)

Step 4 already records `severity`, `dimension`, `path`, `line`, `title`,
`issue`, `proof`, `why_it_matters`, `fix` and `privacy`. This feature
adds:

| Field | Value | Set in |
| --- | --- | --- |
| `id` | `r<N>-f<k>` for a new finding; the earlier ID for a re-posted item | Step 5b, once, before the first submit call |
| `topic` | one row of "Finding topics" | Step 4, with `dimension` |
| `dimension` (now written out) | one of the 11 slugs | Step 4, as today |

Validation:

- `severity` equals the tag on the finding's first line.
- `id` is unique among new findings in this review.
- A `[docs]` finding has `dimension=documentation` and topic
  `docs-missing` or `docs-misaligned`. A folded gap is `docs-missing`.

## Finding ID

- Shape: `r<N>-f<k>`, with `N` from Step 3.5 and `k` from 1.
- Scope: unique on the PR. `N` is never reused, abandoned runs included.
- Lifetime: the life of the PR. Re-posts and docs dedup matches keep it;
  only the docs supersede case creates a new ID for the same gap.
- Docs group: entries the dedup rule matches (same named item, same doc
  path) form one group. After a supersede the group holds several IDs;
  the latest entry's ID is live, and each older ID is written
  `superseded` with `superseded_by` set to the live ID on every round.

## Earlier finding (in a follow-up)

Built from own inline comments (Step 4, "Other reviewers") and own
review bodies (Step 2):

| Field | Source |
| --- | --- |
| `id` | the `finding` marker on the entry; entries without one are skipped |
| `entries` | every own inline comment, outside-diff entry or folded line carrying the ID |
| `thread_ids` | `id` of each own inline comment among `entries`; empty when all entries are in a body |
| `classification` | Step 4, "Follow-up only", as today |
| `reply` | the latest PR-author comment whose `in_reply_to_id` is in `thread_ids` |

## Finding status (per follow-up, per earlier ID)

| Field | Rule |
| --- | --- |
| `status` | `resolved`, `partial`, `open` from `classification`; `superseded` for the docs supersede case |
| `resolution` | `fixed`, `code-gone` or `maintainer-dismissed` when resolved; from `reply` when partial or open (`declined`, `deferred`, `replied`, `no-response`); `no-thread` when `thread_ids` is empty; absent when superseded |
| `reason` | only with `declined` or `deferred`; one Reason value |
| `superseded_by` | only with `superseded`; the new finding's ID |

## State transitions of one finding across rounds

```text
            raised (round N: finding marker)
                         |
        +----------------+----------------+
        v                v                v
      open  <------->  partial  ------> resolved (fixed | code-gone |
        |                |                         maintainer-dismissed)
        +-------+--------+
                v
            superseded (docs only; superseded_by = new ID)
```

- `open` and `partial` can move either way between rounds. `resolution`
  can change every round as replies arrive.
- `resolved` is terminal for the docs override. For other findings the
  classification decides each round; a later round can classify an item
  open again if a commit reintroduces it.
- `superseded` is terminal. The new ID starts its own path.
- No transition happens without a follow-up. A PR that merges after the
  last review keeps the last recorded status (spec, Out of scope).

## Topic

A row of the "Finding topics" table in `PROMPT.md`: a slug and what it
covers. 35 rows, `other` last. Rows are added, never renamed.
