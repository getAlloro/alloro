/**
 * Account Formatter
 *
 * Shapes onboarded Google connection rows into the account + GBP-location
 * payload returned by GET /accounts. Extracted from
 * PracticeRankingController.listAccounts to keep the controller thin.
 *
 * Preserves the original per-account debug log of the first GBP location's raw
 * structure (same Pino logger the controller used).
 */

import { parseJsonField } from "./util.json-parser";
import { log } from "./util.ranking-logger";

export interface FormattedAccountGbpLocation {
  accountId: string;
  locationId: string;
  displayName: string;
  address?: string;
}

export interface FormattedAccount {
  id: number;
  domain: string;
  practiceName: string;
  hasGbp: boolean;
  gbpLocations: FormattedAccountGbpLocation[];
  gbpCount: number;
}

/**
 * Map a single onboarded account row to its API shape. Logs the raw structure
 * of the first GBP location (debug aid preserved verbatim from the controller).
 */
function formatAccount(a: any): FormattedAccount {
  const propertyIds = parseJsonField(a.google_property_ids);

  const rawGbp = propertyIds?.gbp || [];
  if (rawGbp.length > 0) {
    log(
      `Account ${a.id} (${
        a.org_name
      }) GBP locations raw structure: ${JSON.stringify(rawGbp[0])}`,
    );
  }

  const gbpLocations: FormattedAccountGbpLocation[] = (
    propertyIds?.gbp || []
  ).map((gbp: any) => ({
    accountId: gbp.accountId,
    locationId: gbp.locationId,
    displayName: gbp.displayName || gbp.name || gbp.title || "Unknown Location",
    address: gbp.address || gbp.storefrontAddress?.addressLines?.[0],
  }));

  return {
    id: a.id,
    domain: a.org_domain,
    practiceName: a.org_name,
    hasGbp: gbpLocations.length > 0,
    gbpLocations: gbpLocations,
    gbpCount: gbpLocations.length,
  };
}

/** Map a list of onboarded account rows to their API shape. */
export function formatAccounts(accounts: any[]): FormattedAccount[] {
  return accounts.map(formatAccount);
}
