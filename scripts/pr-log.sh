#!/usr/bin/env bash
# Generate PR-LOG.md — what every PR is, where to find it, and what it does.
#
# WHY THIS IS GENERATED AND NOT WRITTEN
# ------------------------------------
# An inventory already existed: ASSET-MAP.md, 2026-06-12, described as "a verified
# inventory of what's already built, TO STOP REBUILDING." Its own conclusion was
# "the constraint is not building -- it's landing and consolidation."
#
# Five weeks later: three finished features sat stranded with no PR, and an eighth
# duplicate spec got written. The hand-written inventory rotted the day after it was
# typed, and nobody noticed, because nothing regenerates it.
#
# So this file types nothing. Every column is read from the thing it describes --
# GitHub for the PR, git for the branch, the PR's own file list for the plan folder,
# the migration source for the enable state. A ledger that can't be stale is the
# only kind worth having.
#
# THE COLUMN THAT MATTERS: "does it DO anything?"
# ----------------------------------------------
# Merged is not the same as on. A6, A4 and B1 all merged and ship with
# `defaultTo(false)` -- landed, and doing nothing for a customer until someone
# flips a switch that no surface tracks. Kieran Flanagan, 2026-07-17: "Building it
# is maybe 40% of the job. Getting adoption is the other 60%." This column is the
# 60%.
#
# USAGE
#   ./scripts/pr-log.sh            # regenerate PR-LOG.md
#   ./scripts/pr-log.sh --check    # exit 1 if PR-LOG.md is stale (CI-able)
#
# Requires: gh (authenticated), git, python3.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT" || exit 1

OUT="PR-LOG.md"
LIMIT="${PR_LOG_LIMIT:-60}"
MODE="${1:-generate}"

command -v gh >/dev/null 2>&1 || { echo "pr-log: gh not found — install it or run 'gh auth login'" >&2; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "pr-log: gh is not authenticated — run 'gh auth login'" >&2; exit 1; }

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

git fetch origin --quiet 2>/dev/null || true

# Every migration on dev/dave that ships a flag defaulted OFF. These are the
# features that merge and then do nothing until someone enables them.
DISABLED_MIGRATIONS="$(git grep -l "defaultTo(false)" origin/dev/dave -- src/database/migrations/ 2>/dev/null | sed 's|.*/||' || true)"

gh pr list --state all --limit "$LIMIT" \
  --json number,title,state,headRefName,baseRefName,author,createdAt,mergedAt,url,files,additions,deletions,isDraft \
  > "$TMP" 2>/dev/null || { echo "pr-log: gh pr list failed" >&2; exit 1; }

# An INDEPENDENT open count, asked of GitHub directly rather than derived from the
# --state all list. The derived count was wrong once: isDraft was read as a state, so
# PRs merged/closed-while-draft got filed as open and the log said 12 open when 8 were.
# One reading can be quietly wrong; two readings that must agree cannot be. If these
# ever diverge, the derivation is broken -- stop the line rather than publish a number.
OPEN_TRUTH="$(gh pr list --state open --limit 200 --json number --jq 'length' 2>/dev/null || echo "")"

python3 - "$TMP" "$OUT" "$MODE" "$OPEN_TRUTH" <<'PY'
import json, sys, os, subprocess, re

tmp, out_path, mode, open_truth = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
prs = json.load(open(tmp))

disabled_migs = set(
    os.path.basename(p) for p in
    subprocess.run(["git","grep","-l","defaultTo(false)","origin/dev/dave","--","src/database/migrations/"],
                   capture_output=True, text=True).stdout.split()
)

def plan_of(files):
    """The PR's own file list names its plan folder. Nothing to type."""
    for f in files:
        m = re.match(r"(plans/[^/]+)/", f.get("path", ""))
        if m:
            return m.group(1)
    return ""

def ships_off(files):
    """A merged PR whose migration defaults a flag to false landed and does nothing."""
    for f in files:
        p = f.get("path", "")
        if p.startswith("src/database/migrations/") and os.path.basename(p) in disabled_migs:
            return True
    return False

rows = []
for p in prs:
    files = p.get("files") or []
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
        "who": (p.get("author") or {}).get("login", ""),
        "merged": (p.get("mergedAt") or "")[:10],
        "created": (p.get("createdAt") or "")[:10],
        "url": p.get("url", ""),
        "plan": plan_of(files),
        "nfiles": len(files),
        "adds": p.get("additions", 0),
        "off": ships_off(files),
    })

promo = lambda r: r["title"].strip().lower() in ("dev/dave", "dev/dave -> main")
feature = [r for r in rows if not promo(r)]

# ---- The reconcile gate: two independent readings must agree, or nothing publishes ----
# Compare EVERY open PR we derived (promotion PRs included -- open_truth counts those too)
# against the number GitHub gives when asked for open PRs directly. A mismatch means
# either the state derivation is wrong, or PR_LOG_LIMIT is too small a window and an
# older open PR fell outside it. Both make the log lie in the one column people act on.
derived_open = [r for r in rows if r["state"] in ("OPEN", "DRAFT")]
if open_truth.isdigit() and len(derived_open) != int(open_truth):
    print(
        f"pr-log: STOPPING -- open count disagrees.\n"
        f"  derived from --state all: {len(derived_open)}\n"
        f"  GitHub asked directly:    {open_truth}\n"
        f"  Either the state derivation is wrong, or PR_LOG_LIMIT ({len(rows)} fetched) is\n"
        f"  too small a window and an older open PR fell outside it. Not writing the log:\n"
        f"  a ledger nobody can trust is worse than no ledger.",
        file=sys.stderr,
    )
    sys.exit(1)

def table(rs):
    if not rs:
        return "_none_\n"
    o = ["| PR | What it is | Where it lives | Plan | Does it DO anything? |",
         "|---|---|---|---|---|"]
    for r in rs:
        t = r["title"] if len(r["title"]) <= 62 else r["title"][:59] + "…"
        plan = f"`{r['plan']}`" if r["plan"] else "—"
        if r["state"] == "MERGED":
            doit = "⛔ **merged, ships DISABLED**" if r["off"] else "✅ merged"
        elif r["state"] == "OPEN":
            doit = "⏳ open — not landed"
        elif r["state"] == "DRAFT":
            doit = "✏️ draft"
        else:
            doit = "❌ closed, never landed"
        o.append(f"| [#{r['n']}]({r['url']}) | {t} | `{r['branch']}` | {plan} | {doit} |")
    return "\n".join(o) + "\n"

openr   = [r for r in feature if r["state"] in ("OPEN", "DRAFT")]
mergedr = [r for r in feature if r["state"] == "MERGED"]
closedr = [r for r in feature if r["state"] == "CLOSED"]
dark    = [r for r in mergedr if r["off"]]

gen = subprocess.run(["git","rev-parse","--short","origin/dev/dave"], capture_output=True, text=True).stdout.strip()

doc = f"""# PR Log

**Generated — do not edit.** Run `./scripts/pr-log.sh`. Every column is read from the thing it
describes: GitHub for the PR, git for the branch, the PR's own file list for the plan folder,
the migration source for the enable state.

> **Why generated:** `ASSET-MAP.md` (2026-06-12) was a hand-written *"verified inventory of
> what's already built, to stop rebuilding."* Five weeks later three finished features sat with
> no PR and an eighth duplicate spec got written. **A typed ledger rots the day after it's typed.**
> This one can't — it's regenerated from the source.

`origin/dev/dave` @ `{gen}` · {len(feature)} feature PRs (promotion PRs excluded) · showing the most recent {len(rows)}

## ⛔ Merged but DARK — landed, and doing nothing

These shipped with a flag defaulted **off**. They are in the codebase and invisible to every
customer until someone enables them. *"Building it is maybe 40% of the job. Getting adoption is
the other 60%."* — **this section is the 60%, and nothing else tracks it.**

{table(dark)}
## ⏳ Open — waiting on review or merge

{table(openr)}
## ✅ Merged

{table(mergedr)}
## ❌ Closed without landing

Work that exists on a branch and never shipped. Before building anything new, check here — the
thing may already be written.

{table(closedr)}"""

if mode == "--check":
    cur = open(out_path).read() if os.path.exists(out_path) else ""
    strip = lambda s: re.sub(r"@ `[0-9a-f]+`", "", s)
    if strip(cur) != strip(doc):
        print("pr-log: PR-LOG.md is STALE — run ./scripts/pr-log.sh")
        sys.exit(1)
    print("pr-log: PR-LOG.md is current")
    sys.exit(0)

open(out_path, "w").write(doc)
print(f"  ✓ {out_path} — {len(feature)} feature PRs · {len(openr)} open · {len(mergedr)} merged · {len(dark)} MERGED-BUT-DARK · {len(closedr)} closed-unlanded")
PY
