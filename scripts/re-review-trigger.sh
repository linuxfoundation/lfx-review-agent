#!/usr/bin/env bash
# Copyright The Linux Foundation and each contributor to LFX.
# SPDX-License-Identifier: MIT
#
# Put the Guild comment filter on every `issue_comment created` trigger
# for lfx-review-agent, then activate it (README.md, Triggers). With the
# filter, only a comment that starts with `@lfx-one re-review` starts a
# session; other comments never wake the model.
#
# Usage: WS=<workspace-id> scripts/re-review-trigger.sh [--apply]
#   Without --apply, prints what it would do and changes nothing.
#
# Only repositories with an active `pull_request synchronize` trigger are
# activated, so a repository that left the review stays off. Each update
# keeps the trigger's other service_config keys, and the saved filter is
# read back before the trigger is activated. Activating starts live
# reviews on `@lfx-one re-review` comments.
set -euo pipefail

AGENT=${REVIEW_AGENT:-linux-foundation~lfx-review-agent}
# Keep in sync with RE_REVIEW_FILTER in scripts/onboard-repo.sh.
RE_REVIEW_FILTER='^\s*@lfx-one\s+re-review\b'

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

# One line per re-review trigger: id, repo, has filter, active, repo
# still onboarded (has an active synchronize trigger).
rows=$(jq -r --arg ag "$AGENT" --arg rt "$RE_REVIEW_FILTER" '
  ([.[] | select(.type == "webhook" and .deactivated_at == null
    and .event_type == "pull_request" and .action == "synchronize"
    and .agent.full_name == $ag) | .service_config.repo]) as $live
  | .[] | select(.type == "webhook" and .event_type == "issue_comment"
    and .action == "created" and .agent.full_name == $ag)
  | [.id, .service_config.repo,
     (.service_config.required_text == $rt
       and .service_config.required_text_regex == true),
     (.deactivated_at == null),
     (.service_config.repo as $r | $live | index($r) != null)]
  | @tsv' <<<"$all")

if [ -z "$rows" ]; then
  echo "no issue_comment triggers for $AGENT" >&2
  exit 1
fi

while IFS=$'\t' read -r -u 3 id repo filtered active live; do
  if [ "$live" != true ]; then
    echo "skip      $repo (no active synchronize trigger)"
    continue
  fi
  if [ "$filtered" = true ] && [ "$active" = true ]; then
    echo "ok        $repo"
    continue
  fi
  [ "$filtered" = true ] || echo "filter    $repo ($id)"
  [ "$active" = true ] || echo "activate  $repo ($id)"
  $apply || continue

  if [ "$filtered" != true ]; then
    cfg=$(guild --mode json trigger get "$id" | jq -c --arg rt "$RE_REVIEW_FILTER" \
      '.service_config + {required_text: $rt, required_text_regex: true}')
    guild trigger update "$id" --service-config "$cfg" >/dev/null
  fi
  # Never activate an unfiltered trigger: it would start a run per comment.
  saved=$(guild --mode json trigger get "$id")
  if ! jq -e --arg rt "$RE_REVIEW_FILTER" --arg r "$repo" '
      .service_config.required_text == $rt
      and .service_config.required_text_regex == true
      and .service_config.repo == $r' <<<"$saved" >/dev/null; then
    if [ "$active" = true ]; then
      guild trigger deactivate "$id" >/dev/null
    fi
    echo "filter not saved on $repo ($id); trigger is deactivated" >&2
    exit 1
  fi
  [ "$active" = true ] || guild trigger activate "$id" >/dev/null
done 3<<<"$rows"

$apply || echo "dry run; rerun with --apply to change the triggers"
