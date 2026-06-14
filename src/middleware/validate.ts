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

export default validate;
