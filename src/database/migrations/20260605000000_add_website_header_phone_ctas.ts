import type { Knex } from "knex";

/**
 * Add header phone CTAs to the website builder dental templates and selected
 * live projects.
 *
 * Production safety:
 * - Backs up every affected template/project row before updates.
 * - Updates only published templates and a narrow allowlist of live domains.
 * - down() restores the original headers from backup tables.
 */

const BACKUP_TEMPLATES = "website_builder.templates_backup_20260605_header_phone_cta";
const BACKUP_PROJECTS = "website_builder.projects_backup_20260605_header_phone_cta";

const TARGET_DOMAINS = [
  "artfulorthodontics.com",
  "1endodontics.com",
  "garrisonorthodontics.com",
  "tricity-endo.com",
  "surfcityendo.com",
];

const PHONE_HELPER_TEXT = "Call us today";

const PHONE_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>';

type ProjectIdentity = {
  business?: {
    phone?: string | null;
  } | null;
  locations?: Array<{
    phone?: string | null;
    is_primary?: boolean | null;
  } | null> | null;
};

type ProjectRow = {
  id: string;
  custom_domain: string | null;
  custom_domain_alt: string | null;
  project_identity: unknown;
  header: string | null;
};

function parseIdentity(raw: unknown): ProjectIdentity | null {
  if (!raw) return null;
  if (typeof raw === "object") return raw as ProjectIdentity;
  if (typeof raw !== "string") return null;

  try {
    return JSON.parse(raw) as ProjectIdentity;
  } catch {
    return null;
  }
}

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function resolveProjectPhone(identity: ProjectIdentity | null): string | null {
  if (hasText(identity?.business?.phone)) {
    return identity.business.phone.trim();
  }

  const locations = Array.isArray(identity?.locations)
    ? identity.locations.filter(Boolean)
    : [];
  const primary = locations.find((location) => location?.is_primary) || locations[0];
  return hasText(primary?.phone) ? primary.phone.trim() : null;
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

function formatPhoneForDisplay(phone: string): string {
  const digits = digitsOnly(phone);
  const ten = digits.length === 11 && digits.startsWith("1")
    ? digits.slice(1)
    : digits;

  if (ten.length === 10) {
    return `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`;
  }

  return phone.trim();
}

function formatPhoneForTel(phone: string): string | null {
  const digits = digitsOnly(phone);
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length >= 7) return digits;
  return null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildPhoneCta(phone: string, telHref: string): string {
  const displayPhone = escapeHtml(formatPhoneForDisplay(phone));
  const href = escapeHtml(telHref);

  return ` <a href="tel:${href}" class="alloro-tpl-v1-release-header-component-phone-link flex flex-col items-start leading-tight font-sans no-underline">
      <span class="flex items-center gap-2 text-primary font-semibold text-base">${PHONE_ICON} ${displayPhone}</span>
      <span class="alloro-tpl-v1-release-header-component-phone-helper text-xs text-gray-500 mt-1 pl-6">${PHONE_HELPER_TEXT}</span>
    </a>`;
}

function buildTemplatePhoneCta(): string {
  return ` <!-- AI-CONTENT: header-phone | Replace href with tel:{business phone digits} and visible text with the formatted business phone. Default helper text must be "${PHONE_HELPER_TEXT}" unless the business identity explicitly says otherwise. -->
    <a href="tel:" class="alloro-tpl-v1-release-header-component-phone-link flex flex-col items-start leading-tight font-sans no-underline">
      <span class="flex items-center gap-2 text-primary font-semibold text-base">${PHONE_ICON} (555) 123-4567</span>
      <span class="alloro-tpl-v1-release-header-component-phone-helper text-xs text-gray-500 mt-1 pl-6">${PHONE_HELPER_TEXT}</span>
    </a>`;
}

function replacePhoneHelper(html: string): string {
  return html
    .replace(
      /(<a href="tel:[^"]+" class=")(?![^"]*alloro-tpl-v1-release-header-component-phone-link)([^"]*flex flex-col items-start leading-tight font-sans no-underline")/g,
      "$1alloro-tpl-v1-release-header-component-phone-link $2",
    )
    .replace(
      /<span class="alloro-tpl-v1-release-header-component-phone-helper text-xs text-gray-500 mt-1 pl-6">[^<]*<\/span>/g,
      `<span class="alloro-tpl-v1-release-header-component-phone-helper text-xs text-gray-500 mt-1 pl-6">${PHONE_HELPER_TEXT}</span>`,
    )
    .replace(
      /<span class="text-xs text-gray-500 mt-1 pl-6">\s*\(se habla espa(?:ñ|n)ol\)\s*<\/span>/gi,
      `<span class="alloro-tpl-v1-release-header-component-phone-helper text-xs text-gray-500 mt-1 pl-6">${PHONE_HELPER_TEXT}</span>`,
    );
}

function injectPhoneCta(header: string, phoneCta: string): string {
  const normalized = replacePhoneHelper(header);
  if (/href=["']tel:/i.test(normalized)) return normalized;

  const ctaGroupPattern =
    /<div class="hidden md:[^"]*">([\s\S]*?<a\b[^>]*class="[^"]*alloro-tpl-v1-release-(?:header-component-cta(?:-button)?|section-nav-component-cta-button)[^"]*"[\s\S]*?<\/a\s*>\s*)<\/div>/;

  return normalized.replace(
    ctaGroupPattern,
    `<div class="hidden md:flex items-center gap-6">$1${phoneCta}</div>`,
  );
}

function updateProjectHeader(row: ProjectRow): string | null {
  if (!row.header) return null;

  const identity = parseIdentity(row.project_identity);
  const phone = resolveProjectPhone(identity);
  if (!phone) return null;

  const telHref = formatPhoneForTel(phone);
  if (!telHref) return null;

  return injectPhoneCta(row.header, buildPhoneCta(phone, telHref));
}

async function backupTablesExist(knex: Knex): Promise<boolean> {
  const guard = await knex.raw(`SELECT to_regclass(?) AS templates, to_regclass(?) AS projects`, [
    BACKUP_TEMPLATES,
    BACKUP_PROJECTS,
  ]);
  return guard.rows[0].templates !== null || guard.rows[0].projects !== null;
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
    .select("id", "custom_domain", "custom_domain_alt", "project_identity", "header");

  await knex.transaction(async (trx) => {
    for (const template of templates) {
      const nextHeader = injectPhoneCta(template.header || "", buildTemplatePhoneCta());
      if (nextHeader !== template.header) {
        await trx("website_builder.templates").where("id", template.id).update({
          header: nextHeader,
          updated_at: new Date(),
        });
      }
    }

    for (const project of projects as ProjectRow[]) {
      const nextHeader = updateProjectHeader(project);
      if (nextHeader && nextHeader !== project.header) {
        await trx("website_builder.projects").where("id", project.id).update({
          header: nextHeader,
          updated_at: new Date(),
        });
      }
    }
  });

}

export async function down(knex: Knex): Promise<void> {
  const guard = await knex.raw(`SELECT to_regclass(?) AS templates, to_regclass(?) AS projects`, [
    BACKUP_TEMPLATES,
    BACKUP_PROJECTS,
  ]);
  if (guard.rows[0].templates === null || guard.rows[0].projects === null) {
    throw new Error("Cannot rollback website header phone CTA migration: backup tables missing.");
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
