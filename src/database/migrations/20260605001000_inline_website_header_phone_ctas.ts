import type { Knex } from "knex";

/**
 * Keep the header phone CTA inline with the primary nav CTA.
 *
 * Production safety:
 * - Backs up affected template/project headers before updates.
 * - Updates only published templates and the confirmed website domain allowlist.
 * - down() restores the exact pre-fix header HTML from backup tables.
 */

const BACKUP_TEMPLATES = "website_builder.templates_backup_20260605_inline_header_phone_cta";
const BACKUP_PROJECTS = "website_builder.projects_backup_20260605_inline_header_phone_cta";

const TARGET_DOMAINS = [
  "artfulorthodontics.com",
  "1endodontics.com",
  "garrisonorthodontics.com",
  "tricity-endo.com",
  "surfcityendo.com",
];

type HeaderRow = {
  id: string;
  header: string | null;
};

const ctaClassPattern =
  /alloro-tpl-v1-release-(?:header-component-cta(?:-button)?|section-nav-component-cta-button)/;

function addClassTokenToHeaderLinks(html: string, marker: RegExp, token: string): string {
  return html.replace(/(<a\b[^>]*class=")([^"]*)(")/g, (match, prefix, className, suffix) => {
    if (!marker.test(className) || className.split(/\s+/).includes(token)) {
      return match;
    }

    return `${prefix}${className} ${token}${suffix}`;
  });
}

function normalizeHeaderCtaLayout(header: string): string {
  const inlineWrapperPattern =
    /<div class="hidden md:[^"]*">(\s*<a\b[^>]*class="[^"]*alloro-tpl-v1-release-(?:header-component-cta(?:-button)?|section-nav-component-cta-button)[^"]*"[\s\S]*?<\/a>\s*<a\b[^>]*class="[^"]*alloro-tpl-v1-release-header-component-phone-link[^"]*"[\s\S]*?<\/a>\s*)<\/div>/g;

  let next = header.replace(
    inlineWrapperPattern,
    '<div class="hidden md:flex items-center gap-6">$1</div>',
  );

  next = addClassTokenToHeaderLinks(next, ctaClassPattern, "shrink-0");
  next = addClassTokenToHeaderLinks(
    next,
    /alloro-tpl-v1-release-header-component-phone-link/,
    "shrink-0",
  );
  next = next.replace(
    /(<span class="[^"]*flex items-center gap-2 text-primary font-semibold text-base)(?![^"]*whitespace-nowrap)([^"]*">[\s\S]*?<\/span>)/g,
    "$1 whitespace-nowrap$2",
  );

  return next;
}

async function backupTablesExist(knex: Knex): Promise<boolean> {
  const guard = await knex.raw(`SELECT to_regclass(?) AS templates, to_regclass(?) AS projects`, [
    BACKUP_TEMPLATES,
    BACKUP_PROJECTS,
  ]);
  return guard.rows[0].templates !== null || guard.rows[0].projects !== null;
}

async function updateHeaders(
  trx: Knex.Transaction,
  tableName: string,
  rows: HeaderRow[],
): Promise<void> {
  for (const row of rows) {
    if (!row.header) continue;

    const nextHeader = normalizeHeaderCtaLayout(row.header);
    if (nextHeader === row.header) continue;

    await trx(tableName).where("id", row.id).update({
      header: nextHeader,
      updated_at: new Date(),
    });
  }
}

export async function up(knex: Knex): Promise<void> {
  if (await backupTablesExist(knex)) {
    throw new Error(
      `Backup tables ${BACKUP_TEMPLATES} / ${BACKUP_PROJECTS} already exist. Drop them to re-run.`,
    );
  }

  await knex.raw(
    `CREATE TABLE ${BACKUP_TEMPLATES} AS
     SELECT * FROM website_builder.templates
     WHERE status = 'published'`,
  );
  await knex.raw(
    `CREATE TABLE ${BACKUP_PROJECTS} AS
     SELECT * FROM website_builder.projects
     WHERE custom_domain = ANY (?::text[]) OR custom_domain_alt = ANY (?::text[])`,
    [TARGET_DOMAINS, TARGET_DOMAINS],
  );

  const templates = await knex("website_builder.templates")
    .where("status", "published")
    .select("id", "header");
  const projects = await knex("website_builder.projects")
    .where(function () {
      this.whereIn("custom_domain", TARGET_DOMAINS).orWhereIn(
        "custom_domain_alt",
        TARGET_DOMAINS,
      );
    })
    .select("id", "header");

  await knex.transaction(async (trx) => {
    await updateHeaders(trx, "website_builder.templates", templates as HeaderRow[]);
    await updateHeaders(trx, "website_builder.projects", projects as HeaderRow[]);
  });
}

export async function down(knex: Knex): Promise<void> {
  const guard = await knex.raw(`SELECT to_regclass(?) AS templates, to_regclass(?) AS projects`, [
    BACKUP_TEMPLATES,
    BACKUP_PROJECTS,
  ]);
  if (guard.rows[0].templates === null || guard.rows[0].projects === null) {
    throw new Error("Cannot rollback inline website header phone CTA migration: backup tables missing.");
  }

  await knex.transaction(async (trx) => {
    await trx.raw(
      `UPDATE website_builder.templates tgt
       SET header = src.header, updated_at = src.updated_at
       FROM ${BACKUP_TEMPLATES} src
       WHERE tgt.id = src.id`,
    );
    await trx.raw(
      `UPDATE website_builder.projects tgt
       SET header = src.header, updated_at = src.updated_at
       FROM ${BACKUP_PROJECTS} src
       WHERE tgt.id = src.id`,
    );
  });

  await knex.raw(`DROP TABLE IF EXISTS ${BACKUP_PROJECTS}`);
  await knex.raw(`DROP TABLE IF EXISTS ${BACKUP_TEMPLATES}`);
}
