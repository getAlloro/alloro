import { Knex } from "knex";

const ESCALATIONS_TABLE = "gbp_review_escalations";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE ${ESCALATIONS_TABLE}
    DROP CONSTRAINT IF EXISTS gbp_review_escalations_status_check
  `);
  await knex.raw(`
    ALTER TABLE ${ESCALATIONS_TABLE}
    ADD CONSTRAINT gbp_review_escalations_status_check
    CHECK (status IN ('open', 'resolved', 'dismissed'))
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE ${ESCALATIONS_TABLE}
    DROP CONSTRAINT IF EXISTS gbp_review_escalations_status_check
  `);
  await knex.raw(`
    ALTER TABLE ${ESCALATIONS_TABLE}
    ADD CONSTRAINT gbp_review_escalations_status_check
    CHECK (status IN ('open', 'resolved'))
  `);
}
