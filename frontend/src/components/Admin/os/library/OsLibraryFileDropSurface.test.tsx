import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OsLibraryFileDropSurface } from "./OsLibraryFileDropSurface";

function fileTransfer(files: File[], types = ["Files"]): DataTransfer {
  return {
    files,
    types,
    dropEffect: "none",
  } as unknown as DataTransfer;
}

describe("OsLibraryFileDropSurface", () => {
  it("shows a drop overlay and forwards every dropped file together", () => {
    const onFiles = vi.fn();
    render(
      <OsLibraryFileDropSurface onFiles={onFiles}>
        <p>Library content</p>
      </OsLibraryFileDropSurface>,
    );
    const surface = screen.getByText("Library content").closest("section");
    const files = [
      new File(["one"], "rules.pdf", { type: "application/pdf" }),
      new File(["two"], "stack.pdf", { type: "application/pdf" }),
    ];
    const dataTransfer = fileTransfer(files);

    fireEvent.dragEnter(surface as HTMLElement, { dataTransfer });
    expect(screen.getByRole("status")).toHaveTextContent(
      "Drop files to import",
    );

    fireEvent.drop(surface as HTMLElement, { dataTransfer });
    expect(onFiles).toHaveBeenCalledTimes(1);
    expect(onFiles).toHaveBeenCalledWith(files);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("ignores non-file drags used by other library interactions", () => {
    const onFiles = vi.fn();
    render(
      <OsLibraryFileDropSurface onFiles={onFiles}>
        <p>Library content</p>
      </OsLibraryFileDropSurface>,
    );
    const surface = screen.getByText("Library content").closest("section");
    const dataTransfer = fileTransfer([], ["text/plain"]);

    fireEvent.dragEnter(surface as HTMLElement, { dataTransfer });
    fireEvent.drop(surface as HTMLElement, { dataTransfer });

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(onFiles).not.toHaveBeenCalled();
  });
});
