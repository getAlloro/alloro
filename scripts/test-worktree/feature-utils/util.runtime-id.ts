import { createHash } from "node:crypto";
import path from "node:path";

function runtimeSlug(worktreePath: string): string {
  const slug = path.basename(worktreePath)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 28);

  return slug || "worktree";
}

export function createRuntimeId(worktreePath: string, head: string): string {
  const digest = createHash("sha256")
    .update(worktreePath)
    .update("\0")
    .update(head)
    .update("\0")
    .update(process.hrtime.bigint().toString())
    .digest("hex")
    .slice(0, 12);

  return `${runtimeSlug(worktreePath)}-${digest}`;
}
