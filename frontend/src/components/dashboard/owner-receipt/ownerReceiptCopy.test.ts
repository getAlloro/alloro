import { describe, expect, it } from "vitest";

import type {
  FunnelMovementDiagnosis,
  ImpressionsTrend,
  ImpressionsWindowCoverage,
  OwnerReceiptMetric,
} from "../../../api/ownerReceipt";
import {
  actionsTruncationNote,
  buildImpressionsTrendView,
  diagnosisSentence,
  formatMetricValue,
  formatSignedCount,
  formatSignedPercent,
  metricSourceNote,
  NOT_MEASURED,
  RECEIPT_ERROR_ACCESS_BODY,
  RECEIPT_ERROR_ACCESS_TITLE,
  RECEIPT_ERROR_BODY,
  RECEIPT_ERROR_TITLE,
  receiptErrorCopy,
} from "./ownerReceiptCopy";

/**
 * The adversarial honesty contract for the Owner Receipt copy helpers.
 *
 * These are the cases where a helper could quietly say something the data does
 * not support: a measured 0 collapsing into the words "not measured", a
 * coverage caveat being dropped off a live number, a direction being asserted
 * about a flat month, or a request failure being dressed as a data lag. Each
 * one exercises the real helper — none scans source text — so a rewrite that
 * keeps the file compiling still fails here.
 */

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
      storedImpressions: 20500,
    }),
    delta: 500,
    pctChange: 0.025,
    sufficient: true,
    reason: null,
    history: { earliest: "2026-05-01", latest: "2026-06-25" },
    ...over,
  };
}

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

// ── A measured zero is a fact, never the words ──────────────────────────────

describe("Owner Receipt — a measured 0 never collapses into 'not measured'", () => {
  it("formats a real 0 as '0' and a null as the words", () => {
    expect(formatMetricValue(0)).toBe("0");
    expect(formatMetricValue(null)).toBe(NOT_MEASURED);
  });

  it("signs a zero delta and a zero percent without inventing a direction", () => {
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

  it("shows a genuine 0 as the BEFORE number, not as 'not measured'", () => {
    const view = buildImpressionsTrendView(
      trend({
        pre: coverage({ storedImpressions: 0 }),
        delta: 500,
        pctChange: null,
      }),
    );
    expect(view.hasDelta).toBe(true);
    expect(view.before).toBe("0");
    expect(view.before).not.toBe(NOT_MEASURED);
  });

  it("renders a measured delta of exactly 0 as a delta, not as a coverage gap", () => {
    const view = buildImpressionsTrendView(trend({ delta: 0, pctChange: 0 }));
    expect(view.hasDelta).toBe(true);
    expect(view.change).toContain("0");
  });
});

// ── A caveated number is never rendered as a clean one ──────────────────────

describe("Owner Receipt — a coverage caveat survives onto a live number", () => {
  it("keeps a present metric's note alongside its source label", () => {
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

  it("still reads the note alone when the source is one we have no label for", () => {
    expect(
      metricSourceNote(
        metric({ value: 12, source: "some_new_source", note: "estimated" }),
      ),
    ).toBe("estimated");
  });
});

// ── Coverage wins over a present delta ──────────────────────────────────────

describe("Owner Receipt — the coverage gate outranks a present number", () => {
  it("refuses a delta when the backend says the windows are not covered", () => {
    const view = buildImpressionsTrendView(
      trend({ sufficient: false, delta: 42, reason: "PRE window not covered" }),
    );
    expect(view.hasDelta).toBe(false);
    expect(view.reason).toBe("PRE window not covered");
  });

  it("does not crash, and shows no delta, when a coverage object is null", () => {
    const view = buildImpressionsTrendView(
      trend({ sufficient: true, delta: 5, pre: null }),
    );
    expect(view.hasDelta).toBe(false);
  });
});

// ── A direction is only asserted when it was measured ───────────────────────

describe("Owner Receipt — no direction is asserted about a flat or absent change", () => {
  it("falls to the reason when the backend names no driver", () => {
    const sentence = diagnosisSentence(
      diagnosis({
        diagnosable: true,
        primaryDriver: null,
        leadsChange: 0,
        reason: "leads did not change",
      }),
    );
    expect(sentence).toBe("leads did not change");
    expect(sentence.toLowerCase()).not.toContain("fewer people reached out");
  });

  it("never says 'fewer' about a FLAT month, even if a driver is named", () => {
    // The backend nulls `primaryDriver` on a flat month today, but the frontend
    // must not depend on backend behaviour it cannot enforce.
    const sentence = diagnosisSentence(
      diagnosis({
        diagnosable: true,
        primaryDriver: "CRO",
        leadsChange: 0,
        reason: "leads did not change",
      }),
    );
    expect(sentence).toBe("leads did not change");
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
    expect(sentence).toBe("post leads not measured");
    expect(sentence.toLowerCase()).not.toContain("fewer people reached out");
  });

  it("lets `diagnosable: false` veto a named driver on its own", () => {
    const sentence = diagnosisSentence(
      diagnosis({
        diagnosable: false,
        primaryDriver: "CRO",
        leadsChange: -6,
        reason: "cannot decompose which term moved leads",
      }),
    );
    expect(sentence).toBe("cannot decompose which term moved leads");
  });

  it("still names the term when the change is real and diagnosable", () => {
    const sentence = diagnosisSentence(
      diagnosis({ diagnosable: true, primaryDriver: "CTR", leadsChange: 6 }),
    );
    expect(sentence.toLowerCase()).toContain("more people reached out");
  });
});

// ── A failure is reported as a failure ──────────────────────────────────────

describe("Owner Receipt — a failed request never reads as a data lag", () => {
  it("returns the outage copy for a 500-style failure", () => {
    const copy = receiptErrorCopy(
      Object.assign(new Error("boom"), { code: "HTTP_500" }),
    );
    expect(copy.title).toBe(RECEIPT_ERROR_TITLE);
    expect(copy.body).toBe(RECEIPT_ERROR_BODY);
  });

  it("returns the access copy for a 403 carried on `status`", () => {
    const copy = receiptErrorCopy(
      Object.assign(new Error("denied"), { status: 403 }),
    );
    expect(copy.title).toBe(RECEIPT_ERROR_ACCESS_TITLE);
    expect(copy.body).toBe(RECEIPT_ERROR_ACCESS_BODY);
  });

  it("returns the access copy for a 403 carried as an HTTP_403 code", () => {
    expect(
      receiptErrorCopy(Object.assign(new Error("denied"), { code: "HTTP_403" }))
        .title,
    ).toBe(RECEIPT_ERROR_ACCESS_TITLE);
  });

  it("returns the access copy for the backend's domain ACCESS_DENIED code", () => {
    expect(
      receiptErrorCopy(
        Object.assign(new Error("denied"), {
          code: "OWNER_RECEIPT_LOCATION_ACCESS_DENIED",
        }),
      ).title,
    ).toBe(RECEIPT_ERROR_ACCESS_TITLE);
  });

  it("never tells the owner to wait for data on ANY failure", () => {
    const failures: unknown[] = [
      Object.assign(new Error("a"), { code: "HTTP_403" }),
      Object.assign(new Error("b"), { code: "HTTP_404" }),
      Object.assign(new Error("c"), { code: "HTTP_500" }),
      new Error("no code at all"),
      null,
    ];
    for (const failure of failures) {
      const copy = receiptErrorCopy(failure);
      expect(copy.body.toLowerCase()).not.toContain("as soon as the data is in");
      expect(copy.body.toLowerCase()).not.toContain("still gathering");
    }
  });
});

// ── A truncated list says it is truncated ───────────────────────────────────

describe("Owner Receipt — a capped action list states the cap", () => {
  it("names both the shown count and the real total", () => {
    const note = actionsTruncationNote(50, 120);
    expect(note).toContain("50");
    expect(note).toContain("120");
  });
});
