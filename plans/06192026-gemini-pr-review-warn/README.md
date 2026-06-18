# Gemini PR Review (warn-only) — Runbook

Advisory AI code review on pull requests into `main`. It posts inline comments on the
changed lines only, written as senior-engineer recommendations against the Alloro Code
Constitution. **It never blocks the merge.**

Plan folder: `plans/06192026-gemini-pr-review-warn/` · Spec: `spec.html`

## Files

| File | Role |
|---|---|
| `.github/workflows/gemini-pr-review.yml` | The `pull_request` workflow (trigger, permissions, steps). |
| `scripts/pr-review/collect-context.mjs` | Computes changed files + related files (depcruise for `src/`, grep fallback for `frontend/`), assembles the prompt, and writes the changed-line map. |
| `scripts/pr-review/post-review.mjs` | Parses the model output, validates each finding against the diff, posts one PR review (`event: COMMENT`). |
| `.github/gemini/review-prompt.md` | The senior-engineer prompt (role, what to review, output contract). Edit this to tune the review. |

## One-time setup (required before it does anything)

1. **Add the API key secret.** Create a Google AI Studio key, then add it to the repo:
   `Settings → Secrets and variables → Actions → New repository secret`
   - Name: `GEMINI_API_KEY`
   - Value: your Gemini API key

   Without this secret the Gemini step fails harmlessly (the job is `continue-on-error`)
   and no comments are posted.

2. **Use a PR into `main`.** The review only runs on `pull_request` events targeting
   `main`. Your flow is: work on `dev/dave` (push deploys dev) → open a PR
   `dev/dave → main` → the review runs and re-runs on every push to the PR → merge when
   ready. A direct merge with no PR will skip the review entirely.

## How it runs

```
pull_request (base: main)
  1. checkout (full history)  +  npm ci  (for dependency-cruiser)
  2. collect-context.mjs  →  pr-review-prompt.md + pr-review-changed.json
        - changed files: incremental on re-push (before..head), full PR on first run
          / reopen / force-push; *.ts/*.tsx, added/modified only
        - related files: depcruise graph (src) + same-folder/imports grep (frontend)
        - has_changes=false short-circuits the rest (no cost on doc-only PRs)
  3. run-gemini-cli (gemini-3.5-flash)  →  JSON findings (inference only)
  4. post-review.mjs  →  validates file+line against the diff, posts COMMENT review
```

## Tuning

- **Model:** change `GEMINI_MODEL` in the workflow `env:` (default `gemini-3.5-flash`).
- **What it flags / tone:** edit `.github/gemini/review-prompt.md`.
- **Max comments:** `MAX_COMMENTS` in `post-review.mjs` (default 12).
- **Context size caps:** `MAX_CHANGED_FILES` / `MAX_RELATED_FILES` / `MAX_FILE_BYTES` in
  `collect-context.mjs`. Anything dropped is logged in the job output.

## Local testing (no API calls)

Reproduce what CI does without posting anything:

```bash
# 1. build the prompt + changed-line map for the last commit
BASE_SHA=$(git rev-parse HEAD~1) HEAD_SHA=$(git rev-parse HEAD) \
  node scripts/pr-review/collect-context.mjs

# 2. see which comments post-review WOULD post (DRY_RUN skips the GitHub API)
GITHUB_TOKEN=x GITHUB_REPOSITORY=acme/repo PR_NUMBER=1 HEAD_SHA=$(git rev-parse HEAD) \
  DRY_RUN=1 GEMINI_SUMMARY='[{"file":"<changed file>","line":<added line>,"title":"t","recommendation":"r","article":null}]' \
  node scripts/pr-review/post-review.mjs
```

`DRY_RUN=1` makes `post-review.mjs` log the inline comments it would post and exit
without calling GitHub. The generated `pr-review-*.{md,json}` files are gitignored.

## Notes & limitations

- **depcruise scans `src/` only**, so frontend related-files use a lighter
  same-folder + relative-import fallback (no reverse-dependency lookup). Extending
  depcruise to `frontend/` is future work.
- **Action pinning:** pinned to `google-github-actions/run-gemini-cli@v0.1.22`. For
  stricter supply-chain hardening, pin to the release commit SHA instead of the tag.
- **Incremental re-runs:** each push to an open PR reviews only that push's new commits
  (`before..head`), not the whole PR again. The first run / a reopen / a force-push
  reviews the full PR. Concurrency serializes runs per PR (no cancellation), so no
  push's commits are skipped.
- **Valid silence:** clean code yields no comments — the prompt treats an empty result
  as the expected outcome, and `post-review` posts nothing when there are no findings.
- **Cost:** Flash tier, scoped context — roughly a cent or two per PR (less on
  incremental re-runs).
- **Not a gate.** This is Layer-2 advisory review. The deterministic
  `npm run check:conventions --strict` gate is the recommended blocking follow-up.
