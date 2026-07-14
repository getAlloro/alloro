import { Editor } from "@tiptap/core";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { buildOsEditorExtensions } from "./osEditorExtensions";
import { OsTableFloatingMenu } from "./OsTableFloatingMenu";

const TABLE_MARKDOWN = `| Rule | Owner |
| --- | --- |
| R-001 | Jo |`;

type MountedEditor = {
  editor: Editor;
  container: HTMLDivElement;
};

const mountedEditors: MountedEditor[] = [];
const clientRectsDescriptor = Object.getOwnPropertyDescriptor(
  Range.prototype,
  "getClientRects",
);
const boundingRectDescriptor = Object.getOwnPropertyDescriptor(
  Range.prototype,
  "getBoundingClientRect",
);

beforeAll(() => {
  const emptyRect = new DOMRect();
  Object.defineProperty(Range.prototype, "getClientRects", {
    configurable: true,
    value: () => [emptyRect],
  });
  Object.defineProperty(Range.prototype, "getBoundingClientRect", {
    configurable: true,
    value: () => emptyRect,
  });
});

afterAll(() => {
  if (clientRectsDescriptor) {
    Object.defineProperty(
      Range.prototype,
      "getClientRects",
      clientRectsDescriptor,
    );
  } else {
    Reflect.deleteProperty(Range.prototype, "getClientRects");
  }
  if (boundingRectDescriptor) {
    Object.defineProperty(
      Range.prototype,
      "getBoundingClientRect",
      boundingRectDescriptor,
    );
  } else {
    Reflect.deleteProperty(Range.prototype, "getBoundingClientRect");
  }
});

function mountTableEditor(): MountedEditor {
  const container = document.createElement("div");
  const editorElement = document.createElement("div");
  container.append(editorElement);
  document.body.append(container);
  const editor = new Editor({
    element: editorElement,
    extensions: buildOsEditorExtensions(),
    content: TABLE_MARKDOWN,
  });
  editor.commands.setTextSelection(4);
  const mounted = { editor, container };
  mountedEditors.push(mounted);
  return mounted;
}

function tableRowCount(editor: Editor): number {
  const table = editor.state.doc.firstChild;
  return table?.type.name === "table" ? table.childCount : 0;
}

afterEach(() => {
  mountedEditors.splice(0).forEach(({ editor, container }) => {
    editor.destroy();
    container.remove();
  });
});

describe("OsTableFloatingMenu", () => {
  it("shows every action for the active table and adds a row", async () => {
    const { editor, container } = mountTableEditor();
    const containerRef = createRef<HTMLDivElement>();
    containerRef.current = container;
    const user = userEvent.setup();
    const rowsBefore = tableRowCount(editor);

    render(<OsTableFloatingMenu editor={editor} containerRef={containerRef} />);

    const trigger = await screen.findByRole("button", {
      name: "Table options",
    });
    await user.click(trigger);

    await waitFor(() =>
      expect(screen.getByRole("menuitem", { name: "Add row" })).toBeVisible(),
    );
    expect(screen.getByRole("menuitem", { name: "Add column" })).toBeVisible();
    expect(screen.getByRole("menuitem", { name: "Delete row" })).toBeVisible();
    expect(
      screen.getByRole("menuitem", { name: "Delete column" }),
    ).toBeVisible();
    expect(
      screen.getByRole("menuitem", { name: "Delete table" }),
    ).toBeVisible();

    await user.click(screen.getByRole("menuitem", { name: "Add row" }));

    await waitFor(() => expect(tableRowCount(editor)).toBe(rowsBefore + 1));
    await waitFor(() =>
      expect(screen.queryByRole("menu")).not.toBeInTheDocument(),
    );
  });

  it("dismisses the open menu with Escape and an outside pointer", async () => {
    const { editor, container } = mountTableEditor();
    const containerRef = createRef<HTMLDivElement>();
    containerRef.current = container;
    const user = userEvent.setup();

    render(<OsTableFloatingMenu editor={editor} containerRef={containerRef} />);
    const trigger = await screen.findByRole("button", {
      name: "Table options",
    });

    await user.click(trigger);
    await waitFor(() => expect(screen.getByRole("menu")).toBeVisible());
    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("menu")).not.toBeInTheDocument(),
    );

    await user.click(trigger);
    await waitFor(() => expect(screen.getByRole("menu")).toBeVisible());
    await user.pointer({ target: document.body, keys: "[MouseLeft]" });
    await waitFor(() =>
      expect(screen.queryByRole("menu")).not.toBeInTheDocument(),
    );
  });
});
