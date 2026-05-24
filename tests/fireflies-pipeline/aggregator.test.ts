import { describe, test, expect } from "vitest";
import { aggregateProposals } from "../../src/services/fireflies-pipeline/aggregator";
import type { ExtractionRecord } from "../../src/services/fireflies-pipeline/types";

const baseExtraction = (overrides: Partial<ExtractionRecord> = {}): ExtractionRecord => ({
  customer: "One Endodontics",
  transcript_id: "fireflies://test-001",
  transcript_title: "Saif call",
  transcript_date: "2026-05-24T15:00:00Z",
  attendees: [
    { role: "doctor", name: "Saif" },
    { role: "alloro_team", name: "Jo" },
  ],
  status_change: null,
  resolution_events: [],
  account_health_signals: [],
  mentions: [],
  extraction_notes: [],
  ...overrides,
});

describe("aggregateProposals", () => {
  test("returns empty array when no extractions", () => {
    expect(aggregateProposals([], new Map())).toEqual([]);
  });

  test("generates one bullet per customer", () => {
    const extractions = [
      baseExtraction({ customer: "One Endodontics" }),
      baseExtraction({ customer: "Caswell Orthodontics" }),
    ];
    const proposals = aggregateProposals(extractions, new Map());
    expect(proposals.map((p) => p.customer).sort()).toEqual([
      "Caswell Orthodontics",
      "One Endodontics",
    ]);
  });

  test("appends event line to prior bullet text", () => {
    const ext = baseExtraction({
      resolution_events: [
        {
          issue: "GBP-OAuth block",
          resolution: "walked through OAuth",
          evidence_quote: "Done, I can see it now.",
        },
      ],
    });
    const priorBullets = new Map([
      ["One Endodontics", "One Endodontics (Saif): endodontics, Fredericksburg VA. $232K April production."],
    ]);
    const proposals = aggregateProposals([ext], priorBullets);
    expect(proposals[0]!.rendered_text).toContain("One Endodontics (Saif): endodontics");
    expect(proposals[0]!.rendered_text).toContain("$232K April production");
    expect(proposals[0]!.rendered_text).toContain("resolved GBP-OAuth block");
    expect(proposals[0]!.rendered_text).toContain("Done, I can see it now.");
    expect(proposals[0]!.rendered_text).toContain("Source: fireflies://test-001");
  });

  test("renders state-tag change suffix when status_change present", () => {
    const ext = baseExtraction({
      status_change: {
        from: "churn-pending",
        to: "recovery-underway",
        evidence_quote: "another month",
      },
    });
    const priorBullets = new Map([
      ["One Endodontics", "One Endodontics (Saif): endodontics, VA. EMPTY HERO despite data-rich state."],
    ]);
    const proposals = aggregateProposals([ext], priorBullets);
    expect(proposals[0]!.state_tag).toBe("RECOVERY-UNDERWAY");
    expect(proposals[0]!.rendered_text).toContain("RECOVERY-UNDERWAY");
    expect(proposals[0]!.rendered_text).toContain("was EMPTY HERO");
  });

  test("most-recent status wins across multiple transcripts", () => {
    const early = baseExtraction({
      transcript_id: "early",
      transcript_date: "2026-05-22T10:00:00Z",
      status_change: { from: "active", to: "concerned", evidence_quote: "q1" },
    });
    const late = baseExtraction({
      transcript_id: "late",
      transcript_date: "2026-05-24T10:00:00Z",
      status_change: { from: "concerned", to: "recovery-underway", evidence_quote: "q2" },
    });
    const proposals = aggregateProposals([late, early], new Map());
    expect(proposals[0]!.state_tag).toBe("RECOVERY-UNDERWAY");
  });

  test("bootstraps bullet from extraction for placeholder customers", () => {
    const ext = baseExtraction({
      customer: "Garrison Orthodontics",
      resolution_events: [
        {
          issue: "first contact",
          resolution: "demo scheduled",
          evidence_quote: "demo scheduled for June",
        },
      ],
    });
    const priorBullets = new Map([
      [
        "Garrison Orthodontics",
        "Garrison Orthodontics: multi-location ortho. Current state unknown to CW; Jo or Corey to populate.",
      ],
    ]);
    const proposals = aggregateProposals([ext], priorBullets);
    expect(proposals[0]!.rendered_text).toContain(
      "state populated 2026-05-24 from Fireflies pipeline",
    );
    expect(proposals[0]!.rendered_text).toContain("first contact");
  });

  test("includes all source transcript IDs in the bullet", () => {
    const a = baseExtraction({ transcript_id: "t-a" });
    const b = baseExtraction({ transcript_id: "t-b" });
    const proposals = aggregateProposals([a, b], new Map());
    expect(proposals[0]!.source_transcript_ids).toEqual(["t-a", "t-b"]);
    expect(proposals[0]!.rendered_text).toContain("t-a");
    expect(proposals[0]!.rendered_text).toContain("t-b");
  });

  test("source_record_count reflects number of records per customer", () => {
    const records = [
      baseExtraction({ transcript_id: "1" }),
      baseExtraction({ transcript_id: "2" }),
      baseExtraction({ transcript_id: "3" }),
    ];
    const proposals = aggregateProposals(records, new Map());
    expect(proposals[0]!.source_record_count).toBe(3);
  });

  test("renders confidence qualifier for non-high-confidence signals", () => {
    const ext = baseExtraction({
      account_health_signals: [
        {
          signal_type: "concern",
          polarity: "negative",
          confidence: "medium",
          evidence_quote: "not sure my associate will use it",
        },
      ],
    });
    const proposals = aggregateProposals([ext], new Map());
    expect(proposals[0]!.rendered_text).toContain("medium confidence");
  });

  test("proposals sorted by customer name alphabetically", () => {
    const proposals = aggregateProposals(
      [
        baseExtraction({ customer: "One Endodontics" }),
        baseExtraction({ customer: "Artful Orthodontics" }),
        baseExtraction({ customer: "Caswell Orthodontics" }),
      ],
      new Map(),
    );
    expect(proposals.map((p) => p.customer)).toEqual([
      "Artful Orthodontics",
      "Caswell Orthodontics",
      "One Endodontics",
    ]);
  });
});
