---
name: project_alloro_built_vs_unbuilt_capabilities
description: "VERIFIED built vs NOT-built Alloro capabilities (origin/dev/dave, 2026-07-05, adversary-proofed). The guardrail for any copy/spec/audit that claims \"Alloro does X.\" Never claim an unbuilt capability."
metadata: 
  node_type: memory
  type: reference
  originSessionId: 00f7f7d8-dcd9-4bd3-aa2a-e78f57087399
---

⛔ GUARDRAIL for any outward copy, audit recommendation, or build spec that says "Alloro does X." Claiming an unbuilt capability is the over-claim that sets the expectation gap driving churn (Merideth/DentalEMR bought on integrations + done-for-you, got neither, churned $3.5k/mo). Value #6 + the copy-must-not-claim-unbuilt-capability rule.

**The resolving fact:** every Google-My-Business WRITE in the codebase is confined to TWO things, review replies + local posts. Anything claiming a THIRD GBP write is unbuilt.

**✅ BUILT (safe to recommend/claim):**
- GBP post publishing + scheduling — `src/controllers/gbp/gbp-services/gbp-write.service.ts:120` (`createGbpLocalPost`); `GbpLocalPost{Deployment,Schedule,Draft,Safety}Service.ts`
- GBP review REPLIES / auto-response — `gbp-write.service.ts:70` (`replyToGbpReview`); `GbpReviewReplyService`, `reviewSync.processor.ts`
- Alloro-built practice websites + on-page website SEO (title/description/schema/FAQ) — `user-website/*`, `service.seo-enrichment.ts`. Frame SEO as an OUTPUT, not a sold feature.
- Website lead/contact forms — `formSubmissions.service.ts`
- Photo ATTACH to a post (`media.PHOTO` on a local post)

**⛔ NOT BUILT (never claim as a capability):**
- **Review GENERATION** / soliciting patient reviews — only a scoring constant `review_request.sent` (`behavioralIntelligence.ts:23`), no emitter. (Garrison pays Birdeye SOLELY for this, "the only one we do not.")
- **GBP profile/cover photo refresh** — images only attach to posts; no profile-photo product
- **PMS live integrations/connectors** — a manual upload/paste IMPORT exists (`pms/*`, 25+ files), but ZERO connectors (`dentrix|opendental|eaglesoft|nexhealth` = empty). The bug word is "integrations."
- **Integrated booking flow / online scheduling / Reserve-with-Google** — zero handling in code
- **GBP completeness write-back** (hours/category/attributes to Google) — writes to the local DB only (`BusinessDataService.ts`), never PATCHes `mybusinessbusinessinformation`. For completeness gaps, the honest move is owner-education ("update these in your Google profile").

Verified `origin/dev/dave` 2026-07-05, adversary-proofed. The audit pillars' "Solution Bias — Alloro First" blocks (6 of 7) over-claim these; fix = `alloro-brain/dashboard-audit/audit-pillar-overclaims-spec.md`. Related: [[feedback_seo_aeo_are_outputs_not_features]], [[feedback_wedge_is_experience_not_visibility]].
