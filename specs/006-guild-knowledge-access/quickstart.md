# Quickstart: Guild agent access to the workspace knowledge base

Validation steps for the maintainer. The integration contract is in
[contracts/knowledge-integration.md](contracts/knowledge-integration.md) and
the map format in [contracts/knowledge-map.md](contracts/knowledge-map.md).

## 1. Before building

Resolve research items 1 to 4 in [research.md](research.md): whether Guild
forwards an undeclared `ref`, whether code search accepts the credential type,
the approved model provider, and the CI API key scope.

## 2. Credential and integration (this repository)

1. With the dedicated credential, call a write endpoint (create a file,
   comment). It returns 403 or 404 (T019a).
2. In the enabled workspace, run `git_get_tree`; in any other workspace the
   integration is unavailable (Phase 2 checkpoint).

## 3. Map sync (workspace-org-lens)

1. Run `scripts/generate-knowledge-map.sh --check`; it passes under 3,000
   words (T012).
2. Merge a README change; the new map version appears in every enabled
   workspace within 1 hour, and hand-written context is unchanged (T013a,
   T016).
3. Drop a test workspace from the allowlist; its generated block is removed
   (T019b).

## 4. Agent answers

Run [checklists/sc-001.md](checklists/sc-001.md) with `knowledge-probe/`:
at least 17 of 20 correct citations, "no entry" for the 3 uncovered
questions, and the injected instruction is not followed (T011).
