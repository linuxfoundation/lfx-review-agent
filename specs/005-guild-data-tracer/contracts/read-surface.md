# Contract: tracer read surface

Read-only endpoints behind the platform gateway (LFX platform constitution I,
FR-012).
Host service is open (research item 1). Every endpoint is GET; any other verb
returns 405 (T007). Authorization follows DR-004.

## Caller and asker

- Caller: the tracer's service identity only. Any other caller gets 403.
- Every request carries `X-Tracer-Asker: <lfx-username>`, the verified asker
  (research item 6). A missing or unverified asker returns 403.
- Before returning data, the surface runs an FGA check for `user:<asker>` on the
  object named by the request, using the gating relation in the allowlist below.
  Deny by default: an object type or bucket not in the allowlist returns 403.
- The service identity's own access is never used as the answer to an asker
  check. The call records why no user token is available (no LFX session from
  Slack or GitHub), per the `heimdall-fga` rule.

## Object allowlist

| Object type | Gating relation for reads | KV bucket | Enabled in release one |
|---|---|---|---|
| `b2b_org` | `auditor` | to confirm (research item 1) | yes |
| `project_membership` | `auditor` on parent `b2b_org` | to confirm | yes |
| `key_contact` | `auditor` on parent `b2b_org` | to confirm | yes |
| `committee` | `auditor` (via project `auditor_guard`) | to confirm | no, until arch review (DR-004) |
| `v1_meeting` | `auditor` (via project `auditor_guard`) | to confirm | no, until arch review (DR-004) |

## Endpoints

| Endpoint | Purpose | FR | Asker check | Response |
|---|---|---|---|---|
| `GET /tracer/v1/kv/{bucket}/{key}` | Read one KV entry | FR-006 | Gating relation on the object the key names | Entry and revision; 403 if denied or bucket unlisted |
| `GET /tracer/v1/fga/check?user=&relation=&object=` | Check one relation | FR-007 | Asker holds `auditor` on `object` | `allowed`, plus direct or inherited path; 403 if denied |
| `GET /tracer/v1/fga/tuples?user=&object_type=` | List a user's tuples | FR-007 | Results filtered to objects where the asker holds `auditor` | Filtered list, paginated |
| `GET /tracer/v1/fga/holders?relation=&object=` | List who holds a relation | FR-007 | Asker holds `auditor` on `object` | User list, paginated; 403 if denied |
| `GET /tracer/v1/indexed/{object_type}/{id}` | Indexed copy via query-service | FR-008 | Gating relation on the object | Object as served; 403 if denied |

## Errors

- 401 or 403 from the gateway or the asker check. A 403 body says "denied" and
  never confirms whether the object exists.
- 504 on upstream timeout, reported as a failed hop (FR-021).
