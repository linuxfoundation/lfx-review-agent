# Implementation Plan: Guild-hosted LFX data tracer

**Branch**: `feature/guild-tracer-knowledge-specs` | **Date**:
2026-11-12 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/005-guild-data-tracer/spec.md`

## Summary

A Guild-hosted, read-only agent answers LFX data questions from Slack and GitHub
issue comments by tracing reads across NATS KV, OpenFGA, query-service and the
analytics warehouse. Writes are blocked at the data surfaces and credentials
(DR-001). Askers are limited to `lf-staff`, and every read is checked against
the asker's own relation on the object (DR-004), and only Development is
queried in the first release (DR-003).

## Technical Context

**Language/Version**: TypeScript (Guild Native agent prompt plus a read-only
HTTP
surface), version unverified `[INFERENCE]`
**Primary Dependencies**: Guild agent runtime; Slack and GitHub connections;
NATS
KV client; OpenFGA HTTP API; query-service read API; Snowflake read role
**Storage**: No new storage. Audit records go to the Guild run log (FR-018).
**Testing**: Read-only smoke test against Development; tool-level contract tests
per data tool; privacy scan test on GitHub replies (SC-004)
**Target Platform**: Guild workspace (agent), LFX Development cluster (data)
**Project Type**: Agent plus a read-only platform surface
**Performance Goals**: Answer in under 5 minutes (SC-001)
**Constraints**: Read-only (FR-011 to FR-014); staff-only askers (FR-015); no
Production (FR-019); ADR-0038 analytics gating
**Scale/Scope**: Internal audience, low volume; spend budget enforced (FR-020)

## Constitution Check

This repository has no constitution of its own. The read surface is built in
LFX platform services, so the LFX platform constitution
(`workspace-org-lens/.specify/memory/constitution.md`) applies to it. The
agent follows this repository's `CLAUDE.md` rules.

*GATE: passed before research; re-check after design.*

- **I. Gateway-Enforced Authorization**: PASS. The read surface sits behind the
  platform gateway (FR-012). No caller-side role check replaces it.
- **II. NATS as the Inter-Service Backbone**: PASS. KV reads go over NATS; the
  tracer does not add a second transport.
- **III. OpenFGA Model as the Permission Source of Truth**: PASS. Access checks
  call OpenFGA; the tracer never caches or invents relations.
- **IV. License and DCO Compliance**: APPLIES at merge. Headers on new code
  files.
- **This repository's `CLAUDE.md`**: APPLIES to the agent. New YAML, shell and
  code files carry the LF header; Markdown follows `.markdownlint.json` and the
  unslop rules; the root reviewer's `PROMPT.md` and `guild.yaml` are not
  touched,
  so no agent version bump.
- **V. Umbrella Chart Composition**: APPLIES if the read surface is deployed by
  the umbrella chart (`lfx-v2-helm`).
- **VI. Idempotent Secret Management**: APPLIES to the warehouse read
  credential.
- **VII. Medallion Data Architecture**: PASS. Warehouse reads limited to gold
  and
  platinum (FR-009). Layer names not yet verified against dbt models
  `[INFERENCE]`.
- **VIII. Environment Parity via GitOps**: PASS. Development only in release one
  (DR-003); deploy via GitOps.

### Read-plane authorization gate

- [x] Authorization & Privacy table filled, with a gate of record per fact.
- [x] Analytics-lane facts limited to plain counts; any other aggregate needs
      arch-review sign-off (ADR-0038 (c), ADR-0032). Source: spec table row.
- [x] `account_id` row filter treated as scoping only, not authorization
      (ADR-0038 (a), ADR-0017).
- [x] `public`/`private` treated as display only (ADR-0038 (b)).
- [ ] Cross-lens links: none rendered (spec states this). Re-check if added.
- [x] Per-asker object check on every read (DR-004, FR-022); staff `b2b_org`
      grant
      is not used as proof of project-plane access.
- [ ] Arch-review sign-off for asserted asker principals and committee or
      meeting
      reads (ADR-0032, ADR-0038 (c)). Those types stay disabled until signed
      off.
- [x] Residual gap routed to DR-004 (staff team name depends on ADR-0045,
      Proposed).

## Project Structure

### Documentation (this feature)

```text
specs/005-guild-data-tracer/
├── spec.md
├── plan.md              # this file
├── research.md          # open questions and verified facts
├── data-model.md        # Question, Investigation, Hop, Verdict, Asker
├── quickstart.md        # validation steps
├── contracts/           # read-surface.md
├── checklists/          # requirements.md
├── decisions/           # DR-001 to DR-004
└── tasks.md
```

### Source Code

```text
Guild agent, in this repository under tracer/ (as controller/ is for the
controller): prompt and tool manifest
  - tools: nats_kv_get, fga_check, fga_list_tuples, query_service_read,
    warehouse_read (gold/platinum only), github_read
Platform read surface: new read-only endpoints, repo to be confirmed
  - lfx-v2-query-service or lfx-v2-auth-service (NOT VERIFIED; choose in research)
```

**Structure Decision**: the agent's source lives in `tracer/` in this
repository and runs in Guild. The read surface belongs in an
existing platform service, not a new one, to avoid a second read path.

## Complexity Tracking

| Violation | Why needed | Simpler alternative rejected because |
|---|---|---|
| Machine identity with asserted asker principal | No LFX user session exists for Slack or GitHub askers | Forwarding a user token is impossible; service-only reads would bypass project-plane gates (DR-004) |
