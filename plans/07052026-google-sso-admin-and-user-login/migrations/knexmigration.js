/**
 * Migration scaffold — add Google login identity to `users`.
 *
 * PLANNING ARTIFACT. During execution, create the real file via:
 *   npm run db:make-migration -- add_google_sub_to_users
 * and copy this body in. Alloro is PostgreSQL + Knex; this is the migration
 * that actually runs (pgsql.sql / mssql.sql are reference equivalents).
 *
 * Production safety: additive, nullable columns only. No backfill, no data
 * rewrite, no table rewrite, no long lock. Fully reversible. Idempotent guards
 * so a re-run is safe (§10.3, §21.1 spirit).
 *
 * Columns:
 *   users.google_sub  text  NULL  — the stable Google account id (`sub` claim).
 *                                    Partial-UNIQUE where not null: one Google
 *                                    account maps to at most one Alloro user.
 *   users.avatar_url  text  NULL  — Google `picture`, best-effort display only.
 */

/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  const hasGoogleSub = await knex.schema.hasColumn("users", "google_sub");
  const hasAvatar = await knex.schema.hasColumn("users", "avatar_url");

  await knex.schema.alterTable("users", (table) => {
    if (!hasGoogleSub) table.text("google_sub").nullable();
    if (!hasAvatar) table.text("avatar_url").nullable();
  });

  // Partial unique index: uniqueness enforced only for linked accounts,
  // so the many NULLs (password-only users) don't collide.
  await knex.raw(
    `CREATE UNIQUE INDEX IF NOT EXISTS users_google_sub_unique
       ON users (google_sub)
       WHERE google_sub IS NOT NULL`
  );
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  await knex.raw(`DROP INDEX IF EXISTS users_google_sub_unique`);

  const hasGoogleSub = await knex.schema.hasColumn("users", "google_sub");
  const hasAvatar = await knex.schema.hasColumn("users", "avatar_url");

  await knex.schema.alterTable("users", (table) => {
    if (hasGoogleSub) table.dropColumn("google_sub");
    if (hasAvatar) table.dropColumn("avatar_url");
  });
};
