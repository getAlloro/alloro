import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(
    process.cwd(),
    "src/controllers/practice-ranking/feature-services/service.ranking-llm.ts",
  ),
  "utf8",
);

describe("ranking LLM search-position prompt contract", () => {
  it("keeps measured and unavailable search-position bands mutually exclusive", () => {
    expect(source).toContain("Position 4 through 20");
    expect(source).toContain("Not in the top 20");
    expect(source).toContain("Position unavailable");
    expect(source).toContain("Never tell a practice already in the top 20 to break into the top 20");
    expect(source).not.toContain(
      "Position greater than 3, or \\`search_position.not_in_top_20\\` is true",
    );
  });
});
