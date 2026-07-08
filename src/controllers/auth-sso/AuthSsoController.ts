/**
 * Auth SSO Controller — Google sign-in for the admin (P1).
 *
 * OAuth start/callback are browser redirects, not JSON endpoints:
 *  - GET /api/auth/google/start    → set signed state cookie, redirect to Google
 *  - GET /api/auth/google/callback → verify + gate + mint JWT + set auth_token
 *                                     cookie, redirect to the SPA finish route
 *
 * The callback finishes with a RELATIVE redirect (`/auth/google/finish`) so it
 * resolves same-origin in every environment (Vite proxy locally, Apache on
 * dev/prod) — no FRONTEND_ORIGIN env needed. The minted JWT rides the existing
 * non-httpOnly `auth_token` cookie; the finish page copies it into localStorage.
 */

import { Request, Response } from "express";
import {
  createOAuthClient,
  buildAuthUrl,
  exchangeCodeForIdentity,
} from "./feature-services/service.google-oauth";
import { assertGoogleIdentity } from "./feature-services/service.google-identity";
import { loginAdminFromGoogle } from "./feature-services/service.sso-session";
import {
  newOAuthState,
  setStateCookie,
  consumeOAuthState,
} from "./feature-utils/util.oauth-tx";
import { AuthSsoError } from "./feature-utils/AuthSsoError";
import { buildAuthCookieOptions } from "../auth-otp/feature-utils/util.cookie-config";
import { ADMIN_ALLOWED_DOMAIN } from "../../config/googleLogin";
import logger from "../../lib/logger";

const AUTH_TOKEN_COOKIE = "auth_token";

function finishUrl(error?: string): string {
  // P1 is admin-only; the finish page routes the admin flow to /admin.
  return `/auth/google/finish?flow=admin${
    error ? `&error=${encodeURIComponent(error)}` : ""
  }`;
}

export class AuthSsoController {
  // GET /api/auth/google/start — begin the admin OAuth handshake.
  static start(_req: Request, res: Response): void {
    try {
      const { stateToken, nonce } = newOAuthState({ flow: "admin" });
      setStateCookie(res, stateToken);
      const client = createOAuthClient();
      res.redirect(buildAuthUrl(client, stateToken, nonce, ADMIN_ALLOWED_DOMAIN));
    } catch (err) {
      logger.error({ err }, "[auth-sso] start failed");
      res.redirect(finishUrl("AUTH_NOT_CONFIGURED"));
    }
  }

  // GET /api/auth/google/callback — verify, gate, mint session, redirect.
  static async callback(req: Request, res: Response): Promise<void> {
    try {
      const code = String(req.query.code ?? "");
      const state = String(req.query.state ?? "");
      if (!code) {
        throw new AuthSsoError(
          "AUTH_NO_CODE",
          "Sign-in failed. Please try again.",
          400
        );
      }

      const tx = consumeOAuthState(req, res, state);
      const payload = await exchangeCodeForIdentity(
        createOAuthClient(),
        code,
        tx.nonce
      );
      const identity = assertGoogleIdentity(payload);
      const { token } = await loginAdminFromGoogle(identity);

      res.cookie(AUTH_TOKEN_COOKIE, token, buildAuthCookieOptions());
      res.redirect(finishUrl());
    } catch (err) {
      const code = err instanceof AuthSsoError ? err.code : "AUTH_FAILED";
      logger.warn({ err, code }, "[auth-sso] callback rejected");
      res.redirect(finishUrl(code));
    }
  }
}
