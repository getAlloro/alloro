import { describe, expect, it } from "vitest";
import { resolvePmTaskTab } from "./projectBoardDeepLink.utils";

describe("resolvePmTaskTab", () => {
  it("accepts supported task-panel tabs", () => {
    expect(resolvePmTaskTab("details")).toBe("details");
    expect(resolvePmTaskTab("attachments")).toBe("attachments");
    expect(resolvePmTaskTab("comments")).toBe("comments");
  });

  it("rejects missing or unknown task-panel tabs", () => {
    expect(resolvePmTaskTab(null)).toBeUndefined();
    expect(resolvePmTaskTab("activity")).toBeUndefined();
  });
});
