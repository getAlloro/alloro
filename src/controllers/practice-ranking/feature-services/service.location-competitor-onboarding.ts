/**
 * Location Competitor Onboarding Service (barrel)
 *
 * v2 user-curated competitor list flow. Each location moves through:
 *   pending  → (runDiscoveryForLocation populates initial scrape) →
 *   curating → (user adds/removes via the curate UI) →
 *   finalized (finalizeAndTriggerRun freezes the list and kicks off ranking)
 *
 * Spec: plans/04282026-no-ticket-practice-ranking-v2-user-curated-competitors/spec.md
 *
 * This file was decomposed from a single ~1,600-line service into cohesive
 * siblings (per the gbp-automation pattern). It is now a thin re-export barrel
 * so the public import surface stays importable from this path. The logic lives
 * verbatim in:
 *   - feature-utils/util.competitor-profile-strength    (pure scoring)
 *   - feature-utils/util.competitor-onboarding-builders (pure builders + types)
 *   - service.location-context                          (loadLocationContext)
 *   - service.competitor-identity                       (client place-id, specialty/market)
 *   - service.competitor-discovery-helpers              (Places discovery helpers)
 *   - service.competitor-curation                       (discovery + curate actions)
 *   - service.competitor-finalize                       (finalize + reselect, transactions)
 */

export type { LoadedLocationContext } from "./service.location-context";

export {
  type ClientPlaceResolutionSource,
  type ResolvedClientPlace,
  resolveClientPlaceId,
  getDefaultComparisonSpecialtyForLocation,
} from "./service.competitor-identity";

export {
  type ComparisonSpecialtyPayload,
  type CompetitorDiscoverySuggestion,
  COMPARISON_SPECIALTY_PAYLOAD_OPTIONS,
} from "../feature-utils/util.competitor-onboarding-builders";

export {
  type DiscoveryResult,
  type DiscoverySuggestionsResult,
  type CompetitorPlacePreviewResult,
  runDiscoveryForLocation,
  previewDiscoveryCandidatesForLocation,
  previewManualCompetitorForLocation,
  addCustomCompetitor,
  removeCompetitorFromList,
} from "./service.competitor-curation";

export {
  type FinalizeAndRunResult,
  type ReselectCompetitorsAndRunResult,
  finalizeAndTriggerRun,
  reselectCompetitorsAndTriggerRun,
} from "./service.competitor-finalize";
