# Alloro Agent Notes

These are repo-local operating notes for `/Users/rustinedave/Desktop/alloro`. They intentionally include only Alloro-specific context. Broader workflow rules can live in `~/.codex/AGENTS.md`.

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
