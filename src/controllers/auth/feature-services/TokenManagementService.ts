import { getValidOAuth2Client } from "../../../auth/oauth2Helper";
import { GoogleConnectionModel, IGoogleConnection } from "../../../models/GoogleConnectionModel";
import logger from "../../../lib/logger";

/**
 * Required OAuth scopes (used as fallback when account has no stored scopes)
 */
const REQUIRED_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/business.manage",
] as const;

/**
 * Validates and refreshes an OAuth access token for a Google account.
 * Delegates to the oauth2Helper which handles expiry check and DB update,
 * then fetches the updated account record.
 *
 * @param googleAccountId Google account database ID
 * @returns Updated Google account with fresh token data
 */
export async function validateAndRefreshToken(
  googleAccountId: number,
): Promise<IGoogleConnection> {
  try {
    // Use the safe helper which handles expiry check and DB update
    await getValidOAuth2Client(googleAccountId);

    // Fetch the updated account
    const googleAccount = await GoogleConnectionModel.findById(googleAccountId);

    if (!googleAccount) {
      throw new Error("Google account not found after refresh");
    }

    return googleAccount;
  } catch (error) {
    logger.error({ err: error }, "[AUTH] Error refreshing access token:");
    throw error;
  }
}

/**
 * Returns the parsed scopes array for a Google account,
 * falling back to REQUIRED_SCOPES if none are stored.
 *
 * @param googleAccount The Google account record
 * @returns Array of scope strings
 */
export function getAccountScopes(googleAccount: IGoogleConnection): string[] {
  return googleAccount.scopes?.split(",") || [...REQUIRED_SCOPES];
}
