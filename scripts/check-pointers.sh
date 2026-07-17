#!/usr/bin/env bash
# check-pointers.sh — the repo artifacts our instruction files point at must actually exist.
#
# WHY THIS EXISTS (2026-07-16, measured):
#   CLAUDE.md and AGENTS.md point agents at specific files. When one of those files is missing, the
#   agent dutifully "checks" it, finds nothing, and proceeds believing it checked. Nothing says
#   otherwise. That shape bit three times in one day: a mandated contract path that resolved to
#   nothing, `code-constitution.html` going stale while commits cited Articles it never mentions,
#   and §20.5 pointing at a `test.html` convention in `CLAUDE.md` that `CLAUDE.md` does not contain.
#
#   A broken pointer is the worst failure shape available: it fails SILENTLY and reports success.
#   This script makes it loud. It is deliberately dumb — `test -e` over an explicit list — and that
#   is the point.
#
# WHAT IT CHECKS — and just as importantly, WHAT IT DOES NOT:
#   It checks the allowlisted MANIFEST below: repo artifacts an instruction file points at, each
#   with the obligation that put it there. The list is maintained by hand, on purpose. An earlier
#   version grepped the instruction prose for path-shaped strings; that was abandoned because it
#   read obligation into sentences that carry none (AGENTS.md says broader rules "can live in"
#   ~/.codex/AGENTS.md — permissive, not mandatory) and flagged operational server key locations as
#   agent dependencies, while missing every mandated `.ts`, `.yml`, and directory because it only
#   matched four extensions. Obligation is a judgment call. It gets written down, not inferred.
#
#   It does NOT check paths outside the repo (`~/.claude/...`, `/etc/alloro/...`). CI runs on a
#   clean checkout: no agent home directory, no server filesystem. Those paths are unverifiable here
#   by construction, so this script makes no claim about them either way — see EXTERNAL below.
#
# EXIT: 0 = every manifest entry resolves. 1 = at least one does not. Nothing else fails it, and
#       it never reports a problem and exits 0 — that is the defect this script exists to catch.

set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

# ---------------------------------------------------------------------------------------------
# MANIFEST — repo artifacts an instruction file points at.  "path|the obligation that requires it"
#
# Add an entry when an instruction file starts depending on a path. Remove the entry AND the
# sentence that mandates it when it stops — a manifest that outlives its obligation is the same
# broken pointer pointed the other way.
# ---------------------------------------------------------------------------------------------
MANIFEST=(
  "AGENTS.md|CLAUDE.md @-includes it and links it as the repo-local operating notes"
  "CLAUDE.md|the entry point every Claude Code session loads"
  "code-constitution.html|CLAUDE.md + AGENTS.md name it as the browsable view of the contract"
  "CHANGELOG.md|AGENTS.md --done mandates updating it"
  "scripts/check-conventions.sh|backs 'npm run check:conventions', the CI gate CLAUDE.md + AGENTS.md mandate"
  "src/controllers/gbp-automation|§6.1 backend reference analog — both instruction files say 'mirror this'"
  "frontend/src/api|§12.1 frontend reference analog — both instruction files say 'mirror this'"
  ".github/workflows/dev.yml|AGENTS.md deployment path: dev/dave deploys through it"
  ".github/workflows/main.yml|AGENTS.md deployment path: main deploys through it"
  "plans/06152026-frontend-remediation|AGENTS.md gates frontend advisory status on it landing"
  "friyays/05-25-2026|AGENTS.md names it as the inaugural Friyay folder"
)

# EXTERNAL — paths the instruction files reference that live outside the repo. Listed here so the
# dependency is declared in one place rather than buried in prose. NOT CHECKED, and deliberately
# not counted, warned on, or printed as a finding: this script cannot see them, and a check that
# reports what it cannot verify is noise that trains people to ignore real output.
#   ~/.claude/skills/code-constitution/SKILL.md  — the canonical contract text (machine-local)
#   ~/.claude/CLAUDE.md                          — the global command contract (machine-local)
#   /etc/alloro/*.env, /etc/alloro/*.json        — server runtime config (server-local, not agent deps)

fail=0
say_fail() { printf '  \033[31mBROKEN\033[0m  %s\n          required because: %s\n' "$1" "$2"; fail=$((fail + 1)); }

echo "Pointer check — do the repo artifacts our instruction files point at exist?"
echo

for entry in "${MANIFEST[@]}"; do
  path="${entry%%|*}"
  why="${entry#*|}"
  [ -e "$path" ] || say_fail "$path" "$why"
done

echo
if [ "$fail" -gt 0 ]; then
  echo "FAIL — $fail manifest path(s) do not exist. An instruction pointing at nothing fails silently:"
  echo "  the agent believes it checked. Restore the file, or drop the instruction that mandates it."
  exit 1
fi

echo "OK — all ${#MANIFEST[@]} manifest path(s) resolve."
echo "Scope: repo artifacts only. Machine-local paths (~/.claude/..., /etc/alloro/...) are NOT"
echo "checked here — CI has no agent home directory or server filesystem to check them against."
exit 0
