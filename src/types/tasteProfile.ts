/**
 * Client Taste Profile — shared PERSISTENCE types.
 *
 * Neutral, layer-free module (§7.1). These are the shapes that live in the
 * `taste_profiles` JSONB columns (`profile`, `source_summary`), so BOTH ends of
 * the stack need them:
 *   - the model  (`models/website-builder/TasteProfileModel.ts`) — persists them;
 *   - the service (`controllers/admin-websites/feature-services/service.taste-profile.ts`)
 *     — composes + honesty-gates them.
 *
 * They live here, not in the service, because "Routes → Controllers → Services →
 * Models" (§7.1) is one-directional: a model may never import from a controller.
 * Same precedent as `types/adminReset.ts` and `types/pmsMapping.ts`.
 *
 * Scope: ONLY the persisted shapes belong here. The composition-time input types
 * (`SourcedCandidate`, `TasteProfileCandidates`, `ExtractorBundle`, …) stay in the
 * service — they are never written to the database.
 *
 * Honesty (Value #6): every claim is a `{ value, source }` pair. A claim with no
 * real source is dropped before write, never invented.
 */

/** A single verifiable claim: the text plus the real source it traces back to. */
export interface SourcedClaim {
  value: string;
  /** review id, GBP field, page URL, or intake ref — a human can click it back. */
  source: string;
}

/** The persisted, gated profile the website reads for its content slots. */
export interface TasteProfile {
  business_name: string;
  business_category: string;
  voice: {
    archetype: string;
    tone_descriptor: string;
  };
  hero_quote: SourcedClaim | null;
  /** Generated hero copy — honesty-gated, but not a sourced factual claim. */
  suggested_headline: string;
  unique_strength: SourcedClaim | null;
  praise_themes: SourcedClaim[];
  credentials: SourcedClaim[];
  practice_facts: SourcedClaim[];
  customer_journey: {
    why_they_choose: SourcedClaim[];
    what_makes_them_hesitate: SourcedClaim[];
  };
}

/** A claim the gate discarded because it had no real source (Tier 1). */
export interface DroppedClaim {
  field: string;
  value: string;
  reason: "no_source";
}

/** A claim the gate refused for banned language (rank/visibility/guarantee/metric). */
export interface RejectedClaim {
  field: string;
  value: string;
  reasonCodes: string[];
}

/** Audit of what the honesty gate kept / dropped / rejected (persisted alongside). */
export interface TasteProfileAudit {
  kept: number;
  dropped: DroppedClaim[];
  rejected: RejectedClaim[];
}
