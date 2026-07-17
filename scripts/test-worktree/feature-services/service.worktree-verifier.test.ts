import { describe, expect, it, vi } from "vitest";
import { verifySecondaryWorktree } from "./service.worktree-verifier";

const WORKTREE_PATH = "/repo-worktrees/feature";
const GIT_DIR = "/repo/.git/worktrees/feature";
const COMMON_DIR = "/repo/.git";
const HEAD = "0123456789abcdef";

function gitResponse(args: string[]): string {
  const key = args.join(" ");
  const values: Record<string, string> = {
    "rev-parse --is-inside-work-tree": "true",
    "rev-parse --show-toplevel": WORKTREE_PATH,
    "rev-parse --path-format=absolute --git-dir": GIT_DIR,
    "rev-parse --path-format=absolute --git-common-dir": COMMON_DIR,
    "rev-parse HEAD": HEAD,
    "status --porcelain": " M feature.ts",
    "worktree list --porcelain": [
      "worktree /repo",
      `HEAD ${HEAD}`,
      "branch refs/heads/dev/dave",
      "",
      `worktree ${WORKTREE_PATH}`,
      `HEAD ${HEAD}`,
      "branch refs/heads/codex/feature",
    ].join("\n"),
  };
  const value = values[key];
  if (value === undefined) throw new Error(`Unexpected git command: ${key}`);
  return value;
}

function dependencies(overrides: Partial<Record<string, string>> = {}) {
  return {
    run: vi.fn(async (_command: string, args: string[]) => ({
      stdout: overrides[args.join(" ")] ?? gitResponse(args),
      stderr: "",
    })),
    resolvePath: vi.fn(async (value: string) => value),
  };
}

describe("verifySecondaryWorktree", () => {
  it("returns verified identity and reports dirty state", async () => {
    const identity = await verifySecondaryWorktree(WORKTREE_PATH, dependencies());

    expect(identity).toEqual({
      worktreePath: WORKTREE_PATH,
      gitDir: GIT_DIR,
      commonDir: COMMON_DIR,
      branch: "codex/feature",
      isDetached: false,
      head: HEAD,
      isDirty: true,
    });
  });

  it("refuses a primary checkout before runtime startup", async () => {
    const deps = dependencies({
      "rev-parse --path-format=absolute --git-dir": COMMON_DIR,
    });

    await expect(verifySecondaryWorktree("/repo", deps)).rejects.toThrow(
      "only runs inside a secondary linked worktree",
    );
  });

  it("accepts a detached linked worktree", async () => {
    const detachedList = [
      `worktree ${WORKTREE_PATH}`,
      `HEAD ${HEAD}`,
      "detached",
    ].join("\n");
    const deps = dependencies({
      "worktree list --porcelain": detachedList,
      "status --porcelain": "",
    });

    const identity = await verifySecondaryWorktree(WORKTREE_PATH, deps);

    expect(identity.branch).toBeNull();
    expect(identity.isDetached).toBe(true);
    expect(identity.isDirty).toBe(false);
  });
});
