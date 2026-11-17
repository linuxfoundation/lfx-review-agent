# Review controller

The root remains the Native reviewer. Publish it as 0.1.33 before
deploying the controller, which calls that Native version.
Install both agents in the same workspace with `REVIEWER_LOGIN` configured.
The reviewer's Guild model policy selects the model; neither agent pins it.
If a GitHub read fails or returns an unexpected shape, the controller fails
open: it passes the original input to the reviewer, which applies every gate
itself, and reports `Fallback: controller read failed (...)`.

## Publishing

Publish the Native reviewer first, from the repository root, then the
controller. This directory has no `guild.json`, so name the agent, and pass
`--no-bump`: for a TypeScript agent, `guild agent save` otherwise bumps the
version in `package.json` before it uploads.

```bash
cd controller
npm test
guild agent save linux-foundation~lfx-review-controller --no-bump --publish --version-number <package.json version> -m "Call reviewer <reviewer version> (PR #<n>)"
```

Guild builds the controller in a clean directory with `tsc --build`.
`npm test` runs the same build with `--force`. Without it, the incremental
build reuses `dist/tsconfig.tsbuildinfo` from earlier builds and can report
no errors for code that Guild's clean build rejects: controller 0.1.10
first failed that way on a type error that local tests had passed.

A version whose build fails stays a draft without a version number, so
fix the code and publish again with the same number. After publishing,
check that the webhook triggers use the new version: `guild trigger list`
shows it as `workspace_agent.agent_version.version_number`.

## Escaped marker repair

The reviewer sometimes posts its formal review with HTML-escaped markers
(`&lt;!-- lfx-review-agent:review --&gt;`). They show as text on GitHub,
and metrics readers miss them; later runs still read them. After the
reviewer returns, the controller takes the review links in its Step 7
report (`.../pull/<n>#pullrequestreview-<id>`), lists the PR's reviews
again, and repairs each own review that the report links and that was not
in the list read before the reviewer ran. It rewrites escaped
`lfx-review-agent:` markers outside Markdown code to the literal form and
updates the review with `pulls_update_review` (integration 1.0.8). Escaped
text in code, fenced blocks in list items included, is quoted content and
stays.

- Only reviews this run posted are changed. Earlier reviews, reviews
  another run posted meanwhile, other accounts' reviews and inline
  comments are never touched. A report that links no review makes no
  extra read.
- A failed list or update is reported in the result and never fails the
  run; the review is already posted.
- Runs the controller does not prepare are not repaired: the sweep
  calls the Native reviewer directly, and a controller read failure falls
  back to the reviewer without a review list.
- Updating a review sends a `pull_request_review` `edited` webhook. No
  trigger subscribes to it, so the repair starts no run.

## Test before replacing triggers

Check out the repository in a separate directory. Register two private test
agents with new names: a Native reviewer from the root and a TypeScript
controller from `controller/`. Point the test controller's `calls` reference
at the test Native agent's published version. Do not publish either copy
under the deployed agent names. A separate workspace alone does not isolate
changes published to an existing agent.

Install both copies in a test workspace. Bind the custom GitHub integration
to a test credential, set `REVIEWER_LOGIN` and `REVIEW_AGENT_HELP_URL`, and
select the reviewer's model through Guild policy. Check access to a disposable
repository before running. The controller accepts `linuxfoundation/*`; a
sandbox outside that organization needs an explicit test-only scope change.

The SDK is private: sign in to Guild with an account that can read
`linux-foundation~lfx-one-github`. From `controller/`, run `npm ci` and
`npm test`. Use `guild agent test` with captured webhook inputs first.
Check closed PR, active review, cooldown, reviewed HEAD,
initial review and follow-up cases, including publication and approval rules.
Then create only test-repository webhook triggers targeting the test controller
and check real GitHub delivery. Deactivate those triggers when finished.

## Pilot replacement and rollback

Since 2026-11-14 every onboarded repository's webhook triggers target the
controller: lf-dbt's are named `<old name> controller pilot`, the rest
`<old name> controller`. `scripts/onboard-repo.sh` creates controller
triggers for a new repository. Use the steps below to move a repository
between the controller and the Native reviewer.

`trigger update` cannot change agents; names are workspace-unique. Creation
starts webhooks active; there is no inactive-create flag. Qualify full input
handling before cutover.

1. Pilot one repository. Save `guild --mode json trigger get "$OLD_ID"` for
   each original, recording IDs/names, active states, integration/credential,
   repo/event/action, full `service_config` and `agent_input`. Leave inactive
   originals untouched with no replacement. Avoid onboarding/filter helpers.
2. Verify the same GitHub connection/credential for the controller first.
   Creation chooses credentials for caller/workspace/agent; no CLI binding
   override exists. Also authorize the controller UUID on that credential:
   create an ALLOW policy scoped to the pilot workspace and controller, for
   `pulls_get`, `pulls_list_reviews`, `issues_list_comments`,
   `issues_add_labels`, `issues_create_comment`, `issues_update_comment`,
   `pulls_update_review`.
   Keep the Native policy and default-deny for unmatched operations. The
   workspace uses only credentials scoped to it, so also grant the
   credential to the controller (root README, Agent grants). See the
   root README's Credential policy commands. Verify access before cutover.
3. Deactivate all active originals: `guild trigger deactivate "$OLD_ID"`.
   Verify with `trigger get`; retain originals and let running reviews finish.
4. Copy each snapshot into the flags below. Choose an unused `NEW_NAME`
   (old name plus `controller pilot`); record each old/new ID pair.

   ```bash
   guild --mode json trigger create --workspace "$WS" --type webhook \
     --agent linux-foundation~lfx-review-controller --name "$NEW_NAME" \
     --integration "$INTEGRATION" --event "$EVENT" --action "$ACTION" \
     --service-config "$CONFIG" "${INPUT_FLAGS[@]}"
   ```

   Preserve repo and `required_text`/regex in `CONFIG`. For null input use
   `INPUT_FLAGS=()`; otherwise `INPUT_FLAGS=(--input "$INPUT_JSON")` with the
   full JSON/placeholders. Compare saved replacements; deactivate on mismatch.
5. This is not atomic: record the gap and inspect deliveries/sessions for
   missed events. Never reactivate originals while replacements are active.
6. Run `WS="$WS" scripts/sweep-trigger.sh --apply`. The Native sweep always
   includes both agent groups and retains its existing activation state.
7. Rollback: deactivate/verify every replacement, then
   `guild trigger activate "$OLD_ID"` only for originally active IDs. Repeat 6.
