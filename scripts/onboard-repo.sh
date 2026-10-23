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

AGENT=linux-foundation~lfx-review-agent

: "${WS:?set WS to the Guild workspace ID}"
if [ $# -eq 0 ]; then
  echo "usage: WS=<workspace-id> $0 <repo> [<repo>...]" >&2
  exit 2
fi
command -v jq >/dev/null || { echo "jq is required" >&2; exit 1; }

existing=$(guild --mode json trigger list --workspace "$WS" --limit 200)

for arg in "$@"; do
  repo=linuxfoundation/${arg#linuxfoundation/}
  for t in "${TRIGGERS[@]}"; do
    read -r event action suffix <<<"$t"
    name="lfx-review-agent ${repo#*/} $suffix"
    found=$(jq -r --arg r "$repo" --arg e "$event" --arg a "$action" \
      '[.items[] | select(.service_config.repo == $r and .event_type == $e
        and .action == $a)] | length' <<<"$existing")
    if [ "$found" != 0 ]; then
      echo "skip    $name (exists)"
      continue
    fi
    guild trigger create \
      --workspace "$WS" \
      --type webhook \
      --integration github \
      --event "$event" \
      --action "$action" \
      --agent "$AGENT" \
      --name "$name" \
      --service-config "{\"repo\": \"$repo\"}" >/dev/null
    echo "created $name"
  done
done
