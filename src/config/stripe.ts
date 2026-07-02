/**
 * Stripe Configuration
 *
 * Initializes the Stripe SDK with the secret key from environment variables.
 * Exports the configured client and price ID constants.
 *
 * Fails fast if required env vars are missing — no silent fallback.
 */

import Stripe from "stripe";
import logger from "../lib/logger";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const STRIPE_DEFAULT_PRICE_ID = process.env.STRIPE_HEALTH_PRICE_ID;
const STRIPE_MODE_ENV = process.env.STRIPE_MODE;

if (!STRIPE_SECRET_KEY) {
  logger.warn(
    "[Stripe] STRIPE_SECRET_KEY is not set. Billing features will be unavailable."
  );
}

// ─── Billing environment (test vs live) guard ───

export type StripeMode = "test" | "live";

function deriveModeFromKey(key: string | undefined): StripeMode | null {
  if (!key) return null;
  if (key.startsWith("sk_test_") || key.startsWith("rk_test_")) return "test";
  if (key.startsWith("sk_live_") || key.startsWith("rk_live_")) return "live";
  return null;
}

const keyMode = deriveModeFromKey(STRIPE_SECRET_KEY);

if (
  STRIPE_MODE_ENV !== undefined &&
  STRIPE_MODE_ENV !== "test" &&
  STRIPE_MODE_ENV !== "live"
) {
  throw new Error(
    `[Stripe] STRIPE_MODE must be "test" or "live" when set (got "${STRIPE_MODE_ENV}").`
  );
}

if (STRIPE_MODE_ENV && keyMode && STRIPE_MODE_ENV !== keyMode) {
  // Fail fast: an environment declared as one mode but keyed for the other
  // (e.g. dev declared test but someone re-enabled the live key) must never
  // boot and silently mutate the wrong Stripe environment.
  throw new Error(
    `[Stripe] STRIPE_MODE=${STRIPE_MODE_ENV} but STRIPE_SECRET_KEY is a ${keyMode}-mode key. ` +
      `Refusing to start with a mismatched billing environment.`
  );
}

if (!STRIPE_MODE_ENV && keyMode) {
  logger.warn(
    `[Stripe] STRIPE_MODE is not set; inferred "${keyMode}" from the secret key prefix. ` +
      `Set STRIPE_MODE explicitly in the environment.`
  );
}

const STRIPE_MODE: StripeMode | null =
  (STRIPE_MODE_ENV as StripeMode | undefined) ?? keyMode;

/**
 * The billing environment this process runs against, or null when Stripe is
 * not configured. Webhook handling drops events whose livemode disagrees.
 */
export function getStripeMode(): StripeMode | null {
  return STRIPE_MODE;
}

// Initialize Stripe client (lazy — only fails when actually used if key is missing)
const stripe = STRIPE_SECRET_KEY
  ? new Stripe(STRIPE_SECRET_KEY)
  : null;

/**
 * Get the Stripe client instance.
 * Throws if Stripe is not configured.
 */
export function getStripe(): Stripe {
  if (!stripe) {
    throw new Error(
      "Stripe is not configured. Set STRIPE_SECRET_KEY in environment variables."
    );
  }
  return stripe;
}

/**
 * Get the webhook secret for signature verification.
 */
export function getWebhookSecret(): string {
  if (!STRIPE_WEBHOOK_SECRET) {
    throw new Error(
      "Stripe webhook secret is not configured. Set STRIPE_WEBHOOK_SECRET in environment variables."
    );
  }
  return STRIPE_WEBHOOK_SECRET;
}

/**
 * Get the default Stripe price ID ($2,000/location for new clients).
 */
export function getDefaultPriceId(): string {
  if (!STRIPE_DEFAULT_PRICE_ID) {
    throw new Error(
      "Stripe default price ID is not configured. Set STRIPE_HEALTH_PRICE_ID in environment variables."
    );
  }
  return STRIPE_DEFAULT_PRICE_ID;
}

/**
 * Check if Stripe is configured (for graceful degradation).
 */
export function isStripeConfigured(): boolean {
  return !!stripe;
}
