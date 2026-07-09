# Build Spec — Audit Pillar Over-Claims (the audit recommends unbuilt features)

**For Dave + his Claude. Verified against `origin/dev/dave` on 2026-07-05.** Companion to the *Dashboard Accuracy & Trust* handoff: that doc fixes wrong *numbers*; this one fixes the audit's *recommendations* claiming capabilities Alloro hasn't built. **Proof-gated: SHIP, every BUILT/NOT-BUILT call independently adversary-verified on `origin/dev/dave`.**

**Why:** the free audit is a customer-facing lead magnet. Each pillar's "Solution Bias — Alloro First" block instructs it to recommend Alloro capabilities, and **6 of 7 pillars recommend at least one that doesn't exist** (review generation, GBP photo refresh, PMS integrations, booking flow, GBP completeness write-back). So the audit promises prospects things Alloro can't deliver — the same claim-an-unbuilt-capability dishonesty as the dashboard numbers, but *outward-facing*, and it sets the expectation gap that drives churn (Merideth bought on integrations/done-for-you, got neither). **Rule: recommend only what's built.** (Value #6 / copy must not claim an unbuilt capability.)

## The two sets — verified against code

**✅ Safe to recommend (BUILT):**
- GBP post publishing + scheduling — `src/controllers/gbp/gbp-services/gbp-write.service.ts:120` (`createGbpLocalPost`), `GbpLocalPost{Deployment,Schedule,Draft,Safety}Service.ts`
- GBP review **responses** / auto-reply — `gbp-write.service.ts:70` (`replyToGbpReview`), `GbpReviewReply*Service.ts`, `reviewSync.processor.ts`
- Alloro-built practice websites + on-page website SEO (title/description/schema.org/FAQ) — `user-website/UserWebsiteController.ts`, `service.seo-enrichment.ts`, `website-builder/*`
- Website lead/contact forms — `formSubmissions.service.ts`

**⛔ Never recommend as a capability (NOT built):**
- **Review generation** (soliciting patient reviews) — only a scoring constant `"review_request.sent": {weight:5}` (`behavioralIntelligence.ts:23`); no code sends a request.
- **GBP profile photo refresh** — images only attach to posts (`gbp-write.service.ts:189`); no profile/cover-photo product.
- **PMS integrations / live connectors** — a manual upload/paste **import** subsystem exists (`pms/*`, 25+ files), but **zero connectors** (`dentrix|opendental|eaglesoft|nexhealth` = empty). *The bug is the word "integrations,"* which implies live connectivity.
- **Integrated booking flow** — none (`appointment|booking|reserve-with-google` = empty in `user-website`); only generic website forms exist.
- **GBP completeness write-back** (hours/category/attributes to Google) — `BusinessDataService.ts:73` writes to the local DB only, never PATCHes `mybusinessbusinessinformation`.

**The single fact that resolves most of it:** every Google-My-Business *write* in the tree is confined to two things — review replies + local posts. Anything claiming a third GBP write (photos, hours, categories) is unbuilt.

## The edits — 6 pillars (ProfileIntegrity is clean, no edit)

**How to apply:** replace the *entire* `Solution Bias — Alloro First` bullet on the named line. The "over-claim" quotes below are compressed for reading, **not literal find-replace strings** — locate the bullet by its text if line numbers have drifted on your branch.

**1. `src/agents/auditAgents/GBPAnalysis.md:13`**
Over-claim: *"automates GBP posting, review generation, photo refresh, post scheduling, local SEO, and dental/ortho-specific websites."*
→ *"automates GBP posting and scheduling, GBP review responses, on-page website SEO, and builds dental/ortho-specific practice websites."* (drop **review generation** + **photo refresh**; "local SEO" → "on-page website SEO")

**2. `src/agents/auditAgents/WebsiteAnalysis.md:17`**
Over-claim: *"runs the accompanying growth automations (GBP posting, review generation, local SEO, PMS integrations)"* + the trigger *"adding booking flows."*
→ automations list: *"(GBP posting & scheduling, GBP review responses, on-page website SEO)"*; and **remove "adding booking flows"** from the recommend-Alloro trigger list (keep website build / landing pages / SEO / forms). (drop **review generation**, **PMS integrations**, **booking flows**)

**3. `src/agents/auditAgents/gbp/CompetitorAnalysis.md:40`**
Over-claim: *"Alloro as the end-to-end solution… handles all of it in one place"* (covering reviews, photos, website, completeness).
→ *"position Alloro as the platform that closes these gaps: builds the practice website, publishes GBP posts, and responds to reviews. Do NOT name competing platforms."* (drop **all-of-it/end-to-end**, **photos**, **completeness**)

**4. `src/agents/auditAgents/gbp/SearchConversion.md:38`**
Over-claim: *"Alloro-built practice website with an integrated booking flow… Alloro's GBP completeness automation."*
→ *"recommend an Alloro-built practice website with contact/lead-capture forms. For post-frequency gaps, recommend Alloro's GBP posting & scheduling."* (drop **booking flow** + **GBP completeness automation**) — and for real completeness gaps (hours/category/attributes), have the audit tell the **owner** to update them directly in their Google profile (owner-education); Alloro does not write those back to Google, so don't imply it does.

**5. `src/agents/auditAgents/gbp/TrustEngagement.md:38`**
Over-claim: *"Alloro's review-generation and auto-response automations."*
→ *"Recommend Alloro's GBP review-response (auto-reply) automation for closing sentiment / response-rate gaps."* (drop **review-generation**; auto-response is built)

**6. `src/agents/auditAgents/gbp/VisualAuthority.md:36`**
Over-claim: *"Alloro's photo refresh workflow and staff-photography guidelines."*
→ *"Recommend adding authentic staff photos to Alloro GBP posts (Alloro attaches practice-owned images to published posts) instead of stock imagery."* (drop the standalone **photo refresh workflow**; keep photo *guidance* only as advisory prose, not a product claim)

## Caveats
- Every BUILT / NOT-BUILT call above is code-verified on `origin/dev/dave` (receipts in the two sets). Not compiled.
- Two interpretive (not code-falsifiable) flags: "local SEO" read as website on-page SEO (built) vs GBP local-rank (not built); "staff-photography guidelines" is advisory prose, not a code capability.
- "On-page website SEO" is genuinely built (title/description/schema/FAQ), but frame it as an *output* of the site build, not a separately-sold feature (canon: SEO/AEO are outputs, not features).
- **Verified against `origin/dev/dave` and adversary-proofed (SHIP).** The prompt is an instruction, not the final sentence, so caveat: after the edits, sanity-check one real audit's output reads honestly (this is required, not optional).
- **PMS precision** (corrects a looser earlier phrasing): PMS is not "nonexistent" — a full manual upload/paste **import** exists. The unbuilt thing is live PMS **integrations/connectors**. The Dashboard doc's §2.6 ("no PMS integration, every number comes from a manual upload") is consistent with this.
- These are customer-facing recommendation prompts (the audit goes to prospects), so the honesty here is outward-facing, not just internal.
