# MAGIC Operational — Dave's Complete Build Handoff

*2026-07-08. Everything needed to build the value levers that make the end-to-end done-for-you journey (search -> submission) actually DELIVER value, not just recommend it. Grounded in the Connect audits (file:lines below). This is the single source; per-lever briefs included.*

## THE STANDARD (non-negotiable)
Every lever runs WITHOUT a human touching the account (the Slack/Zoom/Claude standard). Economics are fixed-cost: more customers is NOT more expense, growth = profit past ~6 customers, ONLY if delivery is automated. Owner approves once where there's outbound, then it runs. Any lever that needs a human per customer is re-scoped until it doesn't.

## FEASIBILITY GATE — can Alloro even do this today? (verified against origin/dev/dave, 2026-07-08)
Before effort-tiering, the blunter question: does Alloro HAVE the access each lever requires? Three of the nine do NOT, and they cluster on one truth: **Alloro cannot reach or transact with a customer's customers today** — no patient/consumer contact roster, no scheduler write-access, no phone service. Those are not "unbuilt"; they are BLOCKED until Alloro acquires that access, at any effort.

**A — IN ALLORO'S CONTROL NOW (build + prove today, no new access):**
- GSC->content (1): GSC query data is present (`service.gsc-performance.ts:110` `readQueryRows`, clicks/impressions), content generators present. Only the wiring is missing.
- Form security (2): internal toggles; `sender_ip` + index already in the schema.
- Speed-to-lead (6): CONFIRMED. The generated contact form collects name/phone/email/service/message (`emailTemplateBuilder.ts` EmailData), the controller extracts the lead's email (`formSubmissionController.ts:76`, "extract the first email-like value"), and `sendEmail` (`emailService.ts`) sends to any recipient, so Alloro can auto-reply to the lead today. Edge case only: a custom form with no email field degrades to nothing-to-reply-to, not a blocker.
- Reflect decouple (9): internal pipeline (`service.monthly-agent-processor.ts`), no external access.
- Web-attribution HALF of (8): a session tracker with UTM/referrer exists (`LeadgenSessionModel`) but is scoped to Alloro's OWN audit funnel; the customer form captures only `sender_ip`. Adding capture to customer forms needs no new access.

**B — BUILDABLE WITH AN EXTERNAL KEY ALLORO CAN BUY ALONE (no customer cooperation):**
- AEO monitoring (4): needs an OpenAI/Gemini/Perplexity API key (Alloro's only LLM today is Anthropic).
- Keyword research (5): needs a DataForSEO/SEMrush/Ahrefs key (Alloro's SerpApi is Maps-rank only, not volume/difficulty).

**C — BLOCKED ON ACCESS ALLORO DOES NOT HAVE (cannot build today, at any effort, until acquired):**
- Review requests (3): Alloro holds NO patient/consumer contact list (`review_request.sent` exists only as an event weight in `behavioralIntelligence.ts:23`; PMS import is aggregate-only, no patient email/phone) and has NO send-to-patient channel. Requires acquiring the practice's patient roster + a consumer channel, with consent.
- Booking (7): NO scheduler integration of any kind (no Calendly/Acuity/NexHealth, no availability read, no appointment write). Requires a write connection into the customer's scheduling/PMS.
- Call-tracking (8, phone half): NO telephony integration (zero Twilio/Vonage/Plivo/etc. in the codebase). Tracking phone calls is impossible without provisioning tracking numbers. The web-attribution half is A-buildable; the lever as posed is gated by the phone half.

**What this changes:** the build order is FEASIBLE-first, not just cheap-first. Ship + prove the A levers now (they sit in Alloro's own data); buy the keys for B when they're worth it; treat C as a SEPARATE strategy/cost decision for Corey — "do we acquire the phone service / patient-roster + consent channel / scheduler integration?" — NOT a build task Dave can start. A C lever written as a build task is the done-for-you promise running ahead of the access.

## PRIORITY (accessibility x value-shown)
- Tier 1 (cheap, in-repo, no dependency, shows value): GSC->content loop; re-enable form security; [Reflect decouple - PARKED].
- Tier 1b (value levers, owner-approved, no customer system): review requests; AEO; real keyword research.
- Tier 2 (design first): speed-to-lead.
- Tier 3 (external dependency, later): booking; attribution/call-tracking.

## PER-LEVER BUILD BRIEFS

### 1. GSC -> content loop  [Tier 1, cleanest first]
- WHAT: use the real Google search-demand Alloro ALREADY collects as the content keyword targets, instead of LLM-invented guesses.
- WHY: cheapest keyword fix; the demand data is already in-house; targets go guessed -> real.
- FILES: the GSC integration service is `src/controllers/admin-websites/feature-services/service.gsc-integration.ts` (collects a 16-month history — `GSC_HISTORY_MONTHS` at `:17` — via the `historic-gsc-backfill` job at `:527`; trace the stored query/click/impression rows from there). NOTE: the data is NOT at `:274` (that line is `fetchSites`, the Search Console client init). Target queries are currently LLM-invented at `SeoGeneration.geo-layer.md` + `service.specialty-identifier.ts`.
- CHANGE: feed the org's top GSC queries into the target-query selection for content/SEO generation; rank/replace the LLM guesses by real demand.
- DONE-WHEN: generated pages target queries that appear in the org's actual GSC demand, verified on one real org.
- AUTOMATION: runs inside the existing generation pipeline, no human.

### 2. Re-enable form anti-spam/rate-limit  [Tier 1, live exposure]
- FILES: `formSubmissionController.ts:212-240` (honeypot/timing/JS-challenge/flood/dup commented out); `routes/websiteContact.ts:40` (rate limiter commented out).
- CHANGE: re-enable the guards (disabled "for debugging").
- DONE-WHEN: the pipeline runs; a spam-pattern submission is blocked.

### 3. Review requests  [Tier 1b, most-proven lever in the market]
- WHAT: owner-approved automated request asking a customer for a review.
- WHY: single most-proven lever (all 9 players); lifts review count -> rank + AI-citation.
- FILES: review REPLIES already exist (`gbp-write.service.ts:81`, the write path + approval pattern to mirror); requests are NEW.
- CHANGE: build a review-request sender (email via central sendEmail, and/or SMS via a provider) triggered on a completed visit; owner approves the template ONCE, then auto-sends per new customer.
- DONE-WHEN: requests send on trigger; review count lifts on a real org.
- HONESTY: owner-approved (Option B); never auto-send unsolicited; never fabricate.
- AUTOMATION: owner approves the template once, then fully automated.

### 4. AEO / AI-visibility  [Tier 1b, the wedge]
- WHAT: monitor + improve how the business appears in AI answer engines (ChatGPT/Gemini/Perplexity/Google AI Overviews).
- WHY: only 2 competitors hold it; the wave (45% now search via AI).
- FILES: ZERO today (grep AEO/answer-engine/perplexity/AI-Overview = 0; `ai-seo-audit/` scores the business's OWN pages via Google organic, no answer-engine loop).
- CHANGE: (a) MONITOR - query the AI engines for "[category] in [city]" prompts, detect if/where the business is cited, track over time; (b) OPTIMIZE - the on-page source-readiness (FAQ/schema) `ai-seo-audit` already scores.
- DONE-WHEN: the owner sees "cited in [engine] for [prompt]" tracked over time on one real org.
- AUTOMATION: scheduled monitor + auto on-page fixes, no human.
- NOTE: a real new build, bigger than the others.

### 5. Real keyword research + selection  [Tier 1b, = SEO crossover #32]
- Real demand-backed keyword research + selection, cached per vertical x metro (~85/mo, NOT per-client). Full design in task #32: cache once per vertical x area (DataForSEO Google Ads endpoint, or free Keyword Planner ranges), compute per-client winnability at read time. Superset of the GSC loop (#1).

### 6. Speed-to-lead  [Tier 2, DESIGN FIRST]
- WHAT: an instant, SUBSTANTIVE auto-response to a submission - the next step / an answer / a booking, NOT "we'll call you soon."
- FILES: today the lead gets NOTHING; only the practice is emailed (`formSubmissionController.ts:522`).
- DESIGN FIRST: a hollow auto-reply is worse than silence. Design what a valuable instant response says before building.
- AUTOMATION: automated per submission once designed.

### 7. Booking / scheduling  [Tier 3, external dependency]
- FILES: absent; `htmlValidator.ts:438` forces every CTA to /contact; no PMS appointment write-back.
- CHANGE: integrate a scheduler (or build booking) + capture the booking event. External dependency.

### 8. Attribution / call-tracking  [Tier 3, partly external]
- FILES: `FormSubmissionModel.ts:20-32` stores NO source/UTM; `firstPatientAttribution.ts` orphaned (no caller).
- CHANGE: capture UTM/referrer on submission; wire the attribution join. Call-TRACKING needs the customer's call software (external, later).

### 9. Reflect decouple  [Tier 1, PARKED per Corey]
- Full de-risked brief: `reflect-decouple-build-brief.md`. Reaches the 2/3 who don't import: 3 guards + a scheduled trigger; landmine at `service.monthly-agent-processor.ts:447` (guard the unconditional referralEngineOutput). Parked for a dedicated-focus session.

## PROVE IT EARLY — the runnable hypotheses (before deploying to a real customer)
The point of proving now, while the data is in front of us: establish each A-lever's BASELINE and ADDRESSABLE LIFT on real data, so when it ships the lift is measurable and attributed (customer lift x confident x consistent), and so we never build a C lever that cannot move a number yet. Each hypothesis is CODE-CONFIRMED now (grep/file, no DB) or NEEDS-DB (Dave runs it against live data).
- **GSC->content (1):** HYPOTHESIS: real GSC demand differs materially from the LLM-invented target queries, so feeding it in changes what content targets. TEST (NEEDS-DB): for one real org, pull its top-N GSC queries (`readQueryRows`) and compare to the LLM target set; measure overlap % + the real demand (clicks/impressions) current content does NOT target = the addressable lift. Low overlap proves the lever moves the target set.
- **Reflect decouple (9):** HYPOTHESIS: the pipeline only fires on PMS import, so every non-importing org gets zero monthly insight. CODE-CONFIRMED: the only trigger is `pms-finalize` (the scheduler runs proofline+ranking only). TEST (NEEDS-DB): count orgs with vs without a PMS import; the no-import fraction = the coverage lift from decoupling.
- **Speed-to-lead (6):** HYPOTHESIS: today the lead receives nothing (instant-response baseline = 0). CODE-CONFIRMED: the submission path emails only the practice (`formSubmissionController.ts:522`), nothing to the lead; and the lead's email IS captured (extracted at `formSubmissionController.ts:76`, rendered by `emailTemplateBuilder.ts`), so the reply channel already exists. The lever is cleanly A.
- **Web-attribution (8 half):** HYPOTHESIS: no customer-form submission is currently attributable. CODE-CONFIRMED: `form_submissions` captures only `sender_ip`, no UTM/source column, so 100% of submissions are un-attributed today. Baseline = 0%; adding capture makes it measurable.
- **Dashboard-metric quizzes (Alloro's control):** does every displayed rank read the honest `search_position` (Ch1 landed on patient-journey; the focus-dashboard residual still reads the composite)? how many orgs have a non-empty rank pipeline (task #22)? These establish the honesty baseline the levers report into.
The B levers (AEO, keyword) cannot be simulated until the API key exists; the C levers cannot be simulated at all until the access is acquired — that IS their result. Prove the A set, and the master equation has real baselines to measure lift against.

## VERIFY-GATES (do NOT call any lever "done" until)
- The customer's OWN number visibly moves from the deployed action (customer lift, attributed).
- Reflect: a non-importer's scheduled run produces useful summary rows.

## CONTEXT (the why)
Full gap analysis: `connect-lever-audit.md` (have vs the 9 proven players). Company map/route: `company-pathophysiology.md`. The pattern: cards RECOMMEND actions; these levers DO them. Building cards without levers = honest advice, not done-for-you.
