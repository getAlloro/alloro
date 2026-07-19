/**
 * Generic request-validation middleware.
 *
 * Validates a chosen request part (`body` | `params` | `query`) against a zod
 * schema. This is the shared layer the conventions audit found missing — the
 * existing `src/validation/minds.schemas.ts` validates LLM *output*, not HTTP
 * input, and no validation middleware existed before this file.
 *
 * TWO MODES (the rollout is gated on this, by design):
 *   • "warn"    — the default. On a validation miss it logs a structured warning
 *                 (route + request part + offending field names + zod issue
 *                 codes — NEVER field VALUES, because auth/OTP/password/billing
 *                 bodies carry secrets) and calls next(). The request proceeds
 *                 untouched. This lets us discover lenient/legacy client shapes
 *                 BEFORE any request is rejected.
 *   • "enforce" — on a miss it returns HTTP 400 with the canonical contract
 *                 shape { success:false, data:null, error:{ code, message,
 *                 details } } — matching gbp-automation/feature-utils/
 *                 controllerResponses.ts. On success it assigns the parsed
 *                 (coerced/stripped) value back onto the request and calls next().
 *
 * Flipping a route group from "warn" to "enforce" is the OWNER's later step,
 * done only after a clean soak of the warn logs. The default mode is therefore
 * "warn" unless the VALIDATION_ENFORCE env flag opts the whole process into
 * enforce (an explicit per-call `mode` always wins over the env default).
 *
 * MUST NEVER THROW: a throw here would 500 every guarded route (this middleware
 * is cross-cutting). `safeParse` does not throw, and the whole body is wrapped
 * defensively — on any unexpected internal error we fall through in "warn" and
 * return the standard 400 in "enforce", never an unhandled rejection.
 *
 * Reference shape: src/controllers/gbp-automation/feature-utils/controllerResponses.ts
 */

import { Request, Response, NextFunction } from "express";
import type { ZodType, ZodError } from "zod";
import logger from "../lib/logger";

/** Which part of the request a schema targets. Body is the common case. */
export type ValidationTarget = "body" | "params" | "query";

/** Behavior on a validation miss. See file header. */
export type ValidationMode = "warn" | "enforce";

export interface ValidateOptions {
  /** Request part to validate. Defaults to "body". */
  target?: ValidationTarget;
  /**
   * Behavior on failure. Defaults to the process-wide default (env-driven via
   * VALIDATION_ENFORCE), which is "warn" unless that flag is set. An explicit
   * value here always overrides the env default.
   */
  mode?: ValidationMode;
}

/** The canonical validation-error code emitted in enforce mode. */
export const VALIDATION_ERROR = "VALIDATION_ERROR";

/**
 * Process-wide default mode. "warn" unless VALIDATION_ENFORCE is truthy
 * ("1" / "true", case-insensitive). Read once at module load — flipping the
 * whole process to enforce is an env/deploy decision, not a per-request one.
 */
const ENV_ENFORCE = /^(1|true)$/i.test(process.env.VALIDATION_ENFORCE ?? "");
const DEFAULT_MODE: ValidationMode = ENV_ENFORCE ? "enforce" : "warn";

/**
 * Reduce a ZodError to redaction-safe metadata: the dotted field paths that
 * failed and the zod issue codes. Deliberately excludes every field VALUE and
 * every zod message that could echo a value, so secrets never reach the logs.
 */
function summarizeIssues(error: ZodError): {
  fields: string[];
  codes: string[];
} {
  const fields = new Set<string>();
  const codes = new Set<string>();
  for (const issue of error.issues) {
    // path is (string | number)[]; "" denotes a root-level issue.
    fields.add(issue.path.length ? issue.path.join(".") : "(root)");
    codes.add(issue.code);
  }
  return { fields: [...fields], codes: [...codes] };
}

/**
 * Build the validation middleware for a given schema.
 *
 * @param schema zod schema for the chosen request part.
 * @param options target (default "body") + mode (default env-driven "warn").
 */
export function validate(
  schema: ZodType,
  options: ValidateOptions = {}
): (req: Request, res: Response, next: NextFunction) => void {
  const target: ValidationTarget = options.target ?? "body";
  const mode: ValidationMode = options.mode ?? DEFAULT_MODE;

  return function validateRequest(
    req: Request,
    res: Response,
    next: NextFunction
  ): void {
    try {
      const result = schema.safeParse(req[target]);

      if (result.success) {
        // Assign the parsed (coerced/stripped) value back. `query` is a getter
        // with no setter on some Express versions, so guard the assignment and
        // never let a failed reassignment break the request.
        try {
          (req as unknown as Record<string, unknown>)[target] = result.data;
        } catch {
          /* read-only target (e.g. some Express query impls) — leave as-is */
        }
        next();
        return;
      }

      const { fields, codes } = summarizeIssues(result.error);

      if (mode === "enforce") {
        res.status(400).json({
          success: false,
          data: null,
          error: {
            code: VALIDATION_ERROR,
            message: "Request validation failed.",
            // Redaction-safe: field names + issue codes only, never values.
            details: { target, fields, issues: codes },
          },
        });
        return;
      }

      // warn mode: log redaction-safe metadata and let the request through.
      // Pino merge-object form (fields first, message second) so the structured
      // metadata is actually emitted, not dropped as an unformatted extra arg.
      logger.warn(
        {
          method: req.method,
          // originalUrl includes the mounted prefix; safe (no secrets in path here).
          route: req.originalUrl,
          target,
          fields,
          issues: codes,
        },
        "[VALIDATION] Would-be rejection (warn-only)",
      );
      next();
    } catch (err) {
      // Defensive: safeParse should never throw, but this middleware must not be
      // the thing that 500s a guarded route. In warn we fall through; in enforce
      // we still return the standard 400 contract shape rather than crashing.
      logger.error(
        {
          err,
          method: req.method,
          route: req.originalUrl,
          target,
        },
        "[VALIDATION] Internal validation error",
      );

      if (mode === "enforce") {
        res.status(400).json({
          success: false,
          data: null,
          error: {
            code: VALIDATION_ERROR,
            message: "Request validation failed.",
            details: null,
          },
        });
        return;
      }
      next();
    }
  };
}

/**
 * SANITIZE — the third posture, and the one a public lead-capture endpoint needs.
 *
 * `validate` offers a binary neither half of which fits a public form: "warn"
 * lets an out-of-contract value through to the controller (a bound that logs is
 * not a bound), and "enforce" answers 400 — which on a lead-capture route means
 * the practice LOSES a real patient inquiry because a marketing tool appended a
 * long tracking parameter. Rejecting the asset to protect a note about the asset
 * is the wrong trade, always.
 *
 * `sanitize` takes the third option: bound the field, keep the request. On a
 * miss the offending key is DELETED from the request part and the request
 * proceeds. Downstream code then reads either an in-contract value or nothing at
 * all — which is what §11.2's "once data reaches the controller, it is trusted"
 * actually requires.
 *
 * FAIL-CLOSED ON THE FIELD, FAIL-OPEN ON THE REQUEST. If the schema somehow
 * fails as a whole (it should not — pass a total schema), every listed key is
 * dropped rather than passed through: the metadata is lost, never the
 * submission. Pair it with a total schema (each field `.catch(undefined)`) so
 * one bad field cannot drop its healthy siblings.
 *
 * MOUNT IT INDEPENDENTLY. This is deliberately its OWN middleware rather than a
 * mode of `validate`, because a route's main schema can fail for an unrelated
 * reason (an over-long `hostname`, say) — and if the sanitize rode along inside
 * that parse, that unrelated failure would silently switch the sanitizing off.
 * A guard whose operation depends on the rest of the body being clean is the
 * kind of guard that guards nothing.
 *
 * Mutates the target IN PLACE so sibling keys (honeypot/timing fields, arbitrary
 * form keys) survive untouched.
 *
 * @param schema  a TOTAL schema for the subset (never rejects; see above).
 * @param keys    the exact keys to rewrite. Listed explicitly, not inferred.
 * @param options target (default "body").
 */
export function sanitize(
  schema: ZodType,
  keys: readonly string[],
  options: { target?: ValidationTarget } = {},
): (req: Request, res: Response, next: NextFunction) => void {
  const target: ValidationTarget = options.target ?? "body";

  return function sanitizeRequest(
    req: Request,
    _res: Response,
    next: NextFunction
  ): void {
    const part = (req as unknown as Record<string, unknown>)[target] as
      | Record<string, unknown>
      | undefined;

    // Nothing to sanitize (no body parsed, or a non-object body).
    if (!part || typeof part !== "object") {
      next();
      return;
    }

    // A total schema always succeeds. If it somehow throws or fails, `parsed`
    // stays empty and EVERY listed key is dropped below — the metadata is lost,
    // never the submission. Fail-closed on the field, fail-open on the request.
    let parsed: Record<string, unknown> = {};
    try {
      const result = schema.safeParse(part);
      if (result.success) {
        parsed = result.data as Record<string, unknown>;
      }
    } catch (err) {
      logger.error(
        { err, method: req.method, route: req.originalUrl, target },
        "[VALIDATION] Internal sanitize error — dropping the guarded fields",
      );
    }

    const dropped: string[] = [];
    for (const key of keys) {
      const value = parsed[key];
      if (value === undefined) {
        if (part[key] !== undefined) {
          delete part[key];
          dropped.push(key);
        }
        continue;
      }
      part[key] = value;
    }

    if (dropped.length) {
      // Redaction-safe: field names only, never the offending values (§5.3) —
      // a utm_source can carry patient PII.
      logger.warn(
        {
          method: req.method,
          route: req.originalUrl,
          target,
          fields: dropped,
        },
        "[VALIDATION] Dropped out-of-contract field(s) (sanitize)",
      );
    }

    next();
  };
}

export default validate;
