/**
 * billing-reset-test-org — clear one org's Stripe billing columns so the
 * checkout / paid add-location / remove flows can be exercised from a clean
 * slate (org lands in the admin-granted state and the Subscribe CTA shows).
 *
 * PROD-SAFETY INTERLOCK: refuses to run unless STRIPE_SECRET_KEY is a
 * TEST-mode key (sk_test_…). It must never touch billing columns in an
 * environment keyed for real money — pointing it at live is a hard error.
 *
 * Typical use on dev after a prod re-clone: prod-cloned orgs carry live-mode
 * Stripe ids that a test key cannot see; reset the org(s) you test with and
 * run checkout fresh (test card 4242 4242 4242 4242).
 *
 * Usage:
 *   npm run billing:reset-test-org -- <orgId>
 */
import dotenv from "dotenv";
dotenv.config();

import { db } from "../src/database/connection";

async function main() {
  const orgId = parseInt(process.argv[2] ?? "", 10);
  if (isNaN(orgId)) {
    console.error("Usage: npm run billing:reset-test-org -- <orgId>");
    process.exit(1);
  }

  const key = process.env.STRIPE_SECRET_KEY || "";
  if (!key.startsWith("sk_test_")) {
    console.error(
      "REFUSING TO RUN: STRIPE_SECRET_KEY is not a test-mode key (sk_test_…).\n" +
        "This reset only operates against Stripe TEST environments — never live billing data."
    );
    process.exit(2);
  }

  const org = await db("organizations").where({ id: orgId }).first();
  if (!org) {
    console.error(`Organization ${orgId} not found.`);
    process.exit(1);
  }

  console.log(`Resetting billing columns for org ${orgId} ("${org.name}"):`);
  console.log(
    `  stripe_customer_id:        ${org.stripe_customer_id ? "set → NULL" : "already null"}`
  );
  console.log(
    `  stripe_subscription_id:    ${org.stripe_subscription_id ? "set → NULL" : "already null"}`
  );
  console.log(
    `  stripe_price_id:           ${org.stripe_price_id ? "set → NULL" : "already null"}`
  );
  console.log(
    `  billing_quantity_override: ${org.billing_quantity_override != null ? `${org.billing_quantity_override} → NULL` : "already null"}`
  );
  console.log(
    `  subscription_status:       ${org.subscription_status} → active (admin-granted)`
  );

  await db("organizations").where({ id: orgId }).update({
    stripe_customer_id: null,
    stripe_subscription_id: null,
    stripe_price_id: null,
    billing_quantity_override: null,
    subscription_status: "active",
    subscription_updated_at: new Date(),
  });

  console.log(
    "\nDone. The org is in the admin-granted state — the Billing tab shows the Subscribe CTA and checkout can run fresh in test mode."
  );
  await db.destroy();
}

main().catch(async (err) => {
  console.error("Reset failed:", err);
  try {
    await db.destroy();
  } catch {
    /* connection already closed */
  }
  process.exit(1);
});
