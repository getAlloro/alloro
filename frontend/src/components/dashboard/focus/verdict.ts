/**
 * verdict — Ch7 capstone pure helpers for the Practice Hub "one thing" surface.
 * No data fetch, no new component; mirrors the style of statusRules.ts.
 *
 *  - DOMAIN_TO_STAGE (FIX 3): the single source-of-truth map from the internal
 *    action `domain` taxonomy to the customer-journey STAGE the owner reads. The
 *    eyebrow reads the card's authored `stage` field first, this map as fallback.
 *  - buildHealthVerdict (FIX 2): the 30-second health/leak glance. Critical wins;
 *    else a single warn gap; else the clean-week exhale — and it NEVER claims
 *    health over a neutral (unknown) signal (it scopes to "what Alloro can see").
 *    Attribution is welded in per FIX 4: attribute the CATCH ("Alloro spotted"),
 *    never the CAUSE.
 */

import type { StatusTone } from "./statusRules";

export type JourneyStage = "findable" | "choosable" | "bookable" | "memorable";

/** Owner-facing label per stage. */
export const STAGE_LABEL: Record<JourneyStage, string> = {
  findable: "Findable",
  choosable: "Choosable",
  bookable: "Bookable",
  memorable: "Memorable",
};

/**
 * Internal action `domain` → customer-journey STAGE (FIX 3, single source of
 * truth). Reviews read Choosable to the owner (staked 2026-07-07); "Memorable"
 * is Ch6's internal ownership of the review WORK, never the owner-facing label.
 * ONLY real local rank (`ranking`) maps to Findable. A `gbp` action today is a
 * POST — a consideration/engagement move that keeps the profile active — so it
 * maps to Choosable, NEVER Findable: posts convert/engage, they do not rank
 * (Sterling Sky / lever-evidence-map). Mapping a post to Findable implied that
 * posting improves rank (honesty fix 2026-07-14).
 */
export const DOMAIN_TO_STAGE: Record<string, JourneyStage> = {
  ranking: "findable",
  gbp: "choosable",
  review: "choosable",
  "form-submission": "bookable",
  referral: "memorable",
  "pms-data-quality": "memorable",
};

const VALID_STAGES = new Set<string>(Object.keys(STAGE_LABEL));

function isJourneyStage(value: unknown): value is JourneyStage {
  return typeof value === "string" && VALID_STAGES.has(value);
}

/**
 * The stage an action card is displayed under — DERIVED, not authored.
 *
 * `action.stage` is optional and LLM-authored. `action.domain` is a closed
 * taxonomy the pipeline sets. When the two disagree, the map wins: a
 * `{ domain: "gbp", stage: "findable" }` card would otherwise walk straight
 * past the rule this file exists to enforce (a GBP post is Choosable, never
 * Findable) just because a model typed a different word.
 *
 * Authored state is only consulted for a domain we have no mapping for — a new
 * pipeline domain shipping before this map is updated — and even then it must
 * be a real stage, not free text. Derived beats authored; validated beats
 * trusted.
 */
export function resolveActionStage(action: {
  domain: string;
  stage?: string | null;
}): JourneyStage | null {
  const derived = DOMAIN_TO_STAGE[action.domain];
  if (derived) return derived;
  return isJourneyStage(action.stage) ? action.stage : null;
}

/**
 * Whether Alloro has an honest lever for a stage today.
 *
 * Findable is `false` on purpose: local rank has no lever we can stand behind
 * (posts do not rank — Sterling Sky / lever-evidence-map). We still NAME a weak
 * rank (see rankTone), but we do not follow it with "Here's the move" — that
 * would re-introduce the exact promise this branch removed. Naming a gap we
 * can't fix is honest. Promising a fix we don't have is not.
 */
export const STAGE_HAS_HONEST_MOVE: Record<JourneyStage, boolean> = {
  findable: false,
  choosable: true,
  bookable: true,
  memorable: true,
};

/** The four dashboard stat tones, keyed by the STAGE each maps to. */
export interface StageTones {
  findable: StatusTone; // local rank / GBP presence
  choosable: StatusTone; // reviews (choose-signal)
  bookable: StatusTone; // form submissions
  memorable: StatusTone; // referrals
}

const STAGE_ORDER: JourneyStage[] = [
  "findable",
  "choosable",
  "bookable",
  "memorable",
];

export interface HealthVerdict {
  text: string;
  leakStage: JourneyStage | null;
}

/** " Here's the move." only when we actually have one for that stage. */
function moveSuffix(stage: JourneyStage): string {
  return STAGE_HAS_HONEST_MOVE[stage] ? " Here's the move." : "";
}

/**
 * The health/leak verdict sentence. The leak STAGE is named from the stat tones
 * (stats carry no authored `stage` field), so the verdict and the eyebrow agree
 * on one screen.
 */
export function buildHealthVerdict(tones: StageTones): HealthVerdict {
  // "Measured" means we HAVE a reading — including a bad one. Only `unknown` is
  // absent. Filtering on `neutral` here was the reviewed bug: a weak rank was
  // stored as neutral, dropped out of this list, and the practice was called
  // healthy. See UNKNOWN_IS_NOT_FINE in statusRules.ts.
  const measured = STAGE_ORDER.filter((s) => tones[s] !== "unknown");

  // Nothing measured yet → honest "connect more data", never a fabricated all-clear.
  if (measured.length === 0) {
    return {
      text: "Connect more of your data so Alloro can see your full health picture.",
      leakStage: null,
    };
  }

  // Critical wins.
  const critical = STAGE_ORDER.find((s) => tones[s] === "critical");
  if (critical) {
    return {
      text: `Alloro spotted one gap this month: your ${STAGE_LABEL[critical]} stage is slipping.${moveSuffix(critical)}`,
      leakStage: critical,
    };
  }

  // Then a single warn gap.
  const warn = STAGE_ORDER.find((s) => tones[s] === "warn");
  if (warn) {
    return {
      text: `Healthy overall, with one gap Alloro caught: your ${STAGE_LABEL[warn]} stage.${moveSuffix(warn)}`,
      leakStage: warn,
    };
  }

  // No gaps in anything we measured → the clean-week exhale. The full all-clear
  // is earned ONLY when all four stages were actually measured; otherwise the
  // claim stays explicitly scoped to what Alloro can see, because the stages we
  // can't see might not be fine — we simply don't know.
  const allSeen = measured.length === STAGE_ORDER.length;
  return {
    text: allSeen
      ? "Your practice is healthy this month. Nothing slipped where Alloro can see it."
      : "Based on what Alloro can see, your practice is healthy this month.",
    leakStage: null,
  };
}
