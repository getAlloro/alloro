/**
 * Service-token middleware for machine-called routes.
 *
 * Mirrors middleware/scraperAuth.ts, with one difference that matters: this one
 * has an observation stage. scraperAuth guards an endpoint that was born with a
 * key; these routes are already live and already being called without one, so
 * rejecting immediately would break the PMS→agents pipeline and the Clarity /
 * ranking webhooks. See config/serviceToken.ts for the two stages.
 *
 * Every request is logged with the path and which path it took, so the rollout
 * has evidence rather than a guess about who is still un-tokened.
 */

import { Request, Response, NextFunction } from "express";
import { timingSafeEqual } from "crypto";
import {
  SERVICE_TOKEN_HEADER,
  getServiceToken,
  isServiceTokenEnforced,
} from "../config/serviceToken";
import logger from "../lib/logger";

export interface ServiceTokenRequest extends Request {
  /** True when the caller presented a valid service token. */
  isServiceCaller?: boolean;
}

/**
 * Constant-time comparison. A plain `!==` on a shared secret leaks length and
 * prefix information through timing; cheap to avoid.
 */
function tokensMatch(presented: string, expected: string): boolean {
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export const serviceTokenMiddleware = (
  req: ServiceTokenRequest,
  res: Response,
  next: NextFunction
): void | Response => {
  const headerValue = req.headers[SERVICE_TOKEN_HEADER];
  const presented = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  const expected = getServiceToken();

  const hasValidToken = Boolean(
    presented && expected && tokensMatch(presented, expected)
  );

  if (hasValidToken) {
    req.isServiceCaller = true;
    return next();
  }

  if (!isServiceTokenEnforced()) {
    // Observation stage. This is the line T6 reads to decide whether stage 2 is
    // safe: while any of these appear for a legitimate caller, enforcing would
    // break it.
    logger.warn(
      {
        path: req.path,
        method: req.method,
        ip: req.ip,
        presentedToken: Boolean(presented),
      },
      "[SERVICE-TOKEN] un-tokened call to a machine route — would be rejected under enforcement"
    );
    return next();
  }

  logger.warn(
    { path: req.path, method: req.method, ip: req.ip },
    "[SERVICE-TOKEN] rejected a call with no valid service token"
  );

  return res.status(401).json({
    success: false,
    data: null,
    error: {
      code: "SERVICE_TOKEN_REQUIRED",
      message: "A valid service token is required for this endpoint.",
      details: null,
    },
  });
};
