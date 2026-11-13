# Data model: Make the workspace knowledge base available to Guild agents

## Knowledge area

| Field | Source | Notes |
|---|---|---|
| `path` | directory with `README.md` under `.knowledge/`, nested ones included | 19 today |
| `title` | first `#` heading of the README | |
| `summary` | first paragraph of the README, cut to 60 words | First paragraphs measure 5 to 53 words today |
| `key_files` | up to 5 Markdown files linked from the README; if none, the first 5 Markdown files in the directory by name | Paths only (FR-006) |

## Knowledge map

| Field | Notes |
|---|---|
| `generated_from` | `main` commit SHA |
| `rules` | Full text of `guild/knowledge-agent-rules.md`, verbatim (FR-016) |
| `areas` | Knowledge area list, sorted by path |
| `word_count` | Rules plus areas; must be at most 3,000 (FR-008) |

Rendered as Markdown between `<!-- BEGIN GENERATED KNOWLEDGE MAP -->` and
`<!-- END GENERATED KNOWLEDGE MAP -->`.

## Allowlist entry (`workspace-org-lens/guild/knowledge-workspaces.yaml`)

| Field | Type | Notes |
|---|---|---|
| `workspace` | string | Guild workspace id |
| `model_policy` | string | Provider(s) LF security approved, with the approval reference (DR-004, FR-013) |
| `membership_checked_by` | string | GitHub login of the reviewer |
| `membership_checked_on` | date | Review date (DR-003) |

## Citation (in agent replies)

| Field | Notes |
|---|---|
| `path` | `.knowledge/...` |
| `sha` | `main` commit read (FR-003) |
