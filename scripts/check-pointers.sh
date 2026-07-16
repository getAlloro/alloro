#!/usr/bin/env bash
# check-pointers.sh — every path our instruction files MANDATE must actually exist.
#
# WHY THIS EXISTS (2026-07-16, measured):
#   CLAUDE.md and AGENTS.md both mandate `~/.claude/skills/code-constitution/SKILL.md`. That file did
#   not exist. So every agent dutifully "checked the constitution," found nothing, and proceeded
#   believing it had checked. The contract's §11.7 and §20.5 were then missed across an entire PR
#   batch — not from carelessness, but because the text was unreadable and NOTHING SAID SO.
#   The same shape bit twice more the same day: `code-constitution.html` went stale while a commit
#   wired checkers to Articles it never mentions, and §20.5 points at a `test.html` convention in
#   `CLAUDE.md` that `CLAUDE.md` does not contain.
#
#   A broken pointer is the worst failure shape available: it fails SILENTLY and reports success.
#   This script makes it loud. It is deliberately dumb — `test -f` in a loop — and that is the point.
#
# EXIT: 0 = every in-repo mandated path resolves. 1 = at least one is broken.

set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

fail=0
warn=0

say_fail() { printf '  \033[31mBROKEN\033[0m  %s\n            mandated by %s\n' "$1" "$2"; fail=$((fail + 1)); }
say_warn() { printf '  \033[33mUNVERIFIABLE\033[0m  %s\n                  mandated by %s\n' "$1" "$2"; warn=$((warn + 1)); }

echo "Pointer check — do the paths our instruction files mandate actually exist?"
echo

# The instruction files whose mandated paths we verify.
SOURCES=(CLAUDE.md AGENTS.md)

for src in "${SOURCES[@]}"; do
  [ -f "$src" ] || { say_fail "$src" "check-pointers.sh (SOURCES list)"; continue; }

  # Markdown links -- ](path.md) / ](path.html) -- and backticked paths that look like repo files.
  # Anchors (#foo) and URLs are skipped; those are not our contract.
  paths=$(
    {
      grep -ohE '\]\([^)#][^)]*\.(md|html|json|sh)\)' "$src" | sed -E 's/^\]\(//; s/\)$//'
      grep -ohE '`[^`]+\.(md|html|json|sh)`' "$src" | tr -d '`'
    } | grep -vE '^https?://' | sort -u
  )

  while IFS= read -r p; do
    [ -z "$p" ] && continue

    case "$p" in
      # A path outside the repo cannot be verified by CI on a clean checkout -- and a repo
      # instruction that depends on a machine-local file is the exact single-source violation
      # that produced the missing-constitution incident. Surfaced, never silently accepted.
      '~'* | '/'*)
        say_warn "$p" "$src"
        continue
        ;;
      # Generic filename conventions ("write a spec.html", "update CHANGELOG.md"), not pointers
      # to one specific file. Naming a shape is not mandating a path.
      spec.md | spec.html | spec.css | index.html | email.html | styles.css | test.html | test-results.json | cards.json)
        continue
        ;;
    esac

    [ -e "$p" ] || say_fail "$p" "$src"
  done <<< "$paths"
done

echo
if [ "$warn" -gt 0 ]; then
  echo "$warn mandated path(s) live OUTSIDE the repo — CI cannot prove they exist on any machine."
  echo "  A repo instruction that depends on a machine-local file is unverifiable by construction."
  echo "  This is advisory today. The fix is to bring the contract into the repo."
  echo
fi

if [ "$fail" -gt 0 ]; then
  echo "FAIL — $fail mandated path(s) do not exist. An instruction pointing at nothing fails silently:"
  echo "  the agent believes it checked. Create the file, or stop mandating it."
  exit 1
fi

echo "OK — every in-repo mandated path resolves."
exit 0
