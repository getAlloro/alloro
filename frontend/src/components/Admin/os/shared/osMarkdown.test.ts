import { describe, expect, it } from "vitest";
import { normalizeOsMarkdown, parseOsImageSource } from "./osMarkdown";

describe("parseOsImageSource", () => {
  it("lifts a persisted pixel width out of the URL fragment", () => {
    expect(parseOsImageSource("/api/admin/os/assets/image-1#w=320")).toEqual({
      src: "/api/admin/os/assets/image-1",
      width: 320,
    });
  });

  it("leaves ordinary image URLs unchanged", () => {
    expect(parseOsImageSource("https://example.com/image.png")).toEqual({
      src: "https://example.com/image.png",
    });
  });
});

describe("normalizeOsMarkdown", () => {
  it("separates a block image from a glued code fence", () => {
    expect(normalizeOsMarkdown("![](image.png#w=280)```ts\ncode\n```")).toBe(
      "![](image.png#w=280)\n\n```ts\ncode\n```",
    );
  });

  it("is a no-op when the following block is already separated", () => {
    const markdown = "![](image.png#w=280)\n\n| A | B |\n| - | - |";
    expect(normalizeOsMarkdown(markdown)).toBe(markdown);
  });
});
