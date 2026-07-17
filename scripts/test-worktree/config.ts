import os from "node:os";
import path from "node:path";

export const RUNTIME_ROOT = path.join(os.tmpdir(), "alloro-test-worktree");
export const MANIFEST_FILE_NAME = "manifest.json";
export const REQUEST_FILE_NAME = "request.json";
export const ERROR_FILE_NAME = "startup-error.json";
export const SUPERVISOR_LOG_FILE_NAME = "supervisor.log";
export const STARTUP_TIMEOUT_MS = 180_000;
export const STARTUP_POLL_INTERVAL_MS = 250;
export const STOP_TIMEOUT_MS = 15_000;
export const ALLOWED_FIXTURES = ["baseline", "gbp-posts"] as const;

export function composeProjectName(runtimeId: string): string {
  return `alloro-tw-${runtimeId}`.slice(0, 63);
}
