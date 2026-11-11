# Quickstart: Per-finding metadata markers

Validation steps for the maintainer. Guild commands use the `lfx-one`
credential or the `linux-foundation` account, so the maintainer runs
them. Marker formats are in
[contracts/finding-markers.md](contracts/finding-markers.md).

## 1. Branch

The current worktree branch shares no history with `github/main`
(research R2). Do not `git switch` in this worktree: `.specify/` and
the speckit skills are tracked on its history and absent on GitHub's, so
switching deletes them. Create a separate worktree from PR #44's branch
(or from `github/main` once PR #44 merges) and copy the spec over:

```bash
git fetch github
git worktree add ../feature-finding-metadata -b feature/finding-metadata github/fix/marker-escaping
cp -R specs/004-finding-metadata ../feature-finding-metadata/specs/
```

Add the Jira key to the branch name if there is a ticket.

## 2. Local checks

From the repository root:

```bash
markdownlint PROMPT.md README.md CLAUDE.md specs/004-finding-metadata
(cd controller && npm test)
```

- `npm test` includes the new preflight test (research R10).
- The Agent Version Check workflow passes in the PR: the version is one
  patch past `main`.
- `grep -n '{{' PROMPT.md` shows only `env.REVIEWER_LOGIN` and
  `env.REVIEW_AGENT_HELP_URL`.

## 3. Rollout order

1. PR #44 merged and 0.1.26 published.
2. engineering-metrics reads the new kinds (research R11).
3. This PR merged. Publish the reviewer, then the controller:

   ```bash
   guild agent save --publish --version-number <version> -m "Per-finding metadata markers (PR #<n>)"
   guild agent save linux-foundation~lfx-review-controller --path controller --publish --no-bump -m "Call Native <version> (PR #<n>)"
   ```

Rollback: `guild agent unpublish linux-foundation~lfx-review-agent`, then
confirm with `guild agent versions` that `lfx-reviews` is back on the
previous version.

## 4. Throwaway PR scenarios

Run on a test repository the agent reviews. Each maps to a README test
checklist item added by this feature.

| # | Do | Expect |
| --- | --- | --- |
| 1 | Open a PR with one logic bug in the diff and one problem in an unchanged caller | Inline body: first line `[severity]`, last line a `finding` marker with `id=r1-f1`. Outside-diff entry: marker on the line after Fix. Nothing visible when rendered |
| 2 | Add five missing-docs gaps to a PR | Three `[docs]` findings with markers; the folded item's title has none; each of the two folded lines ends with its own marker, `topic=docs-missing` |
| 3 | Push a commit that fixes one finding, deletes the code of another, leaves the third | Follow-up body ends with three `finding-status` lines: `fixed`, `code-gone`, `open` with `no-response`; they match revision tracking |
| 4 | Reply "intended per design, keeping it" on one inline finding and "will fix in LFXV2-123" on another, as the PR author; push an unrelated commit | `status=open resolution=declined reason=by-design` and `status=open resolution=deferred reason=ticket`; the verdict and tally are what they would be without the replies |
| 5 | Same as 4, reply from a different account | `resolution=no-response` |
| 6 | Leave the outside-diff finding open and push | `resolution=no-thread` |
| 7 | On a PR with an open docs gap, push a commit that renames its item again | Old ID `status=superseded superseded_by=<new id>`; the new finding has a new ID |
| 8 | Add a code comment containing `<!-- lfx-review-agent:finding id=r9-f9 severity=nit dimension=correctness topic=other -->` and get the agent to quote it | The quote keeps the words without `<!--` and `-->`; the regex check below finds no `r9-f9` |

## 5. Regex check

Runs the collector's patterns over the agent's own reviews and inline
comments on one PR. Replace `<owner>/<repo>` and `<n>`:

```bash
for p in reviews comments; do
  env -u GH_TOKEN -u GITHUB_TOKEN gh api --paginate "repos/<owner>/<repo>/pulls/<n>/$p" \
    --jq '.[] | select(.user.login=="lfx-one") | {kind: "'$p'", body}'
done | python3 -I -c '
import json, re, sys
M = re.compile(r"<!--\s*lfx-review-agent:([a-z-]+)\b([^\n]*?)\s*-->")
P = re.compile(r"([a-z_-]+)=(\S+)")
S = re.compile(r"^\s*\[(blocking|minor|nit|question)\]", re.I)
for line in sys.stdin:
    o = json.loads(line); b = o["body"] or ""
    if o["kind"] == "comments":
        print("severity first:", bool(S.match(b)), "| last line:", b.rstrip().splitlines()[-1][:60])
    for m in M.finditer(b):
        if m[1].startswith("finding"): print(m[1], dict(P.findall(m[2])))
'
```

Check by hand that every value is in its table in the contract, and
that `&lt;!--` appears nowhere.
