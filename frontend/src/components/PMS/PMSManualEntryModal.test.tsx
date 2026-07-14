import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PMSManualEntryModal } from "./PMSManualEntryModal";
import { isCurrentFormulaRequest } from "./usePmsManualEntry";

const formulaState = vi.hoisted(() => ({
  canConfigureFormula: true,
  drawerOpen: false,
}));

vi.mock("./pmsCopy", () => ({
  usePmsCopy: () => ({
    manualEntryTitle: "Manual entry",
    manualEntrySubtitle: "Enter data",
  }),
}));

vi.mock("./usePmsManualEntry", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("./usePmsManualEntry")
  >();
  return {
    ...actual,
    usePmsManualEntry: () => ({
      canConfigureFormula: formulaState.canConfigureFormula,
      currentMapping: { headers: ["Production"], assignments: [] },
      mappingSource: "org-cache",
      drawerOpen: formulaState.drawerOpen,
      setDrawerOpen: () => undefined,
      isResolvingMapping: false,
      isDragging: false,
      submitStatus: "success",
      showPasteConfirm: false,
      monthConflicts: null,
      pendingMonths: null,
      showMonthPicker: false,
      mappingHeaders: ["Production"],
      mappingSampleRows: [],
      mappingAllRows: [],
      isReprocessing: false,
      setCurrentMapping: () => undefined,
      handleReprocess: () => undefined,
    }),
  };
});

vi.mock("./ColumnMappingDrawer", () => ({
  ColumnMappingDrawer: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div>Formula drawer</div> : null,
}));

describe("PMSManualEntryModal formula visibility", () => {
  beforeEach(() => {
    formulaState.canConfigureFormula = true;
    formulaState.drawerOpen = false;
  });

  function renderModal() {
    render(
      <PMSManualEntryModal
        isOpen
        onClose={() => undefined}
        clientId="example.test"
        targetMonth="2026-05"
      />,
    );
  }

  it("shows formula settings for a resolved default parser mapping", () => {
    renderModal();

    expect(
      screen.getByRole("button", { name: "Formula settings" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Formula drawer")).not.toBeInTheDocument();
  });

  it("renders the open formula drawer for the default parser", () => {
    formulaState.drawerOpen = true;
    renderModal();

    expect(screen.getByText("Formula drawer")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Formula settings" }),
    ).not.toBeInTheDocument();
  });

  it("hides both controls for a custom parser despite stale mapping state", () => {
    formulaState.canConfigureFormula = false;
    formulaState.drawerOpen = true;
    renderModal();

    expect(
      screen.queryByRole("button", { name: "Formula settings" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Formula drawer")).not.toBeInTheDocument();
  });

  it("rejects a mapping response invalidated by a newer parser result", () => {
    const mappingRequestVersion = 4;

    expect(isCurrentFormulaRequest(mappingRequestVersion, 4)).toBe(true);
    expect(isCurrentFormulaRequest(mappingRequestVersion, 5)).toBe(false);
  });
});
