# Research: Guild-hosted LFX data tracer

## Verified facts

- Development (AWS 788) holds a partial sample plus unreleased object types;
  Production (AWS 372) holds full data for released features
  (`workspace-org-lens/.knowledge/v2/nats/clusters.md:9-10,26-27`).
- The two environments are fully isolated
  (`workspace-org-lens/.knowledge/v2/nats/connecting.md:70`).
- FGA model: `type b2b_org` defines `writer`, `auditor` and `viewer`
  (`lfx-v2-helm/charts/lfx-platform/files/model.fga:479`).
- ADR-0042 fixes the blanket-auditor set at `[lf-staff]`; ADR-0045 (Proposed)
  adds `global-org-auditors`
  (`workspace-org-lens/.knowledge/v2/v2-design/architecture-decisions.md:466,490`).
- ADR-0038 Decision: plain counts allowed; gated or non-granted aggregates need
  arch-review sign-off with parity analysis
  (`workspace-org-lens/.knowledge/v2/v2-design/architecture-decisions.md:434`).
- Existing debug skills are report-only (`lfx-investigate/SKILL.md:30`).

## Open questions (not verified; resolve before tasks)

1. **Which service hosts the read surface?** Candidates: query-service, auth
   service. Needs a read of each service's route list. Not done.
2. **Guild egress model.** The spec's network-isolation claim is an assumption.
   Verify with the Guild docs or the workspace admin before choosing between
   an HTTP proxy and an in-cluster relay.
3. **Gold and platinum layer names.** Verify against the dbt project
   (`lf-dbt`) before FR-009 is implemented.
4. **Snowflake read role.** Scoping is designed, not checked against real
   grants.
5. **Team name for staff population.** Blocked on ADR-0045 Accepted (DR-004).
6. **Verified identity mapping.** How a Slack user or GitHub login maps to an
   LFX username with a verified link, not a display-name match (DR-004).
   Unresolved.

## Decisions

Recorded in DR-001 (read-only in surfaces), DR-002 (staff-only askers) and
DR-003 (Development first).
