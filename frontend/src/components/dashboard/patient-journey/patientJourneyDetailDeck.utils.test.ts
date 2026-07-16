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
    metaLabel: "Google search impressions",
    value: 2400,
    available: true,
    source: "Google Search Console",
    asOf: "2026-07-15",
    shared: false,
    metadata: gsc,
    actions: [],
  };
}

describe("buildGateDetailContent — Google visibility", () => {
  it("formats clicks and ratio-based CTR for non-technical users", () => {
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
        expect.objectContaining({ label: "Google clicks", value: "84" }),
        expect.objectContaining({
          label: "Google click-through rate",
          value: "3.5%",
        }),
      ]),
    );
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
