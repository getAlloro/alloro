import { describe, it, expect } from "vitest";
import { normalizeForMatching } from "../services/content-safety/copyNormalization";

/**
 * Unit coverage for the encoding fold that runs before the honesty gate matches
 * (§20.1 — a test file mirrors the unit it covers).
 *
 * The bypass strings live HERE and never in source: this repo is public, and a
 * working evasion string in a source comment is a recipe, not documentation.
 * Each fixture is a CATEGORY representative, not a one-off — the point of the
 * fold is that it closes the category.
 */
describe("normalizeForMatching — invisible characters", () => {
  const invisible: Array<[string, string]> = [
    ["zero-width space", "guar​antee"],
    ["zero-width non-joiner", "guar‌antee"],
    ["zero-width joiner", "guar‍antee"],
    ["soft hyphen", "guar­antee"],
    ["word joiner", "guar⁠antee"],
    ["byte-order mark", "guar﻿antee"],
    ["left-to-right mark", "guar‎antee"],
    ["bidi override", "guar‭antee"],
    ["bidi isolate", "guar⁦antee"],
    ["Mongolian vowel separator", "guar᠎antee"],
    ["variation selector", "guar️antee"],
    ["combining grapheme joiner", "guar͏antee"],
  ];

  it.each(invisible)("removes a %s sitting inside a word", (_label, input) => {
    expect(normalizeForMatching(input)).toBe("guarantee");
  });
});

describe("normalizeForMatching — compatibility and confusable letter forms", () => {
  const letterForms: Array<[string, string, string]> = [
    ["fullwidth", "ｇｕａｒ", "guar"],
    ["mathematical bold", "\u{1D420}\u{1D42E}\u{1D41A}\u{1D42B}", "guar"],
    ["mathematical monospace", "\u{1D690}\u{1D69E}\u{1D68A}\u{1D69B}", "guar"],
    ["Cyrillic homoglyph", "Gооgle", "Google"],
    ["Greek homoglyph", "Gοοgle", "Google"],
    ["Cyrillic uppercase homoglyph", "СО", "CO"],
    ["Latin script g", "ɡuarantee", "guarantee"],
    // Scripts an adversary confirmed reachable against an earlier version of
    // this fold, which covered only Cyrillic and Greek.
    ["Latin IPA alpha", "guɑrantee", "guarantee"],
    ["Armenian", "guaraոtee", "guarantee"],
    ["Cherokee", "guaranᎿee", "guarantee"],
  ];

  it.each(letterForms)("folds %s to its Latin skeleton", (_label, input, expected) => {
    expect(normalizeForMatching(input)).toBe(expected);
  });
});

describe("normalizeForMatching — punctuation the gate's boundary set is written in ASCII for", () => {
  it("folds the fullwidth semicolon Dave named to ASCII", () => {
    expect(normalizeForMatching("claims； We")).toBe("claims; We");
  });

  it("folds the ideographic full stop Dave named to ASCII", () => {
    expect(normalizeForMatching("claims。 We")).toBe("claims. We");
  });

  const sentenceTerminators: Array<[string, string]> = [
    ["halfwidth ideographic full stop", "｡"],
    ["Devanagari danda", "।"],
    ["Devanagari double danda", "॥"],
    ["Arabic full stop", "۔"],
    ["Arabic question mark", "؟"],
    ["Ethiopic full stop", "።"],
    ["Mongolian full stop", "᠃"],
    ["fullwidth exclamation", "！"],
    ["fullwidth question mark", "？"],
    ["double exclamation", "‼"],
  ];

  it.each(sentenceTerminators)(
    "folds the %s to an ASCII sentence end (the class, not the example)",
    (_label, terminator) => {
      expect(normalizeForMatching(`claims${terminator} We`)).toMatch(/^claims[.!?]+ We$/);
    },
  );

  it("leaves comma forms alone — a bare comma is deliberately NOT a clause end", () => {
    expect(normalizeForMatching("rankings、 placements")).toBe("rankings、 placements");
    expect(normalizeForMatching("rankings， placements")).toBe("rankings, placements");
  });

  it("folds the curly apostrophe that silently blocked honest disclaimers", () => {
    expect(normalizeForMatching("we don’t guarantee")).toBe("we don't guarantee");
  });

  it("folds the non-breaking space and non-breaking hyphen", () => {
    expect(normalizeForMatching("top placement")).toBe("top placement");
    expect(normalizeForMatching("page‑one")).toBe("page-one");
  });
});

describe("normalizeForMatching — HTML", () => {
  it("turns <br> into ONE line break, not a paragraph break", () => {
    // Load-bearing: a paragraph break is a HARD clause end, a lone line break is
    // a soft wrap. <br> IS the HTML soft wrap, so mapping it to "\n\n" cut
    // negators off their claims and blocked honest disclaimers. The gate's
    // "line break + new subject" rule still ends scope where it should.
    expect(normalizeForMatching("claims<br> We")).toBe("claims\n We");
    expect(normalizeForMatching("claims<br/> We")).toBe("claims\n We");
    expect(normalizeForMatching("claims<br /> We")).toBe("claims\n We");
  });

  it("turns a paragraph-level block tag into a paragraph break", () => {
    expect(normalizeForMatching("<p>claims</p><p>We</p>")).toBe("\n\nclaims\n\n\n\nWe\n\n");
    expect(normalizeForMatching("<li>a</li><li>b</li>")).toBe("\n\na\n\n\n\nb\n\n");
  });

  it("removes an inline tag WITHOUT spacing it — spacing would split a word and miss a claim", () => {
    expect(normalizeForMatching("guar<b>antee</b>")).toBe("guarantee");
    expect(normalizeForMatching("guar<wbr>antee")).toBe("guarantee");
    expect(normalizeForMatching('guar<span class="x">antee</span>')).toBe("guarantee");
  });

  it("treats an UNKNOWN tag as inline, never as a break", () => {
    // A break would cut a negator off from the claim it governs and over-block an
    // honest disclaimer — the worse failure. Inline is the safe default.
    expect(normalizeForMatching("guar<custom-el>antee")).toBe("guarantee");
  });

  it("removes comments and script/style elements with their content", () => {
    expect(normalizeForMatching("guar<!-- hidden -->antee")).toBe("guarantee");
    expect(normalizeForMatching("a<script>var x = 1;</script>b")).toBe("ab");
    expect(normalizeForMatching("a<style>.x{color:red}</style>b")).toBe("ab");
  });

  it("decodes numeric and named entities", () => {
    expect(normalizeForMatching("guar&#97;ntee")).toBe("guarantee");
    expect(normalizeForMatching("guar&#x61;ntee")).toBe("guarantee");
    expect(normalizeForMatching("claims&period; We")).toBe("claims. We");
    expect(normalizeForMatching("top&nbsp;placement")).toBe("top placement");
    expect(normalizeForMatching("guar&#8203;antee")).toBe("guarantee");
  });

  it("decodes entities ONCE — a second pass would let &amp;lt; become a tag", () => {
    expect(normalizeForMatching("&amp;lt;br&amp;gt;")).toBe("&lt;br&gt;");
  });

  it("does not treat an ENTITY-ENCODED break tag as a real break", () => {
    // "&lt;br&gt;" renders as the literal text "<br>", not as a line break.
    expect(normalizeForMatching("claims&lt;br&gt;We")).toBe("claims<br>We");
  });

  it("leaves an invalid entity as written", () => {
    expect(normalizeForMatching("&#xZZ; &notreal; 50% & rising")).toBe("&#xZZ; &notreal; 50% & rising");
  });

  it("is idempotent", () => {
    const once = normalizeForMatching("guar​antee<br>；’");
    expect(normalizeForMatching(once)).toBe(once);
  });

  it("handles empty and whitespace input", () => {
    expect(normalizeForMatching("")).toBe("");
    expect(normalizeForMatching("   ")).toBe("   ");
  });
});
