import { describe, expect, it } from "vitest";
import { Schema } from "@tiptap/pm/model";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import { osImageBeforeCursor } from "./OsResizableImage";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { group: "block", content: "inline*" },
    text: { group: "inline" },
    image: { group: "block", inline: false, atom: true },
    orderedList: { group: "block", content: "listItem+" },
    listItem: { content: "block+" },
  },
});

const paragraph = (text?: string) =>
  schema.node("paragraph", null, text ? [schema.text(text)] : []);
const image = () => schema.node("image");

function cursorAtStartOfLastBlock(doc: ReturnType<Schema["node"]>) {
  const position = doc.content.size - (doc.lastChild?.nodeSize ?? 0) + 1;
  return EditorState.create({
    schema,
    doc,
    selection: TextSelection.create(doc, position),
  });
}

describe("osImageBeforeCursor", () => {
  it("finds a direct image before the cursor's block", () => {
    const doc = schema.node("doc", null, [paragraph("x"), image(), paragraph()]);
    const state = cursorAtStartOfLastBlock(doc);
    const position = osImageBeforeCursor(state, "image");
    expect(position).not.toBeNull();
    expect(doc.nodeAt(position as number)?.type.name).toBe("image");
  });

  it("finds an image nested at the end of a list item", () => {
    const list = schema.node("orderedList", null, [
      schema.node("listItem", null, [paragraph("x"), image()]),
    ]);
    const doc = schema.node("doc", null, [list, paragraph()]);
    const state = cursorAtStartOfLastBlock(doc);
    const position = osImageBeforeCursor(state, "image");
    expect(position).not.toBeNull();
    expect(doc.nodeAt(position as number)?.type.name).toBe("image");
  });

  it("leaves ordinary backward deletion unchanged", () => {
    const doc = schema.node("doc", null, [paragraph("above"), paragraph()]);
    expect(osImageBeforeCursor(cursorAtStartOfLastBlock(doc), "image")).toBeNull();
  });

  it("does nothing when the cursor is not at the block start", () => {
    const doc = schema.node("doc", null, [image(), paragraph("xy")]);
    const state = EditorState.create({
      schema,
      doc,
      selection: TextSelection.create(doc, doc.content.size - 1),
    });
    expect(osImageBeforeCursor(state, "image")).toBeNull();
  });
});
