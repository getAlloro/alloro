import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PatientJourneyActionNote } from "./PatientJourneyActionNote";

describe("PatientJourneyActionNote", () => {
  it("shows plain action and watch-window copy without a performance claim", () => {
    render(
      <PatientJourneyActionNote
        action={{
          id: "action-1",
          actionType: "seo_meta_update",
          metricKey: "ctr",
          occurredAt: "2026-07-15T12:00:00.000Z",
          activeUntil: "2026-08-14T12:00:00.000Z",
          summary:
            "Updated Google search titles and descriptions on 6 pages.",
          measurementNote:
            "Watching Google click-through through August 14.",
        }}
      />,
    );

    expect(screen.getByRole("complementary", { name: "Alloro action" })).toBeInTheDocument();
    expect(screen.getByText("Alloro did this")).toBeInTheDocument();
    expect(screen.getByText("Completed Jul 15")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Updated Google search titles and descriptions on 6 pages.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/Watching Google click-through/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/improved|increased|caused/i);
  });
});
