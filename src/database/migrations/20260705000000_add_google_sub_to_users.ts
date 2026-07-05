import { Knex } from "knex";

/**
 * Add Google login identity to `users` (plans/07052026-google-sso-admin-and-user-login, T1).
 *
 * Additive, nullable columns only — no backfill, no rewrite, no long lock,
 * fully reversible. `google_sub` is the stable Google account id (the `sub`
 * claim); the partial-unique index enforces one Google account → at most one
 * Alloro user while letting the many password-only NULLs coexist. `avatar_url`
 * holds the Google `picture` for display.
 */
export async function up(knex: Knex): Promise<void> {
  const hasGoogleSub = await knex.schema.hasColumn("users", "google_sub");
  const hasAvatar = await knex.schema.hasColumn("users", "avatar_url");

  await knex.schema.alterTable("users", (table) => {
    if (!hasGoogleSub) table.text("google_sub").nullable();
    if (!hasAvatar) table.text("avatar_url").nullable();
  });

  await knex.raw(
    `CREATE UNIQUE INDEX IF NOT EXISTS users_google_sub_unique
       ON users (google_sub)
       WHERE google_sub IS NOT NULL`
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS users_google_sub_unique`);

  const hasGoogleSub = await knex.schema.hasColumn("users", "google_sub");
  const hasAvatar = await knex.schema.hasColumn("users", "avatar_url");

  await knex.schema.alterTable("users", (table) => {
    if (hasGoogleSub) table.dropColumn("google_sub");
    if (hasAvatar) table.dropColumn("avatar_url");
  });
}
