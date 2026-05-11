# Specialty-Aware Competitor Filter

## Why
Automated competitor suggestions can include pure general dentists for specialist practices, which makes the comparison set feel noisy and forces users to clean up obvious misses. We need the selector to default to the client’s own specialty and only auto-suggest general dental practices when there is evidence they offer that specialty.

## What
Add a specialty-aware filter to competitor discovery and reselection suggestions. The comparison specialty defaults from the client’s detected primary specialty, e.g. `endodontics` or `endodontist` defaults to `endodontist`, and automated suggestions exclude `general-only` dentists while retaining multi-specialty GPs with endodontic/orthodontic evidence.

## Context

**Relevant files:**
- `src/controllers/practice-ranking/feature-services/service.places-competitor-discovery.ts` — Places Text Search discovery, dental type mappings, and current `filterBySpecialty`.
- `src/controllers/practice-ranking/feature-services/service.location-competitor-onboarding.ts` — first-time discovery, reselection preview, manual profile preview, and `resolveSpecialtyAndMarket`.
- `src/controllers/practice-ranking/PracticeRankingController.ts` — competitor discovery and preview endpoints.
- `src/routes/practiceRanking.ts` — thin routing for location competitor APIs.
- `frontend/src/api/practiceRanking.ts` — typed frontend contract for discovery and reselection.
- `frontend/src/pages/competitor-onboarding/LocationCompetitorOnboarding.tsx` — selector/reselection UI, radius refresh, manual add, and selected list.

**Patterns to follow:**
- Routes stay thin; validation and response shaping stay in controller/service layers.
- Use the existing detected ranking `specialty` as the default comparison specialty.
- Keep manual Google Maps add available even when automated suggestions are filtered out.
- Keep ranking language honest: this is a suggestion filter, not perfect staff verification.

**Reference file:** `src/controllers/practice-ranking/feature-services/service.places-competitor-discovery.ts` — closest existing analog for specialty normalization and filtering.

## Constraints

**Must:**
- Default comparison specialty from the client’s detected primary specialty.
- Normalize internal specialties to Google-style search labels: `endodontics -> endodontist`, `orthodontics -> orthodontist`, etc.
- For dental specialists, auto-include exact specialty matches.
- Retain GPs/dental clinics only when there is specialty evidence in type/category/name/search result metadata.
- Exclude pure general dentists/dental clinics with no specialist evidence from automated top suggestions.
- Preserve manual add/search so users can override the automated filter.
- Apply the same filtering to first-time discovery, radius refresh, wide-radius refresh, and manual preview Maps measurement where relevant.

**Must not:**
- Do not claim staff-level certainty unless we add a website/team-page verification phase.
- Do not remove every `dentist`/`dental_clinic` result for specialist practices.
- Do not change the practice’s own Google Maps estimate card behavior.
- Do not create ranking tasks during competitor reselection.
- Do not add website crawling in this first pass unless implementation proves Places metadata is insufficient.

**Out of scope:**
- Full website/service-page crawling.
- LLM classification of every competitor website.
- Backfilling historical competitor snapshots.
- Changing Practice Health scoring weights.

## Risk

**Level:** 3

**Risks identified:**
- Google Places `primaryType` is incomplete for multi-specialty practices. → **Mitigation:** classify candidates by evidence tier instead of strict primary type.
- Filtering too aggressively can hide legitimate competitors. → **Mitigation:** include `dentist`/`dental_clinic` only when name/category/types/query evidence indicates the selected specialty, and keep manual add.
- Specialty defaults can drift from the current client reality if the Identifier Agent mislabels the practice. → **Mitigation:** expose the comparison specialty control in the UI and default it, not hardcode it.
- Wide-radius discovery currently falls back to unfiltered candidates if same-specialty count is low. → **Mitigation:** change that fallback for dental specialists so `general-only` candidates remain excluded from automated suggestions.

**Blast radius:**
- Automated competitor suggestions in first-time setup.
- Automated competitor suggestions in reselection mode.
- Maps estimate measurement for manually added competitors.
- Any ranking pipeline code path that reuses `discoverCompetitorsViaPlaces`.

**Pushback:**
- This should not become “AI says who has an endodontist.” Without website/team evidence, the defensible product claim is “specialty-evidence filtered suggestions.” Staff-level verification belongs in a later enrichment layer.

## Tasks

### T1: Specialty Normalization and Filter Model
**Do:** Add a small normalized comparison-specialty model with label/query/type metadata. Map client specialties like `endodontics`, `endodontist`, `orthodontics`, `orthodontist`, and other dental specialties to the query label used for discovery. Add candidate evidence tiers: `exact_specialist`, `multi_specialty_evidence`, `general_only`, `unknown`.
**Files:** `src/controllers/practice-ranking/feature-services/service.places-competitor-discovery.ts`
**Depends on:** none
**Verify:** unit-level or targeted service checks for endo/ortho/general mappings.

### T2: Strict Dental Specialist Filtering
**Do:** Update discovery filtering so dental specialist searches include exact specialist matches and GP/dental clinic matches only with specialty evidence. Prevent wide-radius fallback from reintroducing `general_only` dental offices for specialist categories.
**Files:** `src/controllers/practice-ranking/feature-services/service.places-competitor-discovery.ts`
**Depends on:** T1
**Verify:** sample candidate arrays show pure dentists excluded, exact endodontists retained, and multi-specialty evidence retained.

### T3: API Contract for Comparison Specialty
**Do:** Extend discovery preview/run payloads to accept optional `comparisonSpecialty`, defaulting to resolved client specialty when omitted. Return resolved comparison specialty metadata to the frontend for display.
**Files:** `src/controllers/practice-ranking/PracticeRankingController.ts`, `src/controllers/practice-ranking/feature-services/service.location-competitor-onboarding.ts`, `frontend/src/api/practiceRanking.ts`
**Depends on:** T1
**Verify:** omitted specialty uses client default; explicit specialty refresh changes automated suggestions only.

### T4: Selector UI Control
**Do:** Add a compact comparison-specialty selector near the radius control. Default to the client’s resolved specialty and use labels like `Endodontists`, `Orthodontists`, `General dentists`. Refresh suggestions uses both radius and comparison specialty. Manual add remains unchanged.
**Files:** `frontend/src/pages/competitor-onboarding/LocationCompetitorOnboarding.tsx`
**Depends on:** T3
**Verify:** default appears correctly for an endodontic client; changing specialty updates refresh payload; button layout remains inline.

### T5: Rerun Preservation
**Do:** Ensure save/rerun preserves selected competitors and does not create tasks. Persisting the comparison specialty is optional unless the implementation needs it to explain the resulting snapshot; if persisted, store it on the ranking snapshot metadata, not as a global location mutation unless explicitly requested.
**Files:** `src/controllers/practice-ranking/feature-services/service.location-competitor-onboarding.ts`, `src/controllers/practice-ranking/feature-services/service.ranking-pipeline.ts`, `src/controllers/practice-ranking/feature-utils/util.ranking-formatter.ts`
**Depends on:** T3
**Verify:** reselection rerun still has `include_in_summary_recommendations=false`.

### T6: Verification
**Do:** Run typecheck/build and focused lint. Manually verify first-time selector and reselection radius refresh for endodontic and orthodontic examples.
**Files:** touched implementation files
**Depends on:** T1-T5
**Verify:** `npx tsc --noEmit`, `npm run build` in `frontend`, targeted ESLint.

## Done
- [ ] Client specialty defaults to comparison specialty in the selector.
- [ ] `endodontics`/`endodontist` default to `endodontist`.
- [ ] `orthodontics`/`orthodontist` default to `orthodontist`.
- [ ] Pure general dentists are excluded from automated specialist suggestions.
- [ ] GP/dental clinic competitors with specialist evidence are retained.
- [ ] Wide-radius refresh does not backfill specialist suggestions with `general_only` dentists.
- [ ] Automated competitor lists are ordered by Maps estimate before profile/review strength.
- [ ] Manual Google Maps add still works for edge cases.
- [ ] Reselection remains rerank-only and creates no tasks.
- [ ] `npx tsc --noEmit` passes.
- [ ] Frontend build passes.
- [ ] Targeted lint passes.

## Revision Log

### Rev 1 — 2026-05-10
**Change:** Automated competitor suggestions and saved competitor reads should prefer Maps estimate order before review/rating strength.
**Reason:** The UI labels each competitor with a Maps estimate, so ordering by review count made the list look wrong when `#2` appeared below `#5` and `#6`.
**Updated Done criteria:** Added a checklist item requiring automated competitor lists to be ordered by Maps estimate before profile/review strength.
