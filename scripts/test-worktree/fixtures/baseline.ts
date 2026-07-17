import type { Knex } from "knex";
import { FIXTURE_IDENTITIES, FIXTURE_IDS } from "./constants";

export async function seedBaselineFixture(trx: Knex.Transaction): Promise<void> {
  await trx("users")
    .insert({
      id: FIXTURE_IDS.adminUser,
      email: FIXTURE_IDENTITIES.adminEmail,
      name: "Worktree Admin",
      first_name: "Worktree",
      last_name: "Admin",
      email_verified: true,
      is_internal: true,
    })
    .onConflict("id")
    .merge();

  await trx("users")
    .insert({
      id: FIXTURE_IDS.clientUser,
      email: FIXTURE_IDENTITIES.clientEmail,
      name: "Worktree Client",
      first_name: "Worktree",
      last_name: "Client",
      email_verified: true,
      is_internal: false,
    })
    .onConflict("id")
    .merge();

  await trx("organizations")
    .insert({
      id: FIXTURE_IDS.organization,
      name: FIXTURE_IDENTITIES.organizationName,
      domain: FIXTURE_IDENTITIES.organizationDomain,
      subscription_tier: "DWY",
      subscription_status: "active",
      onboarding_completed: true,
      onboarding_wizard_completed: true,
      organization_type: "dental",
      is_sandbox: true,
    })
    .onConflict("id")
    .merge();

  await trx("locations")
    .insert({
      id: FIXTURE_IDS.location,
      organization_id: FIXTURE_IDS.organization,
      name: FIXTURE_IDENTITIES.locationName,
      domain: FIXTURE_IDENTITIES.organizationDomain,
      is_primary: true,
      status: "active",
      business_data: JSON.stringify({
        practiceName: FIXTURE_IDENTITIES.organizationName,
        city: "Test City",
        state: "TS",
      }),
    })
    .onConflict("id")
    .merge();

  await trx("organization_users")
    .insert({
      id: FIXTURE_IDS.organizationUser,
      organization_id: FIXTURE_IDS.organization,
      user_id: FIXTURE_IDS.clientUser,
      role: "admin",
    })
    .onConflict("id")
    .merge();

  await trx("user_locations")
    .insert({
      user_id: FIXTURE_IDS.clientUser,
      location_id: FIXTURE_IDS.location,
    })
    .onConflict(["user_id", "location_id"])
    .ignore();
}
