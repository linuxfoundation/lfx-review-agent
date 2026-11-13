# Contract: `lfx-knowledge` Guild integration

Custom integration over the GitHub REST API, authenticated with the dedicated
read-only credential (DR-002). Three operations; no write operation exists.

| Operation | GitHub endpoint | Inputs | Use |
|---|---|---|---|
| `git_get_tree` | `GET /repos/linuxfoundation/workspace-org-lens/git/trees/main?recursive=1` | none | List knowledge files; the response includes the `main` SHA for citations (FR-003) |
| `repos_get_content` | `GET /repos/linuxfoundation/workspace-org-lens/contents/{path}` | `path` | Read one file from the default branch (FR-001, FR-002) |
| `search_code` | `GET /search/code?q={q}` | `q` | Keyword search; agents add `repo:linuxfoundation/workspace-org-lens path:.knowledge` (FR-009) |

Notes:

- The owner and repository are fixed in the base URL, not as path parameters,
  because a fixed value in an operation path broke Guild operation generation.
- No `ref` parameter is declared on `repos_get_content`. Whether Guild forwards
  undeclared parameters is research item 1.
- The credential reaches the whole repository. The path limit is an agent
  instruction; the rest of the repository (specs, skills) has the same access
  class.
