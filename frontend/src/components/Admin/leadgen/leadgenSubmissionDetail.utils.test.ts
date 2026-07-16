import { describe, expect, it } from "vitest";
import type { LeadgenEventName } from "../../../types/leadgen";
import { eventLabel } from "./leadgenSubmissionDetail.utils";

const REPORT_SURFACE_EVENTS: LeadgenEventName[] = [
  "stage_viewed_5",
  "email_gate_shown",
  "email_submitted",
  "results_viewed",
  "report_engaged_1min",
];

describe("leadgen submission detail event labels", () => {
  it.each(REPORT_SURFACE_EVENTS)(
    "flags %s as unverified when the session has no audit",
    (eventName) => {
      expect(eventLabel(eventName, false)).toBe("Unverified report activity");
    },
  );

  it("keeps the visible-time claim for a report event with an audit", () => {
    expect(eventLabel("report_engaged_1min", true)).toBe(
      "Report Visible for 1+ Min",
    );
  });

  it("does not relabel pre-report activity on an audit-null session", () => {
    expect(eventLabel("input_submitted", false)).toBe("Submitted Search");
  });
});
