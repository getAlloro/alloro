import { describe, expect, it } from "vitest";
import type { PatientJourneyStage } from "../../../types/patientJourney";
import { stageGateSubtext, stageTooltip } from "./patientJourney.utils";

function impressionsStage(
  overrides: Partial<PatientJourneyStage> = {},
): PatientJourneyStage {
  return {
    key: "impressions",
    label: "Google Visibility",
    metaLabel: "How often you showed up on Google",
    value: 2400,
    available: true,
    source: "Google Search Console + Business Profile",
    asOf: "2026-07-15",
    shared: true,
    ...overrides,
  };
}

describe("stageGateSubtext — impressions honesty", () => {
  it("does not describe the combined number as search-only", () => {
    const subtext = stageGateSubtext(impressionsStage());
    // The gate now folds whole-practice GBP Maps into GSC organic, so a
    // "Google search impressions" subtext would under-describe it.
    expect(subtext).toBe("How often you showed up on Google");
    expect(subtext).not.toMatch(/search/i);
  });
});

describe("stageTooltip — shadow of the combined source", () => {
  it("prefers the note, which must itself stay honest for a multi-location org", () => {
    // stageTooltip returns `note?.trim() || source`: a note SHADOWS the
    // corrected combined source. The shared multi-location note must therefore
    // not claim website-only, or the tooltip mislabels the Maps-inclusive number.
    const withNote = stageTooltip(
      impressionsStage({ note: "Whole-practice total — all locations." }),
    );
    expect(withNote).toBe("Whole-practice total — all locations.");
    expect(withNote).not.toMatch(/website/i);
  });

  it("falls back to the combined source when there is no note", () => {
    expect(stageTooltip(impressionsStage())).toBe(
      "Google Search Console + Business Profile",
    );
  });
});
