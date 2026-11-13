# Decision: Read knowledge live from GitHub, with a generated map in workspace context

## Status

Accepted.

## Context

`.knowledge/` holds 332 Markdown files, about 317,000 words, and changed in 129
commits in 30 days (spec Context). Guild has no built-in retrieval store
([llms.txt](https://docs.guild.ai/llms.txt) lists none). Workspace context is
injected verbatim into every prompt
([context](https://docs.guild.ai/platform/context.md)); skills load on demand
but are documented for TypeScript, Goose and OpenClaw agents only
([skills](https://docs.guild.ai/platform/skills.md)).

**Question:** How do agents get the knowledge base?

## Options Considered

1. Everything in workspace context. Rejected: about 420,000 tokens, far past
   any useful prompt size.
2. Publish areas as Guild skills from CI. Rejected for now: a second copy that
   goes stale if CI fails, and Native agent support is undocumented.
3. A vector index behind a custom integration. Rejected for now: a new service
   to build and run; revisit only if SC-001 fails.
4. Live reads from GitHub `main`, plus a generated map in workspace context.
   Chosen.

## Assumptions

- GitHub code search covers `.knowledge/` on the default branch. Checked:
  `search/code` with `path:.knowledge` returned 106 hits for "NATS" on
  2026-11-12 (with a user token, not yet with the dedicated credential).

## Evidence

- Spec Context (file counts, commit rate).
- Guild docs pages cited above.
- Guild REST API `POST /workspaces/{id}/contexts` accepts `status: PUBLISHED`
  (docs.guild.ai/openapi.json), so CI can publish the map in one call.

## Decision

Agents read files live from `main` and search with GitHub code search. CI
generates a map from area READMEs on each merge that touches `.knowledge/` and
publishes it as workspace context.

## Confidence

Medium-high. Search quality is unmeasured until SC-001 runs.

## Consequences

- Every answer costs GitHub API calls; rate limits apply.
- No content is copied into Guild other than the map.

## Revisit Trigger

SC-001 below 17 of 20, or GitHub rate limits block normal use.
