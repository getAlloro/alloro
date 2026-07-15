import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OsImportModal } from "./OsImportModal";

const mocks = vi.hoisted(() => ({
  startImport: vi.fn(),
}));

vi.mock("../../../../hooks/queries/useAdminOsImports", () => ({
  useImportOsFiles: () => ({
    mutate: mocks.startImport,
    isPending: false,
  }),
  useAdminOsDocumentImport: () => ({ data: null }),
}));

vi.mock("../../../../hooks/queries/useAdminOsDocuments", () => ({
  useAdminOsCategories: () => ({ data: [], isLoading: false }),
  useCreateOsCategory: () => ({ isPending: false, mutate: vi.fn() }),
}));

describe("OsImportModal picker batch", () => {
  beforeEach(() => {
    mocks.startImport.mockReset();
  });

  it("submits all files dropped inside the explicit Import modal", () => {
    const files = [
      new File(["one"], "rules.pdf", { type: "application/pdf" }),
      new File(["two"], "stack.pdf", { type: "application/pdf" }),
    ];
    const onClose = vi.fn();
    render(<OsImportModal isOpen onClose={onClose} />);

    fireEvent.drop(screen.getByRole("button", { name: "Add files to import" }), {
      dataTransfer: { files },
    });

    expect(mocks.startImport).toHaveBeenCalledTimes(1);
    expect(mocks.startImport).toHaveBeenCalledWith(
      { files, category: null, folderId: null },
      { onSuccess: expect.any(Function) },
    );
  });
});
