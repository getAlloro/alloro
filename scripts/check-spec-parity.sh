#!/usr/bin/env bash
# check-spec-parity.sh — fail when a plan's spec.html status contradicts its PR's real state.
#
# THE CLASS THIS CATCHES (a human caught it this week)
# ---------------------------------------------------
# PRs #185 and #186 shipped with a spec.html hero status that said one thing while the PR
# said another. Corey caught it by eye. This turns that contradiction into a mechanical
# exit-1: a spec cannot claim the work is finished while the PR carrying it has not landed.
#
# DETERMINISTIC — no model, no judgement:
#   * the spec's self-declared state is the hero status pill, read straight from spec.html;
#   * the PR's real state is read from GitHub via `gh`;
#   * the mapping PR -> plan folder is the PR's own file list (the same rule pr-log.sh uses:
#     the first `plans/<folder>/` path a PR touches names its plan).
# If the pill claims "done" (Completed / Deployed) and the PR is not MERGED -> exit 1.
#
# It fires ONLY when the PR actually modifies that plan's spec.html -- the PR is then asserting
# the status. A PR that merely brushes the plan folder (a test-results.json update, a docs tweak,
# a sibling Rev) is not claiming the "Completed" and is left alone (the day-one false positive
# reproduced on PR #179). Residual, left as a known limit: a PR that edits an already-"Completed"
# spec for a non-status reason still fires -- see the note at the bottom of this file.
#
# USAGE
#   scripts/check-spec-parity.sh 186          # explicit PR number
#   PR_NUMBER=186 scripts/check-spec-parity.sh
#   In CI: PR_NUMBER=${{ github.event.pull_request.number }} scripts/check-spec-parity.sh
#
# EXIT CODES
#   0  consistent, or nothing to check (PR touches no plan, does not modify the spec, or the
#      spec isn't in the checkout)
#   1  contradiction — a "done" spec on an unlanded PR (the #185/#186 class)
#   2  usage / infrastructure error (no PR number, gh missing, gh call failed)
#
# Requires: gh (authenticated). No jq needed on the host — gh bundles its own.

set -uo pipefail

PR="${1:-${PR_NUMBER:-}}"
[ -n "$PR" ] || { echo "check-spec-parity: no PR number (pass as arg or set \$PR_NUMBER)" >&2; exit 2; }

command -v gh >/dev/null 2>&1 || { echo "check-spec-parity: gh not found — install it or run 'gh auth login'" >&2; exit 2; }

# The PR's real state, and its file list (fetched once, reused for the mapping and the touch check).
state="$(gh pr view "$PR" --json state --jq '.state' 2>/dev/null)" \
  || { echo "check-spec-parity: gh pr view $PR failed (auth? PR exists?)" >&2; exit 2; }
files="$(gh pr view "$PR" --json files --jq '.files[].path' 2>/dev/null)"

# plan_of(): the first plans/<folder>/ path in the PR's file list names its plan folder.
plan="$(printf '%s\n' "$files" | sed -nE 's#^(plans/[^/]+)/.*#\1#p' | head -1)"

if [ -z "$plan" ]; then
  echo "check-spec-parity: PR #$PR touches no plans/ folder — nothing to check."
  exit 0
fi

spec="$plan/spec.html"

# The PR must actually MODIFY this spec to be asserting its status. A PR that merely brushes the
# plan folder — a test-results.json update, a docs-parity tweak, a sibling Rev — is not claiming
# the spec's "Completed"; that status came from prior landed work. Gating those was the day-one
# false positive (reproduced on PR #179). Only check specs this PR itself touches.
if ! printf '%s\n' "$files" | grep -Fxq "$spec"; then
  echo "check-spec-parity: PR #$PR does not modify $spec — not asserting its status. Nothing to check."
  exit 0
fi

if [ ! -f "$spec" ]; then
  echo "check-spec-parity: PR #$PR names $plan but $spec is not in this checkout — skipping."
  exit 0
fi

# The hero status pill is the spec's self-declared state (per the plan-spec template).
pill="$(grep -oE '<span class="status-pill[^"]*">[^<]*</span>' "$spec" \
        | head -1 | sed -E 's/<[^>]+>//g' | tr -d '\r' | sed -E 's/^[[:space:]]+|[[:space:]]+$//g')"

if [ -z "$pill" ]; then
  echo "check-spec-parity: PR #$PR / $spec has no status-pill — skipping." >&2
  exit 0
fi

pill_lc="$(printf '%s' "$pill" | tr '[:upper:]' '[:lower:]')"

# A spec that declares the work finished while the PR has not merged is the #185/#186 lie.
case "$pill_lc" in
  completed|complete|deployed|done)
    if [ "$state" != "MERGED" ]; then
      echo "check-spec-parity: FAIL — $spec status is \"$pill\" but PR #$PR is $state (not merged)."
      echo "  A spec cannot claim the work is finished while the PR carrying it has not landed."
      exit 1
    fi
    ;;
esac

echo "check-spec-parity: OK — $spec status \"$pill\" is consistent with PR #$PR state $state."
exit 0

# KNOWN LIMITS (deterministic, no LLM; documented rather than silently expanded)
#   1. A PR that edits an already-"Completed" spec for a non-status reason (e.g. appends a Rev
#      entry) still fires, because this gate keys on the pill's current value, not on whether the
#      PR's diff changed it. The precise fix is to fire only when the PR's diff to spec.html sets
#      the pill to a done-word; deferred because no current open PR exercises that path to prove it.
#   2. Only the FIRST plans/<folder> a PR touches is checked. A PR that finishes two plans at once
#      is under-covered. Rare; left until a real case appears.
