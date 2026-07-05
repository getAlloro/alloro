/**
 * Google OAuth authorization-code flow for login (ported from
 * alloro-os/backend/src/auth/googleClient.ts). The client secret never reaches
 * the browser — the code→token exchange runs here, then the ID token's
 * signature is verified via Google's JWKS (by the library) and its nonce is
 * checked against the one we issued. Domain gating happens in
 * service.google-identity.
 */

import { OAuth2Client, type TokenPayload } from "google-auth-library";
import { getGoogleLoginConfig } from "../../../config/googleLogin";
import { AuthSsoError } from "../feature-utils/AuthSsoError";

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

export function createOAuthClient(): OAuth2Client {
  const cfg = getGoogleLoginConfig();
  return new OAuth2Client({
    clientId: cfg.clientId,
    clientSecret: cfg.clientSecret,
    redirectUri: cfg.redirectUri,
  });
}

/**
 * Authorization-code start URL. `hd` is a UX hint (pre-selects the Workspace
 * domain) — never the security gate; the domain is enforced in code.
 */
export function buildAuthUrl(
  client: OAuth2Client,
  state: string,
  nonce: string,
  hostedDomain?: string
): string {
  const url = client.generateAuthUrl({
    access_type: "online",
    scope: ["openid", "email", "profile"],
    state,
    prompt: "select_account",
  });
  const hd = hostedDomain ? `&hd=${encodeURIComponent(hostedDomain)}` : "";
  return `${url}&nonce=${encodeURIComponent(nonce)}${hd}`;
}

interface GoogleTokenExchangeResponse {
  id_token?: string;
  error?: string;
  error_description?: string;
}

async function exchangeCodeForTokens(
  code: string
): Promise<GoogleTokenExchangeResponse> {
  const cfg = getGoogleLoginConfig();
  const body = new URLSearchParams({
    code,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    redirect_uri: cfg.redirectUri,
    grant_type: "authorization_code",
  });

  let res: Response;
  try {
    res = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "identity",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
  } catch {
    throw new AuthSsoError(
      "AUTH_TOKEN_EXCHANGE_FAILED",
      "Sign-in failed. Please try again.",
      502
    );
  }

  let payload: GoogleTokenExchangeResponse;
  try {
    payload = (await res.json()) as GoogleTokenExchangeResponse;
  } catch {
    throw new AuthSsoError(
      "AUTH_TOKEN_EXCHANGE_BAD_RESPONSE",
      "Sign-in failed. Please try again.",
      502
    );
  }

  if (!res.ok) {
    throw new AuthSsoError(
      "AUTH_TOKEN_EXCHANGE_REJECTED",
      "Sign-in failed. Please try again.",
      401,
      {
        status: res.status,
        error: payload.error ?? "unknown",
      }
    );
  }
  return payload;
}

/**
 * Exchange the code, verify the ID token (signature via JWKS + iss/aud/exp by
 * the library), then check the nonce we issued.
 */
export async function exchangeCodeForIdentity(
  client: OAuth2Client,
  code: string,
  expectedNonce: string
): Promise<TokenPayload> {
  const tokens = await exchangeCodeForTokens(code);
  if (!tokens.id_token) {
    throw new AuthSsoError(
      "AUTH_NO_ID_TOKEN",
      "Sign-in failed. Please try again.",
      401
    );
  }

  const cfg = getGoogleLoginConfig();
  const ticket = await client.verifyIdToken({
    idToken: tokens.id_token,
    audience: cfg.clientId,
  });
  const payload = ticket.getPayload();
  if (!payload) {
    throw new AuthSsoError(
      "AUTH_INVALID_TOKEN",
      "Sign-in failed. Please try again.",
      401
    );
  }
  if (!payload.nonce || payload.nonce !== expectedNonce) {
    throw new AuthSsoError(
      "AUTH_NONCE_MISMATCH",
      "Sign-in failed. Please try again.",
      401
    );
  }
  return payload;
}
