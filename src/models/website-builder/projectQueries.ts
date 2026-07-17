/* eslint-disable @typescript-eslint/no-explicit-any */
import { Knex } from "knex";
import { db } from "../../database/connection";
import {
  PaginatedResult,
  PaginationParams,
  QueryContext,
} from "../BaseModel";
import { IProject, ProjectFilters } from "./ProjectModel";

/**
 * Query-builder bodies for {@link ProjectModel}, extracted verbatim so the model
 * stays under the file-size ceiling while its public static surface — and every
 * caller of it — is unchanged (every non-trivial ProjectModel method delegates
 * here). The model retains only the BaseModel passthroughs (findById / create /
 * updateById / deleteById) and the `paginate` callbacks, which need
 * `this`-bound BaseModel internals.
 *
 * Behavior-preserving contract: every function builds the SAME query as the
 * original inline body in ProjectModel — identical columns, filters, joins,
 * ordering, limits, return shapes, raw SQL, and timestamp clocks (`db.fn.now()`
 * vs the JS `new Date()`). The table is referenced through the same literal the
 * model used (`PROJECTS_TABLE` === ProjectModel.tableName), so the SQL is
 * byte-identical. ProjectModel sets no `jsonFields`, so there is no
 * deserialization seam to keep in the model: helpers return rows/counts exactly
 * as the model returned them.
 */

const PROJECTS_TABLE = "website_builder.projects";

/** Mirror of BaseModel.table(trx) for the projects table. */
function table(trx?: QueryContext): Knex.QueryBuilder {
  return (trx || db)(PROJECTS_TABLE);
}

export function findByOrganizationIdQuery(
  orgId: number,
  trx?: QueryContext,
): Promise<IProject | undefined> {
  return table(trx).where({ organization_id: orgId }).first();
}

export function findRawByIdQuery(id: string, trx?: QueryContext): Promise<any> {
  return table(trx).where("id", id).first();
}

export function updateLayoutFieldQuery(
  id: string,
  layoutField: string,
  html: string,
  trx?: QueryContext,
): Promise<number> {
  return table(trx)
    .where("id", id)
    .update({
      [layoutField]: html,
      updated_at: db.fn.now(),
    });
}

export function findAllByOrganizationIdQuery(
  orgId: number,
  trx?: QueryContext,
): Promise<IProject[]> {
  return table(trx)
    .where({ organization_id: orgId })
    .orderBy("created_at", "asc");
}

export function setLayoutsGenerationStatusQuery(
  id: string,
  status: string,
  trx?: QueryContext,
): Promise<number> {
  return table(trx)
    .where("id", id)
    .update({
      layouts_generation_status: status,
      layouts_generation_progress: null,
      updated_at: db.fn.now(),
    });
}

export function markLayoutsReadyQuery(
  id: string,
  trx?: QueryContext,
): Promise<number> {
  return table(trx)
    .where("id", id)
    .update({
      layouts_generation_status: "ready",
      layouts_generation_progress: null,
      layouts_generated_at: db.fn.now(),
      updated_at: db.fn.now(),
    });
}

/**
 * Atomically create the instant-website project + homepage row and flip the
 * owning organization's patientpath status, in one transaction. Mirrors the
 * inline `db.transaction` in services/instantWebsiteGenerator verbatim
 * (projects insert + pages insert + organizations update). The model owns the
 * transaction boundary via BaseModel.transaction; callers composing further
 * writes may inject a `trx`. Payloads are written verbatim (raw passthrough).
 */
export function createInstantWebsiteWithHomepageQuery(
  params: {
    projectRow: Record<string, unknown>;
    pageRow: Record<string, unknown>;
    organizationId: number;
    organizationUpdate: Record<string, unknown>;
  },
  runInTransaction: (
    callback: (trx: Knex.Transaction) => Promise<void>,
  ) => Promise<void>,
  trx?: QueryContext,
): Promise<void> {
  const run = async (t: Knex.Transaction): Promise<void> => {
    // Create project
    await t(PROJECTS_TABLE).insert(params.projectRow);

    // Create homepage
    await t("website_builder.pages").insert(params.pageRow);

    // Update org with website status + photo quality for dashboard photo brief
    await t("organizations")
      .where({ id: params.organizationId })
      .update(params.organizationUpdate);
  };

  if (trx) {
    return run(trx as Knex.Transaction);
  }
  return runInTransaction(run);
}

export function updateRecipientsByOrganizationQuery(
  orgId: number,
  recipients: string[],
  trx?: QueryContext,
): Promise<number> {
  return table(trx)
    .where({ organization_id: orgId })
    .update({
      recipients: JSON.stringify(recipients),
      updated_at: new Date(),
    });
}

export function setReadOnlyQuery(
  orgId: number,
  trx?: QueryContext,
): Promise<number> {
  return table(trx)
    .where({ organization_id: orgId })
    .update({ is_read_only: true });
}

export function updateRybbitSiteIdQuery(
  projectId: string,
  siteId: string | null,
  trx?: QueryContext,
): Promise<number> {
  return table(trx)
    .where({ id: projectId })
    .update({
      rybbit_site_id: siteId,
      updated_at: new Date(),
    });
}

export function findRybbitConfigByOrganizationIdQuery(
  organizationId: number,
  trx?: QueryContext,
): Promise<
  { rybbit_site_id: string | null; rybbit_time_zone: string | null } | undefined
> {
  return table(trx)
    .select("rybbit_site_id", "rybbit_time_zone")
    .where("organization_id", organizationId)
    .first();
}

export async function getRybbitTimeZoneQuery(
  projectId: string,
  trx?: QueryContext,
): Promise<string | null> {
  const row = await table(trx)
    .select("rybbit_time_zone")
    .where({ id: projectId })
    .first();
  return row?.rybbit_time_zone ?? null;
}

export function updateRybbitTimeZoneQuery(
  projectId: string,
  timeZone: string | null,
  trx?: QueryContext,
): Promise<number> {
  return table(trx)
    .where({ id: projectId })
    .update({
      rybbit_time_zone: timeZone,
      updated_at: new Date(),
    });
}

export function findAllVerifiedDomainsQuery(
  trx?: QueryContext,
): Promise<{ custom_domain: string; custom_domain_alt: string | null }[]> {
  return table(trx)
    .leftJoin(
      "organizations",
      "website_builder.projects.organization_id",
      "organizations.id",
    )
    .select(
      "website_builder.projects.custom_domain",
      "website_builder.projects.custom_domain_alt",
    )
    .whereNotNull("website_builder.projects.domain_verified_at")
    .whereNotNull("website_builder.projects.custom_domain")
    .whereNull("website_builder.projects.archived_at")
    .where(function () {
      this.whereNull("website_builder.projects.organization_id").orWhereNull(
        "organizations.archived_at",
      );
    });
}

export function findWithOrgArchivedByIdQuery(
  projectId: string,
  trx?: QueryContext,
): Promise<any> {
  return table(trx)
    .leftJoin(
      "organizations as o",
      "website_builder.projects.organization_id",
      "o.id",
    )
    .select("website_builder.projects.*", "o.archived_at as org_archived_at")
    .where("website_builder.projects.id", projectId)
    .first();
}

export function findDomainVerificationContextByIdQuery(
  projectId: string,
  trx?: QueryContext,
): Promise<
  | {
      id: string;
      custom_domain: string | null;
      custom_domain_alt: string | null;
      domain_verified_at: Date | null;
      archived_at: Date | null;
      org_archived_at: Date | null;
    }
  | undefined
> {
  return table(trx)
    .leftJoin(
      "organizations as o",
      "website_builder.projects.organization_id",
      "o.id",
    )
    .select(
      "website_builder.projects.id",
      "website_builder.projects.custom_domain",
      "website_builder.projects.custom_domain_alt",
      "website_builder.projects.domain_verified_at",
      "website_builder.projects.archived_at",
      "o.archived_at as org_archived_at",
    )
    .where("website_builder.projects.id", projectId)
    .first();
}

export function findDomainConflictQuery(
  domain: string,
  altDomain: string,
  excludeProjectId: string,
  trx?: QueryContext,
): Promise<any> {
  return table(trx)
    .where(function () {
      this.where("custom_domain", domain)
        .orWhere("custom_domain", altDomain)
        .orWhere("custom_domain_alt", domain)
        .orWhere("custom_domain_alt", altDomain);
    })
    .whereNot("id", excludeProjectId)
    .whereNull("archived_at")
    .first();
}

export function setCustomDomainQuery(
  projectId: string,
  customDomain: string,
  customDomainAlt: string,
  trx?: QueryContext,
): Promise<number> {
  return table(trx).where("id", projectId).update({
    custom_domain: customDomain,
    custom_domain_alt: customDomainAlt,
    domain_verified_at: null,
    updated_at: db.fn.now(),
  });
}

export function markDomainVerifiedQuery(
  projectId: string,
  trx?: QueryContext,
): Promise<number> {
  return table(trx).where("id", projectId).update({
    domain_verified_at: db.fn.now(),
    updated_at: db.fn.now(),
  });
}

export function clearCustomDomainQuery(
  projectId: string,
  trx?: QueryContext,
): Promise<number> {
  return table(trx).where("id", projectId).update({
    custom_domain: null,
    custom_domain_alt: null,
    domain_verified_at: null,
    updated_at: db.fn.now(),
  });
}

export function findDomainStatusByIdQuery(
  projectId: string,
  trx?: QueryContext,
): Promise<
  | {
      id: string;
      custom_domain: string | null;
      custom_domain_alt: string | null;
      domain_verified_at: Date | null;
    }
  | undefined
> {
  return table(trx)
    .select("id", "custom_domain", "custom_domain_alt", "domain_verified_at")
    .where("id", projectId)
    .first();
}

export function findRybbitSiteIdByIdQuery(
  projectId: string,
  trx?: QueryContext,
): Promise<{ rybbit_site_id: string | null } | undefined> {
  return table(trx)
    .select("rybbit_site_id")
    .where("id", projectId)
    .first();
}

export function findRybbitSiteIdByIdForUpdateQuery(
  projectId: string,
  trx: QueryContext,
): Promise<{ rybbit_site_id: string | null } | undefined> {
  return table(trx)
    .select("rybbit_site_id")
    .where("id", projectId)
    .forUpdate()
    .first();
}

export function findPreviewProvisioningContextByIdQuery(
  projectId: string,
  trx?: QueryContext,
): Promise<
  | {
      id: string;
      hostname: string | null;
      generated_hostname: string | null;
      custom_domain: string | null;
      status: string | null;
      archived_at: Date | null;
      org_archived_at: Date | null;
    }
  | undefined
> {
  return table(trx)
    .leftJoin(
      "organizations as o",
      "website_builder.projects.organization_id",
      "o.id",
    )
    .select(
      "website_builder.projects.id",
      "website_builder.projects.hostname",
      "website_builder.projects.generated_hostname",
      "website_builder.projects.custom_domain",
      "website_builder.projects.status",
      "website_builder.projects.archived_at",
      "o.archived_at as org_archived_at",
    )
    .where("website_builder.projects.id", projectId)
    .first();
}

export function findByHostnameOrDomainQuery(
  host: string,
  trx?: QueryContext,
): Promise<IProject | undefined> {
  // Strip port if present (e.g. localhost:5173)
  const cleanHost = host.split(":")[0];

  // Check for *.sites.getalloro.com pattern
  const subdomainMatch = cleanHost.match(/^(.+)\.sites\.getalloro\.com$/);
  const hostname = subdomainMatch ? subdomainMatch[1] : null;

  return table(trx)
    .where(function () {
      if (hostname) {
        this.where("hostname", hostname).orWhere(
          "generated_hostname",
          hostname,
        );
      }
      this.orWhere("custom_domain", cleanHost).orWhere(
        "custom_domain_alt",
        cleanHost,
      );
    })
    .first();
}

export function findActiveByHostnameOrDomainQuery(
  host: string,
  trx?: QueryContext,
): Promise<IProject | undefined> {
  const cleanHost = host.split(":")[0];
  const subdomainMatch = cleanHost.match(/^(.+)\.sites\.getalloro\.com$/);
  const hostname = subdomainMatch ? subdomainMatch[1] : null;

  return table(trx)
    .leftJoin(
      "organizations",
      "website_builder.projects.organization_id",
      "organizations.id",
    )
    .select("website_builder.projects.*")
    .where(function () {
      if (hostname) {
        this.where("website_builder.projects.hostname", hostname).orWhere(
          "website_builder.projects.generated_hostname",
          hostname,
        );
      }
      this.orWhere("website_builder.projects.custom_domain", cleanHost).orWhere(
        "website_builder.projects.custom_domain_alt",
        cleanHost,
      );
    })
    .whereNull("website_builder.projects.archived_at")
    .where(function () {
      this.whereNull("website_builder.projects.organization_id").orWhereNull(
        "organizations.archived_at",
      );
    })
    .first();
}

export function findPublicActiveByIdQuery(
  id: string,
  trx?: QueryContext,
): Promise<IProject | undefined> {
  return table(trx)
    .leftJoin(
      "organizations",
      "website_builder.projects.organization_id",
      "organizations.id",
    )
    .select("website_builder.projects.*")
    .where("website_builder.projects.id", id)
    .whereNull("website_builder.projects.archived_at")
    .where(function () {
      this.whereNull("website_builder.projects.organization_id").orWhereNull(
        "organizations.archived_at",
      );
    })
    .first();
}

export function archiveForOrganizationQuery(
  orgId: number,
  archivedAt: Date,
  trx?: QueryContext,
): Promise<number> {
  return table(trx)
    .where({ organization_id: orgId })
    .update({ archived_at: archivedAt, updated_at: new Date() });
}

export function disconnectDomainsForOrganizationQuery(
  orgId: number,
  trx?: QueryContext,
): Promise<number> {
  return table(trx)
    .where({ organization_id: orgId })
    .update({
      custom_domain: null,
      custom_domain_alt: null,
      domain_verified_at: null,
      updated_at: new Date(),
    });
}

/**
 * buildQuery callback for the admin list-view pagination. Mirrors the inline
 * filter chain in ProjectModel.listAdmin verbatim; the model still calls
 * `this.paginate` so the count/limit/offset + deserialize behavior is unchanged.
 */
export function listAdminBuildQuery(
  filters: ProjectFilters,
): (qb: Knex.QueryBuilder) => Knex.QueryBuilder {
  return (qb: Knex.QueryBuilder) => {
    if (filters.organization_id) {
      qb = qb.where("organization_id", filters.organization_id);
    }
    if (filters.status) {
      qb = qb.where("status", filters.status);
    }
    if (filters.search) {
      qb = qb.where("name", "ilike", `%${filters.search}%`);
    }
    return qb.orderBy("created_at", "desc");
  };
}

// Admin project-manager + generation-pipeline + admin-controller query bodies
// live in the sibling `projectAdminQueries` module (split to keep each file
// under the size ceiling). Re-exported here so {@link ProjectModel} keeps its
// single `* as q` import and the public facade is unchanged.
export * from "./projectAdminQueries";

// Re-export the pagination types so the model can keep its signatures without
// importing from two places.
export type { PaginatedResult, PaginationParams };
