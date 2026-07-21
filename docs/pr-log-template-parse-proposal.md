# OPTIONAL — Dave's call: parse the legibility template into PR-LOG.md columns

**Status:** proposal only. Not wired. `scripts/pr-log.sh` is marked generated / do-not-edit and is **untouched** by this PR.

## Why
`PR-LOG.md`'s `What it is` column is a one-line GitHub summary (the PR title/first line). With the new `.github/PULL_REQUEST_TEMPLATE.md`, every PR body now carries two structured, plain-language fields:
- `## What this is` — the non-engineer outcome.
- `## Where you see it` — the surface/path (or "no visible surface" + what it feeds).

These are exactly the two things a reviewer or a non-engineer needs to situate a PR at a glance, and they are more reliable than a title summary because the CI legibility check enforces they exist and are non-empty.

## Proposed change (for Dave to adopt into `pr-log.sh`, or decline)
Add two derived columns to the generated ledger — `Outcome` (from `## What this is`) and `Surface` (from `## Where you see it`) — read from the PR body, same source-of-truth principle the script already uses (`gh pr view <n> --json body`).

Extraction is a section slice between a header and the next `## ` header, first non-blank line, e.g.:
```bash
# outcome = first non-blank line under "## What this is" in the PR body
outcome="$(gh pr view "$n" --json body -q .body \
  | tr -d '\r' \
  | awk '/^## What this is$/{f=1;next} f&&/^## /{exit} f' \
  | grep -v '^[[:space:]]*$' | head -1)"
```

## Tradeoffs (Dave decides)
- **For:** the ledger gains a plain-language outcome + surface per PR, machine-derived, enforced-present by CI — directly serving the end-of-week visibility the Weekly Reset asked for.
- **Against / to weigh:** PRs merged before the template existed have no `## What this is` section (the columns render empty for the grandfathered batch); and the fields are prose, so column width in a markdown table grows. A `head -1` / truncation keeps it a summary, not the full section.
- **Not done here on purpose:** `pr-log.sh` is generated/do-not-edit; changing it is the owner's call, so this ships as a description, not an edit.
