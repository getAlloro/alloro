# Contributing

## Why the PR template asks only three things

`CLAUDE.md` and `AGENTS.md` already require a plan folder — `plans/{MMDDYYYY}-{slug}/spec.html`
carrying Why, What, Context, Constraints, Risk, Tasks and Done, plus `test-results.json`, with
`--done` gating on both. Repeating those headings in the PR body buys nothing and costs every
author a scroll on every PR. So the template asks for the plan folder and then only the two
things the spec does **not** already cover.

### 1. "Where it lives" — can this code be reached?

A PR can merge clean, pass every test, and still be unable to run, because every app file it
adds is new and nothing already on `dev/dave` imports it. Merging is not the same as being
reachable.

Two merged PRs make the point:

- **#167** (findability sensor) added 10 files under `src/` — services, utils, models, a
  migration, types. Every one of them `ADDED`. Nothing on the base referenced any of them, so
  the code landed and could not execute.
- **#168** (GBP write-back) modified `src/routes/gbpAutomation.ts`, the automation controller,
  three models and a worker processor. It mounted a door on day one.

`scripts/pr-log.sh` computes exactly this and nothing more: it compares the PR's file list
against the base tree and reports **wired** (the PR mounts a route/worker, or edits a file that
already exists on the base), **UNREACHABLE** (every app file is new), or **unknown** (GitHub
capped the file list at 100 and the tail is unknowable). That is all a file list can prove.

### 2. "⛔ Does it need to be switched on?" — only you know this

Reachability is provable from code. A gate behind an env var, a seed row, or a config flag is
**not** — no static check can see it. #168 was reachable *and* shipped deliberately disabled;
its title said so. Nothing in the diff would have told you.

This is why the field is human-declared and why the generated ledger never guesses at it. An
earlier version of `pr-log.sh` tried to infer it by grepping migrations for `defaultTo(false)`.
That string matches 24 migrations on `dev/dave` — `is_internal`, `email_verified`, `is_read`,
`completed`, `mentioned`, `cited`, and so on — ordinary boolean columns whose correct default is
false and which gate nothing at all. The result was a ledger that printed "ships DISABLED" in
bold for a changeset containing no switch, sending readers to look for a flag that did not
exist. A confident wrong answer is worse than a blank: only one of them gets trusted.

So the split is deliberate:

| Question | Answered by | Where |
|---|---|---|
| Can the code be reached? | the script, from the file list and the base tree | `PR-LOG.md` |
| Does something have to be flipped? | the author | the PR template |

Never let one column claim both.

## PR-LOG.md

`PR-LOG.md` is generated — do not hand-edit it. Run `./scripts/pr-log.sh`.

It is regenerated on `dev/dave` only, by schedule or by hand
(`.github/workflows/pr-log-refresh.yml`), and **never on a pull request**. The document's content
is a function of the set of *all* open and merged PRs, not of any one PR's diff, so a staleness
check on a `pull_request` event has no fixed point: a PR that regenerates to go green instantly
stales every other open PR, which then does the same. `./scripts/pr-log.sh --check` refuses to
run on a `pull_request` event for that reason.
