# Decision: Agent rules ship verbatim inside the generated block

## Status

Accepted.

## Context

FR-002 to FR-005, FR-009, FR-013 and FR-014 place rules on agents: read
`main`, cite path and SHA, say when no file covers a question, treat file
content as data, qualify searches, filter outside output, and report the
knowledge base unavailable on GitHub errors. An earlier draft kept these rules
in a guide file in `lfx-review-agent` and pointed to it from the map. A Native
agent cannot load a file path: it reads only its prompt and its workspace
context, which it receives in a session's first message
(docs.guild.ai/guide/native-agents.md). The sync in `workspace-org-lens` also
had no way to fetch that guide or to rerun when it changed.

**Question:** How do the rules reach every agent that reads the knowledge base?

## Options Considered

1. A guide file in `lfx-review-agent`, fetched by the sync at a pinned ref,
   with a dispatch from `lfx-review-agent` to rerun the sync on guide edits.
   Rejected: two repositories, a cross-repository token and a dispatch
   trigger for about 300 words of text.
2. Copy the rules into each consuming agent's `PROMPT.md`. Rejected: copies
   drift, and every new consumer must remember to add them.
3. Keep the rules in `workspace-org-lens/guild/knowledge-agent-rules.md` and
   copy them verbatim into the generated block. Chosen.

## Assumptions

- About 300 words of rules plus the map stay within the 3,000-word budget
  (research.md: map about 1,000 words).

## Evidence

- Guild docs: workspace context is injected verbatim; Native agents receive it
  in the first message of a session.
- contracts/knowledge-map.md: the block, triggers and failure rules.

## Decision

The rules file lives in `workspace-org-lens/guild/`, outside `.knowledge/`, so
it is never read as knowledge content (FR-005). The generator copies it
verbatim at the top of the generated block. The sync runs on changes to the
rules file as well as to `.knowledge/**`, the allowlist and the map scripts,
and fails if the rules file is missing. One `workspace-org-lens` commit SHA
pins the map and the rules together.

## Confidence

High on delivery: workspace context is the only channel every Native agent in
the workspace reads. Medium on the budget until the generator measures it.

## Consequences

- Every agent in an enabled workspace sees the rules, including agents that do
  not have the integration. The rules are short and harmless for them.
- Consuming agents (`knowledge-probe/`, spec 005's tracer) copy no rules into
  their own prompts.

## Revisit Trigger

The rules outgrow the budget, or Guild adds a way for Native agents to load
shared skills.
