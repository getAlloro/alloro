/**
 * Database-target guard for the read-only preview CLI (§5.6 — validate config
 * at startup and fail fast with a clear message).
 *
 * The CLI loads whatever `.env` is on the operator's machine. Per `AGENTS.md`,
 * local `.env` SHOULD point at dev and production values SHOULD be kept
 * commented out "for reference" — both are conventions, and one uncommented
 * line is all it takes. Someone uncomments the production block to debug
 * something else, forgets, and the next `npm run preview:owner-receipt --org 39`
 * reads production. The run is read-only against our database, but it also
 * makes live third-party calls with that org's stored credentials, and nothing
 * in the output would distinguish the two runs.
 *
 * A comment in a docstring is not a guard. This is.
 *
 * Pure: it takes an environment record and returns a verdict. No I/O, no
 * process exit — the caller decides what to do, which is what makes it testable
 * without spawning the CLI.
 */

/** Hosts that are unambiguously a developer's own machine. */
const LOCAL_DB_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/** Env var an operator must set deliberately to aim the CLI off-box. */
export const ALLOW_NON_LOCAL_DB_VAR = "ALLOW_NON_LOCAL_DB";

export interface DatabaseTargetVerdict {
  /** The resolved host, or `"(unset — knex will use localhost)"` when absent. */
  host: string;
  /** True when the host is a local machine address. */
  isLocal: boolean;
  /** True when the operator explicitly opted in to a non-local target. */
  optedIn: boolean;
  /** True when the CLI may run against this target. */
  allowed: boolean;
  /** Why it is refused; `null` when allowed. */
  reason: string | null;
}

/** Decide whether the CLI may run against the database this env points at. */
export function checkDatabaseTarget(
  env: NodeJS.ProcessEnv = process.env
): DatabaseTargetVerdict {
  const raw = (env.DB_HOST ?? "").trim();
  // An unset host means knex falls back to localhost, which is local — but it
  // is reported explicitly rather than silently, so the operator sees it.
  const isLocal = raw === "" || LOCAL_DB_HOSTS.has(raw.toLowerCase());
  const host = raw === "" ? "(unset — knex will use localhost)" : raw;
  const optedIn = (env[ALLOW_NON_LOCAL_DB_VAR] ?? "") === "1";

  if (isLocal || optedIn) {
    return { host, isLocal, optedIn, allowed: true, reason: null };
  }

  return {
    host,
    isLocal,
    optedIn,
    allowed: false,
    reason:
      `refusing to run: DB_HOST is '${host}', which is not a local database.\n` +
      `  This is a read-only dev preview and it must never be pointed at dev or production —\n` +
      `  the composed read path also makes live calls to the Rybbit API with that org's stored\n` +
      `  credentials. Point DB_HOST at a local database, or set ${ALLOW_NON_LOCAL_DB_VAR}=1 to\n` +
      `  override deliberately.`,
  };
}

/** One line naming the target, printed above every report so a wrong run is visible. */
export function describeDatabaseTarget(verdict: DatabaseTargetVerdict): string {
  const scope = verdict.isLocal ? "local" : "NON-LOCAL";
  const override = verdict.optedIn ? ` (${ALLOW_NON_LOCAL_DB_VAR}=1 override in effect)` : "";
  return `  database     : ${verdict.host} [${scope}]${override}`;
}
