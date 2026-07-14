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
 * A gbp PRESENCE/profile signal maps to Findable; a gbp POST is a conversion
 * move and is never emitted as a Findable/rank fix, so this never implies a post
 * improves rank.
 */
export const DOMAIN_TO_STAGE: Record<string, JourneyStage> = {
  ranking: "findable",
  gbp: "findable",
  review: "choosable",
  "form-submission": "bookable",
  referral: "memorable",
  "pms-data-quality": "memorable",
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

/**
 * The health/leak verdict sentence. The leak STAGE is named from the stat tones
 * (stats carry no authored `stage` field), so the verdict and the eyebrow agree
 * on one screen.
 */
export function buildHealthVerdict(tones: StageTones): HealthVerdict {
  const measured = STAGE_ORDER.filter((s) => tones[s] !== "neutral");

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
      text: `Alloro spotted one gap this month: your ${STAGE_LABEL[critical]} stage is slipping. Here's the move.`,
      leakStage: critical,
    };
  }

  // Then a single warn gap.
  const warn = STAGE_ORDER.find((s) => tones[s] === "warn");
  if (warn) {
    return {
      text: `Healthy overall, with one gap Alloro caught: your ${STAGE_LABEL[warn]} stage. Here's the move.`,
      leakStage: warn,
    };
  }

  // All measured tones positive → the clean-week exhale, scoped to what we can see.
  const allSeen = measured.length === STAGE_ORDER.length;
  return {
    text: allSeen
      ? "Your practice is healthy this month. Nothing slipped where Alloro can see it."
      : "Based on what Alloro can see, your practice is healthy this month.",
    leakStage: null,
  };
}
