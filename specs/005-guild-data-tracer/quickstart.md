# Quickstart: Guild-hosted LFX data tracer

Validation steps for the maintainer. Every step runs in the Development
environment only (DR-003). The read surface contract is in
[contracts/read-surface.md](contracts/read-surface.md).

## 1. Before building

Resolve the research items in [research.md](research.md): the Guild egress
model, the host service for the read surface, the warehouse layer names, the
read-only Snowflake role, and the verified Slack and GitHub identity mapping.

## 2. Read surface

1. Call every endpoint with a verb other than GET: each returns 405 (T007).
2. Call as a staff asker without project `auditor_guard`: committee and meeting
   reads return 403, and the 403 body does not say whether the object exists
   (T007a).
3. Call with an unlisted KV bucket and without `X-Tracer-Asker`: both return
   403 (T007a).

## 3. Agent

1. Mention the tracer in the private Slack channel with a question about a
   known organization. The threaded reply names the environment, the
   provenance chain, a verdict, and says no action was taken (T015).
2. Ask it to grant access or re-index an object. It refuses and names the
   owner (T013, T017).
3. Comment the trigger phrase on a test GitHub issue. The issue reply passes
   the privacy scan and links the full trace in Slack (T019 to T021).

## 4. Records

Check the Guild session log: every call is a read, and the audit record names
the asker, question, environment and sources (FR-018).
