import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PasteProgress } from "./PasteProgress";

describe("PasteProgress", () => {
  it("marks active parsing as indeterminate without a fabricated value", () => {
    render(
      <PasteProgress
        phase="parsing"
        rowsParsed={null}
        requiresSanitization={false}
      />,
    );

    const progress = screen.getByRole("progressbar");
    expect(progress).not.toHaveAttribute("aria-valuenow");
    expect(progress).toHaveAttribute(
      "aria-valuetext",
      "Parsing the complete pasted dataset",
    );
    expect(screen.queryByText("Clean sources")).toBeNull();
  });

  it("shows the real completed row count during default source cleaning", () => {
    render(
      <PasteProgress
        phase="sanitizing"
        rowsParsed={600}
        requiresSanitization
      />,
    );

    expect(screen.getByRole("progressbar")).not.toHaveAttribute(
      "aria-valuenow",
    );
    expect(
      screen.getByText("Parsed 600 rows. Cleaning similar sources"),
    ).toBeInTheDocument();
    expect(screen.getByText("Clean sources")).toBeInTheDocument();
  });

  it("uses 100 percent only for the ready state", () => {
    render(
      <PasteProgress
        phase="ready"
        rowsParsed={600}
        requiresSanitization={false}
      />,
    );

    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "100",
    );
    expect(screen.getByText("600 rows are ready")).toBeInTheDocument();
  });
});
