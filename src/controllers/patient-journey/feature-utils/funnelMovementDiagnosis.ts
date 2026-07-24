/**
 * Funnel-movement diagnosis — the doctor's "why" behind a change in leads.
 *
 * The staked funnel is `submissions = impressions × CTR × CRO`, where
 * `impressions` is Get Found (gate 1), `CTR = visits / impressions` is Get
 * Considered (gate 2), and `CRO = leads / visits` is Get Chosen (gate 3). Given
 * a PRE and a POST reading of the three gate numbers, this decides which of the
 * three terms moved leads the most — e.g. "leads doubled while impressions
 * FELL, so the driver is CRO."
 *
 * It is DETERMINISTIC ARITHMETIC ONLY — no LLM, no model call, no DB. It is
 * deliberately NOT `ctrAttributionMath` (that instrument is CTR-only and reads a
 * rise in impressions as `trending_down`); this reads all three terms.
 *
 * HONESTY (Value #6 — a fabricated explanation is worse than none):
 *  - Every term carries its measured pre/post. An absent gate stays `null` with
 *    a plain-words reason; it is NEVER coerced to 0 or invented.
 *  - A driver is named ONLY when a full multiplicative decomposition is honest:
 *    all six gate numbers present and strictly positive (a zero or a missing
 *    value makes the log-ratio undefined). Otherwise `primaryDriver` is `null`
 *    and `reason` says why — never a guess.
 *  - It claims NO causation. It reports which term moved; "Alloro caused it" is a
 *    human's conclusion to draw from the dated actions, not this math's to assert.
 *
 * The method: `leads = impressions × CTR × CRO`, so
 * `ln(leadsPost/leadsPre) = ln(imprPost/imprPre) + ln(CTRpost/CTRpre) + ln(CROpost/CROpre)`
 * EXACTLY. Each term's log-change is its additive contribution to the change in
 * leads; the primary driver is the term contributing most in the direction leads
 * actually moved.
 */

/** The three multiplicative terms of `submissions = impressions × CTR × CRO`. */
export type FunnelTerm = "impressions" | "CTR" | "CRO";

/** One window's three gate numbers. `null` = not measured (never 0-as-absent). */
export interface FunnelGateTriple {
  /** Get Found — impressions (organic, coverage-guarded upstream). */
  impressions: number | null;
  /** Get Considered — visits. */
  visits: number | null;
  /** Get Chosen — leads (form submissions). */
  leads: number | null;
}

/** Pre/post for one term plus its additive log-contribution to Δln(leads). */
export interface FunnelTermMovement {
  term: FunnelTerm;
  pre: number | null;
  post: number | null;
  /**
   * Natural-log contribution to the change in leads (`ln(post/pre)`); `null`
   * when it cannot be honestly formed (a missing or non-positive pre/post).
   */
  logContribution: number | null;
}

export interface FunnelMovementDiagnosis {
  leadsPre: number | null;
  leadsPost: number | null;
  /** `post - pre`; `null` when either leads value is absent. */
  leadsChange: number | null;
  /** `post / pre`; `null` when pre is 0 or a value is absent (no honest ratio). */
  leadsChangeFactor: number | null;
  /**
   * The term that moved leads the most in the direction leads actually moved;
   * `null` when the decomposition isn't honest (see `reason`).
   */
  primaryDriver: FunnelTerm | null;
  /** impressions, CTR, CRO — each with its pre/post and log-contribution. */
  terms: FunnelTermMovement[];
  /** True only when a full, honest multiplicative decomposition was possible. */
  diagnosable: boolean;
  /** Plain-words reason it isn't diagnosable; `null` when diagnosable. */
  reason: string | null;
}

/** A finite, strictly-positive number — the only input a log-ratio can take. */
function isPositive(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && value > 0;
}

/** `numerator / denominator` when both are usable, else `null` (no fake rate). */
function safeRatio(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || !isPositive(denominator)) return null;
  return numerator / denominator;
}

/** `ln(post/pre)` when both are strictly positive, else `null`. */
function logChange(pre: number | null, post: number | null): number | null {
  if (!isPositive(pre) || !isPositive(post)) return null;
  return Math.log(post / pre);
}

/** Build a term row: its pre/post value and its log-contribution. */
function buildTerm(
  term: FunnelTerm,
  pre: number | null,
  post: number | null
): FunnelTermMovement {
  return { term, pre, post, logContribution: logChange(pre, post) };
}

/**
 * Name the term that moved leads most in the direction leads moved. Assumes all
 * three contributions are present (diagnosable path). Ties resolve to the first
 * in funnel order (impressions → CTR → CRO), a stable, arbitrary-but-fixed rule.
 */
function pickPrimaryDriver(
  terms: FunnelTermMovement[],
  leadsRose: boolean
): FunnelTerm {
  let best = terms[0];
  for (const term of terms) {
    const c = term.logContribution as number;
    const bestC = best.logContribution as number;
    // Rose -> the most positive contribution drove it; fell -> the most negative.
    if (leadsRose ? c > bestC : c < bestC) best = term;
  }
  return best.term;
}

/** Plain-words reason a triple can't be decomposed (names the offending gate). */
function undiagnosableReason(pre: FunnelGateTriple, post: FunnelGateTriple): string {
  const problems: string[] = [];
  const check = (label: string, value: number | null): void => {
    if (value === null) problems.push(`${label} not measured`);
    else if (!isPositive(value)) problems.push(`${label} is zero`);
  };
  check("pre impressions", pre.impressions);
  check("pre visits", pre.visits);
  check("pre leads", pre.leads);
  check("post impressions", post.impressions);
  check("post visits", post.visits);
  check("post leads", post.leads);
  return problems.length
    ? `cannot decompose which term moved leads: ${problems.join("; ")}`
    : "cannot decompose which term moved leads";
}

/**
 * Diagnose which funnel term moved leads between a PRE and a POST window.
 *
 * Pure and total: never throws, never invents. When the six gate numbers don't
 * support an honest decomposition it returns the measured pre/post it does have,
 * `primaryDriver: null`, and a plain-words `reason`.
 */
export function diagnoseFunnelMovement(
  pre: FunnelGateTriple,
  post: FunnelGateTriple
): FunnelMovementDiagnosis {
  // Derived rates per window (null unless the denominator is usable).
  const ctrPre = safeRatio(pre.visits, pre.impressions);
  const ctrPost = safeRatio(post.visits, post.impressions);
  const croPre = safeRatio(pre.leads, pre.visits);
  const croPost = safeRatio(post.leads, post.visits);

  const terms: FunnelTermMovement[] = [
    buildTerm("impressions", pre.impressions, post.impressions),
    buildTerm("CTR", ctrPre, ctrPost),
    buildTerm("CRO", croPre, croPost),
  ];

  const leadsChange =
    pre.leads === null || post.leads === null ? null : post.leads - pre.leads;
  const leadsChangeFactor = safeRatio(post.leads, pre.leads);

  // Diagnosable only when every term's contribution is a real number — which
  // requires all six gate values present and strictly positive.
  const allContributionsPresent = terms.every((t) => t.logContribution !== null);
  const base: FunnelMovementDiagnosis = {
    leadsPre: pre.leads,
    leadsPost: post.leads,
    leadsChange,
    leadsChangeFactor,
    primaryDriver: null,
    terms,
    diagnosable: false,
    reason: null,
  };

  if (!allContributionsPresent) {
    return { ...base, reason: undiagnosableReason(pre, post) };
  }
  if (leadsChange === 0) {
    // Terms may have moved and cancelled; naming a "driver" of a net-zero change
    // would overstate. Report the decomposition, name no driver.
    return { ...base, diagnosable: true, reason: "leads did not change" };
  }

  return {
    ...base,
    diagnosable: true,
    primaryDriver: pickPrimaryDriver(terms, (leadsChange as number) > 0),
  };
}
