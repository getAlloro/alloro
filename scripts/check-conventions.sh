#!/usr/bin/env bash
# check-conventions.sh — mechanized subset of the /code-constitution verification checklist.
#
# Read-only static checks. Surfaces structural violations so they can't grow silently.
# Default exits 0 (the backend is mid-remediation and carries known debt).
# Pass --strict to exit 1 when any CLEAR structural violation exists — wire that into
# CI once the debt is cleared, or use a ratchet/baseline (see NOTE at the bottom).
#
# Covers: file-size hard ceiling, console.* (should be Pino), db() outside models/,
# and an ADVISORY list of route files with no inline auth middleware.
# Does NOT cover (still manual): function length, nesting, magic values,
# commented-out code, naming. Does NOT mount auth or change any runtime behavior.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 2

STRICT=0
[ "${1:-}" = "--strict" ] && STRICT=1
CEILING=800

count_nonempty() { [ -n "$1" ] && printf '%s\n' "$1" | grep -c . || echo 0; }
rule() { printf -- '------------------------------------------------------------\n'; }
icon() { if [ "$1" -gt 0 ]; then printf '⚠️ '; else printf '✅ '; fi; }
show() { # $1=list $2=head-n
  [ -n "$1" ] && printf '%s\n' "$1" | head -"$2" | sed 's/^/     /'
}

echo "code-constitution check  (src/)"
rule

# 1. Files over the ~800-line hard ceiling → must-fix decompose
big=$(find src -name '*.ts' -not -path '*/node_modules/*' -exec wc -l {} \; \
      | awk -v c="$CEILING" '$1>c{printf "%6d  %s\n",$1,$2}' | sort -rn)
big_n=$(count_nonempty "$big")
printf '%sfiles > %s lines (hard ceiling): %s\n' "$(icon "$big_n")" "$CEILING" "$big_n"
show "$big" 8
[ "$big_n" -gt 8 ] && printf '     …and %s more\n' "$((big_n-8))"
rule

# 2. console.* in production code → should be the Pino logger
#    (excludes tests/migrations/seeds, which may log legitimately)
con=$(grep -rlE 'console\.(log|error|warn|info|debug)' src --include='*.ts' 2>/dev/null \
      | grep -vE '^src/(__tests__|database/migrations|database/seeds)/' | sort)
con_n=$(count_nonempty "$con")
printf '%sconsole.* files (use Pino): %s\n' "$(icon "$con_n")" "$con_n"
show "$con" 8
[ "$con_n" -gt 8 ] && printf '     …and %s more\n' "$((con_n-8))"
rule

# 3. db( ... ) outside models/ → all DB access belongs in models
#    (excludes __tests__, where direct db access in smoke tests is expected)
dbq=$(grep -rlE '\bdb\(' src --include='*.ts' 2>/dev/null | grep -vE '^src/(models|__tests__)/' | sort)
dbq_n=$(count_nonempty "$dbq")
printf '%sdb() outside models/: %s\n' "$(icon "$dbq_n")" "$dbq_n"
show "$dbq" 8
[ "$dbq_n" -gt 8 ] && printf '     …and %s more\n' "$((dbq_n-8))"
rule

# 4. ADVISORY: route files with no inline auth-middleware reference.
#    Heuristic only — some routes are intentionally public (webhooks, public forms).
#    Cross-check against plans/06142026-security-hotfix before acting. NOT a hard fail.
noauth=""
for f in $(find src/routes -name '*.ts' | sort); do
  grep -qE 'authenticate|requireAuth|authMiddleware|superAdmin|rbacMiddleware|ensureAuth' "$f" \
    || noauth="${noauth}${f}"$'\n'
done
noauth=$(printf '%s' "$noauth" | sed '/^$/d')
noauth_n=$(count_nonempty "$noauth")
printf 'ℹ️  route files w/o inline auth ref: %s   (ADVISORY — review, not a hard fail)\n' "$noauth_n"
show "$noauth" 10
[ "$noauth_n" -gt 10 ] && printf '     …and %s more\n' "$((noauth_n-10))"
rule

violations=$((big_n + con_n + dbq_n))
printf 'CLEAR structural violations (size + console + db): %s\n' "$violations"
printf 'Manual still required: function length, nesting, magic values, commented-out code, naming.\n'

if [ "$STRICT" -eq 1 ] && [ "$violations" -gt 0 ]; then
  echo "STRICT: failing — clear structural violations present."
  exit 1
fi
exit 0
