/**
 * Unit tests — shared logger redaction (src/lib/logger.ts).
 *
 * The security payoff of adopting Pino is its serialize-time `redact`: secrets
 * and PII passed as STRUCTURED FIELDS are scrubbed to `[Redacted]` app-wide, for
 * every present and future call site. The audit found OTP codes + recipient
 * emails logged in plaintext, so these assertions are load-bearing — they prove
 * the SHIPPED redact path list (imported from the module, not re-declared here)
 * actually censors `code` / `token` / `email` and the other configured keys.
 *
 * Capture strategy: pino writes through sonic-boom to fd 1, which a
 * `process.stdout.write` spy cannot intercept. So we build a pino logger from
 * the exact exported `REDACT_OPTIONS` pointed at an in-memory Writable, log a
 * payload, and parse the captured JSON line. We also assert pino's well-known
 * LIMITATION: redaction matches object KEY PATHS, not free text — a secret
 * interpolated into the message string is NOT redacted.
 */

import { describe, it, expect } from "vitest";
import { Writable } from "node:stream";
import pino from "pino";
import { REDACT_OPTIONS } from "../lib/logger";

/** A pino logger that writes JSON lines into `lines`, using the SHIPPED redact config. */
function makeCapturingLogger() {
  const lines: string[] = [];
  const sink = new Writable({
    write(chunk, _enc, cb) {
      lines.push(String(chunk));
      cb();
    },
  });
  const log = pino(
    {
      level: "debug",
      redact: { ...REDACT_OPTIONS, paths: [...REDACT_OPTIONS.paths] },
    },
    sink,
  );
  const read = () =>
    lines
      .join("")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as Record<string, unknown>);
  return { log, read };
}

describe("logger redaction", () => {
  it("censors code / token / email (and other secret/PII keys) at the top level", () => {
    const { log, read } = makeCapturingLogger();
    log.info(
      {
        code: "123456",
        otp: "999000",
        token: "a.b.c",
        accessToken: "access-xyz",
        refreshToken: "refresh-xyz",
        password: "hunter2",
        authorization: "Bearer leak",
        email: "user@example.com",
        to: "recipient@example.com",
        recipient: "someone@example.com",
        secret: "shh",
        safe: "keep-me",
      },
      "structured payload with secrets",
    );
    const [entry] = read();

    for (const key of [
      "code",
      "otp",
      "token",
      "accessToken",
      "refreshToken",
      "password",
      "authorization",
      "email",
      "to",
      "recipient",
      "secret",
    ]) {
      expect(entry[key], `${key} should be redacted`).toBe("[Redacted]");
    }
    // Non-sensitive context is preserved.
    expect(entry.safe).toBe("keep-me");
    expect(entry.msg).toBe("structured payload with secrets");
  });

  it("censors secret keys nested one level deep (*.key paths)", () => {
    const { log, read } = makeCapturingLogger();
    log.info(
      { user: { token: "nested-token", code: "0000", email: "n@e.com", id: 7 } },
      "nested payload",
    );
    const [entry] = read();

    const user = entry.user as Record<string, unknown>;
    expect(user.token).toBe("[Redacted]");
    expect(user.code).toBe("[Redacted]");
    expect(user.email).toBe("[Redacted]");
    // Non-sensitive nested field survives.
    expect(user.id).toBe(7);
  });

  it("serializes an Error passed as `err` (stack preserved) — the console.error(msg, err) shape", () => {
    const { log, read } = makeCapturingLogger();
    log.error({ err: new Error("boom") }, "operation failed");
    const [entry] = read();

    const err = entry.err as Record<string, unknown>;
    expect(err.type).toBe("Error");
    expect(err.message).toBe("boom");
    expect(typeof err.stack).toBe("string");
  });

  it("does NOT redact secrets interpolated into the message string (known pino limitation)", () => {
    // Documents why interpolated-secret call sites must be fixed at the source:
    // pino redacts object KEY PATHS, not free text.
    const { log, read } = makeCapturingLogger();
    log.info("code: 424242");
    const [entry] = read();
    expect(entry.msg).toBe("code: 424242"); // NOT redacted — by design
  });
});
