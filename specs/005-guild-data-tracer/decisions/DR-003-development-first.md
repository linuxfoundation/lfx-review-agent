# Decision: First release investigates Development only

## Status

Accepted.

## Context

Production (AWS 372) holds full production-scale data, while Development (AWS
788) holds a partial sample plus unreleased object types (spec FR-019;
User Story 4). Production data carries the highest privacy exposure, and
enabling it needs a privacy review the tracer does not have yet.

**Question:** Is Production in scope for the first release?

## Options Considered

1. Development and Production from day one. Rejected: no privacy review yet.
2. Development only; Production behind a later review. Chosen.
3. Production only. Rejected: the common cases are unreleased features in
   Development.

## Assumptions

- Development's sample is sufficient for most reported questions. Unverified.

## Evidence

- `workspace-org-lens/.knowledge/v2/nats/clusters.md:9-10,26-27`: Development is
  a partial sample
  plus unreleased types; Production holds full data for released features.
- `workspace-org-lens/.knowledge/v2/nats/connecting.md:70`: the two environments
  are fully isolated.

## Decision

The tracer reads Development only. Production enablement is a separate
decision, opened after the privacy audit, and recorded as a new DR.

## Confidence

High on the scope choice. Low on how much Development covers; measure against
the 10 solved investigations in SC-002.

## Consequences

- Reports about released features in Production cannot be traced until the
  follow-up DR lands. The tracer says so instead of answering from Development.

## Revisit Trigger

SC-002 coverage below 8 of 10, or the privacy audit approves Production.
