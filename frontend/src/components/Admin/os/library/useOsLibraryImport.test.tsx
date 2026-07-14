import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useOsLibraryImport } from "./useOsLibraryImport";

const mocks = vi.hoisted(() => ({
  importFiles: vi.fn(),
}));

vi.mock("../../../../hooks/queries/useAdminOsImports", () => ({
  useImportOsFiles: () => ({ mutate: mocks.importFiles, isPending: false }),
}));

describe("useOsLibraryImport", () => {
  beforeEach(() => {
    mocks.importFiles.mockReset();
  });

  it("imports a native drop directly while leaving the modal closed", () => {
    const files = [
      new File(["one"], "rules.pdf", { type: "application/pdf" }),
      new File(["two"], "stack.pdf", { type: "application/pdf" }),
    ];
    const { result } = renderHook(() => useOsLibraryImport());

    act(() => result.current.handleDroppedFiles(files));

    expect(mocks.importFiles).toHaveBeenCalledTimes(1);
    expect(mocks.importFiles).toHaveBeenCalledWith({
      files,
      category: null,
      folderId: null,
    });
    expect(result.current.isImportOpen).toBe(false);
  });

  it("keeps the Import button on the explicit modal path", () => {
    const { result } = renderHook(() => useOsLibraryImport());

    act(() => result.current.handleOpenImport());
    expect(result.current.isImportOpen).toBe(true);

    act(() => result.current.handleCloseImport());
    expect(result.current.isImportOpen).toBe(false);
    expect(mocks.importFiles).not.toHaveBeenCalled();
  });
});
