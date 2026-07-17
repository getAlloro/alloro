import { realpath } from "node:fs/promises";
import path from "node:path";
import type { WorktreeIdentity } from "../types";
import { runCommand } from "../feature-utils/util.command";

interface WorktreeEntry {
  path: string;
  head: string;
  branch: string | null;
  isDetached: boolean;
}

type CommandRunner = typeof runCommand;
type PathResolver = (value: string) => Promise<string>;

interface WorktreeVerifierDependencies {
  run?: CommandRunner;
  resolvePath?: PathResolver;
}

export function parseWorktreeList(output: string): WorktreeEntry[] {
  return output
    .split(/\n\n+/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const lines = block.split("\n");
      const worktreeLine = lines.find((line) => line.startsWith("worktree "));
      const headLine = lines.find((line) => line.startsWith("HEAD "));
      if (!worktreeLine || !headLine) {
        throw new Error("Git returned an incomplete worktree entry.");
      }
      const branchLine = lines.find((line) => line.startsWith("branch refs/heads/"));
      return {
        path: worktreeLine.slice("worktree ".length),
        head: headLine.slice("HEAD ".length),
        branch: branchLine ? branchLine.slice("branch refs/heads/".length) : null,
        isDetached: lines.includes("detached"),
      };
    });
}

async function gitValue(
  cwd: string,
  args: string[],
  commandRunner: CommandRunner,
): Promise<string> {
  const result = await commandRunner("git", args, cwd);
  return result.stdout;
}

export async function verifySecondaryWorktree(
  cwd: string,
  dependencies: WorktreeVerifierDependencies = {},
): Promise<WorktreeIdentity> {
  const commandRunner = dependencies.run ?? runCommand;
  const resolvePath = dependencies.resolvePath ?? realpath;
  const inside = await gitValue(
    cwd,
    ["rev-parse", "--is-inside-work-tree"],
    commandRunner,
  );
  if (inside !== "true") {
    throw new Error("Test Worktree refused: current directory is not a Git worktree.");
  }

  const [worktreePath, gitDir, commonDir, head, status, listed] = await Promise.all([
    gitValue(cwd, ["rev-parse", "--show-toplevel"], commandRunner).then((value) =>
      resolvePath(value),
    ),
    gitValue(cwd, ["rev-parse", "--path-format=absolute", "--git-dir"], commandRunner).then(
      (value) => resolvePath(value),
    ),
    gitValue(
      cwd,
      ["rev-parse", "--path-format=absolute", "--git-common-dir"],
      commandRunner,
    ).then((value) => resolvePath(value)),
    gitValue(cwd, ["rev-parse", "HEAD"], commandRunner),
    gitValue(cwd, ["status", "--porcelain"], commandRunner),
    gitValue(cwd, ["worktree", "list", "--porcelain"], commandRunner),
  ]);

  if (path.normalize(gitDir) === path.normalize(commonDir)) {
    throw new Error(
      "Test Worktree refused: -tw only runs inside a secondary linked worktree.",
    );
  }

  const entries = parseWorktreeList(listed);
  const currentEntry = entries.find(
    (entry) => path.normalize(entry.path) === path.normalize(worktreePath),
  );
  if (!currentEntry || currentEntry.head !== head) {
    throw new Error("Test Worktree refused: current linked worktree could not be proven.");
  }

  return {
    worktreePath,
    gitDir,
    commonDir,
    branch: currentEntry.branch,
    isDetached: currentEntry.isDetached,
    head,
    isDirty: status.length > 0,
  };
}
