# Decision: Unredacted model access only under an approved policy

## Status

Accepted.

## Context

21 knowledge files contain AWS account numbers and 13 contain Auth0
identifiers (spec Edge Cases). Agents send what they read to the workspace's
model provider. Guild can use Guild-managed model access or the account's own
keys, and model policies limit which models a workspace may call
([docs](https://docs.guild.ai/)).

**Question:** May knowledge content reach the model provider unredacted?

## Options Considered

1. Redact identifiers before agents read files. Rejected: live reads (DR-001)
   leave no place to redact, and redaction would break debugging answers.
2. Allow unredacted reads only in workspaces whose model policy is limited to
   providers already approved for `workspace-org-lens`; filter replies by
   audience.
   Chosen.

## Assumptions

- The repository already has an approved model provider through the team's
  coding assistants. Which provider, and whether Guild uses LF's own keys, is
  not verified (research item).

## Evidence

- Spec FR-013 and Edge Cases.
- Guild model policies and LLM settings (docs.guild.ai platform/llm-settings).

## Decision

An allowlisted workspace (DR-003) must also have a model policy limited to an
approved provider. Agents never repeat AWS account numbers, Auth0 identifiers
or personal names in replies visible outside the enabled population.

## Confidence

Medium. The approved provider list is not yet confirmed.

## Consequences

- Workspaces using Guild-managed models may not qualify until the provider is
  approved.

## Revisit Trigger

LF security publishes a model-provider policy, or the provider changes.
