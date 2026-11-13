# Decision: Read-only is enforced in data surfaces, not in the prompt

## Status

Accepted.

## Context

The tracer runs as a Guild-hosted agent with network reach into the platform's
read paths (spec FR-006 to FR-010). A prompt rule ("do not write") is not a
security boundary: an injected question can instruct the agent to try a write.
The LFX platform constitution, principle I (Gateway-Enforced Authorization),
requires every platform
endpoint to be gated at the gateway, not by the caller.

**Question:** Where does the no-write guarantee live?

## Options Considered

1. Prompt-only instruction. Rejected: a prompt is bypassable by injected text.
2. Agent prompt plus read-only credentials and read-only endpoints. Chosen.
3. A separate tracer service with its own write-free store. Rejected for the
   first release: it duplicates read paths the platform already serves.

## Assumptions

- The platform's read services and the warehouse identity can be scoped to
  read-only (not yet verified; see Evidence).

## Evidence

- Spec FR-011 to FR-014 (read-only guarantee, no write tools).
- Constitution I (Gateway-Enforced Authorization),
  `workspace-org-lens/.specify/memory/constitution.md:42`.
- Read-plane invariants: writes are never performed by the analytics lane
  (`workspace-org-lens/.knowledge/v2/v2-design/read-plane-authorization-invariants.md`).
- Existing `lfx-investigate` skill is already report-only
  (`workspace-org-lens/.claude/skills/lfx-investigate/SKILL.md:30`), so the
  behaviour exists
  locally; this DR moves the guarantee out of the prompt.

## Decision

Enforce read-only at three layers: the tracer's data tools expose only read
operations; the warehouse identity has read grants on gold and platinum only;
the platform read surface rejects writes at the gateway. The agent prompt
repeats the rule, but it is not relied on.

## Confidence

Medium. The per-layer scoping is a design target; each layer must be verified
against the real credentials before enabling the tracer.

## Consequences

- Each data tool needs a read-only audit: no write verbs, no admin endpoints.
- Credential creation is a platform task with its own review.

## Revisit Trigger

Any tool request that needs a write, or any finding that a read surface
accepts writes.
