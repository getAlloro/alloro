import { describe, expect, it } from "vitest";
import type {
  PatientJourneyPeriod,
  PatientJourneyStage,
} from "../../../types/patientJourney";
import { buildGateDetailContent } from "./patientJourneyDetailDeck.utils";

const period: PatientJourneyPeriod = {
  label: "July 2026",
  startDate: "2026-07-01",
  endDate: "2026-07-31",
};

function impressionsStage(
  gsc?: PatientJourneyStage["metadata"],
): PatientJourneyStage {
  return {
    key: "impressions",
    label: "Google Visibility",
    metaLabel: "How often you showed up on Google",
    value: 2400,
    available: true,
    source: "Google Search Console + Business Profile",
    asOf: "2026-07-15",
    shared: false,
    metadata: gsc,
    actions: [],
  };
}

describe("buildGateDetailContent — Google visibility", () => {
  it("scopes clicks and CTR to Search only, so they never claim to divide into the Maps-inclusive impressions", () => {
    const content = buildGateDetailContent(
      impressionsStage({
        gsc: {
          clicks: 84,
          ctr: 0.035,
          position: 8.2,
          topQueries: [],
          topPages: [],
          top10QueryCount: 4,
          top3QueryCount: 1,
        },
      }),
      period,
      null,
    );

    expect(content.summary).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Search clicks", value: "84" }),
        expect.objectContaining({
          label: "Search click-through rate",
          value: "3.5%",
        }),
      ]),
    );
    // The labels must scope the metric to Search — never a bare "Google
    // click-through rate" that reads as CTR over the combined impressions.
    const labels = content.summary.map((item) => item.label);
    expect(labels).not.toContain("Google click-through rate");
    // The footer must not imply a combined CTR; it states the Search-only scope.
    expect(content.footer).toMatch(/Search Console only/i);
  });

  it("uses honest empty values when Search Console metadata is absent", () => {
    const content = buildGateDetailContent(
      impressionsStage(undefined),
      period,
      null,
    );

    expect(content.summary.map((item) => item.value)).toEqual(["—", "—"]);
  });
});
