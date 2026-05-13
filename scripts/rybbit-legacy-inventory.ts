/**
 * Dry-run inventory for legacy Rybbit header/footer snippets.
 *
 * Usage:
 *   npx tsx scripts/rybbit-legacy-inventory.ts
 *
 * This is read-only. It reports projects with enabled Rybbit-like snippets,
 * parsed site IDs, existing integration rows, and stored rybbit_data coverage.
 */

import { db } from "../src/database/connection";
import {
  extractRybbitSiteId,
  isRybbitSnippetCode,
} from "../src/controllers/admin-websites/feature-utils/util.rybbit-snippet";

type InventoryRow = {
  project_id: string;
  organization_id: number | null;
  display_name: string | null;
  custom_domain: string | null;
  rybbit_site_id: string | null;
  snippet_id: string;
  snippet_name: string;
  location: string;
  is_enabled: boolean;
  code: string;
  integration_id: string | null;
  integration_status: string | null;
  integration_site_id: string | null;
  data_rows: string | number | null;
  min_report_date: string | Date | null;
  max_report_date: string | Date | null;
};

function normalizeDate(value: string | Date | null): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().split("T")[0];
  return String(value).split("T")[0];
}

async function main(): Promise<void> {
  const rows = await db("website_builder.header_footer_code as hfc")
    .join("website_builder.projects as p", "p.id", "hfc.project_id")
    .leftJoin("website_builder.website_integrations as wi", function joinIntegration() {
      this.on("wi.project_id", "=", "p.id")
        .andOn("wi.platform", "=", db.raw("?", ["rybbit"]));
    })
    .leftJoin(
      db("website_builder.rybbit_data")
        .select("project_id")
        .count("* as data_rows")
        .min("report_date as min_report_date")
        .max("report_date as max_report_date")
        .groupBy("project_id")
        .as("rd"),
      "rd.project_id",
      "p.id",
    )
    .select({
      project_id: "p.id",
      organization_id: "p.organization_id",
      display_name: "p.display_name",
      custom_domain: "p.custom_domain",
      rybbit_site_id: "p.rybbit_site_id",
      snippet_id: "hfc.id",
      snippet_name: "hfc.name",
      location: "hfc.location",
      is_enabled: "hfc.is_enabled",
      code: "hfc.code",
      integration_id: "wi.id",
      integration_status: "wi.status",
      integration_site_id: db.raw("wi.metadata ->> 'siteId'"),
      data_rows: "rd.data_rows",
      min_report_date: "rd.min_report_date",
      max_report_date: "rd.max_report_date",
    })
    .where("hfc.is_enabled", true)
    .orderBy("p.display_name", "asc") as InventoryRow[];

  const legacyRows = rows
    .filter((row) => isRybbitSnippetCode(row.code))
    .map((row) => ({
      projectId: row.project_id,
      organizationId: row.organization_id,
      name: row.display_name,
      domain: row.custom_domain,
      projectSiteId: row.rybbit_site_id,
      snippetId: row.snippet_id,
      snippetName: row.snippet_name,
      location: row.location,
      detectedSiteId: extractRybbitSiteId(row.code),
      integrationId: row.integration_id,
      integrationStatus: row.integration_status,
      integrationSiteId: row.integration_site_id,
      dataRows: Number(row.data_rows ?? 0),
      dataFrom: normalizeDate(row.min_report_date),
      dataTo: normalizeDate(row.max_report_date),
    }));

  console.log(JSON.stringify({
    dryRun: true,
    totalEnabledLegacySnippets: legacyRows.length,
    projects: legacyRows,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error("[rybbit-inventory] failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.destroy();
  });
