# Local Rankings Copy and CTA Updates

## Why
The Local Rankings landing view still mixes competitor management into the page header, and the generated summary/Alloro Engage copy is wordier than a non-technical owner needs.

## What
Move competitor management into the competitor card, tighten the main ranking narrative format, add a direct Alloro Engage GBP Posts action, and simplify Alloro Engage language to clean, non-redundant sentences.

## Context

**Relevant files:**
- `frontend/src/components/dashboard/RankingsDashboard.tsx` - Local Rankings page composition and competitor table card.
- `frontend/src/components/dashboard/shared/MeaningHero.tsx` - main overview card layout.
- `frontend/src/components/dashboard/gbp-automation/GbpEngagementActionNotice.tsx` - Alloro Engage narrative copy.
- `src/controllers/practice-ranking/feature-services/service.ranking-llm.ts` - ranking AI narrative prompt.
- `/Users/rustinedave/Desktop/alloro-docs/src/components/replicas/LocalRankingsReplica.tsx` - docs replica parity for Local Rankings.

**Patterns to follow:**
- Existing dashboard card/header styling in `RankingsDashboard.tsx`.
- Existing hero composition in `MeaningHero.tsx`.

## Constraints

**Must:**
- Keep the change presentation-focused and scoped to Local Rankings.
- Keep website speed/action language out of ranking recommendations.
- Preserve existing refresh and GBP automation flows.

**Must not:**
- Touch unrelated PMS/support dirty files.
- Add dependencies.
- Refactor the rankings page beyond the requested placement/copy updates.

**Out of scope:**
- Re-running rankings, changing stored historical analysis, or altering GBP API behavior.
- Changing competitor selection persistence.

## Risk

**Level:** 2

**Risks identified:**
- Stored LLM text may still contain older wording until rankings are re-run. → **Mitigation:** update the generator prompt and use deterministic Alloro Engage UI copy for current rows.
- Moving the competitor CTA could make it less discoverable from the top header. → **Mitigation:** place it inside the competitor card where the user is already reading competitor data.

**Blast radius:** Local Rankings dashboard, ranking LLM output for future runs, Alloro Engage summary card.

## Tasks

### T1: Move Competitor Management
**Do:** Remove Manage Competitors from the top header card and place it inside the competitor comparison card.
**Files:** `frontend/src/components/dashboard/RankingsDashboard.tsx`, `/Users/rustinedave/Desktop/alloro-docs/src/components/replicas/LocalRankingsReplica.tsx`
**Depends on:** none
**Verify:** Manual: `/rankings` shows Refresh Rankings in the header and Manage Competitors in the competitor card.

### T2: Tighten Summary and Engage Copy
**Do:** Add a direct Alloro Engage GBP Posts CTA to the main hero, update the ranking LLM prompt format, and replace duplicate engage prose with concise deterministic copy.
**Files:** `frontend/src/components/dashboard/shared/MeaningHero.tsx`, `frontend/src/components/dashboard/RankingsDashboard.tsx`, `frontend/src/components/dashboard/gbp-automation/GbpEngagementActionNotice.tsx`, `src/controllers/practice-ranking/feature-services/service.ranking-llm.ts`, `/Users/rustinedave/Desktop/alloro-docs/src/components/replicas/LocalRankingsReplica.tsx`
**Depends on:** none
**Verify:** `npx tsc --noEmit`, `cd frontend && npm run build`

## Done
- [x] `npx tsc --noEmit`
- [x] `cd frontend && npm run build`
- [x] `/Users/rustinedave/Desktop/alloro-docs npm run build`
- [x] Manual: Local Rankings header, hero CTA, Alloro Engage copy, and competitor card placement checked.
- [x] No unrelated PMS/support files changed.
