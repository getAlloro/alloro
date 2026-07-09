# MAGIC operational — the complete build list (what Dave needs)

> This is the **priority-tier view** (Tier 0-3) of the 9 value-levers. The **per-lever build briefs** (files + done-checks) are in [`dave-build-handoff.md`](dave-build-handoff.md); the whole-repo map + read order is in [`../START-HERE.md`](../START-HERE.md). Same lever set, two views.

*Grounded in the 2026-07-08 Connect audits (conversion / discovery / Reflect vs code, `strategy/connect-lever-audit.md`) + the proven-lever menu. "Operational" = the end-to-end done-for-you journey (search -> submission) delivering real, attributed customer VALUE, not honest advice. Each item: what · barrier · grounding (file:line) · verified-vs-assumed. GAPS are verified (audit); effort estimates are Claude's except where noted.*

## Honest framing
Building the 7 card-chapters makes what the engine SAYS honest and specific. It does NOT make it done-for-you. The card RECOMMENDS actions; the levers below are what DOES them and attributes the lift. Without the levers, MAGIC produces honest advice, not value. Ch5 (Bookable) literally specs a card that attributes a responder + attribution rail that don't exist.

## ⭐ THE BUILD STANDARD — no human contact per customer (the economic requirement, Corey 2026-07-08)
Alloro's economics are FIXED-cost / low-marginal: more customers is NOT more noticeable expense, so every customer past ~6 (break-even) is near-pure margin, and growth = profit, not a faster loss. **This ONLY holds if the system serves each customer WITHOUT a human touching the account** (the Slack/Zoom/Claude standard: the customer and Alloro interface with the SYSTEM, not a person). The instant a lever needs a human per customer, marginal cost climbs and growth stops being pure profit. So EVERY lever below is built to RUN ITSELF, owner-approves once, then automated/agentic, never human-in-the-loop-per-account. This IS the "consistent" in the master equation (repeatable at near-zero marginal cost = automated). Any lever that can't meet this standard is re-scoped until it can, or it's the wrong build.

## TIER 0 — merge/finish (small, already built, the SAYING layer)
- Merge **#148** (unified card-type schema — the contract the chapters need). [verified: 35 lines, OPEN]
- Merge **#147** (dashboard rank -> real Maps position). [data-truth]
- **#145** (Slice 1 honest numbers) already merged.

## TIER 1 — cheap, in-repo, no external dependency, shows value (DO FIRST)
1. **Reflect decouple** — make the monthly insight engine reach the ~2/3 who don't import.
   - 3 guards + a scheduled trigger. (a) wrap the RE loop `service.monthly-agent-processor.ts:254-307` in `if (pmsDataForRE)`; (b) soften the `:301` abort to log-and-continue; (c) guard `:447` `createTasksFromReferralEngineOutput(referralEngineOutput!)` (crashes non-importers when RE is skipped); (d) add a scheduled monthly job for all locations (`agentRegistry.ts` runs only proofline+ranking today; pipeline is triggered only by `pms-finalize.service.ts:110`).
   - Opportunity/CRO already disabled (`:424-438`); Summary v2 absorbs them.
   - [de-risked brief: `specs/reflect-decouple-build-brief.md`. OPEN RISK: Summary's standalone output quality needs a real run on a non-importer before "done."]
2. **Close the GSC->content loop** — feed real Google search-demand ALREADY collected (`service.gsc-integration.ts:274`, true daily time series) into keyword/content selection, replacing LLM-invented target queries. No new integration. [verified: GSC data collected but unused for selection]
3. **Re-enable form anti-spam/rate-limit** — commented out "for debugging" (`formSubmissionController.ts:212-240`; `routes/websiteContact.ts:40`). Live exposure. Small.

## TIER 1b — value LEVERS, low barrier (owner-approved, no customer system)
4. **Review requests** — owner-approved (Option B) SMS/email ask for reviews. New send path; review REPLIES already exist (`gbp-write.service.ts:81`). Lifts review count -> rank + AI-citation. The most-proven lever in the market (all 9 players).
5. **AEO / AI-visibility** — monitor + optimize presence in ChatGPT/Gemini/Perplexity/Google AI Overviews. ZERO code today (`ai-seo-audit/` scores the business's own pages via Google organic, no answer-engine feedback loop). The wedge: only Yext + Birdeye hold it.
6. **Real keyword research + selection** — cache-per-vertical×area DataForSEO/GSC, ~$85/mo amortized, no per-client cost. Designed (#32). Superset of #2; adds volume/difficulty/selection.

## TIER 2 — design-first, then build
7. **Speed-to-lead** — an instant, SUBSTANTIVE auto-response to a submission (the next step / answer / booking, NOT a hollow "we'll call you"). Today the lead gets NOTHING; only the practice is emailed (`formSubmissionController.ts:522`). Design the response before building, else it's noise.

## TIER 3 — external dependency, later
8. **Booking / scheduling** — online booking capture. Absent; CTAs forced to /contact (`htmlValidator.ts:438`); no PMS appointment write-back. Needs a scheduling integration.
9. **Attribution / call-tracking** — capture source/UTM on submission (`FormSubmissionModel.ts:20-32` stores none) + tie visitor -> submission -> booking (`firstPatientAttribution.ts` orphaned, no caller). Call-tracking needs the customer's call software.

## Secondary — GBP completeness (partial today)
- NAP consistency (not built/measured on GBP side); profile completeness + categories (read-only advice, never applied); profile photos (post-attach only, no profile gallery upload). All observe-or-advise, not done-for-them.

## The verify-gates (do NOT call "operational" until)
- Reflect: a never-imported org's scheduled run produces useful `agent_type='summary'` rows.
- Each lever: the customer's own number visibly moves from the deployed action (the master-equation check: customer lift, attributed).
