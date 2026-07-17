import { describe, expect, it } from "vitest";
import { createRuntimeId } from "./util.runtime-id";

describe("createRuntimeId", () => {
  it("includes a sanitized worktree slug and a bounded digest", () => {
    const runtimeId = createRuntimeId(
      "/tmp/Alloro Worktrees/Google Posts!",
      "0123456789abcdef",
    );

    expect(runtimeId).toMatch(/^google-posts-[a-f0-9]{12}$/);
    expect(runtimeId.length).toBeLessThanOrEqual(63);
  });

  it("creates distinct runtime identities for concurrent launches", () => {
    const first = createRuntimeId("/tmp/alloro-worktree", "head");
    const second = createRuntimeId("/tmp/alloro-worktree", "head");

    expect(first).not.toBe(second);
  });
});
