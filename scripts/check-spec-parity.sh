#!/usr/bin/env bash
# check-spec-parity.sh — fail when a PR SETS a plan's spec.html status to a done-word while unmerged.
#
# THE CLASS THIS CATCHES (a human caught it this week)
# ---------------------------------------------------
# PRs #185 and #186 shipped with a spec.html hero status that said the work was finished while
# the PR carrying it had not landed. Corey caught it by eye. This turns that contradiction into a
# mechanical exit-1: a PR cannot declare the work "Completed"/"Deployed" while it is not merged.
#
# DETERMINISTIC — no model, no judgement. It keys on the PR's OWN diff, not on the spec's current
# state on disk:
#   * the signal is an ADDED line (a `+` line) in a spec.html hunk that sets the status-pill to a
#     done-word (Completed / Deployed / Done). That is the PR asserting "this work is finished."
#   * the PR's real state is read from GitHub via `gh`.
#   If the PR adds a done-pill and is not MERGED -> exit 1.
#
# WHY DIFF-BASED (this closes the earlier residual):
#   An earlier version keyed on the spec's *current* pill and only ran on specs the PR touched.
#   That still fired on a PR that edited an already-"Completed" spec for a non-status reason
#   (e.g. appending a Rev entry) — a false positive, since that PR asserts nothing new. Keying on
#   the ADDED pill line means only a PR that actually SETS a done status is gated. A brush of the
#   folder, or a body edit that leaves the pill untouched, adds no done-pill and passes.
#   As a bonus it scans EVERY spec.html in the diff, so a PR finishing two plans is fully covered,
#   and it needs nothing from the checkout — the diff comes from GitHub.
#
# USAGE
#   scripts/check-spec-parity.sh 180          # explicit PR number
#   PR_NUMBER=180 scripts/check-spec-parity.sh
#   In CI: PR_NUMBER=${{ github.event.pull_request.number }} scripts/check-spec-parity.sh
#
# EXIT CODES
#   0  consistent, or nothing to check (the PR sets no spec.html to a done status, or it is merged)
#   1  contradiction — the PR sets a spec.html to a done status while unmerged (the #185/#186 class)
#   2  usage / infrastructure error (no PR number, gh missing, a gh call failed)
#
# Requires: gh (authenticated). No jq needed on the host — gh bundles its own.

set -uo pipefail

PR="${1:-${PR_NUMBER:-}}"
[ -n "$PR" ] || { echo "check-spec-parity: no PR number (pass as arg or set \$PR_NUMBER)" >&2; exit 2; }

command -v gh >/dev/null 2>&1 || { echo "check-spec-parity: gh not found — install it or run 'gh auth login'" >&2; exit 2; }

state="$(gh pr view "$PR" --json state --jq '.state' 2>/dev/null)" \
  || { echo "check-spec-parity: gh pr view $PR failed (auth? PR exists?)" >&2; exit 2; }

diff="$(gh pr diff "$PR" 2>/dev/null)" \
  || { echo "check-spec-parity: gh pr diff $PR failed (auth? PR exists?)" >&2; exit 2; }

# Every spec.html file whose diff ADDS a status-pill set to a done-word. awk tracks the current
# file from the `+++ b/<path>` header and emits "<path>\t<added-line>" for added content lines in
# a spec.html; grep keeps only the ones that set the pill to a done-word; the file names are what
# is left. The `.status-pill { … }` CSS rule is not a <span>, so it never matches.
offenders="$(printf '%s\n' "$diff" | awk '
    /^\+\+\+ / { f = $0; sub(/^\+\+\+ [ab]\//, "", f); next }
    /^\+/ && !/^\+\+\+/ { if (f ~ /(^|\/)spec\.html$/) print f "\t" substr($0, 2) }
  ' \
  | grep -iE '<span class="status-pill[^"]*">[[:space:]]*(completed|complete|deployed|done)[[:space:]]*</span>' \
  | cut -f1 | sort -u)"

if [ -z "$offenders" ]; then
  echo "check-spec-parity: PR #$PR sets no spec.html to a done status — nothing to assert."
  exit 0
fi

pretty="$(printf '%s' "$offenders" | tr '\n' ' ')"

if [ "$state" = "MERGED" ]; then
  echo "check-spec-parity: OK — PR #$PR sets a done status ($pretty) and is MERGED. Consistent."
  exit 0
fi

echo "check-spec-parity: FAIL — PR #$PR sets a \"done\" status in: $pretty — but the PR is $state (not merged)."
echo "  A PR cannot declare the work finished while it has not landed."
exit 1
