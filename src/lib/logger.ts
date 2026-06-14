/**
 * Shared application logger (Pino).
 *
 * This is the ONE logging abstraction for the backend. The conventions contract
 * (dimension 10) mandates Pino + pino-http and forbids raw `console.*`; this
 * module is that mandate made real. A repo-wide codemod replaced every
 * `console.{log,info,warn,error,debug}` in `src/` with the matching method on
 * this logger, and `pino-http` (sharing this same instance) logs every request
 * — see `src/app.ts`.
 *
 * USAGE — pino's call signature is a superset of console's:
 *   logger.info("plain message")                         // like console.log
 *   logger.info("templated %s", value)                   // printf interpolation
 *   logger.info({ orgId, count }, "structured message")  // merge object first
 *   logger.error({ err }, "failed to do the thing")      // errors go under `err`
 * The leading object is the structured-fields "merge object"; everything after
 * is the message + printf args. The codemod kept console-style calls intact
 * (plain rename) and rewrote the common `console.error(msg, err)` shape to
 * `logger.error({ err }, msg)` so stack traces serialize properly.
 *
 * REDACTION (the security payoff) — `redact.paths` below scrub secrets/PII out
 * of the STRUCTURED-FIELD side of a log line at serialize time, app-wide, for
 * every present and future call site. The audit found OTP codes and recipient
 * emails logged in plaintext; pino's redact is defense-in-depth against that.
 *
 *   IMPORTANT LIMITATION: redaction matches OBJECT KEY PATHS, not free text.
 *   `logger.info({ code })` → code is redacted. `logger.info(`code: ${code}`)`
 *   is a plain string and CANNOT be redacted by pino — those call sites must be
 *   fixed at the source (owned by the security-hotfix track, e.g. the OTP line
 *   in AuthPasswordController). Prefer passing secrets as object fields, never
 *   interpolated into the message string.
 *
 * OUTPUT — structured JSON by default (prod-grade, queryable, aggregation-ready).
 * In local dev (NODE_ENV !== production and not under test) it pipes through
 * `pino-pretty` for human-readable colorized output. Level is env-driven via
 * LOG_LEVEL (default "info"; "debug" in non-prod). Changing log DESTINATIONS
 * (files, Sentry transport) is a deliberate follow-up, not part of this module.
 *
 * Modeled on the shape of the existing domain loggers (e.g.
 * controllers/agents/feature-utils/agentLogger.ts): a single module with a
 * default export plus named levels, so adoption is familiar.
 */

import pino, { type LoggerOptions } from "pino";

const isProd = process.env.NODE_ENV === "production";
const isTest = process.env.VITEST === "true" || process.env.NODE_ENV === "test";

/**
 * Field-name paths scrubbed from the structured side of every log line.
 *
 * Covers the keys the audit + convention doc call out — auth headers, JWTs /
 * OAuth tokens, OTP/verification codes, passwords, recipient emails, cookies,
 * and generic secrets — at the top level, one level deep (`*.key`), and under
 * the request/response shapes pino-http attaches (`req.headers.*`, `*.body.*`).
 * `[Redacted]` replaces the value; the surrounding context is preserved.
 *
 * Exported so the redaction unit test can assert the EXACT path list (the
 * shipped config, not a copy) against a capture stream — pino writes via
 * sonic-boom to fd 1, which a `process.stdout.write` spy cannot intercept, so
 * the test rebuilds a logger from these same options pointed at an in-memory
 * stream.
 */
export const REDACT_PATHS = [
  // Auth headers (and the cased variants pino-http may attach on req/res).
  "authorization",
  "Authorization",
  "*.authorization",
  "*.Authorization",
  "headers.authorization",
  "headers.Authorization",
  "req.headers.authorization",
  "req.headers.Authorization",
  "res.headers.authorization",
  // Cookies (carry session/JWT material).
  "cookie",
  "Cookie",
  "*.cookie",
  "headers.cookie",
  "req.headers.cookie",
  "res.headers['set-cookie']",
  // Tokens / secrets.
  "token",
  "accessToken",
  "refreshToken",
  "access_token",
  "refresh_token",
  "idToken",
  "id_token",
  "apiKey",
  "api_key",
  "secret",
  "clientSecret",
  "client_secret",
  "*.token",
  "*.accessToken",
  "*.refreshToken",
  "*.access_token",
  "*.refresh_token",
  "*.secret",
  // Credentials.
  "password",
  "*.password",
  "passwordHash",
  "password_hash",
  // OTP / verification codes (the verified plaintext-OTP finding).
  "code",
  "otp",
  "verificationCode",
  "verification_code",
  "*.code",
  "*.otp",
  // Recipient PII (the verified recipient-email finding).
  "email",
  "to",
  "recipient",
  "*.email",
  "*.to",
  "*.recipient",
];

/**
 * The redact config shared by the logger and the unit test. Defined separately
 * so a test can build an identical logger over a capture stream.
 */
export const REDACT_OPTIONS = {
  paths: REDACT_PATHS,
  censor: "[Redacted]",
  // Don't throw if a configured path can't be navigated on a given payload.
  remove: false,
} as const;

const options: LoggerOptions = {
  level: process.env.LOG_LEVEL ?? (isProd ? "info" : "debug"),
  redact: { ...REDACT_OPTIONS, paths: [...REDACT_PATHS] },
  // Pretty output for local dev only; JSON everywhere else (prod + tests + CI).
  ...(!isProd && !isTest
    ? {
        transport: {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "SYS:standard" },
        },
      }
    : {}),
};

/**
 * The shared logger instance. Default export so consumers can
 * `import logger from "../lib/logger"` and call `logger.info/warn/error/debug`.
 */
export const logger = pino(options);

export default logger;
