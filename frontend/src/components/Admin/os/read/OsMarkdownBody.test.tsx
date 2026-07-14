import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OsEditor } from "../edit/OsEditor";
import { OsDropzone } from "../import/OsDropzone";
import { OsMarkdownBody } from "./OsMarkdownBody";

const TABLE_MARKDOWN = `| Rule | Owner | Notes |
| --- | --- | --- |
| R-001 | Jo | Keep client work separate. |`;

describe("OsMarkdownBody", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it("contains a semantic table in a keyboard-focusable overflow region", () => {
    render(<OsMarkdownBody markdown={TABLE_MARKDOWN} />);

    const region = screen.getByRole("region", { name: "Scrollable table" });
    const table = screen.getByRole("table");

    expect(region).toHaveAttribute("tabindex", "0");
    expect(region).toHaveClass("overflow-x-auto", "[scrollbar-width:thin]");
    expect(region).toContainElement(table);
    expect(table).toHaveClass("min-w-max");
    expect(screen.getByRole("columnheader", { name: "Rule" })).toBeVisible();
    expect(screen.getByRole("cell", { name: "R-001" })).toBeVisible();
  });

  it("keeps the existing OS asset renderer for imported images", () => {
    render(
      <OsMarkdownBody markdown="![Architecture](/api/admin/os/assets/asset-1/content)" />,
    );

    expect(screen.getByRole("img", { name: "Architecture" })).toHaveAttribute(
      "src",
      "/api/admin/os/assets/asset-1/content",
    );
  });

  it("renders persisted image width without putting auth after the fragment", () => {
    window.localStorage.setItem("auth_token", "token with space");
    render(
      <OsMarkdownBody markdown="![Architecture](/api/admin/os/assets/asset-1#w=320)" />,
    );

    const image = screen.getByRole("img", { name: "Architecture" });
    expect(image).toHaveAttribute(
      "src",
      "/api/admin/os/assets/asset-1?token=token%20with%20space",
    );
    expect(image).toHaveAttribute("width", "320");
  });

  it("gives TipTap tables the bounded editor overflow treatment", async () => {
    const { container } = render(
      <OsEditor
        documentId="document-1"
        content={TABLE_MARKDOWN}
        onChange={vi.fn()}
        isEditable
      />,
    );

    const editor = await waitFor(() => {
      const element = container.querySelector<HTMLElement>(".tiptap");
      expect(element).not.toBeNull();
      return element as HTMLElement;
    });
    const wrapper = editor.querySelector(".tableWrapper");

    expect(editor).toHaveAttribute("contenteditable", "true");
    expect(editor).toHaveClass(
      "[&_.tableWrapper]:overflow-x-auto",
      "[&_.tableWrapper]:[scrollbar-width:thin]",
    );
    expect(wrapper).not.toBeNull();
    expect(wrapper?.querySelector("table")).not.toBeNull();
    expect(
      screen.getByRole("toolbar", { name: "Document formatting" }),
    ).toHaveClass("sticky", "top-[104px]");
    expect(
      screen.getByRole("button", { name: "Insert image" }),
    ).toBeVisible();
  });

  it("shows the image edge controls and requires delete confirmation", async () => {
    render(
      <OsEditor
        documentId="document-1"
        content="![Architecture](/api/admin/os/assets/asset-1#w=320)"
        onChange={vi.fn()}
        isEditable
      />,
    );

    await waitFor(() =>
      expect(
        screen.getByRole("img", { name: "Architecture" }),
      ).toBeVisible(),
    );
    expect(screen.getByTitle("Drag to resize")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Delete image" }));
    expect(
      screen.getByRole("button", { name: "Confirm delete image" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Cancel delete" }),
    ).toBeVisible();
  });

  it("describes semantic conversion and PDF fidelity honestly", () => {
    render(<OsDropzone onFiles={vi.fn()} />);

    expect(screen.getByText(/Imports become semantic Markdown/i)).toBeVisible();
    expect(
      screen.getByText(/complex PDF layouts are best-effort/i),
    ).toBeVisible();
  });
});
