#!/usr/bin/env bash
# check-conventions.sh — mechanized subset of the /code-constitution verification checklist.
#
# Read-only static checks. Surfaces structural violations so they can't grow silently.
# Default exits 0 (the backend is mid-remediation and carries known debt).
# Pass --strict to exit 1 when any CLEAR structural violation exists — wire that into
# CI once the debt is cleared, or use a ratchet/baseline (see NOTE at the bottom).
# Pass --audit to print the full untruncated list for every check (the refactor backlog;
#   `npm run audit:constitution`). Advisory — never changes the exit code.
#
# Covers (backend, src/): runtime file-size hard ceiling, console.* (should be Pino),
# db() outside models/, and an ADVISORY list of route files with no inline auth
# middleware. Historical migrations/seeds over the ceiling are reported
# separately but do not count as living architecture violations.
# Covers (frontend, frontend/src/): file-size hard ceiling, console.*, raw fetch/axios
# outside the shared api/index.ts client, and : any / as any usage — all ADVISORY
# (they do not fail --strict yet) until the frontend remediation lands.
# Does NOT cover (still manual): function length, nesting, magic values,
# commented-out code, naming. Does NOT mount auth or change any runtime behavior.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 2

STRICT=0
AUDIT=0
for arg in "$@"; do
  case "$arg" in
    --strict) STRICT=1 ;;
    --audit)  AUDIT=1 ;;
  esac
done
CEILING=800

count_nonempty() { [ -n "$1" ] && printf '%s\n' "$1" | grep -c . || echo 0; }
rule() { printf -- '------------------------------------------------------------\n'; }
icon() { if [ "$1" -gt 0 ]; then printf '⚠️ '; else printf '✅ '; fi; }
show() { # $1=list $2=head-n  (AUDIT mode prints the full list)
  local n="$2"
  [ "$AUDIT" -eq 1 ] && n=100000
  [ -n "$1" ] && printf '%s\n' "$1" | head -"$n" | sed 's/^/     /'
}

echo "code-constitution check  (backend, src/)"
rule

# 1. Runtime files over the ~800-line hard ceiling → must-fix decompose.
#    Historical migrations/seeds are append-only artifacts; report separately
#    but do not refactor or fail them solely for size unless they are being edited.
big=$(find src -name '*.ts' -not -path '*/node_modules/*' \
      -not -path 'src/database/migrations/*' \
      -not -path 'src/database/seeds/*' \
      -not -path 'src/__tests__/*' \
      -exec wc -l {} \; \
      | awk -v c="$CEILING" '$1>c{printf "%6d  %s\n",$1,$2}' | sort -rn)
big_n=$(count_nonempty "$big")
printf '%sruntime files > %s lines (hard ceiling) [§2.4]: %s\n' "$(icon "$big_n")" "$CEILING" "$big_n"
show "$big" 8
[ "$big_n" -gt 8 ] && printf '     …and %s more\n' "$((big_n-8))"
rule

historical_big=$(find src/database/migrations src/database/seeds -name '*.ts' 2>/dev/null \
      -exec wc -l {} \; \
      | awk -v c="$CEILING" '$1>c{printf "%6d  %s\n",$1,$2}' | sort -rn)
historical_big_n=$(count_nonempty "$historical_big")
printf 'ℹ️  migration/seed files > %s lines [§10.3]: %s   (ADVISORY — historical unless edited)\n' "$CEILING" "$historical_big_n"
show "$historical_big" 8
[ "$historical_big_n" -gt 8 ] && printf '     …and %s more\n' "$((historical_big_n-8))"
rule

# 2. console.* in production code → should be the Pino logger
#    (excludes tests/migrations/seeds, which may log legitimately)
con=$(grep -rlE 'console\.(log|error|warn|info|debug)' src --include='*.ts' 2>/dev/null \
      | grep -vE '^src/(__tests__|database/migrations|database/seeds)/' | sort)
con_n=$(count_nonempty "$con")
printf '%sconsole.* files (use Pino) [§9.1]: %s\n' "$(icon "$con_n")" "$con_n"
show "$con" 8
[ "$con_n" -gt 8 ] && printf '     …and %s more\n' "$((con_n-8))"
rule

# 3. db( ... ) outside models/ → all DB access belongs in models
#    (excludes __tests__, where direct db access in smoke tests is expected)
dbq=$(grep -rlE '\bdb\(' src --include='*.ts' 2>/dev/null | grep -vE '^src/(models|__tests__)/' | sort)
dbq_n=$(count_nonempty "$dbq")
printf '%sdb() outside models/ [§7.4]: %s\n' "$(icon "$dbq_n")" "$dbq_n"
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
printf 'ℹ️  route files w/o inline auth ref [§11.1]: %s   (ADVISORY — review, not a hard fail)\n' "$noauth_n"
show "$noauth" 10
[ "$noauth_n" -gt 10 ] && printf '     …and %s more\n' "$((noauth_n-10))"
rule

# ────────────────────────────────────────────────────────────
# FRONTEND (frontend/src/) — advisory until the FE remediation lands.
# Mirrors the backend checks: file-size ceiling, console.*, the shared-client
# bypass (raw fetch/axios outside api/index.ts), and any-usage. These do NOT
# count toward the --strict backend gate yet; promote them once FE debt clears.
echo
echo "code-constitution check  (frontend, frontend/src/)"
rule
if [ -d frontend/src ]; then
  fe_big=$(find frontend/src \( -name '*.ts' -o -name '*.tsx' \) -not -path '*/node_modules/*' \
        -exec wc -l {} \; | awk -v c="$CEILING" '$1>c{printf "%6d  %s\n",$1,$2}' | sort -rn)
  fe_big_n=$(count_nonempty "$fe_big")
  printf '%sfrontend files > %s lines (hard ceiling) [§13.1]: %s\n' "$(icon "$fe_big_n")" "$CEILING" "$fe_big_n"
  show "$fe_big" 8
  [ "$fe_big_n" -gt 8 ] && printf '     …and %s more\n' "$((fe_big_n-8))"
  rule

  fe_con=$(grep -rlE 'console\.(log|error|warn|info|debug)' frontend/src --include='*.ts' --include='*.tsx' 2>/dev/null \
        | grep -vE '^frontend/src/lib/logger\.ts$' | sort)
  fe_con_n=$(count_nonempty "$fe_con")
  printf '%sfrontend console.* files (strip before merge) [§17.1]: %s\n' "$(icon "$fe_con_n")" "$fe_con_n"
  show "$fe_con" 6
  [ "$fe_con_n" -gt 6 ] && printf '     …and %s more\n' "$((fe_con_n-6))"
  rule

  fe_fetch=$(grep -rlE '\bfetch\(|import axios|from .axios.' frontend/src --include='*.ts' --include='*.tsx' 2>/dev/null \
        | grep -vE '^frontend/src/api/index\.ts$' | sort)
  fe_fetch_n=$(count_nonempty "$fe_fetch")
  printf '%sfrontend raw fetch/axios outside api/index.ts [§14.2]: %s\n' "$(icon "$fe_fetch_n")" "$fe_fetch_n"
  show "$fe_fetch" 6
  [ "$fe_fetch_n" -gt 6 ] && printf '     …and %s more\n' "$((fe_fetch_n-6))"
  rule

  fe_any=$(grep -rhoE ':[[:space:]]*any\b|\bas any\b' frontend/src --include='*.ts' --include='*.tsx' 2>/dev/null || true)
  fe_any_n=$(count_nonempty "$fe_any")
  printf '%sfrontend any usages (: any / as any) [§17.2]: %s\n' "$(icon "$fe_any_n")" "$fe_any_n"
  rule

  fe_violations=$((fe_big_n + fe_con_n + fe_fetch_n))
  printf 'Frontend advisory tally (files>%s + console-files + fetch-bypass): %s   (+ %s any usages)\n' "$CEILING" "$fe_violations" "$fe_any_n"
  printf 'NOTE: frontend checks are ADVISORY pending the FE remediation; they do not fail --strict yet.\n'
else
  printf 'ℹ️  no frontend/src directory — skipping frontend checks\n'
fi
rule

# ────────────────────────────────────────────────────────────
# TIER A — cheap greppable Articles (ADVISORY; do NOT affect --strict).
# Quick wins from plans/06152026-constitution-mechanization.
echo
echo "code-constitution check  (Tier A — quick greps, advisory)"
rule

# §17.4 dangerouslySetInnerHTML (frontend)
a174=$(grep -rlE 'dangerouslySetInnerHTML' frontend/src --include='*.ts' --include='*.tsx' 2>/dev/null | sort)
a174_n=$(count_nonempty "$a174")
printf '%sdangerouslySetInnerHTML (FE) [§17.4]: %s\n' "$(icon "$a174_n")" "$a174_n"
show "$a174" 5

# §17.5 JWT/token read outside the api/index.ts client
a175=$(grep -rlE 'localStorage\.(getItem|setItem)\([^)]*token' frontend/src --include='*.ts' --include='*.tsx' 2>/dev/null \
      | grep -vE 'frontend/src/(api/index\.ts|hooks/useLocalStorage)' | sort)
a175_n=$(count_nonempty "$a175")
printf '%sJWT/token read outside api client (FE) [§17.5]: %s\n' "$(icon "$a175_n")" "$a175_n"
show "$a175" 5

# §17.3 process.env in the frontend bundle (should be import.meta.env.VITE_*)
a173=$(grep -rlE 'process\.env' frontend/src --include='*.ts' --include='*.tsx' 2>/dev/null | sort)
a173_n=$(count_nonempty "$a173")
printf '%sprocess.env in FE bundle (use VITE_) [§17.3]: %s\n' "$(icon "$a173_n")" "$a173_n"
show "$a173" 5

# §15.4 stray client-state libraries (only React Query + Context + Zustand sanctioned)
a154=$(grep -oE '"(redux|@reduxjs/toolkit|mobx|mobx-react|jotai|recoil|valtio)"' frontend/package.json 2>/dev/null | tr -d '"' | sort -u)
a154_n=$(count_nonempty "$a154")
printf '%sstray state libs in FE deps [§15.4]: %s\n' "$(icon "$a154_n")" "$a154_n"
show "$a154" 6

# §10.2 knex .raw( outside models/ (backend)
a102=$(grep -rlE '\.raw\(' src --include='*.ts' 2>/dev/null | grep -vE '^src/(models|__tests__|database)/' | sort)
a102_n=$(count_nonempty "$a102")
printf '%sknex .raw( outside models/ (BE) [§10.2]: %s\n' "$(icon "$a102_n")" "$a102_n"
show "$a102" 5

# §5.1 hardcoded secret-like literals (conservative, double-quoted; verify each)
a51=$(grep -rlEi '(secret|api[_-]?key|password|access[_-]?token)[" ]*[:=][ ]*"[A-Za-z0-9/_+.-]{16,}"' src frontend/src --include='*.ts' --include='*.tsx' 2>/dev/null \
      | grep -vE '__tests__|\.test\.' | sort)
a51_n=$(count_nonempty "$a51")
printf '%spossible hardcoded secret literals [§5.1]: %s   (verify each — false positives expected)\n' "$(icon "$a51_n")" "$a51_n"
show "$a51" 5

# §20.3 focused/skipped tests reaching the tree (silently disable coverage)
a203=$(grep -rlE '\.only\(|describe\.skip|it\.skip|test\.skip|\bxit\(|\bxdescribe\(' src frontend/src --include='*.ts' --include='*.tsx' 2>/dev/null | sort)
a203_n=$(count_nonempty "$a203")
printf '%sfocused/skipped tests (.only/.skip/xit) [§20.3]: %s\n' "$(icon "$a203_n")" "$a203_n"
show "$a203" 5

# §12.4 frontend import-boundary breaches (components←pages, api←components/pages)
a124=$( { grep -rlE "from ['\"][^'\"]*/pages/" frontend/src/components --include='*.ts' --include='*.tsx' 2>/dev/null;
          grep -rlE "from ['\"][^'\"]*/(components|pages)/" frontend/src/api --include='*.ts' 2>/dev/null; } | sort -u)
a124_n=$(count_nonempty "$a124")
printf '%sfrontend import-boundary breaches (components←pages, api←components) [§12.4]: %s\n' "$(icon "$a124_n")" "$a124_n"
show "$a124" 5

# §11.7 tenant-scope heuristic — models that query but reference no tenant column.
#    HEURISTIC ONLY (advisory): many models are legitimately global. A backstop for
#    §5.5/§11.7 review, NOT proof. Strict promotion needs a curated tenant-table list.
a117=$(for f in $(find src/models -name '*.ts' 2>/dev/null | sort); do
         if grep -qE '\.where\(|\.join\(|\.andWhere\(|\.whereIn\(' "$f" \
            && ! grep -qE 'organization_id|location_id|org_id|organizationId|locationId' "$f"; then
           printf '%s\n' "$f"
         fi
       done)
a117_n=$(count_nonempty "$a117")
printf 'ℹ️  models querying w/o a tenant-scope column ref [§11.7]: %s   (HEURISTIC — verify each; many are legitimately global)\n' "$a117_n"
show "$a117" 8
printf 'NOTE: Tier A is ADVISORY — surfaced for the mechanization rollout; does not fail --strict.\n'
rule

violations=$((big_n + con_n + dbq_n))
printf 'CLEAR structural violations — backend (size + console + db): %s\n' "$violations"
printf 'Manual still required: function length, nesting, magic values, commented-out code, naming.\n'

if [ "$STRICT" -eq 1 ] && [ "$violations" -gt 0 ]; then
  echo "STRICT: failing — clear structural violations present."
  exit 1
fi
exit 0
