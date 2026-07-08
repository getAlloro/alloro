/**
 * OAuth transaction state — CSRF (state) + replay (nonce) protection for the
 * Google sign-in handshake.
 *
 * The app does not run cookie-parser, so rather than depend on signed cookies
 * we make the `state` a short-lived JWT (signed with JWT_SECRET) that carries
 * the nonce + flow, and we double-submit it in an httpOnly cookie parsed from
 * the raw Cookie header. On callback we require: state(query) === state(cookie)
 * (same-browser / CSRF), a valid signature (we issued it), and later the
 * id_token nonce === state.nonce (replay). No new dependency, no change to the
 * global middleware stack.
 */

import crypto from "crypto";
import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { getJwtSecret } from "../../../config/jwt";
import { AuthSsoError } from "./AuthSsoError";

export type SsoFlow = "admin" | "login" | "link";

const STATE_COOKIE = "oauth_login_tx";
const STATE_TTL = "10m";
const STATE_TTL_MS = 10 * 60 * 1000;
// Scope the cookie to the SSO routes so it is only sent to the callback.
const COOKIE_PATH = "/api/auth/google";
const STATE_PURPOSE = "sso-oauth";

export interface OAuthState {
  nonce: string;
  flow: SsoFlow;
  userId?: number;
}

interface StateClaims {
  nonce?: string;
  flow?: SsoFlow;
  userId?: number;
  purpose?: string;
}

export function newOAuthState(input: { flow: SsoFlow; userId?: number }): {
  stateToken: string;
  nonce: string;
} {
  const nonce = crypto.randomBytes(16).toString("hex");
  const stateToken = jwt.sign(
    {
      nonce,
      flow: input.flow,
      purpose: STATE_PURPOSE,
      ...(input.userId ? { userId: input.userId } : {}),
    },
    getJwtSecret(),
    { expiresIn: STATE_TTL }
  );
  return { stateToken, nonce };
}

export function setStateCookie(res: Response, stateToken: string): void {
  res.cookie(STATE_COOKIE, stateToken, {
    httpOnly: true,
    // Secure everywhere except local http (NODE_ENV=development). dev/prod run
    // NODE_ENV=production over HTTPS, so the cookie survives the Google redirect.
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax", // must survive the top-level redirect back from Google
    path: COOKIE_PATH,
    maxAge: STATE_TTL_MS,
  });
}

function readRawCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return undefined;
}

/**
 * Validates the returned state against the cookie + signature and clears the
 * cookie. Throws AuthSsoError on any mismatch — the caller redirects to the
 * finish page with the error code.
 */
export function consumeOAuthState(
  req: Request,
  res: Response,
  returnedState: string
): OAuthState {
  const cookieState = readRawCookie(req, STATE_COOKIE);
  res.clearCookie(STATE_COOKIE, { path: COOKIE_PATH });

  if (!returnedState || !cookieState) {
    throw new AuthSsoError(
      "AUTH_STATE_MISSING",
      "Sign-in expired. Please try again.",
      400
    );
  }
  if (returnedState !== cookieState) {
    throw new AuthSsoError(
      "AUTH_STATE_MISMATCH",
      "Sign-in failed. Please try again.",
      400
    );
  }

  let claims: StateClaims;
  try {
    claims = jwt.verify(returnedState, getJwtSecret()) as unknown as StateClaims;
  } catch {
    throw new AuthSsoError(
      "AUTH_STATE_INVALID",
      "Sign-in failed. Please try again.",
      400
    );
  }

  if (claims.purpose !== STATE_PURPOSE || !claims.nonce || !claims.flow) {
    throw new AuthSsoError(
      "AUTH_STATE_INVALID",
      "Sign-in failed. Please try again.",
      400
    );
  }

  return { nonce: claims.nonce, flow: claims.flow, userId: claims.userId };
}
