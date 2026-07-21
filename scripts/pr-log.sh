#!/usr/bin/env bash
# pr-log.sh — regenerate PR-LOG.md: what every PR is, where it lives, and whether
# the code it adds can actually be reached.
#
# WHY THIS IS GENERATED AND NOT WRITTEN
# ------------------------------------
# A hand-typed inventory rots the day after it is typed, and nobody notices, because
# nothing regenerates it. This file types nothing. Every column is read from the thing
# it describes -- GitHub for the PR, git for the branch and the base tree, the PR's own
# file list for the plan folder and for reachability.
#
# THE COLUMN THAT MATTERS: "Reachable?"
# ------------------------------------
# Merged is not the same as running. A PR can land 16 files that nothing on the base
# imports: the code is in the repository and cannot execute. That is what this column
# measures, and it measures ONLY that, because that is all a file list can prove:
#
#   wired -- mounts a door     the PR itself adds/edits src/app.ts, src/routes/, or a worker
#   wired -- edits running code the PR modifies a file that already exists on the base ref
#   UNREACHABLE -- adds no caller  every app file is new; nothing on the base can import it
#   truncated -- unknown       the API capped the file list at 100; we cannot see all of it
#
# It does NOT claim a feature is "switched off". Reachability is provable from code;
# a gate behind an env var, a seed row, or a config flag is not. The switch question is
# answered by the author in the PR template, never inferred here. A previous version of
# this script inferred it by grepping migrations for `defaultTo(false)` -- which matches
# 24 ordinary boolean columns on dev/dave (is_internal, email_verified, is_read,
# completed, mentioned, cited ...) whose correct value is false and which gate nothing.
# It printed "merged, ships DISABLED" in bold for a PR with no switch anywhere, and sent
# readers hunting for a flag that did not exist. If this tool cannot NAME the switch,
# it does not assert one exists.
#
# STALENESS: WHY THERE IS NO pull_request GATE
# --------------------------------------------
# PR-LOG.md is a committed file whose content is a function of the set of ALL open and
# merged PRs -- not of any single PR's diff. So a staleness check attached to a
# `pull_request` event has NO FIXED POINT: PR X regenerates, differs from the committed
# copy because unrelated PR Y opened, and goes red; X commits its regeneration, which
# instantly stales every other open PR. With 18 open PRs there is no sequence of
# regenerations that makes them all green.
#
# The fix is the trigger, not the content. Regeneration and `--check` belong to
# dev/dave -- a single writer, on a schedule or dispatched by hand
# (.github/workflows/pr-log-refresh.yml). `--check` REFUSES to run on a pull_request
# event (see the guard below) so that a future workflow edit cannot re-create the
# deadlock even by accident.
#
# FAIL-CLOSED BY DESIGN
# ---------------------
# Every reading this tool cannot complete stops it, loudly, instead of producing a
# plausible document. An unreadable open count, an unresolvable base ref, or a missing
# python3 all exit non-zero with a message naming what was unavailable. An unrecognised
# argument exits 2 without writing anything. This will look like a regression the first
# time it fires -- it is the point: a ledger that is quietly wrong is worse than one
# that stops.
#
# `set -uo pipefail` WITHOUT `-e` is deliberate: several commands below are EXPECTED to
# fail and are handled explicitly on the next line. Do not "fix" this.
#
# Note: this script runs `git fetch origin`, so it performs network I/O and touches
# .git even in --check mode.
#
# USAGE
#   ./scripts/pr-log.sh                 # regenerate PR-LOG.md
#   ./scripts/pr-log.sh --check         # exit 1 if PR-LOG.md is stale (dev/dave only)
#   ./scripts/pr-log.sh --out PATH      # write somewhere else
#   ./scripts/pr-log.sh --limit N       # widen the PR window (default 60)
#   ./scripts/pr-log.sh --base REF      # base ref for reachability (default origin/dev/dave)
#
# Requires: gh (authenticated), git, python3.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT" || exit 1

# ---- Named constants (no magic values) ----
DEFAULT_OUT="PR-LOG.md"
DEFAULT_LIMIT=60
DEFAULT_BASE_REF="origin/dev/dave"
# GitHub's `gh pr list --json files` returns at most 100 files per PR. This is an API
# limit, not a choice -- a PR at or above it has an unknowable tail.
GH_FILES_PAGE_CAP=100
# Cheap count-only query used for the real denominator in the header.
COUNT_QUERY_LIMIT=400

OUT_PATH="$DEFAULT_OUT"
LIMIT="${PR_LOG_LIMIT:-$DEFAULT_LIMIT}"
BASE_REF="$DEFAULT_BASE_REF"
MODE="generate"

usage() {
  cat <<'EOF' >&2
usage: pr-log.sh [--check] [--out PATH] [--limit N] [--base REF]
  (no args)     regenerate PR-LOG.md
  --check       exit 1 if PR-LOG.md is stale. dev/dave only -- refuses on pull_request.
  --out PATH    write the ledger to PATH instead of PR-LOG.md
  --limit N     how many PRs to fetch (default 60)
  --base REF    base ref for reachability (default origin/dev/dave)
  -h, --help    this message
EOF
}

# The analog (scripts/check-conventions.sh:25-30) has no `*)` arm, which is harmless
# there because that script is read-only. It is NOT harmless here: this one writes, so
# an unmatched argument previously fell through to the write path and overwrote
# PR-LOG.md while exiting 0. Every unrecognised argument now exits 2, having written
# nothing.
while [ $# -gt 0 ]; do
  case "$1" in
    --check)   MODE="check"; shift ;;
    --out)     OUT_PATH="${2:-}";  [ -n "$OUT_PATH" ] || { echo "pr-log: --out needs a path" >&2; usage; exit 2; }; shift 2 ;;
    --limit)   LIMIT="${2:-}";     [ -n "$LIMIT" ]    || { echo "pr-log: --limit needs a number" >&2; usage; exit 2; }; shift 2 ;;
    --base)    BASE_REF="${2:-}";  [ -n "$BASE_REF" ] || { echo "pr-log: --base needs a ref" >&2; usage; exit 2; }; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *)         echo "pr-log: unknown argument: $1" >&2; usage; exit 2 ;;
  esac
done

case "$LIMIT" in
  ''|*[!0-9]*) echo "pr-log: --limit must be a positive integer, got: $LIMIT" >&2; exit 2 ;;
esac

# ---- The structural guard against re-creating the deadlock ----
# If a future workflow edit ever attaches `--check` to a pull_request event, this makes
# it a loud no-op rather than a red build. Exit 0 is correct here and is NOT a silent
# fail-open: the check is not failing to read something, it is inapplicable by
# construction, and it says so on stderr.
if [ "$MODE" = "check" ]; then
  case "${GITHUB_EVENT_NAME:-}" in
    pull_request|pull_request_target)
      echo "pr-log: REFUSING to check staleness on a '${GITHUB_EVENT_NAME}' event." >&2
      echo "  PR-LOG.md is a function of the set of ALL open PRs, not of this PR's diff," >&2
      echo "  so this check has no fixed point while more than one PR is open: going green" >&2
      echo "  here would stale every other open PR. Run it on dev/dave instead" >&2
      echo "  (.github/workflows/pr-log-refresh.yml). Skipping, exit 0." >&2
      exit 0
      ;;
  esac
fi

command -v gh >/dev/null 2>&1 || { echo "pr-log: gh not found — install it or run 'gh auth login'" >&2; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "pr-log: gh is not authenticated — run 'gh auth login'" >&2; exit 1; }
# python3 is declared required at the top of this file and does the whole derivation.
# It previously had no guard at all while gh had two.
command -v python3 >/dev/null 2>&1 || { echo "pr-log: python3 not found — it is required to build the ledger" >&2; exit 1; }

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

# A failed fetch is survivable (the local copy of the base may still be current); an
# unresolvable base ref is not, because reachability is computed against its tree and
# an empty tree would render every row UNREACHABLE -- a lie, not a result.
git fetch origin --quiet 2>/dev/null || \
  echo "pr-log: warning — git fetch failed; using the local copy of $BASE_REF" >&2
git rev-parse --verify --quiet "$BASE_REF" >/dev/null || {
  echo "pr-log: STOPPING — $BASE_REF does not resolve." >&2
  echo "  Reachability is computed against its tree; without it every row would" >&2
  echo "  render UNREACHABLE, which is a lie, not a result." >&2
  exit 1
}

gh pr list --state all --limit "$LIMIT" \
  --json number,title,state,headRefName,baseRefName,mergedAt,url,files,isDraft \
  > "$TMP" 2>/dev/null || { echo "pr-log: gh pr list failed" >&2; exit 1; }

# An INDEPENDENT open count, asked of GitHub directly rather than derived from the
# --state all list. The derived count was wrong once: isDraft was read as a state, so
# PRs merged/closed-while-draft got filed as open and the log said 12 open when 8 were.
# One reading can be quietly wrong; two readings that must agree cannot be.
OPEN_TRUTH="$(gh pr list --state open --limit 200 --json number --jq 'length' 2>/dev/null || echo "")"
# Fail CLOSED. Previously an unavailable second reading skipped the cross-check in
# silence, reverting to the single derivation already proven wrong once -- the gate
# disabled itself exactly when the reading that makes it meaningful was missing.
if ! printf '%s' "$OPEN_TRUTH" | grep -Eq '^[0-9]+$'; then
  echo "pr-log: STOPPING — could not read the independent open count from GitHub." >&2
  echo "  The cross-check that makes this ledger trustworthy is unavailable" >&2
  echo "  (rate limit, network, or token scope). Not publishing a single-source number." >&2
  exit 1
fi

# The real denominator, so the "check here before building" claim is honest about how
# much of the repo's history is actually inside the window. Count-only query -- cheap,
# no file lists.
TOTALS="$(gh pr list --state all --limit "$COUNT_QUERY_LIMIT" --json number,mergedAt,state 2>/dev/null || echo "")"
if [ -z "$TOTALS" ]; then
  echo "pr-log: STOPPING — could not read the repository-wide PR totals." >&2
  echo "  The window header would otherwise claim a denominator it did not measure." >&2
  exit 1
fi

python3 - "$TMP" "$OUT_PATH" "$MODE" "$OPEN_TRUTH" "$BASE_REF" "$GH_FILES_PAGE_CAP" "$TOTALS" <<'PY'
import json, sys, os, subprocess, re

tmp, out_path, mode, open_truth, base_ref, cap_s, totals_s = sys.argv[1:8]
CAP = int(cap_s)

with open(tmp, encoding="utf-8") as fh:
    prs = json.load(fh)
totals = json.loads(totals_s)
total_prs = len(totals)
total_closed_unlanded = len([t for t in totals if t.get("state") == "CLOSED" and not t.get("mergedAt")])

# The base tree, read once and reused for every PR. check=True so a failure raises
# instead of yielding an empty set -- an empty set would silently render every row
# UNREACHABLE.
base_tree = set(subprocess.run(
    ["git", "ls-tree", "-r", "--name-only", base_ref],
    capture_output=True, text=True, check=True).stdout.split())

APP_PREFIXES  = ("src/", "frontend/src/")
WIRED_EXACT   = ("src/app.ts", "src/index.ts", "src/worker.ts", "src/server.ts")
WIRED_PREFIX  = ("src/routes/", "src/workers/")
TEST_MARKERS  = ("__tests__/", ".test.", ".spec.")

def is_test(p):
    return any(m in p for m in TEST_MARKERS)

def plan_of(files, truncated):
    """The PR's own file list names its plan folder. Nothing to type."""
    if truncated:
        return None                      # unknown, NOT "no plan"
    seen = []
    for f in files:
        m = re.match(r"(plans/[^/]+)/", f.get("path", ""))
        if m and m.group(1) not in seen:
            seen.append(m.group(1))      # a PR touching two plans used to hide one
    return seen

def reachability(files, truncated):
    """What the file list can PROVE about whether this code can execute.
    Never a guess: when the list is incomplete, the answer is 'unknown'."""
    if truncated:
        return "truncated — unknown"
    app_all = [f.get("path", "") for f in files
               if f.get("path", "").startswith(APP_PREFIXES)]
    app = [p for p in app_all if not is_test(p)]
    if not app:
        return "tests only — no runtime surface" if app_all else "no app code"
    # limb 1 -- the PR itself mounts a door
    for p in app:
        if p in WIRED_EXACT or p.startswith(WIRED_PREFIX):
            return "wired — mounts a door"
    # limb 2 -- the PR edits a file that already executes on the base ref
    by_path = {f.get("path", ""): f for f in files}
    for p in app:
        if by_path[p].get("changeType") != "ADDED" and p in base_tree:
            return "wired — edits running code"
    # everything it touches is new; nothing on the base can import it
    return "UNREACHABLE — adds no caller"

rows = []
for p in prs:
    files = p.get("files") or []
    truncated = len(files) >= CAP
    rows.append({
        "n": p["number"],
        "title": (p.get("title") or "").strip(),
        # isDraft stays TRUE forever on a PR that was merged or closed while still a
        # draft, so it is NOT a state -- it only qualifies an OPEN one. Reading it as a
        # state put merged #163 and closed #127/#128/#129 in the "open" column: a ledger
        # reporting 12 open when 8 were open. Draft only means anything while open.
        "state": ("DRAFT" if p.get("isDraft") else "OPEN") if p.get("state") == "OPEN" else p.get("state", ""),
        "branch": p.get("headRefName", ""),
        "base": p.get("baseRefName", ""),
        "merged_at": p.get("mergedAt") or "",
        "url": p.get("url", ""),
        "truncated": truncated,
        "plan": plan_of(files, truncated),
        "reach": reachability(files, truncated),
    })

# ---- The reconcile gate: two independent readings must agree, or nothing publishes ----
derived_open = [r for r in rows if r["state"] in ("OPEN", "DRAFT")]
if len(derived_open) != int(open_truth):
    print(
        f"pr-log: STOPPING -- open count disagrees.\n"
        f"  derived from --state all: {len(derived_open)}\n"
        f"  GitHub asked directly:    {open_truth}\n"
        f"  Either the state derivation is wrong, or the window ({len(rows)} fetched) is\n"
        f"  too small and an older open PR fell outside it. Not writing the log:\n"
        f"  a ledger nobody can trust is worse than no ledger.",
        file=sys.stderr,
    )
    sys.exit(1)

# ---- Promotion PRs, detected by REF and not by title string ----
# The old predicate matched the title against ("dev/dave", "dev/dave -> main"), which
# missed #147 "Promote dev/dave → main: ...", #144 "Ship dev/dave → main: ..." and #135
# "Promote dev/dave → main (production)" -- all three then sat in the ✅ Merged table
# under a header claiming "(promotion PRs excluded)".
# base == "main" ALONE is wrong: #143, #137, #131 and #161 are genuine feature PRs
# targeting main and must stay in the feature list.
promo = lambda r: r["base"] == "main" and r["branch"] == "dev/dave"
promos  = [r for r in rows if promo(r)]
feature = [r for r in rows if not promo(r)]

# ---- Merged is not shipped (AGENTS.md -> Review Habit) ----
# A feature PR merged to dev/dave is on dev only. It reaches production when a
# promotion PR (dev/dave -> main) merges AFTER it. If no merged promotion PR is inside
# the window we cannot prove either way, and say so rather than implying "dev only".
landed_promos = sorted([p for p in promos if p["merged_at"]], key=lambda x: x["merged_at"])
last_promo = landed_promos[-1] if landed_promos else None
promo_horizon = last_promo["merged_at"] if last_promo else None

def landing(r):
    """Where a merged PR actually is. Never collapses dev with production."""
    if r["base"] == "main":
        return f"✅ merged → **main** (production) {r['merged_at'][:10]}"
    if promo_horizon is None:
        return "✅ merged → `dev/dave` · production status unknown (no promotion PR in window)"
    if r["merged_at"] and r["merged_at"] <= promo_horizon:
        return f"✅ merged → `dev/dave`, carried to production by [#{last_promo['n']}]({last_promo['url']})"
    return "🟡 merged → `dev/dave` — **on dev only, not on production**"

def table(rs):
    if not rs:
        return "_none_\n"
    o = ["| PR | What it is | Where it lives | Plan | Reachable? |",
         "|---|---|---|---|---|"]
    for r in rs:
        t = r["title"] if len(r["title"]) <= 62 else r["title"][:59] + "…"
        if r["plan"] is None:
            plan = "_truncated — unknown_"
        elif r["plan"]:
            plan = ", ".join(f"`{p}`" for p in r["plan"])
        else:
            plan = "—"
        if r["state"] == "MERGED":
            verdict = landing(r)
            reach = r["reach"]
            doit = f"{verdict}<br>{reach}"
        elif r["state"] == "OPEN":
            doit = f"⏳ open — not landed<br>{r['reach']}"
        elif r["state"] == "DRAFT":
            doit = f"✏️ draft<br>{r['reach']}"
        else:
            doit = "❌ closed, never landed"
        o.append(f"| [#{r['n']}]({r['url']}) | {t} | `{r['branch']}` | {plan} | {doit} |")
    return "\n".join(o) + "\n"

openr   = [r for r in feature if r["state"] in ("OPEN", "DRAFT")]
mergedr = [r for r in feature if r["state"] == "MERGED"]
closedr = [r for r in feature if r["state"] == "CLOSED"]
unreach = [r for r in mergedr if r["reach"].startswith("UNREACHABLE")]

gen = subprocess.run(["git", "rev-parse", "--short", base_ref],
                     capture_output=True, text=True, check=True).stdout.strip()

doc = f"""# PR Log

**Generated — do not edit.** Run `./scripts/pr-log.sh`. Every column is read from the thing it
describes: GitHub for the PR, git for the branch and the base tree, the PR's own file list for
the plan folder and for reachability.

> **Why generated:** a hand-typed inventory rots the day after it is typed, and nobody notices,
> because nothing regenerates it. This one is rebuilt from the source every time it runs.

> **Regenerated on `dev/dave` only** — by schedule or by hand
> (`.github/workflows/pr-log-refresh.yml`). Never on a pull request: this document is a function
> of the set of *all* open PRs, so a staleness gate on `pull_request` has no fixed point — going
> green on one PR would stale every other one.

`{base_ref}` @ `{gen}` · {len(feature)} feature PRs ({len(promos)} promotion PRs excluded) ·
showing the most recent {len(rows)} of **{total_prs}** PRs · {len(closedr)} of
**{total_closed_unlanded}** closed-without-landing PRs are inside this window — raise it with
`--limit N`.

## ⛔ Merged but UNREACHABLE — landed with no caller

Every app file these PRs touch is **new**. Nothing on `{base_ref}` imports them, so the code sits
in the repository and cannot execute. That is a statement about reachability and nothing else —
this table makes **no claim** about feature flags or switches. Whether something is additionally
gated behind an env var, a seed row, or a config value is declared by the author in the PR
template; it is not inferred here.

{table(unreach)}
## ⏳ Open — waiting on review or merge

{table(openr)}
## ✅ Merged

Merged to `dev/dave` means **on dev, not on production**. Production requires a promotion PR
(`dev/dave` → `main`) to merge afterwards; where one has, it is named in the row.

{table(mergedr)}
## ❌ Closed without landing

Work that exists on a branch and never shipped. Before building anything new, check here — the
thing may already be written. **This section shows {len(closedr)} of {total_closed_unlanded}**
closed-without-landing PRs; the rest are outside the {len(rows)}-PR window. Run
`./scripts/pr-log.sh --limit {total_prs}` for the complete list.

{table(closedr)}"""

if mode == "check":
    if os.path.exists(out_path):
        with open(out_path, encoding="utf-8") as fh:
            cur = fh.read()
    else:
        cur = ""
    strip = lambda s: re.sub(r"@ `[0-9a-f]+`", "", s)
    if strip(cur) != strip(doc):
        print(f"pr-log: {out_path} is STALE — run ./scripts/pr-log.sh")
        sys.exit(1)
    print(f"pr-log: {out_path} is current")
    sys.exit(0)

# encoding is explicit: the document is emoji-dependent and a bare open() raises
# UnicodeEncodeError under a POSIX-locale CI container.
with open(out_path, "w", encoding="utf-8") as fh:
    fh.write(doc)
print(f"  ✓ {out_path} — {len(feature)} feature PRs · {len(openr)} open · {len(mergedr)} merged · {len(unreach)} MERGED-BUT-UNREACHABLE · {len(closedr)} closed-unlanded")
PY
