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
 *  - The two windows must be the SAME LENGTH. Impressions and leads are counts:
 *    they scale with window length, while CTR and CRO are rates and do not. So
 *    an unequal pair dumps `ln(lenPost/lenPre)` entirely onto the impressions
 *    term and then names it the driver — a calendar artifact reported as an
 *    explanation. Refused outright; `spanDays` is required so a caller cannot
 *    forget to say.
 *  - A driver must actually STAND OUT. When the top two terms are near-tied, or
 *    when large opposing moves nearly cancel, no term is named: `margin` and
 *    `marginRatio` are on the wire so a consumer can see how close it was.
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

/**
 * Ceiling for a believable click-through rate.
 *
 * `CTR = visits / impressions` is only a click-through rate when the numerator
 * and the denominator describe the same surface. Today they do not: `visits` is
 * Rybbit ALL-CHANNEL traffic (search + direct + social + referral) and
 * `impressions` is Google Search ORGANIC ONLY. A social campaign therefore
 * pushes the quotient above 1 — a "400% click-through rate" — and, unguarded,
 * gets named the driver, relabelling a social push as a search-snippet win.
 *
 * A ratio above 1 is arithmetically impossible for a real click-through rate,
 * so it is proof the two numbers are not commensurable for this practice. The
 * honest response is to publish no CTR reading at all and say why. The cost is
 * accepted and deliberate: mixed-traffic practices lose CTR diagnosis until the
 * visits source can be narrowed to the search channel.
 */
const MAX_BELIEVABLE_CTR = 1;

/**
 * How far the leading term must beat the runner-up before it may be called THE
 * driver, as a share of the total gross movement (Σ|contribution|).
 *
 * Below this the top two are a near-tie and the single word "impressions" would
 * carry information the arithmetic does not support.
 */
const MIN_DRIVER_MARGIN_RATIO = 0.25;

/**
 * How much of the gross movement must survive as net movement before any driver
 * is named, as `|Δln(leads)| / Σ|contribution|`.
 *
 * Below this the terms moved a lot and nearly cancelled — e.g. impressions up
 * 65% while CRO fell 38%, netting +3% leads. Naming one of them "the driver" of
 * that +3% describes the arithmetic accurately and the practice misleadingly.
 */
const MIN_NET_MOVEMENT_RATIO = 0.25;

/** One window's three gate numbers. `null` = not measured (never 0-as-absent). */
export interface FunnelGateTriple {
  /** Get Found — impressions (organic, coverage-guarded upstream). */
  impressions: number | null;
  /** Get Considered — visits. */
  visits: number | null;
  /** Get Chosen — leads (form submissions). */
  leads: number | null;
  /**
   * Inclusive calendar-day length of the window these numbers were read over.
   *
   * REQUIRED, and `null` means "unknown" rather than "does not matter": two of
   * the three gates are counts, so a decomposition across windows of different
   * lengths measures the calendar. An unknown span fails closed.
   */
  spanDays: number | null;
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

/** What the diagnosis concluded — the discriminant a consumer should branch on. */
export type FunnelDiagnosisOutcome =
  /** One term stands out; `primaryDriver` is set. */
  | "driver"
  /** Decomposed fine, but leads did not move. No driver to name. */
  | "no_change"
  /** Decomposed fine, but no term stands out (near-tie or a near-cancellation). */
  | "no_dominant_term"
  /** The numbers do not support a decomposition at all. */
  | "undiagnosable";

export interface FunnelMovementDiagnosis {
  leadsPre: number | null;
  leadsPost: number | null;
  /** `post - pre`; `null` when either leads value is absent. */
  leadsChange: number | null;
  /** `post / pre`; `null` when pre is 0 or a value is absent (no honest ratio). */
  leadsChangeFactor: number | null;
  /**
   * The term that moved leads the most in the direction leads actually moved,
   * by a margin wide enough to be worth saying out loud; `null` in every other
   * case (see `outcome` and `reason`).
   */
  primaryDriver: FunnelTerm | null;
  /** impressions, CTR, CRO — each with its pre/post and log-contribution. */
  terms: FunnelTermMovement[];
  /**
   * How much the leading term beat the runner-up, in log units, in the
   * direction leads moved. `null` when the terms could not be compared.
   */
  margin: number | null;
  /**
   * `margin` as a share of the total gross movement (0..1) — the scale-free
   * form. Near 0 means the top two were effectively tied. `null` when the terms
   * could not be compared.
   */
  marginRatio: number | null;
  /** True when a full, honest multiplicative decomposition was possible. */
  diagnosable: boolean;
  /**
   * Plain-words reason no single term is named; `null` only when `outcome` is
   * `"driver"`. Note a decomposition can succeed (`diagnosable: true`) and still
   * name no driver — read `outcome`, not `diagnosable`, to decide what to show.
   */
  reason: string | null;
  /** The discriminant: what this diagnosis actually concluded. */
  outcome: FunnelDiagnosisOutcome;
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

/** The leading term, the runner-up gap, and the gross movement. */
interface DriverRanking {
  leader: FunnelTerm;
  /** Leader's lead over the runner-up, in log units (always >= 0). */
  margin: number;
  /** Σ|contribution| — the total movement before cancellation. */
  gross: number;
}

/**
 * Rank the terms in the direction leads actually moved.
 *
 * Assumes all three contributions are present (diagnosable path). Ties resolve
 * to the first in funnel order (impressions → CTR → CRO) and produce a margin
 * of 0, which the caller then refuses — a tie is never silently broken into a
 * confident answer.
 */
function rankDrivers(
  terms: FunnelTermMovement[],
  leadsRose: boolean
): DriverRanking {
  // Score each term in the direction leads moved, so "biggest" always means
  // "most responsible" whether leads rose or fell.
  const scored = terms.map((t) => {
    const contribution = t.logContribution as number;
    return { term: t.term, score: leadsRose ? contribution : -contribution };
  });
  const gross = scored.reduce((sum, s) => sum + Math.abs(s.score), 0);

  let leader = scored[0];
  let runnerUp = scored[1];
  for (const candidate of scored) {
    if (candidate.score > leader.score) {
      runnerUp = leader;
      leader = candidate;
    } else if (candidate !== leader && candidate.score > runnerUp.score) {
      runnerUp = candidate;
    }
  }
  // Guard the degenerate case where the initial runner-up IS the leader.
  if (runnerUp === leader) {
    runnerUp = scored.find((s) => s !== leader) ?? leader;
  }

  return { leader: leader.term, margin: leader.score - runnerUp.score, gross };
}

/** Plain-words reason a triple can't be decomposed (names the offending gate). */
function undiagnosableReason(pre: FunnelGateTriple, post: FunnelGateTriple): string {
  const problems: string[] = [];
  const check = (label: string, value: number | null): void => {
    if (value === null) {
      problems.push(`${label} not measured`);
    } else if (!Number.isFinite(value)) {
      // NaN / Infinity. Saying "is zero" here would be a false statement, in a
      // module whose whole point is that a fabricated explanation is worse than
      // none.
      problems.push(`${label} is not a usable number`);
    } else if (value < 0) {
      problems.push(`${label} is negative`);
    } else if (value === 0) {
      problems.push(`${label} is zero`);
    }
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
 * support an honest decomposition — or support one but name no clear driver —
 * it returns the measured pre/post it does have, `primaryDriver: null`, an
 * `outcome` discriminant, and a plain-words `reason`.
 */
export function diagnoseFunnelMovement(
  pre: FunnelGateTriple,
  post: FunnelGateTriple
): FunnelMovementDiagnosis {
  // Derived rates per window (null unless the denominator is usable).
  let ctrPre = safeRatio(pre.visits, pre.impressions);
  let ctrPost = safeRatio(post.visits, post.impressions);
  const croPre = safeRatio(pre.leads, pre.visits);
  const croPost = safeRatio(post.leads, post.visits);

  // An impossible click-through rate is proof the numerator and denominator
  // describe different surfaces. Publish no reading rather than a wrong one.
  const ctrIsImpossible =
    (ctrPre !== null && ctrPre > MAX_BELIEVABLE_CTR) ||
    (ctrPost !== null && ctrPost > MAX_BELIEVABLE_CTR);
  if (ctrIsImpossible) {
    ctrPre = null;
    ctrPost = null;
  }

  const terms: FunnelTermMovement[] = [
    buildTerm("impressions", pre.impressions, post.impressions),
    buildTerm("CTR", ctrPre, ctrPost),
    buildTerm("CRO", croPre, croPost),
  ];

  const leadsChange =
    pre.leads === null || post.leads === null ? null : post.leads - pre.leads;
  const leadsChangeFactor = safeRatio(post.leads, pre.leads);

  const base: FunnelMovementDiagnosis = {
    leadsPre: pre.leads,
    leadsPost: post.leads,
    leadsChange,
    leadsChangeFactor,
    primaryDriver: null,
    terms,
    margin: null,
    marginRatio: null,
    diagnosable: false,
    reason: null,
    outcome: "undiagnosable",
  };

  // Comparability first: no arrangement of the six numbers rescues a
  // decomposition across windows of different lengths.
  if (pre.spanDays === null || post.spanDays === null) {
    return {
      ...base,
      reason:
        "cannot decompose which term moved leads: the length of the before/after windows is unknown",
    };
  }
  if (pre.spanDays !== post.spanDays) {
    return {
      ...base,
      reason: `cannot decompose which term moved leads: the before and after windows are different lengths (${pre.spanDays} vs ${post.spanDays} days), so the change would measure the calendar, not the practice`,
    };
  }

  if (ctrIsImpossible) {
    return {
      ...base,
      reason:
        "cannot decompose which term moved leads: the click-through term is not comparable — website visits count every channel (search, direct, social, referral) while impressions count Google Search organic only, so the ratio came out above 100%",
    };
  }

  // Diagnosable only when every term's contribution is a real number — which
  // requires all six gate values present and strictly positive.
  const allContributionsPresent = terms.every((t) => t.logContribution !== null);
  if (!allContributionsPresent) {
    return { ...base, reason: undiagnosableReason(pre, post) };
  }

  if (leadsChange === 0) {
    // Terms may have moved and cancelled; naming a "driver" of a net-zero change
    // would overstate. Report the decomposition, name no driver.
    return {
      ...base,
      diagnosable: true,
      reason: "leads did not change",
      outcome: "no_change",
    };
  }

  const ranking = rankDrivers(terms, (leadsChange as number) > 0);
  const marginRatio = ranking.gross > 0 ? ranking.margin / ranking.gross : 0;
  const netRatio =
    ranking.gross > 0 ? Math.abs(Math.log(leadsChangeFactor as number)) / ranking.gross : 0;
  const decomposed = {
    ...base,
    diagnosable: true,
    margin: ranking.margin,
    marginRatio,
  };

  if (marginRatio < MIN_DRIVER_MARGIN_RATIO) {
    return {
      ...decomposed,
      reason:
        "no single term stands out — the top two moved by nearly the same amount, so naming one would claim more than the numbers show",
      outcome: "no_dominant_term",
    };
  }
  if (netRatio < MIN_NET_MOVEMENT_RATIO) {
    return {
      ...decomposed,
      reason:
        "no single term stands out — the terms moved in opposite directions and nearly cancelled, so the change in leads is a small remainder of much larger moves",
      outcome: "no_dominant_term",
    };
  }

  return {
    ...decomposed,
    primaryDriver: ranking.leader,
    outcome: "driver",
  };
}
