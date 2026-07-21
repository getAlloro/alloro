#!/usr/bin/env bash
# check-env-placeholders.sh — refuse to commit a .env* file carrying real values.
#
# Why this exists: `.env.example` was committed to this repository in 918622dfb
# carrying 66 keys, of which 19 held long non-placeholder values — thirteen of
# them webhook URLs. The repository is public, so those values were disclosed
# and the file being deleted later did not retract them. Rotation was the only
# remedy. This check exists so the next one is caught before it is pushed.
#
# What counts as safe: an empty value, or one that looks like a placeholder
# (contains your/xxx/changeme/example/placeholder/todo/here/dummy/test/fake/
# sample, or an angle bracket or ellipsis). Anything else with 16+ characters is
# treated as a real value.
#
# Values are never printed — only key NAMES and counts, so running this in CI
# cannot itself leak the secret it just found.
#
# Usage:
#   bash scripts/check-env-placeholders.sh            # scan tracked .env* files
#   bash scripts/check-env-placeholders.sh FILE...    # scan specific files
#
# Exit 0 when clean, 1 when a suspicious value is found, 2 on usage error.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 2

PLACEHOLDER_RE='(your|xxx|changeme|example|placeholder|todo|<|\.\.\.|here|dummy|test|fake|sample)'
MIN_SUSPICIOUS_LEN=16

# Newline-separated rather than an array: macOS ships bash 3.2, which has no
# `mapfile` and errors on an empty array under `set -u`.
if [ "$#" -gt 0 ]; then
  FILE_LIST=$(printf '%s\n' "$@")
else
  # Only tracked files matter — an untracked local .env is the correct place for
  # real values and must not be flagged.
  FILE_LIST=$(git ls-files | grep -E '(^|/)\.env' || true)
fi

if [ -z "$FILE_LIST" ]; then
  echo "✅ no tracked .env* files"
  exit 0
fi

status=0

while IFS= read -r f; do
  [ -n "$f" ] || continue
  [ -f "$f" ] || continue

  suspicious=$(grep -E "^[A-Za-z_][A-Za-z0-9_]*=.{${MIN_SUSPICIOUS_LEN},}" "$f" 2>/dev/null \
    | grep -viE "=.*${PLACEHOLDER_RE}" \
    | cut -d= -f1 || true)

  if [ -n "$suspicious" ]; then
    count=$(printf '%s\n' "$suspicious" | grep -c . || true)
    echo "❌ $f — $count key(s) hold a non-placeholder value:"
    printf '     %s\n' $suspicious
    status=1
  else
    echo "✅ $f — all values empty or placeholder-shaped"
  fi
done <<EOF
$FILE_LIST
EOF

if [ "$status" -ne 0 ]; then
  cat <<'EOF'

A tracked .env* file carries what looks like a real value.

This repository's history is public. Committing a real value discloses it, and
deleting the file later does NOT retract it — the only remedy is rotation.

Replace each value above with a placeholder, or move the file out of git.
Only key names are shown; no values were printed.
EOF
fi

exit "$status"
