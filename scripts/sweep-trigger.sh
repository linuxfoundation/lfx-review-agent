#!/usr/bin/env bash
# Copyright The Linux Foundation and each contributor to LFX.
# SPDX-License-Identifier: MIT
#
# Set the hourly sweep trigger's repository list (README.md, Triggers).
# The list is built from the workspace's active `pull_request synchronize`
# triggers for lfx-review-agent and REVIEW_AGENT, so onboarding is the source of
# truth. Rerun it after onboarding a repository.
#
# Usage: WS=<workspace-id> scripts/sweep-trigger.sh [--apply]
#   Without --apply, prints what it would do and changes nothing.
#
# An existing trigger keeps its active or inactive state; change that with
# `guild trigger activate|deactivate`. A new trigger starts active and runs
# at minute 17 of every hour, which starts live reviews. With no
# synchronize trigger left, --apply deactivates the sweep.
# Never write the repository list to a file in this repository.
set -euo pipefail

AGENT=linux-foundation~lfx-review-agent
SOURCE_AGENT=${REVIEW_AGENT:-$AGENT}
NAME="lfx-review-agent sweep"
MINUTE=17

: "${WS:?set WS to the Guild workspace ID}"
apply=false
case "${1-}" in
  "") ;;
  --apply) apply=true ;;
  *) echo "usage: WS=<workspace-id> $0 [--apply]" >&2; exit 2 ;;
esac
command -v jq >/dev/null || { echo "jq is required" >&2; exit 1; }

# Read every page of the workspace's triggers into one JSON array.
PAGE=100
all="[]"
offset=0
while :; do
  page=$(guild --mode json trigger list --workspace "$WS" \
    --limit "$PAGE" --offset "$offset")
  all=$(printf '%s\n%s' "$all" "$page" | jq -c -s '.[0] + .[1].items')
  [ "$(jq -r '.pagination.has_more' <<<"$page")" = true ] || break
  offset=$((offset + PAGE))
done

input=$(jq -c --arg ag "$AGENT" --arg selected "$SOURCE_AGENT" '
  [.[] | select(.type == "webhook" and .deactivated_at == null
    and .event_type == "pull_request" and .action == "synchronize"
    and (.agent.full_name == $ag or .agent.full_name == $selected))
    | .service_config.repo
    | select(test("^linuxfoundation/[A-Za-z0-9._-]+$"))]
  | unique
  | {lfx_review_agent_event: "sweep", repos: .}' <<<"$all")
count=$(jq '.repos | length' <<<"$input")

ids=$(jq -r --arg ag "$AGENT" --arg n "$NAME" \
  '.[] | select(.type == "time" and .name == $n
    and .agent.full_name == $ag) | .id' <<<"$all")
if [ "$(printf '%s' "$ids" | grep -c .)" -gt 1 ]; then
  echo "more than one \"$NAME\" trigger; fix that by hand first" >&2
  exit 1
fi

# With no repository left, the sweep would keep its old list: stop it.
if [ "$count" = 0 ]; then
  echo "no active synchronize triggers for $AGENT or $SOURCE_AGENT; nothing to sweep" >&2
  [ -n "$ids" ] || exit 1
  echo "deactivate  $NAME ($ids)"
  if $apply; then
    guild trigger deactivate "$ids" >/dev/null
  else
    echo "dry run; rerun with --apply to change the trigger"
  fi
  exit 0
fi

echo "repos: $count"
if [ -n "$ids" ]; then
  echo "update  $NAME ($ids)"
  $apply && guild trigger update "$ids" --input "$input" >/dev/null
else
  echo "create  $NAME (hourly at :$MINUTE)"
  $apply && guild trigger create \
    --workspace "$WS" \
    --type time \
    --agent "$AGENT" \
    --name "$NAME" \
    --frequency HOURLY \
    --minutes-of-hour "$MINUTE" \
    --input "$input" >/dev/null
fi
$apply || echo "dry run; rerun with --apply to change the trigger"
