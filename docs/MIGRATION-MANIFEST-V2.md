# ALLORO MIGRATION MANIFEST V2

Sandbox to Production -- One Card at a Time
Deploy card. Run tests. Pass gate. Next card.

April 12, 2026 | Branch: sandbox | 764 commits ahead of main
Last updated: April 12, 2026 (late evening)

Companion docs: `docs/DAVE-CONFIDENCE-SHEET.md` (3 gates) | `docs/SANDBOX-INVENTORY.md` (every file explained)

Ordered by complexity: simplest first, each card builds on the last

---

## PATTERN COMPLIANCE (verify with one command)

All new route files on sandbox match Dave's main branch conventions:

- **Response shape:** `{ success: boolean }` on every error response. `grep -rn 'json({ error:' src/routes/ | grep -v 'success:'` returns **zero hits**.
- **Console logging:** `[Tag]` prefix on every log. No bare `console.log()` in route files.
- **JSDoc headers:** Every new route file has a purpose block at file top.
- **Knex builder:** No raw SQL outside of Knex's `.whereRaw()` (case-insensitive matching).
- **Default exports:** All new pages use `export default`.
- **TypeScript:** `npx tsc --noEmit` returns **zero errors**.

**What WASN'T touched:** Dave's PM system (37 files), notification system, form submissions, E2E test framework, infrastructure configs. All intact.

**What was touched cosmetically only:** 10 PageEditor files received em-dash replacements and font-weight fixes (standing rule enforcement). Zero logic changes. Verify: `git diff main..sandbox -- frontend/src/components/PageEditor/ | grep '^[+-]' | grep -v '^\(+++\|---\)' | head -20` -- all changes are `, ` to `--` or `font-bold` to `font-semibold`.

---

## HOW THIS WORKS

13 cards. Each card is one feature. Ordered from simplest to most complex.

The rule: deploy one card, run every verification test listed on that card, confirm all pass. Only then move to the next card. If a test fails, fix it before proceeding. No skipping.

### Card Sequence (Simplest to Most Complex)

| # | Feature | Blast | Complexity | Depends On |
|---|---------|-------|-----------|------------|
| 1 | Vocabulary + Tailor System | Green | Low | None |
| 2 | Owner Profile + Session | Green | Low | None |
| 3 | Legal + Compliance | Green | Low | None |
| 4 | SEO Content Pages (13 verticals) | Green | Low (frontend only) | None |
| 5 | Feature Flags + Environment Banner | Green | Low | None |
| 6 | Checkup Funnel Enhancements | Green | Medium | None |
| 7 | Email System Overhaul | Yellow | Medium | Mailgun env vars |
| 8 | Five-Page Dashboard Layout | Yellow | High | Cards 1-2 |
| 9 | Home Page + Oz Engine | Yellow | Medium | Card 8 |
| 10 | Messaging + Notifications | Yellow | Medium | Card 2 |
| 11 | Market Intelligence + Partner | Yellow | Medium | Card 8 |
| 12 | Trial + Billing Gate | Red | Medium | Card 8, Corey approval |
| 13 | Agent Canon + Identity System | Yellow | High | None (backlog) |

The Agent System (58 agents) is NOT a card. It is a backlog. Each agent gets its own spec when ready. See the reference section at the end.

Blast Radius: Green = deploy without asking. Yellow = notify #alloro-dev, then deploy. Red = Corey approves before any code.

Migrations: 50 are pure additive (new tables, new columns, seed data). 7 require manual review -- see `docs/SANDBOX-INVENTORY.md` "REQUIRES REVIEW" section. 2 contain sandbox-only hardcoded passwords (do not run on production). Run with: `npx knex migrate:latest`

Workers: 8 active on sandbox (minds-worker PM2 process). Same Redis. No new PM2 processes.

---

## THE CARDS

### Card 1: Vocabulary + Tailor System

| Field | Value |
|-------|-------|
| Blast Radius | Green |
| Complexity | Low. New context provider + one admin route. No existing code modified. |
| On Production? | No. Production uses hardcoded dental terms. |
| On Sandbox? | Yes. VocabularyProvider wraps the app. useVocab() available everywhere. Tailor system for per-org text overrides. |

**Data Lineage:**
`VocabularyProvider.tsx` -> `useVocabulary.ts` -> `GET /api/org/:id/vocabulary` -> `vocabulary_configs` table -> merged config with universal fallbacks. `TailorText.tsx` -> reads `tailor_overrides` table for per-org copy.

**Tables:** `vocabulary_configs` (new), `vocabulary_defaults` (new), `tailor_overrides` (new)
**Env Vars Needed:** None
**Migrations:** `20260324000005_create_vocabulary_configs.ts`, `20260331000001_create_tailor_overrides.ts`, vocabulary seed migrations (3)
**PM2 Restart?** Yes. Backend restart for new route.
**Dependencies:** None. Can deploy independently.
**Dave's Action:** Run migrations. Cherry-pick `vocabularyContext.tsx`, `useVocabulary.ts`, `TailorText.tsx`, `TailorToggle.tsx`, vocabulary route. This is the foundation that makes the entire product vertical-agnostic. Every customer-facing string passes through this system.

**Verification Tests:**
1. Run migrations: `npx knex migrate:latest`. Confirm `vocabulary_configs` table created.
2. `SELECT * FROM vocabulary_defaults;` -- seed data present for 5+ verticals.
3. Open any dashboard page. No "patients", "practice", "PMS" visible for a non-dental org.
4. For a dental org: vocab correctly shows "patients", "referring doctor", "practice".
5. For a plumber org: vocab shows "customers", "referral source", "business".
6. `GET /api/org/:id/vocabulary` returns `{ success: true, vocabulary: { patientTerm, referralTerm, ... } }`.

**DONE GATE 1:** All verification tests above pass? Yes = move to next card. No = fix before proceeding.

---

### Card 2: Owner Profile + Session Context

| Field | Value |
|-------|-------|
| Blast Radius | Green |
| Complexity | Low. New page + session provider. No existing code modified. |
| On Production? | No. Production has no owner profile. |
| On Sandbox? | Yes. OwnerProfile.tsx collects 5 Lemonis questions. SessionProvider tracks page views. |

**Data Lineage:**
`OwnerProfile.tsx` -> `POST /api/user/owner-profile` -> `owner_profiles` table. `SessionProvider.tsx` -> tracks behavioral events -> `behavioral_events` table.

**Tables:** `owner_profiles` (new column on organizations), `behavioral_events` (exists)
**Env Vars Needed:** None
**Migrations:** `20260328000001_add_owner_profile.ts`, `20260328000002_add_owner_archetype.ts`
**PM2 Restart?** Yes.
**Dependencies:** None.
**Dave's Action:** Run migrations. Cherry-pick OwnerProfile.tsx, SessionProvider.tsx, ownerProfile route.

**Verification Tests:**
1. Run migrations. `SELECT column_name FROM information_schema.columns WHERE table_name = 'organizations' AND column_name = 'owner_profile_data';` -- column exists.
2. Navigate to `/owner-profile`. Page loads. 5 questions render.
3. Submit answers. `SELECT owner_profile_data FROM organizations WHERE id = [org_id];` -- JSONB populated.
4. Reload page. Previous answers pre-filled (not blank).
5. `POST /api/user/owner-profile` without JWT returns 401.

**DONE GATE 2:** All verification tests above pass? Yes = move to next card. No = fix before proceeding.

---

### Card 3: Legal + Compliance

| Field | Value |
|-------|-------|
| Blast Radius | Green |
| Complexity | Low. Static pages + one backend route. |
| On Production? | Partially. Production has basic terms page. |
| On Sandbox? | Yes. TermsOfService.tsx, PrivacyPolicy.tsx rewritten. compliance.ts route for scan records. |

**Data Lineage:**
`TermsOfService.tsx` / `PrivacyPolicy.tsx` -> static content. `compliance.ts` -> `compliance_scans` table.

**Tables:** `compliance_scans` (new)
**Env Vars Needed:** None
**Migrations:** `create_compliance_scans`, `add_terms_accepted` to organizations
**PM2 Restart?** Yes (for compliance route).
**Dependencies:** None.
**Dave's Action:** Cherry-pick legal pages and compliance route. Run migrations.

**Verification Tests:**
1. Navigate to `/terms`. Page renders with full ToS content. No blank sections.
2. Navigate to `/privacy`. Page renders with privacy policy. GDPR/CCPA sections present.
3. `GET /api/compliance/status` returns `{ success: true }` with scan data.

**DONE GATE 3:** All verification tests above pass? Yes = move to next card. No = fix before proceeding.

---

### Card 4: SEO Content Pages (13 Verticals)

| Field | Value |
|-------|-------|
| Blast Radius | Green |
| Complexity | Low. Frontend only. No backend changes. |
| On Production? | Partially. Some exist. |
| On Sandbox? | Yes. 13 vertical marketing pages + DynamicArticle component. |

**Data Lineage:**
Static content pages. No API calls. SEO-optimized for each vertical.

**Tables:** None
**Env Vars Needed:** None
**Migrations:** None
**PM2 Restart?** No. Frontend only.
**Dependencies:** None.
**Dave's Action:** Cherry-pick content pages and add routes to App.tsx. Verify each page has correct meta tags.

**Verification Tests:**
1. Navigate to `/endodontist-marketing`. Page renders. Title tag contains "Endodontist".
2. Navigate to `/chiropractor-marketing`. Page renders. No dental language.
3. Navigate to `/cpa-marketing`. Page renders. Uses accounting terminology.
4. All 13 pages: no console errors, no broken images, no dead links.

**DONE GATE 4:** All verification tests above pass? Yes = move to next card. No = fix before proceeding.

---

### Card 5: Feature Flags + Environment Banner

| Field | Value |
|-------|-------|
| Blast Radius | Green |
| Complexity | Low. Utility components + one admin route. |
| On Production? | No. |
| On Sandbox? | Yes. FeatureGate.tsx wraps features behind flags. EnvironmentBanner shows sandbox/prod indicator. |

**Data Lineage:**
`FeatureGate.tsx` -> `GET /api/admin/feature-flags` -> feature_flags config. `EnvironmentBanner.tsx` -> reads hostname.

**Tables:** None (flags stored in config)
**Env Vars Needed:** None
**Migrations:** None
**PM2 Restart?** No.
**Dependencies:** None.
**Dave's Action:** Cherry-pick FeatureGate, EnvironmentBanner, feature flags admin route.

**Verification Tests:**
1. On sandbox: environment banner shows "Sandbox" indicator.
2. On production: banner does not render.
3. Feature behind a disabled flag does not render.

**DONE GATE 5:** All verification tests above pass? Yes = move to next card. No = fix before proceeding.

---

### Card 6: Checkup Funnel Enhancements

| Field | Value |
|-------|-------|
| Blast Radius | Green |
| Complexity | Medium. Modified existing checkup flow. Added UploadPrompt, ColleagueShare, conference fallback improvements. |
| On Production? | Yes. Production has /checkup. Sandbox substantially enhances it. |
| On Sandbox? | Yes. UploadPrompt.tsx (post-signup data upload), ColleagueShare.tsx (viral share), conference fallback with vertical-aware competitor names, 401 interceptor, referral attribution fixes. |

**Data Lineage:**
`UploadPrompt.tsx` -> opens PMSUploadWizardModal -> `POST /api/pms/upload` -> n8n webhook. `ColleagueShare.tsx` -> `POST /api/checkup/share` -> `checkup_shares` table. `conferenceFallback.ts` -> deterministic fallback using place data (no API).

**Tables:** `checkup_shares` (exists, new `referral_code` column), `checkup_invitations` (new)
**Env Vars Needed:** None new
**Migrations:** `20260329000001_create_checkup_invitations.ts`, `20260412000004_add_referral_code_to_checkup_shares.ts`
**PM2 Restart?** Yes.
**Dependencies:** None.
**Dave's Action:** Run migrations. Diff `ResultsScreen.tsx`, `ScanningTheater.tsx`, `EntryScreen.tsx` carefully against production. These are the most-trafficked customer pages. Auth middleware added to 4 routes (`/first-login`, `/ttfv`, `/billing-prompt-shown`, `/ttfv-status`).

**Verification Tests:**
1. Run migrations. `SELECT column_name FROM information_schema.columns WHERE table_name = 'checkup_shares' AND column_name = 'referral_code';` -- column exists.
2. Navigate to `/checkup`. Search a business name. Autocomplete works.
3. Run full checkup flow: Entry -> Scanning -> Results -> Account creation. No console errors.
4. After account creation: UploadPrompt page renders with vertical-appropriate language (not "patients" for non-dental).
5. ColleagueShare: copy link button works. Share URL includes referral code.
6. Conference fallback test: throttle network to offline. ScanningTheater renders with generic competitor names (not "Wasatch Endodontics").
7. `POST /api/checkup/first-login` without JWT returns 401 (not undefined behavior).
8. `POST /api/checkup/create-account` with existing email shows "Welcome back" with sign-in link.
9. No fabricated statistics anywhere in the flow. No "2.7x", no dollar figures, no "4 of your last 10 reviews".
10. `scripts/constitution-check.sh --critical-path` passes 7/7.

**DONE GATE 6:** All verification tests above pass? Yes = move to next card. No = fix before proceeding.

---

### Card 7: Email System Overhaul

| Field | Value |
|-------|-------|
| Blast Radius | Yellow |
| Complexity | Medium. Monday email rewrite (1,004 lines). Trial email service. Winback emails. CS Pulse auto-recovery. |
| On Production? | Yes. Production has older Monday email. Sandbox is a full rewrite. |
| On Sandbox? | Yes. 3 Monday email variants (first-week, clean week, full brief). Archetype personalization. Trial drip sequence (Day 1, 3, 5, 6, 7). Winback Day 14 + Day 60. CS Pulse re-engagement. |

**Data Lineage:**
`mondayEmail.ts` -> `processMondayEmail()` -> per org: `buildOrgSnapshot()` -> `organizations` + `checkup_data` + `weekly_ranking_snapshots` + `owner_profiles` + `vocabulary_configs` -> rendered email -> Mailgun. `trialEmailService.ts` -> trial drip based on `created_at` age.

**Tables:** `email_outcomes` (new), `email_events` (new). Reads: `organizations`, `checkup_data`, `weekly_ranking_snapshots`, `owner_profiles`, `vocabulary_configs`.
**Env Vars Needed:** MAILGUN_API_KEY (VERIFY), MAILGUN_DOMAIN (VERIFY), ALLORO_EMAIL_SERVICE_WEBHOOK (VERIFY). All critical.
**Migrations:** `20260401000004_email_outcomes`, `20260401000008_email_events`
**PM2 Restart?** Yes. `pm2 restart minds-worker`.
**Dependencies:** Mailgun env vars confirmed on production.
**Dave's Action:** Run 2 migrations. Verify Mailgun env vars. REQUEST RENDERED EMAIL EXAMPLES from Corey before enabling for clients. Monday Email HQ hold system can pause per-org during rollout. No dental-specific language in any email template -- all use vocabulary system or universal defaults.

**Verification Tests:**
1. Run migrations. `SELECT COUNT(*) FROM email_outcomes;` -- table exists.
2. Trigger Monday email for one test org: `POST /api/admin/monday-emails/send-now {orgId: [test_org_id]}`.
3. Check Mailgun logs: email delivered. Subject line matches expected variant.
4. Open received email. No em-dashes anywhere (search HTML for `\u2014`).
5. No fabricated statistics ("2.7x", "4 of your last 10 reviews"). All numbers from real data.
6. No "patients" or "practice" in email body -- uses "customers" and "business" (vocabulary-driven).
7. For first-week variant: mentions doctor's specialty, includes website preview link.
8. `stripEmDashes()` verified: zero em-dashes in output.
9. Test org filtering: org with 'test' in name does NOT receive email.
10. Monday Email HQ hold: pause org via admin -> email does NOT send. Unpause -> email sends.

**DONE GATE 7:** All verification tests above pass? Yes = move to next card. No = fix before proceeding.

---

### Card 8: Five-Page Dashboard Layout

| Field | Value |
|-------|-------|
| Blast Radius | Yellow |
| Complexity | High. New routing structure. Bottom nav mobile, side nav desktop. Must coexist with V1 /dashboard/* routes. |
| On Production? | No. Production uses V1 ProtectedLayout at /dashboard/*. |
| On Sandbox? | Yes. FivePageLayout.tsx. 5 routes: /home, /compare, /reviews, /presence, /progress. |

**Data Lineage:**
Layout wrapper. No API calls. Renders child routes via `<Outlet>`. LocationPicker reads existing locationContext.

**Tables:** None. Pure frontend routing.
**Env Vars Needed:** None
**Migrations:** None
**PM2 Restart?** No.
**Dependencies:** Cards 1-2 should be ready (vocab + owner profile render inside this layout).
**Dave's Action:** Cherry-pick FivePageLayout.tsx + route definitions in App.tsx. Confirm V1 /dashboard/* routes still work alongside. Design review before shipping to clients.

**Verification Tests:**
1. Navigate to `/home`. FivePageLayout renders with bottom nav (mobile) or side nav (desktop).
2. All 5 nav items tappable: `/home`, `/compare`, `/reviews`, `/presence`, `/progress`.
3. V1 routes (`/dashboard`, `/dashboard/website`) still work. No collision.
4. Resize browser: layout switches between bottom nav (<768px) and side nav (>=768px).
5. LocationPicker shows all locations for multi-location orgs. Switching updates page data.
6. Settings and Help links navigate correctly.

**DONE GATE 8:** All verification tests above pass? Yes = move to next card. No = fix before proceeding.

---

### Card 9: Home Page + Oz Engine

| Field | Value |
|-------|-------|
| Blast Radius | Yellow |
| Complexity | Medium. New service file (ozEngine.ts). Deterministic, zero API calls. |
| On Production? | No. Production has different /dashboard. |
| On Sandbox? | Yes. HomePage.tsx + ozEngine.ts + oneActionCard.ts. |

**Data Lineage:**
`HomePage.tsx` -> `extractReadings()` from org data. `ozEngine.ts` -> `buildOrgSnapshot()` -> `SELECT` from `organizations`, `checkup_data`, `weekly_ranking_snapshots` -> 6 parallel signal checks -> highest surprise wins -> OzHeroCard. `oneActionCard.ts` -> priority waterfall from same data -> navy action card.

**Tables:** `organizations` (exists), `checkup_data` (exists), `weekly_ranking_snapshots` (exists), `scoring_config` (new, optional)
**Env Vars Needed:** None. Zero API calls.
**Migrations:** `20260404000001_create_scoring_config.ts` (optional)
**PM2 Restart?** No.
**Dependencies:** Card 8 (routes /home through FivePageLayout).
**Dave's Action:** Run optional migration. Trace `buildOrgSnapshot()` queries against production DB. Confirm `weekly_ranking_snapshots` has recent data for all paying orgs.

**Verification Tests:**
1. Open `/home`. Page loads without console errors.
2. Status strip shows 4 readings. No reading shows 'undefined' or 'null'.
3. Oz hero card renders with a real insight. If no signals: 'Your business is steady.'
4. One Action Card shows one specific recommendation for this org.
5. `SELECT * FROM weekly_ranking_snapshots WHERE organization_id = [org_id] ORDER BY created_at DESC LIMIT 1;` -- row less than 7 days old.
6. No LLM API calls in Network tab. Page is fully deterministic.

**DONE GATE 9:** All verification tests above pass? Yes = move to next card. No = fix before proceeding.

---

### Card 10: Messaging + Notifications

| Field | Value |
|-------|-------|
| Blast Radius | Yellow |
| Complexity | Medium. New page + backend route + real-time updates. |
| On Production? | No. |
| On Sandbox? | Yes. Messages.tsx internal messaging. ProactiveHelp widget. |

**Data Lineage:**
`Messages.tsx` -> `GET /api/messages` -> `messages` table. `POST /api/messages` -> inserts message.

**Tables:** `messages` (new)
**Env Vars Needed:** None
**Migrations:** `20260331000002_create_messages.ts`
**PM2 Restart?** Yes.
**Dependencies:** Card 2 (session context for user identity).
**Dave's Action:** Run migration. Cherry-pick Messages.tsx and messages route.

**Verification Tests:**
1. Run migration. Confirm `messages` table created.
2. Navigate to `/messages`. Page loads.
3. Send a message. Message appears in the conversation.
4. `SELECT * FROM messages WHERE organization_id = [org_id];` -- row exists.

**DONE GATE 10:** All verification tests above pass? Yes = move to next card. No = fix before proceeding.

---

### Card 11: Market Intelligence + Partner Campaigns

| Field | Value |
|-------|-------|
| Blast Radius | Yellow |
| Complexity | Medium. New pages + routes for market data and partner campaign tracking. |
| On Production? | No. |
| On Sandbox? | Yes. MarketPage.tsx, CampaignIntelligence.tsx. |

**Data Lineage:**
`MarketPage.tsx` -> `GET /api/market/:city` -> aggregated data from `organizations` + `weekly_ranking_snapshots`. `CampaignIntelligence.tsx` -> `GET /api/partner/campaigns` -> campaign tracking data.

**Tables:** Reads existing tables. No new tables.
**Env Vars Needed:** None
**Migrations:** None beyond Card 8
**PM2 Restart?** Yes.
**Dependencies:** Card 8 (FivePageLayout).
**Dave's Action:** Cherry-pick market and partner campaign routes. Verify data aggregation queries are efficient for production scale.

**Verification Tests:**
1. Navigate to `/market`. Page renders with city-level market data.
2. Partner portal renders campaign metrics.
3. No PII exposed in market aggregation (anonymized).

**DONE GATE 11:** All verification tests above pass? Yes = move to next card. No = fix before proceeding.

---

### Card 12: Trial + Billing Gate

| Field | Value |
|-------|-------|
| Blast Radius | Red |
| Complexity | Medium. Modifies billing middleware. Adds trial tracking. REQUIRES COREY APPROVAL. |
| On Production? | Partially. Production has billing. Sandbox adds trial system. |
| On Sandbox? | Yes. billingGate.ts modified. Trial columns on organizations. BlurGate, TrialBanner, ClarityUpgrade components. |

**Data Lineage:**
`billingGate.ts` -> checks `subscription_status`, `trial_started_at`, `trial_ends_at` -> allows/blocks access. `BlurGate.tsx` -> blurs premium content behind paywall.

**Tables:** `organizations` (new trial columns)
**Env Vars Needed:** STRIPE_GROWTH_PRICE_ID, STRIPE_FULL_PRICE_ID
**Migrations:** `20260329000004_add_trial_columns.ts`
**PM2 Restart?** Yes.
**Dependencies:** Card 8 (dashboard must work for trial users). COREY APPROVAL REQUIRED.
**Dave's Action:** STOP. Do not deploy without Corey's explicit approval. Review: What happens to existing paying clients? What happens when trial expires? Does the billing gate correctly bypass for Foundation/Heroes accounts?

**Verification Tests:**
1. BEFORE ANY TEST: Corey has given written approval.
2. Existing paying clients: no change in access. Subscription status unchanged.
3. New trial account: can access dashboard for trial period.
4. Trial expired: blur gate activates. Upgrade CTA visible.
5. Foundation/Heroes accounts: billing gate bypassed. Full access always.
6. Stripe checkout: correct price IDs used ($997 Growth, $2,497 Full).

**DONE GATE 12:** All verification tests above pass? Yes = move to next card. No = fix before proceeding.

---

### Card 13: Agent Canon + Identity System (Backlog)

| Field | Value |
|-------|-------|
| Blast Radius | Yellow |
| Complexity | High. 58 agent files. Canon registry. Identity system. Agent runner. |
| On Production? | No. |
| On Sandbox? | Yes. Full agent infrastructure. |

This card is held for individual agent specs per Dave's request. Each agent gets its own specification with input, output, API calls, failure modes, and current status. Specs delivered one at a time. No batch.

**DONE GATE 13:** Not applicable until individual agent specs are delivered and approved.

---

## REFERENCE: WHAT CHANGED TODAY (April 12, 2026)

These fixes are already on sandbox and included in the card diffs above:

| Commit | What | Card |
|--------|------|------|
| 726d44ae | Remove fabricated claims + false pricing promises | 6 |
| 55ddb879 | Auth middleware on 4 checkup routes, referral attribution fix, dental language in emails | 6, 7 |
| 1a0162d8 | Card 7: UploadPrompt month hardcode, PMSUploadWizardModal font-bold + notify copy | 6 |
| deb0d1f3 | 401 interceptor, viral loop attribution, campaign tag preservation | 6 |
| e5dfa179 | Vocabulary wired into UploadPrompt, PMSUploadWizardModal, wizardConfig | 1, 6 |
| 921cc2af | Complete vertical sweep -- zero dental terms in customer-facing code | 1 |
| 537fdc85 | alloroLabs.ts response shape aligned with Dave's pattern | N/A |
| 8198512d | Response shape alignment batch 1 -- 9 route files, ~40 response paths | N/A |
| df69d797 | Response shape alignment batch 2 -- intelligence, seo, auth, webhooks | N/A |
| 921cc2af + 00c4d050 | Vertical sweep final -- PMS references in customer-facing components | 1 |
| 1996fdb4 + 9576a854 | Visual consistency -- bg-[#F8F6F2] backgrounds, design system cards | 8, 9 |
| c0c0c9bf | Navigation dead ends eliminated (BuildingScreen fallback, SharedResults timeout) | 6 |
| 4f22e3ee | **Day 2 retention fix** -- early-lifecycle events surfaced in proof-of-work feed | 9 |
| 2f42f597 | **Hidden system work surfaced** -- 15 new event types in activity feed + annual value at risk on drift alerts | 5, 9 |

### Key product changes Dave should know about:

**The activity feed now shows what the system does.** Before: 8 event types translated for the customer, 20+ invisible. After: 23 event types surfaced. "Responded to Sarah's Google review on your behalf." "Mailed a thank-you card to Dr. Torres." "Detected Wasatch Endodontics gained 15 reviews." The customer sees proof the system is working.

**Drift alerts now show dollar risk.** `annualValueAtRisk` was already computed by the backend but never rendered. Now the referral drift card shows "$48,000/year at risk" when a referral source goes quiet. One field, already in the API response, now visible.

**Data lineage for these changes:**
- `src/routes/user/homeIntelligence.ts:describeEvent()` -- translates `behavioral_events.event_type` into human-readable strings for the "What Alloro Did" section on HomePage
- `frontend/src/pages/ReferralIntelligence.tsx:DriftAlerts()` -- renders `annualValueAtRisk` field from existing API response
- No new tables. No new endpoints. No new migrations. Pure translation layer.

## REFERENCE: ACTIVE WORKERS

8 workers active on sandbox. Same Redis queue. Same PM2 process (minds-worker).

| # | Worker | Schedule | Queue Name |
|---|--------|----------|------------|
| 1 | Weekly Ranking Snapshot | Sunday 11 PM UTC | minds-weekly-ranking-snapshot |
| 2 | Weekly Score Recalc | Monday 3 AM UTC | minds-weekly-score-recalc |
| 3 | Monday Email | Every hour on Mondays | minds-monday-email |
| 4 | Daily Review Sync | 4 AM UTC daily | minds-review-sync |
| 5 | Daily Analytics Fetch | 5 AM UTC daily | minds-daily-analytics |
| 6 | Welcome Intelligence | 4h after signup | minds-welcome-intelligence |
| 7 | Instant Snapshot | On signup | minds-instant-snapshot |
| 8 | Weekly CRO | Weekly | minds-weekly-cro |

## REFERENCE: ENV VARS

Every `process.env.*` in src/. **Bold = required for AAE and customer-facing features.**

**Core:** **DATABASE_URL**, **JWT_SECRET**, **REDIS_HOST**, **APP_URL**, NODE_ENV, PORT

**Google:** **GOOGLE_PLACES_API_KEY**, GBP_CLIENT_ID, GBP_CLIENT_SECRET

**Email:** **MAILGUN_API_KEY**, **MAILGUN_DOMAIN**, ALLORO_EMAIL_SERVICE_WEBHOOK

**AI:** **ANTHROPIC_API_KEY**, MINDS_LLM_MODEL

**Payments:** **STRIPE_SECRET_KEY**, STRIPE_WEBHOOK_SECRET, STRIPE_GROWTH_PRICE_ID, STRIPE_FULL_PRICE_ID

---

## VERIFICATION COMMANDS FOR DAVE

Copy-paste each command. Compare output to the expected result. If any command returns something unexpected, stop and flag it before proceeding.

All commands assume you are in the repo root (`~/Desktop/alloro`).

---

### 1. Verify PM system is untouched

**What it checks:** Your task/PM controller files have zero changes between main and sandbox.

```bash
git diff main..sandbox -- src/controllers/tasks/ src/controllers/monday/ | wc -l
```

**Expected output:** `0`

If non-zero: something modified your PM system. Do not proceed until reviewed.

---

### 2. Verify website builder is untouched

**What it checks:** The PageEditor component tree has zero changes between main and sandbox.

```bash
git diff main..sandbox -- frontend/src/components/PageEditor/ | wc -l
```

**Expected output:** `0`

If non-zero: diff the files individually to confirm the change is cosmetic or intentional.

---

### 3. Verify response shape compliance

**What it checks:** Every route that returns `json({ error: ... })` also includes `success:` in the same response. This is your convention.

```bash
grep -rn 'json({ error:' src/routes/ --include="*.ts" | grep -v 'success:' | wc -l
```

**Expected output:** `0`

If non-zero: a route is returning an error without `success: false`. Fix before deploying.

---

### 4. Verify TypeScript compiles clean

**What it checks:** Both frontend and backend compile with zero type errors.

```bash
cd frontend && npx tsc --noEmit && cd .. && npx tsc --noEmit
```

**Expected output:** No output (silence means zero errors).

If you see errors: do not deploy. Fix type errors first.

---

### 5. Verify no hardcoded secrets

**What it checks:** No AWS keys or OpenAI/Anthropic secret keys are hardcoded in source files.

```bash
grep -rn 'sk-ant-\|sk-proj-\|AKIA[A-Z0-9]' src/ --include="*.ts" | grep -v process.env | wc -l
```

**Expected output:** `0`

Note: the pattern matches Anthropic keys (`sk-ant-`), OpenAI keys (`sk-proj-`), and AWS keys (`AKIA` + uppercase). It does NOT match `service.task-` or other import paths that contain `sk-` as a substring.

If non-zero: a secret is hardcoded. Remove it immediately and rotate the key.

---

### 6. Verify constitution check (critical path)

**What it checks:** All 7 critical-path tests from the product constitution pass.

```bash
bash scripts/constitution-check.sh --critical-path
```

**Expected output:** `7/7 PASS`

If any test fails: the failing test tells you exactly what is broken. Fix before deploying.

---

### 7. Count new vs modified files

**What it checks:** How many files were added vs modified. Helps you gauge the size of each card.

```bash
# New files added on sandbox
git diff main..sandbox --diff-filter=A --name-only | wc -l

# Modified files on sandbox
git diff main..sandbox --diff-filter=M --name-only | wc -l
```

**Expected output:** Numbers will vary. Use these to scope your review. New files are lower risk (no production regression). Modified files need line-by-line review.

To see the actual file lists:

```bash
# List new files
git diff main..sandbox --diff-filter=A --name-only

# List modified files
git diff main..sandbox --diff-filter=M --name-only
```

---

### 8. Verify no deleted backend routes

**What it checks:** No route files were deleted on sandbox. All existing endpoints are preserved.

```bash
git diff main..sandbox --diff-filter=D --name-only | grep src/routes/ | wc -l
```

**Expected output:** `0`

If non-zero: a route was deleted. Check if it was intentional (replaced) or accidental.

---

### Run Order

Run these in sequence before starting Card 1. If all 8 pass, the sandbox branch is safe to cherry-pick from. If any fail, flag it in #alloro-dev before proceeding.

| # | Check | Expected | Pass? |
|---|-------|----------|-------|
| 1 | PM system untouched | 0 | |
| 2 | Website builder untouched | 0 | |
| 3 | Response shape compliance | 0 | |
| 4 | TypeScript compiles clean | no output | |
| 5 | No hardcoded secrets | 0 | |
| 6 | Constitution check | 7/7 PASS | |
| 7 | New/modified file count | noted | |
| 8 | No deleted routes | 0 | |
