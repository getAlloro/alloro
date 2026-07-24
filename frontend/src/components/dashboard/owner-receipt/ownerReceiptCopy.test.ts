import { describe, expect, it } from "vitest";

import type {
  FunnelMovementDiagnosis,
  FunnelTermMovement,
  ImpressionsTrend,
  ImpressionsWindowCoverage,
  OwnerReceiptMetric,
  ReceiptGate,
} from "../../../api/ownerReceipt";
import {
  actionLabel,
  ACTIONS_EMPTY,
  ACTIONS_HEADING,
  ACTIONS_FILTER_EMPTY,
  ACTIONS_FILTER_PLACEHOLDER,
  actionsSearchScopeNote,
  actionsTruncationNote,
  buildImpressionsTrendView,
  diagnosisSentence,
  formatDay,
  formatMetricValue,
  formatSignedCount,
  formatSignedPercent,
  gateLabel,
  LEADS_FLAT_SENTENCE,
  metricSourceNote,
  NOT_MEASURED,
  NOT_READY_BODY,
  NOT_READY_TITLE,
  RECEIPT_ERROR_ACCESS_BODY,
  RECEIPT_ERROR_ACCESS_TITLE,
  RECEIPT_ERROR_BODY,
  RECEIPT_ERROR_TITLE,
  receiptErrorCopy,
  RECEIPT_EYEBROW,
  RECEIPT_HEADLINE,
  RECEIPT_SUBLINE,
  TREND_HEADING,
  WINDOW_CONTROL_LABEL,
  WINDOW_CUSTOM_LABEL,
  WINDOW_CUSTOM_NOTE,
  WINDOW_LAG_NOTE,
  windowRangeLabel,
} from "./ownerReceiptCopy";

/**
 * The voice + honesty contract for the Owner Receipt copy.
 *
 * The card speaks to a business owner who is the HERO; Alloro is the quiet
 * guide. The copy is honest-but-intentional, and its rules are the kind a
 * future edit can quietly break — so they get a test, not a comment:
 *
 *  (a) NO HOMEWORK. Telling the hero to "take a look" re-summons the worry the
 *      guide is meant to defuse. No output may hand the owner an errand.
 *  (b) HONESTY GATE (Value #6). An absent number is the words "not measured",
 *      never a 0 standing in for absence; a measured 0 stays "0".
 *  (c) NO CAUSATION, AND NO EXCLUSIVITY. The trend is the only witness; no
 *      string says Alloro caused the change, and none claims a funnel term the
 *      backend did NOT rank held steady.
 *  (d) NOTHING TO CHASE. Every empty / not-ready state closes reassuring.
 *  (e) A FAILURE IS A FAILURE. A thrown request never reads as a data lag.
 *  (f) OUR WORDS, NOT THE BACKEND'S. The backend's `reason` strings are
 *      engineer prose; none of them may reach the owner.
 *
 * The test EXERCISES the real helpers across representative inputs and sweeps
 * their actual output — it does not scan the source text — so a rewrite that
 * keeps the file compiling but breaks the voice still fails here.
 */

// ── Fixtures ────────────────────────────────────────────────────────────────

const GATES: ReceiptGate[] = ["impressions", "visits", "leads"];

/**
 * The `reason` strings the backend actually emits today. These are the strings
 * the owner used to read verbatim, so every sweep below runs against the OUTPUT
 * produced when they are present — not against a fixture that steers around
 * them.
 */
const REAL_BACKEND_REASONS = {
  partialCoverage:
    "PRE window is only partially covered (12 of 28 days stored); POST window has no stored GSC-organic history",
  undiagnosable:
    "cannot decompose which term moved leads: pre visits is zero; post leads not measured",
  flat: "leads did not change",
};

function metric(over: Partial<OwnerReceiptMetric>): OwnerReceiptMetric {
  return {
    gate: "impressions",
    value: null,
    source: null,
    asOf: null,
    note: null,
    ...over,
  };
}

function coverage(
  over: Partial<ImpressionsWindowCoverage>,
): ImpressionsWindowCoverage {
  return {
    window: { start: "2026-05-01", end: "2026-05-28" },
    storedImpressions: 20000,
    storedDays: 28,
    expectedDays: 28,
    earliestStored: "2026-05-01",
    latestStored: "2026-05-28",
    fullyCovered: true,
    ...over,
  };
}

function trend(over: Partial<ImpressionsTrend>): ImpressionsTrend {
  return {
    organizationId: 39,
    projectId: "p1",
    source: "gsc_organic",
    pre: coverage({}),
    post: coverage({
      window: { start: "2026-05-29", end: "2026-06-25" },
      storedImpressions: 27151,
    }),
    delta: 7151,
    pctChange: 0.357,
    sufficient: true,
    reason: null,
    history: { earliest: "2026-05-01", latest: "2026-06-25" },
    ...over,
  };
}

const sufficientTrend = trend({});

/** The production insufficient case: partial PRE, absent POST, real reason. */
const insufficientTrend = trend({
  pre: coverage({ storedDays: 12, expectedDays: 28, fullyCovered: false }),
  post: null,
  delta: null,
  pctChange: null,
  sufficient: false,
  reason: REAL_BACKEND_REASONS.partialCoverage,
});

/** Nothing stored at all — the earliest state a new org sits in. */
const noHistoryTrend = trend({
  pre: null,
  post: null,
  delta: null,
  pctChange: null,
  sufficient: false,
  reason: "no stored GSC-organic history",
});

function term(
  name: FunnelTermMovement["term"],
  logContribution: number | null,
): FunnelTermMovement {
  return { term: name, pre: 1, post: 1, logContribution };
}

const ALL_TERMS_FORMED: FunnelTermMovement[] = [
  term("impressions", 0.2),
  term("CTR", 0.1),
  term("CRO", 0.05),
];

function diagnosis(
  over: Partial<FunnelMovementDiagnosis>,
): FunnelMovementDiagnosis {
  return {
    leadsPre: 6,
    leadsPost: 12,
    leadsChange: 6,
    leadsChangeFactor: 2,
    primaryDriver: null,
    terms: ALL_TERMS_FORMED,
    diagnosable: true,
    reason: null,
    ...over,
  };
}

const DRIVERS: NonNullable<FunnelMovementDiagnosis["primaryDriver"]>[] = [
  "impressions",
  "CTR",
  "CRO",
];

/** Every user-facing string the copy layer can emit, gathered from real calls. */
function allOutputs(): string[] {
  const out: string[] = [
    RECEIPT_EYEBROW,
    RECEIPT_HEADLINE,
    RECEIPT_SUBLINE,
    TREND_HEADING,
    ACTIONS_HEADING,
    ACTIONS_EMPTY,
    NOT_READY_TITLE,
    NOT_READY_BODY,
    RECEIPT_ERROR_TITLE,
    RECEIPT_ERROR_BODY,
    RECEIPT_ERROR_ACCESS_TITLE,
    RECEIPT_ERROR_ACCESS_BODY,
    NOT_MEASURED,
    LEADS_FLAT_SENTENCE,
    ACTIONS_FILTER_EMPTY,
    ACTIONS_FILTER_PLACEHOLDER,
    WINDOW_CONTROL_LABEL,
    WINDOW_CUSTOM_LABEL,
    WINDOW_CUSTOM_NOTE,
    WINDOW_LAG_NOTE,
    windowRangeLabel({
      preStart: "2026-05-26",
      preEnd: "2026-06-22",
      postStart: "2026-06-23",
      postEnd: "2026-07-20",
    }),
    actionsTruncationNote(50, 120),
    actionsSearchScopeNote(50, 120),
    formatMetricValue(null),
    formatMetricValue(27151),
    formatMetricValue(0),
    formatSignedCount(512),
    formatSignedPercent(0.18),
    formatDay(null),
    formatDay("2026-07-24"),
    actionLabel("review_reply"),
    actionLabel("local_post"),
    actionLabel("unknown_type"),
  ];

  for (const gate of GATES) out.push(gateLabel(gate));

  out.push(metricSourceNote(metric({ value: null })));
  out.push(metricSourceNote(metric({ value: 100, source: "gsc_organic" })));
  out.push(metricSourceNote(metric({ value: 100, source: "rybbit" })));
  out.push(metricSourceNote(metric({ value: 100, source: "form_submissions" })));

  const suf = buildImpressionsTrendView(sufficientTrend);
  out.push(
    suf.before ?? "",
    suf.after ?? "",
    suf.change ?? "",
    suf.beforeWindow ?? "",
    suf.afterWindow ?? "",
    suf.reason,
  );
  // Both insufficient shapes, INCLUDING the one carrying a real backend reason —
  // the branch that fires most often in production.
  out.push(buildImpressionsTrendView(insufficientTrend).reason);
  out.push(buildImpressionsTrendView(noHistoryTrend).reason);

  for (const driver of DRIVERS) {
    out.push(
      diagnosisSentence(diagnosis({ primaryDriver: driver, leadsChange: 6 })),
    );
    out.push(
      diagnosisSentence(diagnosis({ primaryDriver: driver, leadsChange: -6 })),
    );
  }
  out.push(
    diagnosisSentence(
      diagnosis({
        diagnosable: false,
        primaryDriver: null,
        reason: REAL_BACKEND_REASONS.undiagnosable,
        terms: [term("impressions", 0.2), term("CTR", null), term("CRO", null)],
      }),
    ),
  );
  out.push(
    diagnosisSentence(
      diagnosis({
        diagnosable: true,
        primaryDriver: null,
        leadsChange: 0,
        reason: REAL_BACKEND_REASONS.flat,
      }),
    ),
  );
  // A future equal-window guard / near-tie margin: every term formed, no driver.
  out.push(
    diagnosisSentence(
      diagnosis({ diagnosable: false, primaryDriver: null, leadsChange: 6 }),
    ),
  );

  return out.filter((s) => s.length > 0);
}

// ── (a) No homework — the banned phrases ────────────────────────────────────

const BANNED_HOMEWORK = [
  "worth a look",
  "take a look",
  "check out",
  "look into",
  "go look",
  "check on",
];

describe("Owner Receipt voice — no homework for the hero", () => {
  it("emits no banned 'go look' phrasing in any output", () => {
    const offenders: string[] = [];
    for (const text of allOutputs()) {
      const lower = text.toLowerCase();
      for (const phrase of BANNED_HOMEWORK) {
        if (lower.includes(phrase)) offenders.push(`"${text}" → ${phrase}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("proves the sweep is not vacuous — a planted phrase is caught", () => {
    const planted = "Your traffic dipped — worth a look on the website.";
    const hit = BANNED_HOMEWORK.some((p) => planted.toLowerCase().includes(p));
    expect(hit).toBe(true);
  });
});

// ── (b) Honesty gate — an absent number is words, never zero ─────────────────

describe("Owner Receipt honesty — an absent number reads 'not measured'", () => {
  it("formats a null value as the words, never '0' or a dash", () => {
    expect(formatMetricValue(null)).toBe("not measured");
    expect(formatMetricValue(null)).not.toBe("0");
    expect(formatMetricValue(null)).not.toContain("—");
  });

  it("a null-valued metric's source note never becomes '0'", () => {
    const note = metricSourceNote(metric({ value: null }));
    expect(note).toBe(NOT_MEASURED);
    expect(note).not.toBe("0");
  });

  it("still formats a genuine measured zero as '0', not the words", () => {
    // A real measured 0 is a fact; only ABSENCE becomes the words.
    expect(formatMetricValue(0)).toBe("0");
    expect(formatSignedCount(0)).toBe("0");
    expect(formatSignedPercent(0)).toBe("0%");
  });

  it("keeps the source note on a metric whose measured value is 0", () => {
    const note = metricSourceNote(
      metric({ gate: "leads", value: 0, source: "form_submissions" }),
    );
    expect(note).toBe("From your website forms");
    expect(note).not.toBe(NOT_MEASURED);
  });

  it("keeps a coverage caveat attached to a live number", () => {
    const note = metricSourceNote(
      metric({
        gate: "visits",
        value: 4102,
        source: "rybbit",
        note: "partial: 19 of 28 days",
      }),
    );
    expect(note).toContain("From your website");
    expect(note).toContain("partial: 19 of 28 days");
  });

  it("shows a genuine 0 as the BEFORE number, and a 0 delta as a delta", () => {
    const zeroBefore = buildImpressionsTrendView(
      trend({ pre: coverage({ storedImpressions: 0 }), pctChange: null }),
    );
    expect(zeroBefore.before).toBe("0");
    expect(zeroBefore.before).not.toBe(NOT_MEASURED);

    const zeroDelta = buildImpressionsTrendView(
      trend({ delta: 0, pctChange: 0 }),
    );
    expect(zeroDelta.hasDelta).toBe(true);
    expect(zeroDelta.change).toContain("0");
  });

  it("lets the coverage gate outrank a present delta, and survives a null window", () => {
    expect(
      buildImpressionsTrendView(trend({ sufficient: false, delta: 42 }))
        .hasDelta,
    ).toBe(false);
    expect(
      buildImpressionsTrendView(trend({ sufficient: true, delta: 5, pre: null }))
        .hasDelta,
    ).toBe(false);
  });
});

// ── (c) No causation, and no exclusivity ────────────────────────────────────

const CAUSAL_WORDS = [
  "caused",
  "because",
  "thanks to",
  "drove",
  "our work",
  "due to",
  "led to",
  "resulted in",
  "as a result of",
];

/**
 * A named driver is the term that moved MOST — a ranking, not an exclusivity
 * claim. When the backend's margin between two terms is thin, any sentence that
 * says another term stayed put is false. These are the phrasings that say that.
 */
const BANNED_EXCLUSIVITY = [
  "not more traffic",
  "traffic wasn't",
  "the visits held",
  "the same visits",
  "wasn't the cause",
  "only thing",
];

describe("Owner Receipt honesty — no output claims Alloro caused the change", () => {
  it("emits no causal word in any output", () => {
    const offenders: string[] = [];
    for (const text of allOutputs()) {
      const lower = text.toLowerCase();
      for (const word of CAUSAL_WORDS) {
        if (lower.includes(word)) offenders.push(`"${text}" → ${word}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("proves the causal sweep is not vacuous — planted phrasing is caught", () => {
    // The first line is the exact phrasing that shipped in #234, which the
    // original five-token list would have passed.
    const planted = [
      "More people reached out, and it's because more people saw you.",
      "Your leads rose due to our work this month.",
      "The posts we published led to more calls.",
    ];
    for (const text of planted) {
      const hit = CAUSAL_WORDS.some((w) => text.toLowerCase().includes(w));
      expect(hit).toBe(true);
    }
  });

  it("never claims a funnel term the backend did not rank held steady", () => {
    const offenders: string[] = [];
    for (const text of allOutputs()) {
      const lower = text.toLowerCase();
      for (const phrase of BANNED_EXCLUSIVITY) {
        if (lower.includes(phrase)) offenders.push(`"${text}" → ${phrase}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("states a real decline plainly, with no spin and no blame on Alloro", () => {
    const decline = diagnosisSentence(
      diagnosis({ primaryDriver: "CRO", leadsChange: -6 }),
    );
    expect(decline.toLowerCase()).toContain("fewer people reached out");
    for (const word of CAUSAL_WORDS) {
      expect(decline.toLowerCase()).not.toContain(word);
    }
  });
});

// ── (c2) A direction is only asserted when it was measured ──────────────────

describe("Owner Receipt — no direction is asserted about a flat or absent change", () => {
  it("says the number held when leads were measured and did not move", () => {
    const sentence = diagnosisSentence(
      diagnosis({
        diagnosable: true,
        primaryDriver: null,
        leadsChange: 0,
        reason: REAL_BACKEND_REASONS.flat,
      }),
    );
    expect(sentence).toBe(LEADS_FLAT_SENTENCE);
    expect(sentence.toLowerCase()).not.toContain("fewer people reached out");
  });

  it("never says 'fewer' about a FLAT month, even if a driver is named", () => {
    // The backend nulls `primaryDriver` on a flat month today, but the frontend
    // must not depend on backend behaviour it cannot enforce.
    const sentence = diagnosisSentence(
      diagnosis({ diagnosable: true, primaryDriver: "CRO", leadsChange: 0 }),
    );
    expect(sentence).toBe(LEADS_FLAT_SENTENCE);
    expect(sentence.toLowerCase()).not.toContain("fewer people reached out");
  });

  it("never says 'fewer' when the change itself was not measured", () => {
    const sentence = diagnosisSentence(
      diagnosis({
        diagnosable: true,
        primaryDriver: "impressions",
        leadsChange: null,
        reason: "post leads not measured",
      }),
    );
    expect(sentence.toLowerCase()).not.toContain("fewer people reached out");
    expect(sentence.toLowerCase()).toContain("can't yet say");
  });

  it("lets `diagnosable: false` veto a named driver on its own", () => {
    const sentence = diagnosisSentence(
      diagnosis({
        diagnosable: false,
        primaryDriver: "CRO",
        leadsChange: -6,
        reason: REAL_BACKEND_REASONS.undiagnosable,
      }),
    );
    expect(sentence.toLowerCase()).toContain("can't yet say");
    expect(sentence.toLowerCase()).not.toContain("fewer people reached out");
  });

  it("still names the biggest change when the movement is real and diagnosable", () => {
    const sentence = diagnosisSentence(
      diagnosis({ diagnosable: true, primaryDriver: "CTR", leadsChange: 6 }),
    );
    expect(sentence.toLowerCase()).toContain("more people reached out");
    expect(sentence.toLowerCase()).toContain("biggest change");
  });
});

// ── (d) Nothing to chase — empty states close reassuring ─────────────────────

describe("Owner Receipt voice — empty and not-ready states end reassuring", () => {
  const REASSURANCE = /nothing for you to do\.?$/i;

  it("the not-ready card body ends with 'Nothing for you to do'", () => {
    expect(NOT_READY_BODY).toMatch(REASSURANCE);
  });

  it("the empty-actions line ends with 'Nothing for you to do'", () => {
    expect(ACTIONS_EMPTY).toMatch(REASSURANCE);
  });

  it("both coverage-gap sentences end reassuring, not with a task", () => {
    expect(buildImpressionsTrendView(insufficientTrend).reason).toMatch(
      REASSURANCE,
    );
    expect(buildImpressionsTrendView(noHistoryTrend).reason).toMatch(
      REASSURANCE,
    );
  });

  it("the undiagnosable and flat sentences end reassuring", () => {
    expect(
      diagnosisSentence(
        diagnosis({
          diagnosable: false,
          primaryDriver: null,
          reason: REAL_BACKEND_REASONS.undiagnosable,
        }),
      ),
    ).toMatch(REASSURANCE);
    expect(LEADS_FLAT_SENTENCE).toMatch(REASSURANCE);
  });
});

// ── (e) A failure is reported as a failure ──────────────────────────────────

describe("Owner Receipt — a failed request never reads as a data lag", () => {
  it("returns the outage copy for a 500-style failure", () => {
    const copy = receiptErrorCopy(
      Object.assign(new Error("boom"), { code: "HTTP_500" }),
    );
    expect(copy.title).toBe(RECEIPT_ERROR_TITLE);
    expect(copy.body).toBe(RECEIPT_ERROR_BODY);
  });

  it("returns the access copy for a denial, however it is carried", () => {
    const denials: unknown[] = [
      Object.assign(new Error("denied"), { status: 403 }),
      Object.assign(new Error("denied"), { code: "HTTP_403" }),
      Object.assign(new Error("denied"), { status: 401 }),
      Object.assign(new Error("denied"), {
        code: "OWNER_RECEIPT_LOCATION_ACCESS_DENIED",
      }),
    ];
    for (const denial of denials) {
      const copy = receiptErrorCopy(denial);
      expect(copy.title).toBe(RECEIPT_ERROR_ACCESS_TITLE);
      expect(copy.body).toBe(RECEIPT_ERROR_ACCESS_BODY);
    }
  });

  it("never denies the fault, and never tells the owner to wait for data", () => {
    const failures: unknown[] = [
      Object.assign(new Error("a"), { code: "HTTP_403" }),
      Object.assign(new Error("b"), { code: "HTTP_404" }),
      Object.assign(new Error("c"), { code: "HTTP_500" }),
      new Error("no code at all"),
      null,
    ];
    for (const failure of failures) {
      const body = receiptErrorCopy(failure).body.toLowerCase();
      expect(body).not.toContain("as soon as the data is in");
      expect(body).not.toContain("still gathering");
      // The exact denial NOT_READY_BODY makes; it must never reach this branch.
      expect(body).not.toContain("it doesn't");
    }
  });
});

// ── (f) Our words, not the backend's ────────────────────────────────────────

describe("Owner Receipt — the backend's engineer prose never reaches the owner", () => {
  it("rewrites the partial-coverage reason instead of passing it through", () => {
    const view = buildImpressionsTrendView(insufficientTrend);
    expect(view.reason).not.toContain("PRE window");
    expect(view.reason).not.toContain("GSC-organic");
    expect(view.reason).not.toBe(REAL_BACKEND_REASONS.partialCoverage);
    // It still tells the owner the true shape of the gap.
    expect(view.reason).toContain("12 of the 28 days");
    // …and keeps the backend's own words for support, off the card.
    expect(view.debugReason).toBe(REAL_BACKEND_REASONS.partialCoverage);
  });

  it("rewrites the undiagnosable reason instead of passing it through", () => {
    const sentence = diagnosisSentence(
      diagnosis({
        diagnosable: false,
        primaryDriver: null,
        reason: REAL_BACKEND_REASONS.undiagnosable,
        terms: [term("impressions", 0.2), term("CTR", null), term("CRO", null)],
      }),
    );
    expect(sentence).not.toContain("decompose");
    expect(sentence).not.toBe(REAL_BACKEND_REASONS.undiagnosable);
    expect(sentence.toLowerCase()).toContain("still missing");
  });

  it("rewrites the flat-month reason instead of passing it through", () => {
    const sentence = diagnosisSentence(
      diagnosis({
        diagnosable: true,
        primaryDriver: null,
        leadsChange: 0,
        reason: REAL_BACKEND_REASONS.flat,
      }),
    );
    expect(sentence).not.toBe(REAL_BACKEND_REASONS.flat);
  });

  it("emits no backend jargon token in any output", () => {
    const JARGON = [
      "pre window",
      "post window",
      "gsc",
      "decompose",
      "diagnosable",
      "null",
      "stored",
    ];
    const offenders: string[] = [];
    for (const text of allOutputs()) {
      const lower = text.toLowerCase();
      for (const token of JARGON) {
        if (lower.includes(token)) offenders.push(`"${text}" → ${token}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

// ── Readability — the grade claim, computed here rather than asserted in prose ─

/** Vowel-group syllable heuristic — the standard one FK implementations use. */
function syllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (w.length === 0) return 0;
  if (w.length <= 3) return 1;
  const trimmed = w
    .replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "")
    .replace(/^y/, "");
  const groups = trimmed.match(/[aeiouy]{1,2}/g);
  return groups ? groups.length : 1;
}

/** Flesch-Kincaid grade level for one passage. */
function fkGrade(text: string): number {
  const sentences = Math.max(1, (text.match(/[.!?](\s|$)/g) ?? []).length);
  const words = text.split(/\s+/).filter((w) => /[a-z]/i.test(w));
  if (words.length === 0) return 0;
  const syllableTotal = words.reduce((sum, w) => sum + syllables(w), 0);
  return (
    0.39 * (words.length / sentences) +
    11.8 * (syllableTotal / words.length) -
    15.59
  );
}

/** Every owner-facing SENTENCE the card can show (labels and numbers excluded). */
function allProse(): string[] {
  const prose = [
    RECEIPT_HEADLINE,
    RECEIPT_SUBLINE,
    ACTIONS_EMPTY,
    NOT_READY_TITLE,
    NOT_READY_BODY,
    RECEIPT_ERROR_TITLE,
    RECEIPT_ERROR_BODY,
    RECEIPT_ERROR_ACCESS_TITLE,
    RECEIPT_ERROR_ACCESS_BODY,
    LEADS_FLAT_SENTENCE,
    ACTIONS_FILTER_EMPTY,
    WINDOW_CUSTOM_NOTE,
    WINDOW_LAG_NOTE,
    actionsTruncationNote(50, 120),
    actionsSearchScopeNote(50, 120),
    buildImpressionsTrendView(insufficientTrend).reason,
    buildImpressionsTrendView(noHistoryTrend).reason,
    diagnosisSentence(
      diagnosis({
        diagnosable: false,
        primaryDriver: null,
        reason: REAL_BACKEND_REASONS.undiagnosable,
        terms: [term("impressions", 0.2), term("CTR", null), term("CRO", null)],
      }),
    ),
    diagnosisSentence(
      diagnosis({ diagnosable: false, primaryDriver: null, leadsChange: 6 }),
    ),
  ];
  for (const driver of DRIVERS) {
    prose.push(
      diagnosisSentence(diagnosis({ primaryDriver: driver, leadsChange: 6 })),
    );
    prose.push(
      diagnosisSentence(diagnosis({ primaryDriver: driver, leadsChange: -6 })),
    );
  }
  return prose;
}

describe("Owner Receipt voice — the copy reads at an owner's grade level", () => {
  it("proves the grader is not vacuous — dense prose scores far above the bar", () => {
    const dense =
      "Subsequent to the aforementioned reconciliation, the multiplicative decomposition indicated that conversion optimization constituted the predominant contributory factor.";
    expect(fkGrade(dense)).toBeGreaterThan(12);
  });

  // Measured worst grade at this commit: 4.8 ("Fewer people reached out. The
  // biggest change happened on your site — a smaller share of the people who
  // visited reached out than before."). The bar is the 6.0 the PR claims, so
  // the claim is now a regression test rather than a line of prose.
  it("keeps every owner-facing sentence at or under grade 6", () => {
    const offenders = allProse()
      .map((text) => ({ text, grade: fkGrade(text) }))
      .filter((row) => row.grade > 6)
      .map((row) => `${row.grade.toFixed(1)} — "${row.text}"`);
    expect(offenders).toEqual([]);
  });
});
