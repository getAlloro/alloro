import type { Knex } from "knex";

type PmIdentityRepair = {
  email: string;
  displayName: string;
  firstName?: string;
  lastName?: string;
  preferredId?: number;
  legacyIds: number[];
};

const PM_IDENTITIES: PmIdentityRepair[] = [
  {
    email: "corey@getalloro.com",
    displayName: "Corey Wise",
    firstName: "Corey",
    lastName: "Wise",
    preferredId: 43,
    legacyIds: [43],
  },
  {
    email: "dave@getalloro.com",
    displayName: "dave",
    preferredId: 66,
    legacyIds: [58, 66],
  },
  {
    email: "jordan@getalloro.com",
    displayName: "jordan",
    preferredId: 67,
    legacyIds: [57, 67],
  },
];

const PM_REFERENCE_COLUMNS: Array<{ table: string; column: string }> = [
  { table: "pm_tasks", column: "assigned_to" },
  { table: "pm_tasks", column: "created_by" },
  { table: "pm_projects", column: "created_by" },
  { table: "pm_activity_log", column: "user_id" },
  { table: "pm_notifications", column: "user_id" },
  { table: "pm_notifications", column: "actor_user_id" },
  { table: "pm_task_attachments", column: "uploaded_by" },
  { table: "pm_task_comments", column: "author_id" },
  { table: "pm_ai_synth_batches", column: "created_by" },
];

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function userInsert(identity: PmIdentityRepair, id?: number): Record<string, unknown> {
  return {
    ...(id ? { id } : {}),
    email: normalizeEmail(identity.email),
    name: identity.displayName,
    first_name: identity.firstName ?? null,
    last_name: identity.lastName ?? null,
    email_verified: true,
    created_at: new Date(),
    updated_at: new Date(),
  };
}

async function ensureUser(knex: Knex, identity: PmIdentityRepair): Promise<number> {
  const email = normalizeEmail(identity.email);
  const existing = await knex("users")
    .whereRaw("LOWER(email) = ?", [email])
    .select("id")
    .first<{ id: number | string }>();

  if (existing) return Number(existing.id);

  if (identity.preferredId) {
    const existingAtPreferredId = await knex("users")
      .where({ id: identity.preferredId })
      .select("id")
      .first();

    if (!existingAtPreferredId) {
      await knex("users").insert(userInsert(identity, identity.preferredId));
      return identity.preferredId;
    }
  }

  const [created] = await knex("users").insert(userInsert(identity)).returning("id");
  return Number(typeof created === "object" ? created.id : created);
}

async function updateReferenceColumns(
  knex: Knex,
  fromIds: number[],
  toId: number
): Promise<void> {
  const idsToMove = Array.from(new Set(fromIds.filter((id) => id !== toId)));
  if (idsToMove.length === 0) return;

  for (const ref of PM_REFERENCE_COLUMNS) {
    await knex(ref.table).whereIn(ref.column, idsToMove).update({ [ref.column]: toId });
  }

  for (const fromId of idsToMove) {
    await knex.raw(
      `
        UPDATE pm_task_comments
        SET mentions = array_replace(mentions, ?, ?)
        WHERE ? = ANY(mentions)
      `,
      [fromId, toId, fromId]
    );
  }
}

async function updateFallbackActorNames(
  knex: Knex,
  fromIds: number[],
  actorName: string
): Promise<void> {
  for (const fromId of fromIds) {
    await knex.raw(
      `
        UPDATE pm_notifications
        SET metadata = jsonb_set(
          COALESCE(metadata, '{}'::jsonb),
          '{actor_name}',
          to_jsonb(?::text),
          true
        )
        WHERE actor_user_id = ?
          AND metadata->>'actor_name' = ?
      `,
      [actorName, fromId, `user ${fromId}`]
    );
  }
}

export async function up(knex: Knex): Promise<void> {
  for (const identity of PM_IDENTITIES) {
    const canonicalId = await ensureUser(knex, identity);
    await updateFallbackActorNames(knex, identity.legacyIds, identity.displayName);
    await updateReferenceColumns(knex, identity.legacyIds, canonicalId);
  }
}

export async function down(): Promise<void> {
  // No-op by design. This migration repairs production PM identity drift by
  // moving rows from orphaned auth IDs to real users; reversing that would put
  // current PM assignments and notifications back onto dead user IDs.
}
