/**
 * Test Account Utility
 *
 * Identifies test accounts that bypass OTP verification.
 *
 * SECURITY: this bypass is DISABLED by default. It only activates when the
 * explicit `ALLOW_TEST_ACCOUNT` env flag is set to "true" AND the email matches
 * the configured test address. It is intentionally NOT gated on NODE_ENV — this
 * repo forces NODE_ENV="production" everywhere (see ecosystem config), so a
 * NODE_ENV check would be meaningless. With the flag unset (the default in
 * dev/prod), `tester@google.com` goes through the normal OTP flow like any other
 * account.
 */

const TEST_EMAIL = "tester@google.com";

export function isTestAccount(email: string): boolean {
  if (process.env.ALLOW_TEST_ACCOUNT !== "true") {
    return false;
  }
  return email === TEST_EMAIL;
}
