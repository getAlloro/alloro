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
