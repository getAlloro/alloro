/**
 * Turns a verified Google identity into an Alloro session — reusing the SAME
 * bearer JWT the rest of the app issues (generateToken), so there is one
 * session model, not two.
 *
 * P1 implements the admin flow only: gate the domain, find-or-create the user,
 * bind the google_sub, mint the JWT. The user/client login + linking flows are
 * P2 (deferred).
 */

import { UserModel } from "../../../models/UserModel";
import { generateToken } from "../../auth-otp/feature-services/service.jwt-management";
import {
  assertAdminDomain,
  VerifiedIdentity,
} from "./service.google-identity";

export interface SsoLoginResult {
  token: string;
  user: { id: number; email: string; name: string | null };
}

/**
 * Admin sign-in from a verified Google identity. Matches an existing user by
 * google_sub first, then by email (binding the google_sub on the way), and
 * creates a fresh admin user only when neither exists. The domain gate runs
 * first so a non-@getalloro identity never reaches the user table.
 */
export async function loginAdminFromGoogle(
  identity: VerifiedIdentity
): Promise<SsoLoginResult> {
  assertAdminDomain(identity.email);

  let user = await UserModel.findByGoogleSub(identity.googleSub);

  if (!user) {
    const existingByEmail = await UserModel.findByEmail(identity.email);
    if (existingByEmail) {
      user = await UserModel.attachGoogleIdentity(
        existingByEmail.id,
        identity.googleSub,
        identity.avatarUrl
      );
    } else {
      user = await UserModel.createFromGoogle({
        email: identity.email,
        name: identity.name,
        googleSub: identity.googleSub,
        avatarUrl: identity.avatarUrl,
      });
    }
  }

  const token = generateToken(user.id, user.email);
  return {
    token,
    user: { id: user.id, email: user.email, name: user.name },
  };
}
