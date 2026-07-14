import { describe, expect, it } from "vitest";
import { Schema } from "@tiptap/pm/model";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import { isEmptyCodeBlockAtStart } from "./osBlockBackspace";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { group: "block", content: "text*" },
    codeBlock: { group: "block", content: "text*", code: true },
    text: {},
  },
});

describe("isEmptyCodeBlockAtStart", () => {
  it("recognizes an empty code block cursor", () => {
    const doc = schema.node("doc", null, [schema.node("codeBlock")]);
    const state = EditorState.create({
      schema,
      doc,
      selection: TextSelection.create(doc, 1),
    });
    expect(isEmptyCodeBlockAtStart(state)).toBe(true);
  });

  it("leaves non-empty code and ordinary paragraphs alone", () => {
    const codeDoc = schema.node("doc", null, [
      schema.node("codeBlock", null, [schema.text("x")]),
    ]);
    const paragraphDoc = schema.node("doc", null, [schema.node("paragraph")]);
    expect(
      isEmptyCodeBlockAtStart(
        EditorState.create({
          schema,
          doc: codeDoc,
          selection: TextSelection.create(codeDoc, 1),
        }),
      ),
    ).toBe(false);
    expect(
      isEmptyCodeBlockAtStart(
        EditorState.create({
          schema,
          doc: paragraphDoc,
          selection: TextSelection.create(paragraphDoc, 1),
        }),
      ),
    ).toBe(false);
  });
});
