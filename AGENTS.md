# Alloro Agent Notes

These are repo-local operating notes for `/Users/rustinedave/Desktop/alloro`. They intentionally include only Alloro-specific context. Broader workflow rules can live in `~/.codex/AGENTS.md`.

## Asking Another Agent A Question

Questions between builders go in [`BUILD-QUESTIONS.md`](BUILD-QUESTIONS.md) at the repo root — not Slack, not
a DM, not a person. Slack is the heads-up; that file is the record. If you get an answer in Slack, write it
back into the file. A question that lives only in a DM is invisible to the next session, which will re-ask it.

Read it when you start work: it carries what's already been settled between the agents on both sides.

## Communication Style

Write plainly for the user. Keep the technical substance accurate, but say it in simple, common words and short sentences. Lead with the main point, then the detail. No wordplay, puns, jokes, or clever phrasing — say things directly. When something has to stay technical (a file name, a command, a term), add a one-line plain explanation next to it. The goal: the user understands the answer on the first read without having to decode it.

## Worktree Workflow

The global `-s` and `-tw` command rules apply to Alloro with these project-specific details.

### Planning Worktrees (`--start` / `-s`)

- Every `-s` starts a new secondary linked worktree from the current branch's committed `HEAD` before planning, unless the user explicitly passes `--no-worktree`.
- Put Alloro planning worktrees under `/Users/rustinedave/Desktop/alloro-worktrees/{feature-slug}`.
- Use `codex/{feature-slug}` for the new branch unless the user explicitly names another branch.
- Create the plan folder and perform later execution inside that linked worktree.
- Report the source branch, source commit, new branch, and absolute worktree path.
- Dirty source-checkout changes are not part of the new worktree. Warn about them, but never stash or copy them automatically.

### Contained Acceptance (`--test-worktree` / `-tw`)

- Hard-fail unless the current checkout is proven to be a secondary linked Git worktree.
- The expected Alloro adapter command is `npm run test:worktree`. **This adapter is not assumed to exist.** If the package script is absent, refuse safely and use `-s` to plan its implementation.
- The adapter must build a runtime from the verified worktree, use OS-assigned ports, and return a machine-readable manifest with the app origin, authenticated bootstrap URL, health URL, safety modes, logs, and teardown command.
- Build an allowlisted runtime environment. Do not copy or activate the checkout's `.env` wholesale, and never enable commented-out production database values.
- Use an isolated local writable database cloned from a sanitized persistent seed when useful. Never write to dev or production by default.
- Seed deterministic local users and issue a local-only session so browser acceptance does not require manual reauthentication.
- Route email to a local capture sink. Isolate Redis and queue namespaces. Keep workers and recurring schedules off unless a named test explicitly requires them.
- Disable third-party writes by default. Test/sandbox integrations require an explicit user request.
- Run acceptance against the manifest origin. For the admin flow, open `{origin}/admin`; when client-dashboard state matters, use the seeded Pilot flow into One Endodontics.
- Update the active plan's `test-results.json` with real browser/API/CLI evidence, then tear the runtime down unless `--keep` was requested.

These instructions define the safe contract. They do not implement the Docker services, database clone, seeds, auth bootstrap, email sink, browser launcher, or package script.

## Plan Specs

All Alloro plan folders must use the global self-contained HTML spec artifact format:

- Create a single self-contained `spec.html` for the consolidated plan/spec content, with all styling embedded in an in-page `<style>` block in the `<head>`. Do not create a separate `spec.css`.
- Do not create new `spec.md` files. Legacy `spec.md` files may be read for historical context, but active continued work must be migrated to a self-contained `spec.html` before execution. Legacy folders that still carry a separate `spec.css` keep working; new specs embed styles inline.
- Use `plans/{MMDDYYYY}-{feature-slug}/` for plan folder names. Do not include ticket numbers or placeholder ticket segments.
- Preserve the old spec structure: Why, What, Context, Constraints, Risk, Tasks, Done, and Revision Log when needed.
- Use a modern black-and-white visual design with clear cards, strong type hierarchy, restrained borders, and no decorative color palettes.
- Show the current execution status in the first hero viewport. Default new plans to `Pending Execution`, then update to `In Progress`, `Needs Revision`, `Blocked`, or `Completed` when the work state changes.

### Spec Revision Log (`Rev N`) convention

Any change to an existing spec — added scope, an execution-time deviation, or a QA fix round — is recorded as an append-only revision entry. This applies to every agent touching a spec, not just the one that created it.

- Append exactly one `<article class="revision-entry">` per revision to the spec's `<section class="spec-card" id="revision-log">` (create the section before the closing `</main>` if it doesn't exist yet).
- Heading format: `<h3>Rev N - YYYY-MM-DD</h3>` where `N` = highest existing Rev in the file + 1. Never renumber, rewrite, or delete earlier entries — the log is the audit trail.
- Each entry carries three lines: `<strong>Change:</strong>` (what was done, concretely — include root causes for bug-fix rounds), `<strong>Reason:</strong>` (why — e.g. `User QA: …`, `Scope addition: …`, `Execution deviation: …`), and `<strong>Updated Done criteria:</strong>` (the new checklist expectations, or "none").
- Tasks added by a revision are tagged `(Rev N)` in their titles, and the Done checklist gains matching items in the same edit.
- Update the hero status pill/status card in the same edit whenever the work state changes; never create a new plan folder for a revision of an existing spec.

## Code Constitution

All code work in this repo — backend (`src/`) and frontend (`frontend/`) — follows the **Code Constitution**, the numbered architecture contract. The full text is at `~/.claude/skills/code-constitution/SKILL.md`, with a browsable view in `code-constitution.html` at the repo root. It is organized as Parts → Sections → Articles with stable `§N.M` IDs, so any violation is cited precisely (e.g. `§7.4`).

This is mandatory during planning (`-s`) and execution (`-x`, `-i`, `-q`):

- **Claude Code:** invoke the `code-constitution` skill. **Codex / other agents:** read and apply `~/.claude/skills/code-constitution/SKILL.md`.
- **Planning (`-s`):** the spec cites the specific `§N.M` Articles the work touches in its Context/Constraints sections, and names the reference analog — `§6.1` `src/controllers/gbp-automation/` for backend, `§12.1` the `frontend/src/api/` + React Query + feature-folder triad for frontend. Do not spec a task that violates an Article; redesign it.
- **Execution:** code conforms to the cited Articles. Afterward, run `npm run check:all` (at minimum `npm run check:conventions --strict` for the backend) and cite the `§N.M` for every violation in the Enforcement Protocol format — never "this is messy." Fix must-fix violations (any 🔎-mechanized backend Article, or a security/correctness Article) before reporting done. Frontend mechanized Articles stay advisory until the frontend remediation lands (see `plans/06152026-frontend-remediation`).
- **Review (`-r`):** cite `§N.M` for every finding.

## Deployment Path

Standard promotion path:

1. Work happens on `dev/dave`.
2. Push `dev/dave` to deploy to dev through `.github/workflows/dev.yml`.
3. Validate on `https://dev.getalloro.com`.
4. Merge `dev/dave` into `main` only when ready for production.
5. Push/merge to `main` to deploy production through `.github/workflows/main.yml`.

Do not treat sandbox as the dev environment. Sandbox is separate and should not be touched for this dev-to-prod path unless the user explicitly asks.

## Servers And Paths

Dev:

- SSH alias: `ssh alloro-dev`
- URL: `https://dev.getalloro.com`
- Workflow: `.github/workflows/dev.yml`
- GitHub branch: `dev/dave`
- GitHub deploy secrets: `DEV_EC2_HOST`, `DEV_EC2_USER`, `DEV_EC2_PORT`, `DEV_EC2_KEY`
- Target directory: `/var/www/signals`
- Runtime env: `/etc/alloro/dev.env`
- Google key file: `/etc/alloro/dev-google-key.json`

Production:

- SSH alias: `ssh alloro-app`
- URL: production Alloro app
- Workflow: `.github/workflows/main.yml`
- GitHub branch: `main`
- GitHub deploy secrets: `EC2_HOST`, `EC2_USER`, `EC2_PORT`, `EC2_KEY`
- Target directory: `/var/www/signals`
- Runtime env: `/etc/alloro/app.env`
- Google key file: `/etc/alloro/signals-google-key.json`

Both deploy workflows build backend and frontend, upload a bundle to `/var/www/signals`, symlink the server-managed `.env` and Google key file, run `npm run db:migrate`, reload PM2, and check `http://localhost:3000/api/health/db`.

## Runtime Environment Rules

- Runtime application secrets live on the servers, not in GitHub `ENV_FILE` secrets.
- GitHub secrets should be limited to deploy transport values such as EC2 host, user, port, and SSH key.
- Do not print database credentials, API keys, tokens, or full `.env` contents into terminal output or chat.
- Local `.env` should point at the dev database by default.
- If production database values are kept in local `.env` for reference, keep them commented out.
- Do not commit `.env`.
- **This repo (`getAlloro/alloro`) is public.** Before pushing or commenting, sanitize outward-facing content: keep concrete security-vulnerability mechanics (exploit strings, "PII leak" framing) and internal strategy codenames out of commit messages, PR titles/bodies, comments, and any committed spec — describe the *defense*, not the attack. Sanitize *before* pushing; do not rely on a classifier catching it. Synthetic strings inside test files are fine.

## Database And Migration Safety

- Production user data is the data baseline.
- Git migration history is the structure baseline.
- Dev was cloned from production and should stay migration-history compatible with production.
- Do not sync dev data back to production.
- Migrations run first on `dev/dave` against the dev database.
- The same migrations run against production only after merge/push to `main`.
- Treat production's `knex_migrations` table as the baseline source of truth for what has actually run in production.

When creating or reviewing migrations, explicitly flag production risk before merge:

- destructive schema changes
- data rewrites or backfills
- long-running locks
- irreversible or weak `down` migrations
- assumptions that only hold in dev data
- dependencies on external services or local-only values

Prefer reversible, idempotent, production-safe Knex migrations. If a migration changes data, state which production rows/tables are affected and how rollback or recovery would work.

## Useful Commands

Local verification:

```bash
npx tsc --noEmit
npm run build
cd frontend && npm run build
```

Database:

```bash
npm run db:migrate
npm run db:rollback
npm run db:make-migration -- migration_name
```

Dev server checks:

```bash
ssh alloro-dev
curl -s https://dev.getalloro.com/api/health/db
```

Production server checks:

```bash
ssh alloro-app
curl -s https://app.getalloro.com/api/health/db
```

PM2 on servers usually requires loading NVM first in non-interactive SSH:

```bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm use node
pm2 list
```

## Review Habit

Before saying a change is live, distinguish:

- code committed and pushed
- workflow completed
- migrations applied
- PM2 restarted
- health check passing
- browser/API behavior verified

Do not collapse these into one vague "done."

## Feature Friyays

Feature Friyays are weekly Alloro feature-roundup artifacts. They live in this repo under `friyays/`.

Folder naming:

- Use `friyays/{MM-DD-YYYY}/`, where the date is the Monday that starts the Friyay coverage week.
- Standard coverage is Monday through Sunday, inclusive, including weekend work.
- The inaugural folder is `friyays/05-25-2026/`. For that first edition only, include features developed from Thursday, May 21, 2026 through Sunday, May 31, 2026, even though the folder name remains `05-25-2026`.

Required files in each weekly folder:

- `index.html` - branded static Friyay page containing the feature inventory, documentation, release-state notes, internal/admin notes, and ship checklist.
- `email.html` - branded customer-ready email HTML in plain language, focused on user value rather than implementation detail.
- `styles.css` - shared Alloro-branded styling for the Friyay page and email preview.

Status requirements:

- Every `index.html` must show a package-level Friyay status in the first hero viewport.
- Allowed package statuses are `Fresh`, `Drafting`, `Needs verification`, `Ready for review`, `Deployed`, and `Archived`.
- `Fresh` means the weekly package is an empty shell ready for new inventory.
- `Deployed` means the Friyay package itself has been pushed/deployed or intentionally archived as shipped inventory; it does not automatically mean every row is production-live.
- Row-level feature states must remain precise: drafted, implemented locally, committed, pushed, deployed to dev, deployed to production, user-verified, needs classification, or needs verification.
- When content is moved from one Friyay package to another, move the inventory into the destination package, update the destination status, and leave the source package as a `Fresh` shell so the same item is not counted twice.

Optional files:

- `assets/` - screenshots, product captures, or other visual assets referenced by `index.html`.

Agent behavior:

- Create the weekly folder if it does not exist when asked to compile, draft, or finalize Feature Friyay material.
- During `--done friyay`, update the current Friyay folder alongside `CHANGELOG.md` after normal finalization checks pass.
- During plain `--done`, infer Friyay inclusion when the completed work is a user-facing product change, admin/operator feature, meaningful support fix, docs-visible change, content launch, data cleanup with client impact, deployment/reliability improvement worth communicating, or any changelog-worthy item in the current coverage window.
- If Friyay inclusion is uncertain, ask targeted questions before finalizing. While waiting for clarity, list the item in the inventory section of `index.html` as `Needs classification` or `Needs verification` rather than omitting it.
- Use real evidence: plan folders, changelog entries, git history, merged commits, PRs, deployment checks, and direct file/runtime verification where needed.
- Distinguish feature states clearly: drafted, implemented locally, committed, pushed, deployed to dev, deployed to production, and user-verified are not the same thing.
- Do not invent feature claims from memory. If a feature is plausible but unverified, put it in the inventory section of `index.html` as `Needs verification`, not in customer-facing copy.
- Keep in-progress notes out of `email.html` unless the email is explicitly marked as a draft.
- Do not create new standalone Markdown Friyay artifacts unless the user explicitly asks for Markdown export. If an older Friyay folder has Markdown artifacts, migrate them into the HTML/CSS package and remove the old Markdown files.
- Dashboard/admin/client-dashboard features still require Alloro Docs parity before finalization; update `/Users/rustinedave/Desktop/alloro-docs` when the feature changes user-facing UI, controls, labels, tooltips, page copy, navigation, screenshots, or guidance.

## Dashboard Docs Parity

When work changes dashboard pages or admin/client dashboard UI, documentation parity is required before finalization.

Check `/Users/rustinedave/Desktop/alloro-docs` for matching documentation, replicas, screenshots, tooltip text, walkthrough copy, and page information.

During planning or instant execution:

- Include docs impact in the spec when dashboard UI changes.
- List the relevant Alloro Docs files if known.
- If no docs update is needed, state why.

During `--done`:

- Update `CHANGELOG.md` in this repo as usual.
- Update `/Users/rustinedave/Desktop/alloro-docs` when the completed work changes dashboard behavior, visible controls, labels, tooltips, page copy, UI guidance, permissions, empty states, or navigation.
- If docs are unchanged, explicitly state why no docs update was required.
- Do not claim finalization is complete until docs parity has been checked.

Cross-repo rule:

- Treat Alloro app changes and Alloro Docs changes as separate working trees.
- Check git status in both repos before committing.
- Keep docs commits focused on documentation parity for the app change.
