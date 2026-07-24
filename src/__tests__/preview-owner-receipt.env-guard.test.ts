/**
 * preview-owner-receipt database-target guard (§5.6).
 *
 * The CLI loads whatever `.env` is on the operator's machine. Per `AGENTS.md`,
 * production values are kept in local `.env` COMMENTED OUT "for reference" —
 * so the distance between a safe run and a production read is one uncommented
 * line. The file's docstring used to say "must never be pointed at prod"; a
 * docstring is not a guard, and this suite is what makes the sentence true.
 *
 * Pure: the guard takes an env record and returns a verdict, so this needs no
 * process, no database, and no network.
 */

import { describe, it, expect } from "vitest";
import {
  ALLOW_NON_LOCAL_DB_VAR,
  checkDatabaseTarget,
  describeDatabaseTarget,
} from "../config/previewDatabaseTarget";

describe("checkDatabaseTarget — refuses a non-local database", () => {
  it("refuses a production-looking RDS host", () => {
    const verdict = checkDatabaseTarget({
      DB_HOST: "alloro-prod.abc123.us-east-1.rds.amazonaws.com",
    } as NodeJS.ProcessEnv);

    expect(verdict.allowed).toBe(false);
    expect(verdict.isLocal).toBe(false);
    expect(verdict.reason).toMatch(/not a local database/);
    // The message has to tell the operator what to do, not just say no.
    expect(verdict.reason).toContain(ALLOW_NON_LOCAL_DB_VAR);
  });

  it("refuses a dev host too — this tool is local-only", () => {
    // Dev is not production, but it is still shared state reached over the
    // network, and the composed read path makes live third-party calls.
    const verdict = checkDatabaseTarget({
      DB_HOST: "alloro-dev.internal",
    } as NodeJS.ProcessEnv);

    expect(verdict.allowed).toBe(false);
  });

  it.each(["localhost", "127.0.0.1", "::1", "LOCALHOST"])(
    "allows the local host %s",
    (host) => {
      const verdict = checkDatabaseTarget({ DB_HOST: host } as NodeJS.ProcessEnv);

      expect(verdict.allowed).toBe(true);
      expect(verdict.isLocal).toBe(true);
      expect(verdict.reason).toBeNull();
    }
  );

  it("treats an unset host as local, and says so rather than hiding it", () => {
    // knex falls back to localhost when DB_HOST is absent, so this IS local —
    // but the operator should see that the value was never set.
    const verdict = checkDatabaseTarget({} as NodeJS.ProcessEnv);

    expect(verdict.allowed).toBe(true);
    expect(verdict.isLocal).toBe(true);
    expect(verdict.host).toMatch(/unset/);
  });

  it("allows a non-local host only with the explicit opt-in", () => {
    const env = {
      DB_HOST: "alloro-prod.abc123.us-east-1.rds.amazonaws.com",
      [ALLOW_NON_LOCAL_DB_VAR]: "1",
    } as NodeJS.ProcessEnv;

    const verdict = checkDatabaseTarget(env);

    expect(verdict.allowed).toBe(true);
    expect(verdict.optedIn).toBe(true);
    // Opting in does not make it local, and the report must not pretend it did.
    expect(verdict.isLocal).toBe(false);
  });

  it("does not accept a truthy-looking value other than the exact opt-in", () => {
    // "true", "yes" and "0" must not open the door — only a deliberate "1".
    for (const value of ["true", "yes", "0", "", "TRUE"]) {
      const verdict = checkDatabaseTarget({
        DB_HOST: "alloro-prod.abc123.us-east-1.rds.amazonaws.com",
        [ALLOW_NON_LOCAL_DB_VAR]: value,
      } as NodeJS.ProcessEnv);

      expect(verdict.allowed).toBe(false);
    }
  });
});

describe("describeDatabaseTarget — a wrong run is visible in its own output", () => {
  it("labels a local target as local", () => {
    const line = describeDatabaseTarget(
      checkDatabaseTarget({ DB_HOST: "localhost" } as NodeJS.ProcessEnv)
    );

    expect(line).toContain("localhost");
    expect(line).toContain("[local]");
  });

  it("shouts when an override is in effect", () => {
    const line = describeDatabaseTarget(
      checkDatabaseTarget({
        DB_HOST: "alloro-prod.abc123.us-east-1.rds.amazonaws.com",
        [ALLOW_NON_LOCAL_DB_VAR]: "1",
      } as NodeJS.ProcessEnv)
    );

    expect(line).toContain("[NON-LOCAL]");
    expect(line).toContain("override in effect");
  });
});
