# Data model: Guild-hosted LFX data tracer

Entities from spec.md "Key Entities". These are logical records; none are
persisted by the tracer (audit goes to the Guild run log, FR-018).

## Question

| Field | Type | Notes |
|---|---|---|
| `asker` | string | Slack or GitHub identity, mapped to an LF identity |
| `channel` | enum | `slack_thread` or `github_issue` |
| `thread_ref` | string | Slack thread ts or issue number and comment id |
| `text` | string | Untrusted input; never treated as instructions |
| `environment` | enum | `development` only in release one (DR-003) |
| `subject` | string, nullable | Organization or user named; null triggers one clarifying question |

## Investigation

| Field | Type | Notes |
|---|---|---|
| `question_ref` | string | Links to Question |
| `hops` | Hop[] | Ordered reads |
| `verdict` | enum | `correct_as_designed`, `data_issue`, `suspected_bug`, `inconclusive` |
| `incomplete` | bool | True when any hop failed (FR-021) |
| `correction_path` | string | Owner and procedure; no action taken |

## Hop

| Field | Type | Notes |
|---|---|---|
| `source` | enum | `nats_kv`, `fga`, `query_service`, `warehouse`, `github` |
| `query` | string | Redacted before reply on public channels (FR-016) |
| `result_summary` | string | Counts or matches, not raw personal data |
| `status` | enum | `ok`, `failed`, `access_filtered`, `denied` (asker lacks the gating relation, FR-022) |

## Asker

| Field | Type | Notes |
|---|---|---|
| `lf_identity` | string | Verified mapping from Slack or GitHub; must hold `lf-staff` to start (DR-004) and is the principal for every read check (FR-022) |
| `allowed` | bool | False yields a refusal with no data |
