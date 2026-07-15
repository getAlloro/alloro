import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { LeadgenEvent } from "../../../../types/leadgen";
import EventTimeline from "./EventTimeline";

const REPORT_EVENT: LeadgenEvent = {
  id: "synthetic-event",
  session_id: "synthetic-session",
  event_name: "report_engaged_1min",
  event_data: null,
  created_at: "2026-07-15T00:01:00.000Z",
};

describe("EventTimeline report integrity labels", () => {
  it("flags report activity on an audit-null session", () => {
    render(<EventTimeline events={[REPORT_EVENT]} hasAudit={false} />);

    expect(screen.getByText("Unverified report activity")).toBeInTheDocument();
    expect(
      screen.queryByText("Report Visible for 1+ Min"),
    ).not.toBeInTheDocument();
  });

  it("keeps the visible-time label when the session has an audit", () => {
    render(<EventTimeline events={[REPORT_EVENT]} hasAudit />);

    expect(screen.getByText("Report Visible for 1+ Min")).toBeInTheDocument();
  });
});
