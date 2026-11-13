# Contract: knowledge map in workspace context

## Triggers

The sync runs on every push to `workspace-org-lens` `main` that touches
`.knowledge/**`, `guild/knowledge-agent-rules.md`,
`guild/knowledge-workspaces.yaml` or `scripts/*knowledge-map.sh` (FR-006).

## Markers

The publisher replaces only the text between these markers and keeps
everything else in the workspace context (FR-007). If the markers are absent,
it appends the block at the end.

```text
<!-- BEGIN GENERATED KNOWLEDGE MAP -->
...generated...
<!-- END GENERATED KNOWLEDGE MAP -->
```

## Block format

```markdown
## LFX knowledge base (generated from main @ <sha>)

### Rules for agents

<the full text of guild/knowledge-agent-rules.md, copied verbatim (FR-016)>

### Map

| Area | Covers | Key files |
|---|---|---|
| `v2/nats` | <summary> | `clusters.md`, `connecting.md` |
```

## Publish call

`POST /workspaces/{id}/contexts` with `status: PUBLISHED`, the spliced
`context`, and `summary: "knowledge map @ <sha>"`. The `<sha>` is the
`workspace-org-lens` commit, so it pins the map and the rules together.
Skip the call when the generated block is unchanged.

## Failure rules

- Word count above 3,000, rules included: exit non-zero, publish nothing
  (FR-008).
- Rules file missing or empty: exit non-zero, publish nothing (FR-016).
- gitleaks finding on the generated block: exit non-zero, publish nothing
  (FR-012).
- Workspace not in the allowlist: never published to (FR-011).
- Workspace removed from the allowlist: its generated block is deleted on the
  next sync, keeping hand-written context (FR-015).
