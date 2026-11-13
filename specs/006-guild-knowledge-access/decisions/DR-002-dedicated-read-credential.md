# Decision: A dedicated read-only credential and integration for the knowledge base

## Status

Accepted.

## Context

The `lfx-one-github` integration already declares `git_get_tree` and
`repos_get_content`, but its credential also posts reviews and comments
(`guild.yaml` in lfx-review-agent, 21 tools). Adding this private repository to
that token would extend the review credential's write reach to it.

**Question:** Which credential reads the knowledge base?

## Options Considered

1. Add the repository to the `lfx-one` token. Rejected: the review credential
   gains reach to a repository it never reviews, and FR-010 forbids write
   access.
2. A dedicated fine-grained token (or GitHub App installation) with Contents:
   read on `workspace-org-lens` only, behind its own integration with three
   operations: tree, content, code search. Chosen.

## Assumptions

- GitHub code search accepts the chosen credential type. Not verified.

## Evidence

- `guild.yaml` (lfx-review-agent): the 21 `lfx_one_github_*` tools, including
  `pulls_create_review` and `issues_create_comment`.
- Spec FR-010.

## Decision

Create a dedicated credential with read access to
`linuxfoundation/workspace-org-lens` only, and a Guild custom integration that
exposes only tree listing, file content and code search.

## Confidence

Medium. Code search support for the credential type is unverified.

## Consequences

- One more credential to rotate.
- The review agent's credential is unchanged.

## Revisit Trigger

Code search rejects the credential type, or GitHub App installation becomes the
LF standard for agent access.
