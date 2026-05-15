# Server Env Deploy Pipelines

## Why
GitHub secrets are currently carrying runtime env files and service-account JSON, which makes routine env edits painful and couples deployments to opaque secret blobs. Prod and dev now have server-managed env/key files, so the pipelines should deploy code and use those files in place.

## What
Update prod deploys and add dev deploys so runtime config comes from `/etc/alloro`, migrations run during deploy, and sandbox remains untouched.

## Constraints

**Must:**
- Keep SSH/deploy-access secrets in GitHub.
- Use server-managed env/key files for runtime secrets.
- Run `npm run db:migrate` against the target environment before PM2 reload.
- Leave `.github/workflows/deploy-sandbox.yml` unchanged.

**Must not:**
- Store `.env` or Google key material in the deploy bundle.
- Touch Corey sandbox deploy behavior.
- Change app runtime code.

## Risk

**Level:** 2

**Risks identified:**
- Missing server env/key files would break deploys -> **Mitigation:** explicit preflight checks before clean/upload and before migration.
- Bad migrations now block deployment -> **Mitigation:** run migrations before PM2 reload so the old process remains up if migration fails.
- Frontend Sentry DSN is a build-time value, not server-runtime env -> **Mitigation:** use optional GitHub repository variable `VITE_SENTRY_DSN`; empty is allowed.

**Blast radius:** `.github/workflows/main.yml`, new `.github/workflows/dev.yml`

## Tasks

### T1: Prod workflow server env
**Do:** Remove runtime secret injection from prod workflow, generate deploy-time knexfile, symlink `/etc/alloro/app.env` and `/etc/alloro/signals-google-key.json`, run migrations, then reload PM2.
**Files:** `.github/workflows/main.yml`
**Depends on:** none
**Verify:** YAML parse, grep for removed runtime secrets.

### T2: Dev workflow
**Do:** Add `dev.yml` triggered by `dev/dave`, deploying to alloro-dev with `/etc/alloro/dev.env` and `/etc/alloro/dev-google-key.json`.
**Files:** `.github/workflows/dev.yml`
**Depends on:** T1
**Verify:** YAML parse, grep for DEV deploy secrets only.

## Done
- [x] Prod workflow no longer references `ENV_FILE` or `SIGNALS_GOOGLE_KEY`.
- [x] Dev workflow exists and triggers on `dev/dave`.
- [x] Both prod/dev workflows run `npm run db:migrate`.
- [x] Sandbox workflow unchanged.
- [x] YAML parses.
