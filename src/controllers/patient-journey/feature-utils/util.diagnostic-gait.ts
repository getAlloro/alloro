/**
 * Patient Journey — the diagnostic gait (brick 1 of the diagnostic coordination layer).
 *
 * WHAT THIS REPLACES. Until now the binding constraint was chosen by one line of
 * arithmetic: the smallest non-null step percentage wins. That is a lone number
 * read without context — it fires on three visitors, it blames the snippet when
 * nothing ranks on page one, and it never declines to answer. The owner-facing
 * headline was built straight off it.
 *
 * WHAT IT DOES INSTEAD. It runs the diagnostic gait the master profiles share
 * (the "THE CORE GAIT" section of the business-doctor strategy reference, held
 * outside this repository — ask the owner for it rather than grepping):
 *
 *   Move 1 — read the constellation, never the lone number. A step is judged
 *            with the paired signals the assembler already carries, not by its
 *            ratio alone, and the signals used are recorded. Those signals were
 *            being assembled and ignored.
 *   Move 2 — trace surface to root. When the click-through step is weak because
 *            nothing ranks on the first page, the root is ranking, not page
 *            titles — so this refuses to name the metadata and says why.
 *   Move 3 — feature-vs-bug: check the symptom against the model's own baseline
 *            before treating it. A weak click-through when no query reaches the
 *            first page is what that model looks like working normally. A step
 *            whose denominator is under the floor is a small-numbers artifact.
 *   Move 4 — find ONE binding constraint. The worst step in the funnel is the
 *            candidate, and it is named ONLY if it is diagnosable. See "THE
 *            GLOBAL-MINIMUM RULE" below — this is the part that is easy to get
 *            catastrophically wrong.
 *   Move 5 — source truth, never invent; refuse the uncontrollable. When the
 *            worst step cannot be diagnosed, this ABSTAINS and says why. It
 *            never names an opportunity it cannot support.
 *
 * THE GLOBAL-MINIMUM RULE (do not "simplify" this away).
 * An earlier version of this file selected the lowest rate among the steps that
 * SURVIVED the gates. That is a trap, and an adversarial review caught it firing
 * on a realistic account: a practice with a 1% click-through from page two and a
 * healthy 50% visit-to-lead step had its catastrophic step excluded as expected,
 * whereupon the healthy step was promoted to "your largest opportunity — only
 * 50% moved through," and `buildBookableCandidate` then told the owner the
 * booking step was "where you're losing the most" while 7,920 people were being
 * lost upstream. Excluding a step must never promote a healthier one.
 *
 * So: the candidate is the global minimum across ALL steps that have a rate. It
 * is named only if it is itself diagnosable. If the worst step is excluded, the
 * gait abstains and reports the exclusion that applied TO THE WORST STEP — it
 * does not fall through to the next survivor.
 *
 * SCOPE — deliberately shape-identical. This changes which step is selected and
 * the sentence explaining it. It changes NO field in the API contract: the
 * frontend mirrors `types.ts` verbatim, so adding an owner-facing verdict or a
 * constellation readout is a two-repo change and is sequenced as brick 2. The
 * reasoning is returned to the service for structured logging and asserted in
 * unit tests; it does not reach the payload.
 *
 * NOT BUILT HERE, ON PURPOSE (each needs data or evidence this does not have):
 *   • Separating a conversion problem from a traffic problem. This is a real
 *     doctor move (Laja), and an earlier version implemented it by excluding the
 *     visit-to-lead step below ~1.05 pages per session. That threshold had no
 *     source, and it had a perverse failure mode: the product's OWN bookable
 *     advice is "make your booking form the first thing visitors see," which
 *     structurally produces single-page sessions — so following Alloro's advice
 *     would permanently suppress diagnosis of that step. Pages-per-session is
 *     now read as corroboration only. Restoring the split needs a sourced
 *     threshold, not a plausible one.
 *   • The reverse-flywheel alarm the doctor calls first-class — it needs a prior
 *     period, and this service reads one month. Named, not faked.
 *   • Routing the constraint up to the impressions/ranking gate itself
 *     (`leakStageKey = "impressions"`), which no frontend has ever received for
 *     a leak. Brick 2.
 *   • The FOUND constellation proper (proximity, grid-not-one-point, matched
 *     competitors). This reads two scalar gates, not that constellation.
 *   • The CRO constellation from Clarity (rage clicks, scroll depth). The
 *     extraction for it is a separate branch, held because Clarity captures
 *     nothing on most sites today — so wiring it here would read a dark
 *     instrument. See BUILD-QUESTIONS.md Q3.
 */

import type {
  PatientJourneyConversion,
  PatientJourneyStage,
  PatientJourneyStageKey,
} from "./types";

/**
 * Below this many people entering a step, the ratio is a small-numbers artifact
 * and not a diagnosable defect. Matches the floor the Bookable card already
 * applies in `funnelMath.ts` — reusing the project's existing judgment rather
 * than introducing a second, differently-argued number. It is an operational
 * threshold, not an industry benchmark, and nothing here claims otherwise.
 */
export const MIN_DIAGNOSABLE_DENOMINATOR = 10;

/**
 * Why a step was taken out of contention for the binding constraint.
 *
 * `expected-for-position` is judged on `top10QueryCount` — how many of the
 * account's top queries actually rank in the first ten results — NOT on GSC's
 * average position. Average position is impressions-weighted across every query,
 * so a practice ranking #1 for its money terms plus one high-impression generic
 * term on page three averages past 10 while ranking perfectly well. Counting
 * queries answers the question the average only appears to answer.
 */
export type StepExclusion =
  | "no-data"
  | "insufficient-sample"
  | "expected-for-position";

/** How much the selection is worth. Never a confidence score — a stated basis. */
export type ConstraintBasis = "corroborated" | "uncorroborated" | "abstained";

export interface StepAssessment {
  fromKey: PatientJourneyStageKey;
  toKey: PatientJourneyStageKey;
  pct: number | null;
  /** Number of people who entered this step; drives the sample gate. */
  denominator: number | null;
  eligible: boolean;
  excludedBy?: StepExclusion;
  /** Independent signals that agree with treating this step. Move 1. */
  corroboration: string[];
}

export interface FunnelDiagnosis {
  /** Index into the conversions array, or -1 when the gait abstains. */
  leakIndex: number;
  leakStageKey: PatientJourneyStageKey | null;
  basis: ConstraintBasis;
  /** Set only when abstaining: why THE WORST step could not be diagnosed. */
  abstainedBecause?: StepExclusion;
  assessments: StepAssessment[];
}

/** Narrow read of the stage metadata the readers already attach. */
interface StageSignals {
  gscPosition: number | null;
  gscCtr: number | null;
  gscTop10QueryCount: number | null;
  rybbitPagesPerSession: number | null;
  rybbitBounceRate: number | null;
}

function readSignals(stage: PatientJourneyStage | undefined): StageSignals {
  const metadata = (stage?.metadata ?? {}) as {
    gsc?: {
      position?: number;
      ctr?: number;
      top10QueryCount?: number;
    };
    rybbit?: { pagesPerSession?: number; bounceRate?: number };
  };
  const num = (value: unknown): number | null =>
    typeof value === "number" && Number.isFinite(value) ? value : null;

  // `summarizeGsc` returns position 0 AND ctr 0 when there were no organic
  // impressions at all — a no-data sentinel, not a first-place ranking. A
  // maps-only account hits this while still carrying a large stage value, so
  // reading 0 as "rank 1" would fabricate a first-page claim. Both fields are
  // only trustworthy when position is positive.
  const rawPosition = num(metadata.gsc?.position);
  const hasOrganicSignal = rawPosition !== null && rawPosition > 0;

  return {
    gscPosition: hasOrganicSignal ? rawPosition : null,
    gscCtr: hasOrganicSignal ? num(metadata.gsc?.ctr) : null,
    gscTop10QueryCount: hasOrganicSignal
      ? num(metadata.gsc?.top10QueryCount)
      : null,
    rybbitPagesPerSession: num(metadata.rybbit?.pagesPerSession),
    rybbitBounceRate: num(metadata.rybbit?.bounceRate),
  };
}

/**
 * Move 3 — feature-vs-bug, per step type. Returns the exclusion when the symptom
 * is what this model looks like when it is working normally, plus any signal
 * that corroborates treating the step (Move 1).
 */
function assessStep(
  conversion: PatientJourneyConversion,
  fromStage: PatientJourneyStage | undefined,
  toStage: PatientJourneyStage | undefined,
): { excludedBy?: StepExclusion; corroboration: string[] } {
  const corroboration: string[] = [];
  const fromSignals = readSignals(fromStage);

  // impressions → visits is a click-through step. Judge it against rank first.
  if (conversion.fromKey === "impressions" && conversion.toKey === "visits") {
    const top10 = fromSignals.gscTop10QueryCount;
    if (top10 !== null && top10 === 0) {
      // Move 2 — the root is ranking, not the page metadata.
      return { excludedBy: "expected-for-position", corroboration };
    }
    if (top10 !== null && top10 > 0) {
      corroboration.push(
        `${top10} of your top search terms rank in the first ten results, so a weak click-through is not explained by rank`,
      );
    }
    if (fromSignals.gscCtr !== null) {
      corroboration.push(
        `Search Console click-through is ${(fromSignals.gscCtr * 100).toFixed(2)}%`,
      );
    }
    return { corroboration };
  }

  // visits → leads is a conversion step. Pages-per-session and bounce are read
  // as corroboration only — see the header note on why they must not exclude.
  if (conversion.fromKey === "visits" && conversion.toKey === "leads") {
    const visitSignals = readSignals(
      fromStage?.key === "visits" ? fromStage : toStage,
    );
    if (visitSignals.rybbitPagesPerSession !== null) {
      corroboration.push(
        `visitors viewed ${visitSignals.rybbitPagesPerSession.toFixed(2)} pages per session`,
      );
    }
    if (visitSignals.rybbitBounceRate !== null) {
      corroboration.push(
        `bounce rate is ${(visitSignals.rybbitBounceRate * 100).toFixed(1)}%`,
      );
    }
    return { corroboration };
  }

  return { corroboration };
}

/**
 * Run the gait across the funnel and return the one binding constraint, or an
 * honest abstention. Pure: no DB, no clock, no model call.
 */
export function diagnoseFunnel(
  stages: PatientJourneyStage[],
  conversions: PatientJourneyConversion[],
): FunnelDiagnosis {
  const stageByKey = new Map(stages.map((stage) => [stage.key, stage]));

  const assessments: StepAssessment[] = conversions.map((conversion) => {
    const fromStage = stageByKey.get(conversion.fromKey);
    const toStage = stageByKey.get(conversion.toKey);
    const denominator = fromStage?.available ? (fromStage.value ?? null) : null;

    if (conversion.pct === null || denominator === null) {
      return {
        fromKey: conversion.fromKey,
        toKey: conversion.toKey,
        pct: conversion.pct,
        denominator,
        eligible: false,
        excludedBy: "no-data",
        corroboration: [],
      };
    }

    if (denominator < MIN_DIAGNOSABLE_DENOMINATOR) {
      return {
        fromKey: conversion.fromKey,
        toKey: conversion.toKey,
        pct: conversion.pct,
        denominator,
        eligible: false,
        excludedBy: "insufficient-sample",
        corroboration: [],
      };
    }

    const { excludedBy, corroboration } = assessStep(
      conversion,
      fromStage,
      toStage,
    );

    return {
      fromKey: conversion.fromKey,
      toKey: conversion.toKey,
      pct: conversion.pct,
      denominator,
      eligible: !excludedBy,
      ...(excludedBy ? { excludedBy } : {}),
      corroboration,
    };
  });

  // Move 4 — the candidate is the WORST step in the funnel, not the worst
  // survivor. Excluding a step must never promote a healthier one to "your
  // largest opportunity"; see THE GLOBAL-MINIMUM RULE in the header.
  let worstIndex = -1;
  let smallest = Number.POSITIVE_INFINITY;
  assessments.forEach((assessment, index) => {
    if (assessment.pct === null) return;
    if (assessment.pct < smallest) {
      smallest = assessment.pct;
      worstIndex = index;
    }
  });

  if (worstIndex === -1) {
    return {
      leakIndex: -1,
      leakStageKey: null,
      basis: "abstained",
      abstainedBecause: "no-data",
      assessments,
    };
  }

  const worst = assessments[worstIndex];

  // Move 5 — if the worst step is not diagnosable, say so. Do not answer a
  // different question by naming whichever step happened to survive.
  if (!worst.eligible) {
    return {
      leakIndex: -1,
      leakStageKey: null,
      basis: "abstained",
      abstainedBecause: worst.excludedBy ?? "no-data",
      assessments,
    };
  }

  return {
    leakIndex: worstIndex,
    leakStageKey: worst.toKey,
    basis: worst.corroboration.length > 0 ? "corroborated" : "uncorroborated",
    assessments,
  };
}
