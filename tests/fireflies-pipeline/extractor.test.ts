import { describe, test, expect, vi } from "vitest";
import {
  evidenceQuoteInTranscript,
  validateExtractionRecord,
} from "../../src/services/fireflies-pipeline/extractor";
import type {
  FirefliesTranscript,
  ExtractionRecord,
} from "../../src/services/fireflies-pipeline/types";

vi.mock("../../src/agents/service.llm-runner", () => ({
  runAgent: vi.fn(),
}));

const sampleTranscript: FirefliesTranscript = {
  id: "test-001",
  title: "Saif call about GBP connection",
  date: "2026-05-24T15:00:00Z",
  duration: 1800,
  attendees: [
    { name: "Saif", email: "saif@1endo.example.com" },
    { name: "Jo Hamilton", email: "jo@getalloro.com" },
  ],
  fullText:
    "Jo: Hey Saif, want to walk through the GBP issue? " +
    "Saif: Yeah, I tried to connect it last week and it just spun. " +
    "Jo: Let me share my screen. Can you click the OAuth button? " +
    "Saif: Done, I can see it now. Great. " +
    "Saif: One more thing, I want to give this another month before I decide. " +
    "Jo: Of course. Saif: This is the first dashboard I have actually used in months. " +
    "Saif: My associate, I am not sure she will use it though.",
  summary: "GBP-OAuth resolved during call; Saif committed to another month of trial; satisfaction signal positive but associate-adoption concern flagged.",
};

describe("evidenceQuoteInTranscript", () => {
  test("matches an exact verbatim quote", () => {
    expect(
      evidenceQuoteInTranscript("Done, I can see it now.", sampleTranscript.fullText),
    ).toBe(true);
  });

  test("matches case-insensitive", () => {
    expect(
      evidenceQuoteInTranscript("DONE, I CAN SEE IT NOW.", sampleTranscript.fullText),
    ).toBe(true);
  });

  test("matches with whitespace normalization", () => {
    expect(
      evidenceQuoteInTranscript(
        "Done,   I  can\nsee  it now.",
        sampleTranscript.fullText,
      ),
    ).toBe(true);
  });

  test("rejects a quote that does not appear in the transcript (hallucination guard)", () => {
    expect(
      evidenceQuoteInTranscript(
        "I am ready to renew for three years.",
        sampleTranscript.fullText,
      ),
    ).toBe(false);
  });

  test("rejects implausibly short quote (< 4 chars)", () => {
    expect(evidenceQuoteInTranscript("ok", sampleTranscript.fullText)).toBe(false);
    expect(evidenceQuoteInTranscript("", sampleTranscript.fullText)).toBe(false);
  });

  test("rejects null/undefined gracefully", () => {
    expect(
      evidenceQuoteInTranscript(null as unknown as string, sampleTranscript.fullText),
    ).toBe(false);
  });
});

describe("validateExtractionRecord", () => {
  const baseRecord: ExtractionRecord = {
    customer: "One Endodontics",
    transcript_id: "test-001",
    transcript_title: "Saif call",
    transcript_date: "2026-05-24T15:00:00Z",
    attendees: [
      { role: "doctor", name: "Saif" },
      { role: "alloro_team", name: "Jo" },
    ],
    status_change: {
      from: "churn-pending",
      to: "recovery-underway",
      evidence_quote: "I want to give this another month",
    },
    resolution_events: [
      {
        issue: "GBP-OAuth block",
        resolution: "OAuth flow walked through",
        evidence_quote: "Done, I can see it now.",
      },
    ],
    account_health_signals: [
      {
        signal_type: "satisfaction",
        polarity: "positive",
        confidence: "high",
        evidence_quote: "This is the first dashboard I have actually used in months.",
      },
    ],
    mentions: ["associate adoption concern"],
    extraction_notes: ["Inferred recovery-underway from 'another month' commitment."],
  };

  test("preserves valid record with verifiable quotes", () => {
    const result = validateExtractionRecord(baseRecord, sampleTranscript);
    expect(result).not.toBeNull();
    expect(result!.customer).toBe("One Endodontics");
    expect(result!.status_change).not.toBeNull();
    expect(result!.resolution_events).toHaveLength(1);
    expect(result!.account_health_signals).toHaveLength(1);
  });

  test("drops record entirely if customer is not in roster (hallucination)", () => {
    const bad: ExtractionRecord = { ...baseRecord, customer: "Fake Practice" };
    const result = validateExtractionRecord(bad, sampleTranscript);
    expect(result).toBeNull();
  });

  test("canonicalizes customer name via roster lookup", () => {
    const lowercased: ExtractionRecord = { ...baseRecord, customer: "one endodontics" };
    const result = validateExtractionRecord(lowercased, sampleTranscript);
    expect(result!.customer).toBe("One Endodontics");
  });

  test("drops status_change with quote not in transcript", () => {
    const bad: ExtractionRecord = {
      ...baseRecord,
      status_change: {
        from: "active",
        to: "churn-imminent",
        evidence_quote: "I am switching to a competitor tomorrow.",
      },
    };
    const result = validateExtractionRecord(bad, sampleTranscript);
    expect(result!.status_change).toBeNull();
  });

  test("drops resolution event with quote not in transcript, keeps valid events", () => {
    const mixed: ExtractionRecord = {
      ...baseRecord,
      resolution_events: [
        baseRecord.resolution_events[0]!,
        {
          issue: "fabricated issue",
          resolution: "fabricated resolution",
          evidence_quote: "I never said this sentence at all.",
        },
      ],
    };
    const result = validateExtractionRecord(mixed, sampleTranscript);
    expect(result!.resolution_events).toHaveLength(1);
    expect(result!.resolution_events[0]!.issue).toBe("GBP-OAuth block");
  });

  test("drops account_health_signal with hallucinated quote", () => {
    const bad: ExtractionRecord = {
      ...baseRecord,
      account_health_signals: [
        {
          signal_type: "intent_to_renew",
          polarity: "positive",
          confidence: "high",
          evidence_quote: "I will sign a five-year contract right now.",
        },
      ],
    };
    const result = validateExtractionRecord(bad, sampleTranscript);
    expect(result!.account_health_signals).toHaveLength(0);
  });

  test("preserves mentions and extraction_notes (no validation on those)", () => {
    const result = validateExtractionRecord(baseRecord, sampleTranscript);
    expect(result!.mentions).toEqual(["associate adoption concern"]);
    expect(result!.extraction_notes).toHaveLength(1);
  });
});
