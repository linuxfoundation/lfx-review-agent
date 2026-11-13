# Decision: Authorize each read against the asker's own relation

## Status

Accepted, supersedes DR-002.

> DR-002 rejected per-asker checks on the premise that `lf-staff` holds blanket
> `auditor` on every `b2b_org`. That grant covers organizations only. Committee,
> meeting and other project-plane objects resolve through the project's
> `auditor_guard`, which `lf-staff` membership does not satisfy. The staff-only
> start gate from DR-002 is kept; its "no per-asker check" conclusion is
reversed.

## Context

The read surface (contracts/read-surface.md) is called by the tracer's service
identity. Without the asker's identity, every read is authorized as the service,
so any staff asker could read any committee roster or meeting invitee list.
ADR-0038 requires an authorization check equivalent to the operational plane's
for gated detail. The `heimdall-fga` rule asks a BFF to forward the user's own
token, and allows a machine identity only where no user session exists, with the
reason recorded next to the call
(`workspace-org-lens/.knowledge/v2/v2-design/read-plane-authorization-invariants.md`,
section
"User token on calls to a Heimdall-fronted API"). A Slack or GitHub mention has
no LFX user session, so the tracer cannot forward a user token.

**Question:** How does a read made by the tracer's service identity respect the
asker's own access?

## Options Considered

1. Service identity only, staff gate at the start (DR-002). Rejected: staff
   membership does not prove project-plane access.
2. Asserted asker principal: the service identity passes the verified asker; the
   read surface checks `user:<asker>` against the object's gating relation
   before returning anything, and denies by default. Chosen.
3. Restrict the surface to `b2b_org`-plane objects only, where staff are proven
   entitled. Rejected as the end state: it drops committee and meeting
   questions. Kept as the fallback if option 2 fails architecture review.

## Assumptions

- Slack and GitHub identities can be mapped to an LFX username with a verified
  link, not a display-name match. Unverified; see research item 6.

## Evidence

- `lfx-v2-helm/charts/lfx-platform/files/model.fga:51` (`global_auditor:
  [team#member]`), `:99` (`auditor_guard: auditor or global_writer or
  global_auditor`), `:189` (`committee` auditor via `auditor_guard from
  project`), `:350` (`v1_meeting` auditor via `auditor_guard from project`),
  `:479` (`b2b_org` is a separate type).
- ADR-0042 and ADR-0045: the `lf-staff` blanket grant is on `b2b_org` only
  (`workspace-org-lens/.knowledge/v2/v2-design/architecture-decisions.md:466,490`).
- ADR-0038 (c): gated detail returned from a non-operational path needs
  arch-review sign-off with a parity analysis
  (`workspace-org-lens/.knowledge/v2/v2-design/architecture-decisions.md:434`).

## Decision

1. Starting an investigation still requires `lf-staff` (DR-002's gate).
2. Every read surface call carries the verified asker principal. The surface
   accepts it only from the tracer's service identity.
3. Before returning data, the surface checks the asker's relation on the object
   named by the request, using the gating relation from the contract's
   allowlist. A denied or unmapped object returns 403 with no body detail.
4. KV reads are limited to an allowlist of buckets, each mapped to an object
   type
   and gating relation. Unlisted buckets return 403.
5. The machine-identity call records why the user token is unavailable, per the
   `heimdall-fga` rule.
6. The design needs arch-review sign-off (ADR-0032, ADR-0038 (c)) before
   enabling committee or meeting reads. Until then, only `b2b_org`-plane types
   are enabled (option 3).

## Confidence

Medium. The check design follows the model; identity mapping and the review are
open.

## Consequences

- Staff askers see only what their own relations grant; some questions return
  "access denied for this object" instead of an answer.
- Denied-object tests are required before release (tasks T007a).

## Revisit Trigger

Arch review rejects asserted principals, or identity mapping cannot be verified.
