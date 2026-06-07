# Audit `/start` Rate Limiting — cost-DoS hardening

## Why

`POST /api/audit/start` is unauthenticated and **unthrottled**. It triggers the full audit pipeline (Apify + Google Places + LLM), roughly **$0.10–0.30 in external spend per call**. The moment any traffic hits it — including the inbound we're about to drive — spend is unbounded. This is a live cost-DoS and the most urgent of the audit gaps: trivial to fix, real exposure. **Ships first**, before any other audit/funnel work.

Extracted from the parent audit-funnel spec (Systems/Gate's `06062026-no-ticket-audit-funnel-volume-ready`, task T4) to ship independently and first, per the agreed T4-first order. The conversion-infra tasks (T1–T3) remain in that parent plan and follow separately.

## What

Add a per-IP rate limiter to the `/start` route, reusing the existing `src/middleware/publicRateLimiter.ts` pattern, with a generous threshold that never blocks a legitimate doctor (who runs one audit) but caps a script hammering the endpoint. Over-limit requests are rejected **before** the controller runs, so no Apify/Places/LLM spend is incurred. Done = exceeding the limit from one IP returns 429 with the retry message and no pipeline run; one normal audit still starts.

## Context

**Relevant files:**
- `src/routes/audit.ts:24` — `auditRoutes.post("/start", auditController.startAudit)` is bare. `/retry` already gates via `requireTrackingKey`; `/start` does not.
- `src/middleware/publicRateLimiter.ts` — exports ready-to-use `express-rate-limit` middlewares (e.g. `checkupCreateAccountLimiter` = 1h/5) sharing `RATE_LIMIT_MESSAGE`. Add a dedicated `auditStartLimiter` mirroring that exact pattern.
- `src/routes/checkup.ts` — reference for importing + applying these limiters as route middleware.

**Patterns to follow:**
- Mirror the existing named limiters exactly: `rateLimit({ windowMs, max, standardHeaders: true, legacyHeaders: false, message: RATE_LIMIT_MESSAGE })`.
- Apply as the first route middleware: `auditRoutes.post("/start", auditStartLimiter, auditController.startAudit)`. express-rate-limit rejects over-limit before the handler, so the controller (and the spend) never runs.
- Per-IP keying is express-rate-limit's default and is already how the checkup limiters behave; inherits the app's existing trust-proxy config.

**Reference file:** `src/middleware/publicRateLimiter.ts` — the closest analog; the new limiter is structurally identical to `checkupCreateAccountLimiter`.

## Constraints

**Must:**
- Reject over-limit before the controller (no pipeline spend).
- Threshold generous enough to never block one legitimate doctor; per-IP, 1-hour window, max 10 (a legit doctor runs ~1; 10/hr/IP tolerates retries and shared-IP clinics while stopping a hammering script).
- No new dependency (`express-rate-limit` already in `package.json`).

**Must not:**
- Touch `/retry`, `/status`, or the controller logic.
- Change the audit pipeline.
- Pull in T1–T3 (conversion infra) — that's the parent plan.

## Risk

**Level:** 1

**Risks identified:**
- Shared-IP clinics (several staff behind one NAT) could theoretically approach the cap → **Mitigation:** 10/hr/IP is far above legitimate use (≈1 audit/practice); over-limit returns a clear retry message, not a hard failure.
- `express-rate-limit` default store is in-memory per process → at multi-instance scale the effective cap is per-instance → **Mitigation:** still bounds spend per instance (the cost-DoS goal); a shared store (Redis) can come later if needed. Flagged, not blocking.

**Blast radius:**
- One route gains one middleware. No data, no schema, no other endpoint.

## Tasks

### T1: Add `auditStartLimiter` and apply it to `/start`
**Do:** Add `auditStartLimiter` (1h window, max 10, standard headers, `RATE_LIMIT_MESSAGE`) to `publicRateLimiter.ts`. Import it in `audit.ts` and mount it as the first middleware on the `/start` route.
**Files:** `src/middleware/publicRateLimiter.ts`, `src/routes/audit.ts`
**Depends on:** none (shippable independently / first).
**Verify:** Manual on dev — exceed the limit from one IP, confirm 429 + retry message and **no** pipeline run (no Apify/Places spend in logs); confirm one normal audit still starts.

## Done
- [ ] backend type-check / build passes
- [ ] Manual on dev: over-limit rejected pre-pipeline; one normal audit works.

## Docs Parity
- No dashboard/admin/client UI change. Public API behavior change (over-limit now returns 429). Note in `CHANGELOG.md`; no docs-UI surface to update.
