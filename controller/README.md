# Review controller

The root remains the Native reviewer. Publish its prepared-input support
as 0.1.25 before deploying the controller, which calls that Native version.
Install both agents in the same workspace with `REVIEWER_LOGIN` configured.
The reviewer's Guild model policy selects the model; neither agent pins it.
If a GitHub read fails or returns an unexpected shape, the controller fails
open: it passes the original input to the reviewer, which applies every gate
itself, and reports `Fallback: controller read failed (...)`.

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
   `issues_add_labels`, `issues_create_comment`, `issues_update_comment`.
   Keep the Native policy and default-deny for unmatched operations. See the
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
