import type { Knex } from "knex";
import { FIXTURE_IDENTITIES, FIXTURE_IDS } from "./constants";

export async function seedGbpPostsFixture(
  trx: Knex.Transaction,
  syntheticRefreshToken: string,
): Promise<void> {
  await trx("google_connections")
    .insert({
      id: FIXTURE_IDS.googleConnection,
      google_user_id: "worktree-google-user",
      email: FIXTURE_IDENTITIES.clientEmail,
      refresh_token: syntheticRefreshToken,
      access_token: null,
      token_type: "Bearer",
      expiry_date: null,
      scopes: "https://www.googleapis.com/auth/business.manage",
      organization_id: FIXTURE_IDS.organization,
      google_property_ids: JSON.stringify([]),
    })
    .onConflict("id")
    .merge();

  await trx("google_properties")
    .insert({
      id: FIXTURE_IDS.googleProperty,
      location_id: FIXTURE_IDS.location,
      google_connection_id: FIXTURE_IDS.googleConnection,
      type: "gbp",
      external_id: "locations/900001",
      account_id: "accounts/900001",
      display_name: FIXTURE_IDENTITIES.locationName,
      metadata: JSON.stringify({
        fixture: true,
        placeId: "worktree-place-900001",
      }),
      selected: true,
    })
    .onConflict("id")
    .merge();

  await trx("website_builder.reviews")
    .insert({
      id: FIXTURE_IDS.review,
      location_id: FIXTURE_IDS.location,
      google_review_name:
        "accounts/900001/locations/900001/reviews/900001",
      stars: 5,
      text: "Synthetic review for isolated Google-post acceptance.",
      reviewer_name: "Synthetic Reviewer",
      is_anonymous: false,
      review_created_at: new Date("2026-07-01T00:00:00.000Z"),
      has_reply: false,
      source: "oauth",
      place_id: "worktree-place-900001",
      hidden: false,
    })
    .onConflict("id")
    .merge();
}
