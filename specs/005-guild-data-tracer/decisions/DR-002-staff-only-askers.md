# Decision: Only LF staff may start a tracer investigation

## Status

Superseded by DR-004 (2026-11-12).

> The rejection of per-asker checks relied on the `lf-staff` blanket
> `auditor` grant, which covers `b2b_org` only. Committee and meeting reads
> resolve through the project's `auditor_guard`. DR-004 keeps the staff start
> gate and adds a per-asker object check.

## Context

The tracer returns person-level data (key contacts, tuples, memberships) that
the product gates per object (spec Authorization table; FR-015). Gating per
asker would require per-asker FGA checks inside the agent, which the agent does
not have a clean path to. The clarify step (auto mode) chose the conservative
population.

**Question:** Who may start an investigation?

## Options Considered

1. Any authenticated Slack or GitHub user, answers limited to what they can see
   in the product. Rejected: needs per-asker FGA checks the agent lacks.
2. LF staff only, the population that already holds blanket `auditor` on every
   `b2b_org`. Chosen.
3. A named allow-list. Rejected for now: a second population to maintain.

## Assumptions

- The org-plane blanket-auditor set is the staff population for this purpose.

## Evidence

- ADR-0042: org-plane blanket-auditor set is `[lf-staff]`, fixed in code
  (`workspace-org-lens/.knowledge/v2/v2-design/architecture-decisions.md:466`).
- ADR-0045: `global-org-auditors` adds a hand-picked read-only team, status
  Proposed
  (`workspace-org-lens/.knowledge/v2/v2-design/architecture-decisions.md:490`).
  The population therefore depends
  on an unfinished decision; this is recorded in the Revisit Trigger.
- ADR-0038: analytics-lane reads must honour the operational access check
  (`workspace-org-lens/.knowledge/v2/v2-design/architecture-decisions.md:434`).

## Decision

Refuse investigations from anyone outside the `lf-staff` population, with a
refusal that contains no data. Confirm which team names the allowed set when
ADR-0045 is Accepted.

## Confidence

Medium-high on the population rule; medium on which team names it, pending
ADR-0045.

## Consequences

- Contractors and community members cannot use the tracer, even for their own
  objects. This is a deliberate narrowing, not a regression.

## Revisit Trigger

ADR-0045 is Accepted or changed, or a request arrives to let a non-staff asker
see their own data.
