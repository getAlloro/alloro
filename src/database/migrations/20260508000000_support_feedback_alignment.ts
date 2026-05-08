import { Knex } from "knex";

const TICKETS_TABLE = "support_tickets";
const ATTACHMENTS_TABLE = "support_ticket_attachments";

export async function up(knex: Knex): Promise<void> {
  await migrateSeverity(knex);
  await migratePriority(knex);

  await knex.schema.createTable(ATTACHMENTS_TABLE, (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table
      .uuid("ticket_id")
      .notNullable()
      .references("id")
      .inTable(TICKETS_TABLE)
      .onDelete("CASCADE");
    table
      .integer("uploaded_by_user_id")
      .references("id")
      .inTable("users")
      .onDelete("SET NULL");
    table.string("uploader_role", 32).notNullable();
    table.string("visibility", 32).notNullable().defaultTo("client_visible");
    table.string("filename", 500).notNullable();
    table.string("s3_key", 1000).notNullable().unique();
    table.string("mime_type", 100).notNullable();
    table.bigInteger("size_bytes").notNullable();
    table
      .timestamp("created_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
  });

  await knex.raw(`
    ALTER TABLE ${ATTACHMENTS_TABLE}
    ADD CONSTRAINT ${ATTACHMENTS_TABLE}_uploader_role_check
    CHECK (uploader_role IN ('client', 'admin', 'system'))
  `);
  await knex.raw(`
    ALTER TABLE ${ATTACHMENTS_TABLE}
    ADD CONSTRAINT ${ATTACHMENTS_TABLE}_visibility_check
    CHECK (visibility IN ('client_visible', 'internal'))
  `);
  await knex.raw(`
    CREATE INDEX idx_support_ticket_attachments_ticket
    ON ${ATTACHMENTS_TABLE}(ticket_id, created_at DESC)
  `);
  await knex.raw(`
    CREATE INDEX idx_support_ticket_attachments_ticket_visibility
    ON ${ATTACHMENTS_TABLE}(ticket_id, visibility, created_at DESC)
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(ATTACHMENTS_TABLE);
  await rollbackPriority(knex);
  await rollbackSeverity(knex);
}

async function migrateSeverity(knex: Knex): Promise<void> {
  await knex.raw(`ALTER TABLE ${TICKETS_TABLE} ALTER COLUMN severity DROP DEFAULT`);
  await knex.raw(`CREATE TYPE support_ticket_severity_v2 AS ENUM ('low', 'medium', 'high')`);
  await knex.raw(`
    ALTER TABLE ${TICKETS_TABLE}
    ALTER COLUMN severity TYPE support_ticket_severity_v2
    USING (
      CASE severity::text
        WHEN 'urgent' THEN 'high'
        WHEN 'high' THEN 'high'
        WHEN 'low' THEN 'low'
        ELSE 'medium'
      END
    )::support_ticket_severity_v2
  `);
  await knex.raw(`ALTER TABLE ${TICKETS_TABLE} ALTER COLUMN severity SET DEFAULT 'medium'`);
  await knex.raw(`DROP TYPE support_ticket_severity`);
  await knex.raw(`ALTER TYPE support_ticket_severity_v2 RENAME TO support_ticket_severity`);
}

async function rollbackSeverity(knex: Knex): Promise<void> {
  await knex.raw(`ALTER TABLE ${TICKETS_TABLE} ALTER COLUMN severity DROP DEFAULT`);
  await knex.raw(`CREATE TYPE support_ticket_severity_old AS ENUM ('low', 'medium', 'high', 'urgent')`);
  await knex.raw(`
    ALTER TABLE ${TICKETS_TABLE}
    ALTER COLUMN severity TYPE support_ticket_severity_old
    USING severity::text::support_ticket_severity_old
  `);
  await knex.raw(`ALTER TABLE ${TICKETS_TABLE} ALTER COLUMN severity SET DEFAULT 'medium'`);
  await knex.raw(`DROP TYPE support_ticket_severity`);
  await knex.raw(`ALTER TYPE support_ticket_severity_old RENAME TO support_ticket_severity`);
}

async function migratePriority(knex: Knex): Promise<void> {
  await knex.raw(`ALTER TABLE ${TICKETS_TABLE} ALTER COLUMN priority DROP DEFAULT`);
  await knex.raw(`CREATE TYPE support_ticket_priority_v2 AS ENUM ('p0', 'p1', 'p2', 'p3')`);
  await knex.raw(`
    ALTER TABLE ${TICKETS_TABLE}
    ALTER COLUMN priority TYPE support_ticket_priority_v2
    USING (
      CASE priority::text
        WHEN 'urgent' THEN 'p0'
        WHEN 'high' THEN 'p1'
        WHEN 'normal' THEN 'p2'
        ELSE 'p3'
      END
    )::support_ticket_priority_v2
  `);
  await knex.raw(`ALTER TABLE ${TICKETS_TABLE} ALTER COLUMN priority SET DEFAULT 'p2'`);
  await knex.raw(`DROP TYPE support_ticket_priority`);
  await knex.raw(`ALTER TYPE support_ticket_priority_v2 RENAME TO support_ticket_priority`);
}

async function rollbackPriority(knex: Knex): Promise<void> {
  await knex.raw(`ALTER TABLE ${TICKETS_TABLE} ALTER COLUMN priority DROP DEFAULT`);
  await knex.raw(`CREATE TYPE support_ticket_priority_old AS ENUM ('low', 'normal', 'high', 'urgent')`);
  await knex.raw(`
    ALTER TABLE ${TICKETS_TABLE}
    ALTER COLUMN priority TYPE support_ticket_priority_old
    USING (
      CASE priority::text
        WHEN 'p0' THEN 'urgent'
        WHEN 'p1' THEN 'high'
        WHEN 'p2' THEN 'normal'
        ELSE 'low'
      END
    )::support_ticket_priority_old
  `);
  await knex.raw(`ALTER TABLE ${TICKETS_TABLE} ALTER COLUMN priority SET DEFAULT 'normal'`);
  await knex.raw(`DROP TYPE support_ticket_priority`);
  await knex.raw(`ALTER TYPE support_ticket_priority_old RENAME TO support_ticket_priority`);
}
