# Decision: Enabled workspaces come from a reviewed allowlist with a membership check

## Status

Accepted.

## Context

The dedicated credential reads on behalf of every member of a workspace that
holds it. A Guild workspace member who cannot read this private repository on
GitHub could otherwise read it through an agent (spec Authorization table).

**Question:** Which workspaces may read the knowledge base?

## Options Considered

1. Every LF Guild workspace. Rejected: membership is not tied to repository
   access.
2. An allowlist file in `workspace-org-lens`; each entry records who checked
   that
   all workspace members can read the repository, and when. Chosen.
3. An automated membership comparison on every sync. Rejected for now: needs a
   reliable Guild-user to GitHub-user mapping that does not exist yet.

## Assumptions

- Workspace membership changes rarely enough for a periodic manual check.

## Evidence

- Spec FR-011 and the Authorization table.
- Guild skills and context are workspace-scoped
  ([skills](https://docs.guild.ai/platform/skills.md)).

## Decision

The sync publishes the map only to workspaces in the allowlist, and the
credential policy limits the integration to those workspaces. Adding an entry
is a reviewed pull request that records the membership check. Start with one
workspace.

## Confidence

Medium. The check is manual and can drift between reviews.

## Consequences

- A member added to an enabled workspace later is not re-checked until the next
  review; the allowlist records a review date to make this visible.

## Revisit Trigger

A Guild-to-GitHub identity mapping becomes available, or an allowlisted
workspace gains a member without repository access.
