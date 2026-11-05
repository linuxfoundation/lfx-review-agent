#!/usr/bin/env bash
# Copyright The Linux Foundation and each contributor to LFX.
# SPDX-License-Identifier: MIT
#
# Create the webhook triggers that send a repository's events to
# lfx-review-agent (onboarding step 4 in README.md). Skips triggers that
# already exist, so it is safe to run again.
#
# Usage: WS=<workspace-id> scripts/onboard-repo.sh <repo> [<repo>...]
#   <repo> is a linuxfoundation repository name, with or without the
#   "linuxfoundation/" prefix.
#
# New triggers start reviews on the repository's next PR event. Run this
# only after onboarding steps 1 to 3 are done for each repository.
set -euo pipefail

# Every event the agent handles (PROMPT.md, Step 0), as
# "<event> <action> <name suffix>". When the agent handles a new event,
# add it here and in README.md, then rerun this script for every onboarded
# repository.
TRIGGERS=(
  "pull_request opened opened"
  "pull_request synchronize synchronize"
  "pull_request ready_for_review ready_for_review"
  "issue_comment created re-review comment"
)

AGENT=${REVIEW_AGENT:-linux-foundation~lfx-review-agent}
# The issue_comment trigger gets this Guild comment filter, so only a
# comment that starts with `@lfx-one re-review` starts a session. Without
# it, every comment starts a model run. Keep in sync with
# scripts/re-review-trigger.sh, which adds it to existing triggers.
RE_REVIEW_FILTER='^\s*@lfx-one\s+re-review\b'

: "${WS:?set WS to the Guild workspace ID}"
if [ $# -eq 0 ]; then
  echo "usage: WS=<workspace-id> $0 <repo> [<repo>...]" >&2
  exit 2
fi
command -v jq >/dev/null || { echo "jq is required" >&2; exit 1; }

# Check every argument before creating anything, so a typo cannot stop a
# multi-repo run partway. Drop repeats, so "x" and "linuxfoundation/x" in
# one run do not create the same triggers twice.
repos=()
for arg in "$@"; do
  if [[ ! $arg =~ ^(linuxfoundation/)?[A-Za-z0-9._-]+$ ]]; then
    echo "not a linuxfoundation repository name: $arg" >&2
    exit 2
  fi
  repo=linuxfoundation/${arg#linuxfoundation/}
  [[ " ${repos[*]-} " == *" $repo "* ]] || repos+=("$repo")
done

# Read every page of the workspace's triggers into one JSON array.
PAGE=100
existing="[]"
offset=0
while :; do
  page=$(guild --mode json trigger list --workspace "$WS" \
    --limit "$PAGE" --offset "$offset")
  existing=$(printf '%s\n%s' "$existing" "$page" | jq -c -s '.[0] + [.[1].items[]
    | {repo: .service_config.repo, event: .event_type, action, agent: .agent.full_name}]')
  [ "$(jq -r '.pagination.has_more' <<<"$page")" = true ] || break
  offset=$((offset + PAGE))
done

for repo in "${repos[@]}"; do
  for t in "${TRIGGERS[@]}"; do
    read -r event action suffix <<<"$t"
    name="lfx-review-agent ${repo#*/} $suffix"
    found=$(jq -r --arg r "$repo" --arg e "$event" --arg a "$action" \
      --arg ag "$AGENT" \
      '[.[] | select(.repo == $r and .event == $e and .action == $a
        and .agent == $ag)] | length' \
      <<<"$existing")
    if [ "$found" != 0 ]; then
      echo "skip    $name (exists)"
      continue
    fi
    config=$(jq -c -n --arg r "$repo" '{repo: $r}')
    if [ "$event" = issue_comment ]; then
      config=$(jq -c --arg rt "$RE_REVIEW_FILTER" \
        '. + {required_text: $rt, required_text_regex: true}' <<<"$config")
    fi
    id=$(guild --mode json trigger create \
      --workspace "$WS" \
      --type webhook \
      --integration github \
      --event "$event" \
      --action "$action" \
      --agent "$AGENT" \
      --name "$name" \
      --service-config "$config" | jq -r '.id // empty')
    echo "created $name"
    if [ -z "$id" ]; then
      echo "no trigger ID returned for $name; run scripts/re-review-trigger.sh to check its filter" >&2
      exit 1
    fi
    # A new trigger starts active. An unfiltered comment trigger would
    # start a run per comment, so turn it off if the filter did not save.
    if [ "$event" = issue_comment ] && ! guild --mode json trigger get "$id" |
        jq -e --arg rt "$RE_REVIEW_FILTER" \
          '.service_config.required_text == $rt
           and .service_config.required_text_regex == true' >/dev/null; then
      guild trigger deactivate "$id" >/dev/null
      echo "filter not saved on $name ($id); deactivated it" >&2
      exit 1
    fi
  done
done
