/**
 * Early protection for POST /api/websites/contact.
 *
 * This middleware is mounted before the app-wide 50 MB JSON parser. That order
 * is load-bearing: the public contact endpoint gets its own small request
 * budget, while PMS and other large-payload routes keep their existing limit.
 */

import express, {
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from "express";
import rateLimit from "express-rate-limit";
import {
  CONTACT_RATE_LIMIT_MAX_REQUESTS,
  CONTACT_RATE_LIMIT_WINDOW_MS,
  CONTACT_REQUEST_BODY_MAX_BYTES,
} from "../config/websiteContact";

const CONTACT_RATE_LIMIT_RESPONSE = {
  success: false,
  data: null,
  error: {
    code: "CONTACT_RATE_LIMITED",
    message: "Too many contact requests. Please wait before trying again.",
    details: null,
  },
};

interface BodyParserError extends Error {
  status?: number;
  type?: string;
}

function isBodyParserError(error: unknown): error is BodyParserError {
  return error instanceof Error;
}

export function createContactSubmissionLimiter(
  maxRequests = CONTACT_RATE_LIMIT_MAX_REQUESTS,
): RequestHandler {
  return rateLimit({
    windowMs: CONTACT_RATE_LIMIT_WINDOW_MS,
    max: maxRequests,
    standardHeaders: true,
    legacyHeaders: false,
    message: CONTACT_RATE_LIMIT_RESPONSE,
  });
}

export const contactSubmissionLimiter = createContactSubmissionLimiter();

export const contactRequestBodyParser = express.json({
  limit: CONTACT_REQUEST_BODY_MAX_BYTES,
});

export function handleContactRequestBodyError(
  error: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (
    isBodyParserError(error) &&
    (error.type === "entity.too.large" || error.status === 413)
  ) {
    res.status(413).json({
      success: false,
      data: null,
      error: {
        code: "CONTACT_REQUEST_TOO_LARGE",
        message: "Contact form request is too large.",
        details: { maxBytes: CONTACT_REQUEST_BODY_MAX_BYTES },
      },
    });
    return;
  }

  next(error);
}

/** Continue from the exact early-protection route into the mounted router. */
export function continueToWebsiteContactRouter(
  _req: Request,
  _res: Response,
  next: NextFunction,
): void {
  next();
}
