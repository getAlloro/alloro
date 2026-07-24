import { describe, expect, it } from "vitest";

import type {
  FunnelMovementDiagnosis,
  ImpressionsTrend,
  OwnerReceiptMetric,
  ReceiptGate,
} from "../../../api/ownerReceipt";
import {
  actionLabel,
  ACTIONS_EMPTY,
  ACTIONS_HEADING,
  buildImpressionsTrendView,
  diagnosisSentence,
  formatDay,
  formatMetricValue,
  formatSignedCount,
  formatSignedPercent,
  gateLabel,
  metricSourceNote,
  NOT_MEASURED,
  NOT_READY_BODY,
  NOT_READY_TITLE,
  RECEIPT_EYEBROW,
  RECEIPT_HEADLINE,
  RECEIPT_SUBLINE,
  TREND_HEADING,
} from "./ownerReceiptCopy";

/**
 * The voice + honesty contract for the Owner Receipt copy.
 *
 * The card speaks to a business owner who is the HERO; Alloro is the quiet
 * guide. The copy is honest-but-intentional, and three of its rules are the
 * kind a future edit can quietly break — so they get a test, not a comment:
 *
 *  (a) NO HOMEWORK. Telling the hero to "take a look" re-summons the worry the
 *      guide is meant to defuse. No output may hand the owner an errand.
 *  (b) HONESTY GATE (Value #6). An absent number is the words "not measured",
 *      never a 0 standing in for absence.
 *  (c) NO CAUSATION. The trend is the only witness; no string says Alloro
 *      caused the change.
 *  (d) NOTHING TO CHASE. Every empty / not-ready state closes reassuring, not
 *      with a task.
 *
 * The test EXERCISES the real helpers across representative inputs and sweeps
 * their actual output — it does not scan the source text — so a rewrite that
 * keeps the file compiling but breaks the voice still fails here.
 */

// ── Fixtures ────────────────────────────────────────────────────────────────

const GATES: ReceiptGate[] = ["impressions", "visits", "leads"];

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

const sufficientTrend: ImpressionsTrend = {
  organizationId: 39,
  projectId: "p1",
  source: "gsc_organic",
  pre: {
    window: { start: "2026-05-01", end: "2026-05-31" },
    storedImpressions: 20000,
    storedDays: 31,
    expectedDays: 31,
    earliestStored: "2026-05-01",
    latestStored: "2026-05-31",
    fullyCovered: true,
  },
  post: {
    window: { start: "2026-06-01", end: "2026-06-30" },
    storedImpressions: 27151,
    storedDays: 30,
    expectedDays: 30,
    earliestStored: "2026-06-01",
    latestStored: "2026-06-30",
    fullyCovered: true,
  },
  delta: 7151,
  pctChange: 0.357,
  sufficient: true,
  reason: null,
  history: { earliest: "2026-05-01", latest: "2026-06-30" },
};

const insufficientTrend: ImpressionsTrend = {
  organizationId: 39,
  projectId: "p1",
  source: "gsc_organic",
  pre: null,
  post: null,
  delta: null,
  pctChange: null,
  sufficient: false,
  reason: null, // force the helper's own fallback copy (the string we own)
  history: { earliest: null, latest: null },
};

function diagnosis(
  over: Partial<FunnelMovementDiagnosis>,
): FunnelMovementDiagnosis {
  return {
    leadsPre: 6,
    leadsPost: 12,
    leadsChange: 6,
    leadsChangeFactor: 2,
    primaryDriver: null,
    terms: [],
    diagnosable: true,
    reason: null,
    ...over,
  };
}

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
    NOT_MEASURED,
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
  out.push(
    metricSourceNote(metric({ value: 100, source: "form_submissions" })),
  );

  const suf = buildImpressionsTrendView(sufficientTrend);
  out.push(
    suf.before ?? "",
    suf.after ?? "",
    suf.change ?? "",
    suf.beforeWindow ?? "",
    suf.afterWindow ?? "",
    suf.reason,
  );
  out.push(buildImpressionsTrendView(insufficientTrend).reason);

  const drivers: FunnelMovementDiagnosis["primaryDriver"][] = [
    "impressions",
    "CTR",
    "CRO",
  ];
  for (const driver of drivers) {
    out.push(
      diagnosisSentence(
        diagnosis({ primaryDriver: driver, leadsChange: 6 }),
      ),
    );
    out.push(
      diagnosisSentence(
        diagnosis({ primaryDriver: driver, leadsChange: -6 }),
      ),
    );
  }
  out.push(
    diagnosisSentence(diagnosis({ diagnosable: false, primaryDriver: null })),
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
    const hit = BANNED_HOMEWORK.some((p) =>
      planted.toLowerCase().includes(p),
    );
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
  });
});

// ── (c) No causation — the trend is the only witness ────────────────────────

const CAUSAL_WORDS = [
  "caused",
  "because of alloro",
  "thanks to",
  "drove",
  "our work",
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

// ── (d) Nothing to chase — empty states close reassuring ─────────────────────

describe("Owner Receipt voice — empty and not-ready states end reassuring", () => {
  const REASSURANCE = /nothing for you to do\.?$/i;

  it("the not-ready card body ends with 'Nothing for you to do'", () => {
    expect(NOT_READY_BODY).toMatch(REASSURANCE);
  });

  it("the empty-actions line ends with 'Nothing for you to do'", () => {
    expect(ACTIONS_EMPTY).toMatch(REASSURANCE);
  });

  it("the trend coverage-gap fallback ends reassuring, not with a task", () => {
    const reason = buildImpressionsTrendView(insufficientTrend).reason;
    expect(reason).toMatch(REASSURANCE);
  });
});
