import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SubmissionSummary } from "../../../types/leadgen";
import { LeadgenSubmissionRow } from "./LeadgenSubmissionRow";

const BASE_SUBMISSION: SubmissionSummary = {
  id: "synthetic-session",
  email: null,
  domain: null,
  practice_search_string: null,
  audit_id: null,
  audit_status: null,
  user_agent: "Mozilla/5.0 (Macintosh) Chrome/126.0",
  final_stage: "landed",
  completed: false,
  abandoned: false,
  first_seen_at: "2026-07-15T00:00:00.000Z",
  last_seen_at: "2026-07-15T00:00:00.000Z",
};

function renderRow(submission: SubmissionSummary) {
  render(
    <table>
      <tbody>
        <LeadgenSubmissionRow
          submission={submission}
          isActive={false}
          isSelected={false}
          isSelectionEnabled={false}
          isDeleting={false}
          onRowClick={vi.fn()}
          onDelete={vi.fn()}
        />
      </tbody>
    </table>,
  );
}

describe("LeadgenSubmissionRow", () => {
  it("does not turn a derived email match into an account link", () => {
    renderRow({ ...BASE_SUBMISSION, linked_via: "email" });

    expect(screen.getByText("Landed on Page")).toBeInTheDocument();
    expect(
      screen.getByText("Existing account email match"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Account linked")).not.toBeInTheDocument();
    expect(screen.queryByText("Converted")).not.toBeInTheDocument();
  });

  it("renders persisted account, conversion, and abandonment separately", () => {
    renderRow({
      ...BASE_SUBMISSION,
      user_id: 42,
      converted_at: "2026-07-15T00:01:00.000Z",
      abandoned: true,
    });

    expect(screen.getByText("Account linked")).toBeInTheDocument();
    expect(screen.getByText("Converted")).toBeInTheDocument();
    expect(screen.getByText("Abandoned")).toBeInTheDocument();
  });

  it("labels invalid historical report activity without making a time claim", () => {
    renderRow({
      ...BASE_SUBMISSION,
      final_stage: "report_engaged_1min",
      data_quality: "report_without_audit",
    });

    expect(screen.getByText("Unverified report activity")).toBeInTheDocument();
    expect(
      screen.queryByText("Report Visible for 1+ Min"),
    ).not.toBeInTheDocument();
  });

  it("uses the visible-time label for valid report activity", () => {
    renderRow({
      ...BASE_SUBMISSION,
      final_stage: "report_engaged_1min",
      data_quality: "valid",
    });

    expect(screen.getByText("Report Visible for 1+ Min")).toBeInTheDocument();
  });
});
