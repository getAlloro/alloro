# Allow GBP-less Identity Generation

## Why
Layout generation is failing for projects where identity warmup completed from website/text signals without a selected GBP profile. The code currently treats `business.name` as the only readiness signal, which is too narrow.

## What
Allow layout/page/slot generation when `project_identity` has meaningful scraped or admin-provided content even if GBP-derived business fields are empty. Future warmups should also backfill `business.name` from non-GBP project/admin inputs.

## Context
**Relevant files:**
- `src/controllers/admin-websites/feature-utils/util.project-identity.ts` — shared identity readiness gates.
- `src/controllers/admin-websites/feature-services/service.identity-warmup.ts` — assembles `project_identity`.
- `src/controllers/admin-websites/feature-services/service.layouts-pipeline.ts` — failing worker path.
- `src/controllers/admin-websites/feature-services/service.generation-pipeline.ts` — page generation uses the same gate.

**Pattern to follow:**
- Keep identity validation in `util.project-identity.ts`; do not spread special cases through worker services.

## Constraints
**Must:**
- Accept GBP-less identity only when it contains meaningful content.
- Preserve rejection for empty queued/running/failed identity shells.
- Keep the fix scoped to identity readiness and warmup identity assembly.

**Must not:**
- Invent fake GBP/place data.
- Change selected place semantics.
- Mutate live project rows unless explicitly requested.

## Risk
**Level:** 2

**Risks identified:**
- Over-loosening readiness could allow generic page generation from empty identity. **Mitigation:** require concrete content signals such as UVP, scraped pages, text inputs, doctors/services, or real locations.

**Blast radius:**
- Admin create-from-template preflight.
- Single page generation preflight.
- Worker page generation.
- Worker layout generation.
- Slot generation from identity.

**Pushback:**
- This is not “allow no identity.” It is “allow no GBP when identity was built from other evidence.” Anything broader would create generic garbage output.

## Tasks

### T1: Make identity readiness source-aware
**Do:** Update shared readiness helpers to accept non-empty content-based identity, not just `business.name`.
**Files:** `src/controllers/admin-websites/feature-utils/util.project-identity.ts`
**Depends on:** none
**Verify:** `npx tsc --noEmit`

### T2: Backfill business identity without GBP
**Do:** During warmup, derive business fallback name/website from project/admin inputs when GBP is missing.
**Files:** `src/controllers/admin-websites/feature-services/service.identity-warmup.ts`
**Depends on:** T1
**Verify:** `npx tsc --noEmit`

## Done
- [x] Confirmed project `2d851cfc-37e1-44d9-8c9d-0aed0422a3d2` fails because `business.name` is null despite warmup status `ready`.
- [x] `npx tsc --noEmit` has no errors caused by this change.
- [x] No live data mutation performed.
