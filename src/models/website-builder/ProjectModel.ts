import { Knex } from "knex";
import {
  BaseModel,
  PaginatedResult,
  PaginationParams,
  QueryContext,
} from "../BaseModel";

export interface IProject {
  id: string;
  organization_id: number | null;
  name: string;
  display_name?: string | null;
  hostname: string | null;
  generated_hostname: string | null;
  custom_domain: string | null;
  custom_domain_alt?: string | null;
  selected_website_url?: string | null;
  template_id: string | null;
  status: string;
  rybbit_site_id?: string | null;
  rybbit_time_zone?: string | null;
  domain_verified_at?: Date | null;
  settings: Record<string, unknown> | null;
  primary_color: string | null;
  accent_color: string | null;
  recipients: string[];
  archived_at?: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface ProjectFilters {
  organization_id?: number;
  status?: string;
  search?: string;
}

export class ProjectModel extends BaseModel {
  protected static tableName = "website_builder.projects";

  static async findById(
    id: string,
    trx?: QueryContext,
  ): Promise<IProject | undefined> {
    return super.findById(id, trx);
  }

  static async findByOrganizationId(
    orgId: number,
    trx?: QueryContext,
  ): Promise<IProject | undefined> {
    return this.table(trx).where({ organization_id: orgId }).first();
  }

  static async findAllByOrganizationId(
    orgId: number,
    trx?: QueryContext,
  ): Promise<IProject[]> {
    return this.table(trx)
      .where({ organization_id: orgId })
      .orderBy("created_at", "asc");
  }

  static async create(
    data: Partial<IProject>,
    trx?: QueryContext,
  ): Promise<IProject> {
    return super.create(data as Record<string, unknown>, trx);
  }

  static async updateById(
    id: string,
    data: Partial<IProject>,
    trx?: QueryContext,
  ): Promise<number> {
    return super.updateById(id, data as Record<string, unknown>, trx);
  }

  /**
   * Atomically create the instant-website project + homepage row and flip the
   * owning organization's patientpath status, in one transaction. Mirrors the
   * inline `db.transaction` in services/instantWebsiteGenerator verbatim
   * (projects insert + pages insert + organizations update) — the three writes
   * must land together so a crash never leaves an orphan project that the
   * dedup check would treat as "already generated". The model owns the
   * transaction boundary (mirrors PageModel.restoreVersion); callers composing
   * further writes may inject a `trx`. Payloads are passed pre-formed and
   * written verbatim (raw passthrough) so behavior is byte-identical.
   *
   * The companion "preview ready" notification is intentionally NOT part of
   * this method — it stays outside the transaction at the call site so a
   * notification failure never rolls back the committed website.
   */
  static async createInstantWebsiteWithHomepage(
    params: {
      projectRow: Record<string, unknown>;
      pageRow: Record<string, unknown>;
      organizationId: number;
      organizationUpdate: Record<string, unknown>;
    },
    trx?: QueryContext,
  ): Promise<void> {
    const run = async (t: Knex.Transaction): Promise<void> => {
      // Create project
      await t(this.tableName).insert(params.projectRow);

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
    return this.transaction(run);
  }

  static async updateRecipientsByOrganization(
    orgId: number,
    recipients: string[],
    trx?: QueryContext,
  ): Promise<number> {
    return this.table(trx)
      .where({ organization_id: orgId })
      .update({
        recipients: JSON.stringify(recipients),
        updated_at: new Date(),
      });
  }

  static async setReadOnly(orgId: number, trx?: QueryContext): Promise<number> {
    return this.table(trx)
      .where({ organization_id: orgId })
      .update({ is_read_only: true });
  }

  static async updateRybbitSiteId(
    projectId: string,
    siteId: string | null,
    trx?: QueryContext,
  ): Promise<number> {
    return this.table(trx)
      .where({ id: projectId })
      .update({
        rybbit_site_id: siteId,
        updated_at: new Date(),
      });
  }

  /**
   * (rybbit_site_id, rybbit_time_zone) projection for an org's project. Mirrors
   * the inline lookup in utils/rybbit/service.rybbit-data.getRybbitSiteConfig.
   * Returns the raw row (or undefined).
   */
  static async findRybbitConfigByOrganizationId(
    organizationId: number,
    trx?: QueryContext,
  ): Promise<{ rybbit_site_id: string | null; rybbit_time_zone: string | null } | undefined> {
    return this.table(trx)
      .select("rybbit_site_id", "rybbit_time_zone")
      .where("organization_id", organizationId)
      .first();
  }

  static async getRybbitTimeZone(
    projectId: string,
    trx?: QueryContext,
  ): Promise<string | null> {
    const row = await this.table(trx)
      .select("rybbit_time_zone")
      .where({ id: projectId })
      .first();
    return row?.rybbit_time_zone ?? null;
  }

  static async updateRybbitTimeZone(
    projectId: string,
    timeZone: string | null,
    trx?: QueryContext,
  ): Promise<number> {
    return this.table(trx)
      .where({ id: projectId })
      .update({
        rybbit_time_zone: timeZone,
        updated_at: new Date(),
      });
  }

  static async findAllVerifiedDomains(
    trx?: QueryContext,
  ): Promise<{ custom_domain: string; custom_domain_alt: string | null }[]> {
    return this.table(trx)
      .leftJoin(
        "organizations",
        "website_builder.projects.organization_id",
        "organizations.id"
      )
      .select(
        "website_builder.projects.custom_domain",
        "website_builder.projects.custom_domain_alt"
      )
      .whereNotNull("website_builder.projects.domain_verified_at")
      .whereNotNull("website_builder.projects.custom_domain")
      .whereNull("website_builder.projects.archived_at")
      .where(function () {
        this.whereNull("website_builder.projects.organization_id").orWhereNull(
          "organizations.archived_at"
        );
      });
  }

  /**
   * Find a project by hostname, generated_hostname, custom_domain, or custom_domain_alt.
   * Used by form submissions that identify the project by the page's hostname.
   */
  static async findByHostnameOrDomain(
    host: string,
    trx?: QueryContext,
  ): Promise<IProject | undefined> {
    // Strip port if present (e.g. localhost:5173)
    const cleanHost = host.split(":")[0];

    // Check for *.sites.getalloro.com pattern
    const subdomainMatch = cleanHost.match(/^(.+)\.sites\.getalloro\.com$/);
    const hostname = subdomainMatch ? subdomainMatch[1] : null;

    return this.table(trx)
      .where(function () {
        if (hostname) {
          this.where("hostname", hostname).orWhere("generated_hostname", hostname);
        }
        this.orWhere("custom_domain", cleanHost)
          .orWhere("custom_domain_alt", cleanHost);
      })
      .first();
  }

  static async findActiveByHostnameOrDomain(
    host: string,
    trx?: QueryContext,
  ): Promise<IProject | undefined> {
    const cleanHost = host.split(":")[0];
    const subdomainMatch = cleanHost.match(/^(.+)\.sites\.getalloro\.com$/);
    const hostname = subdomainMatch ? subdomainMatch[1] : null;

    return this.table(trx)
      .leftJoin(
        "organizations",
        "website_builder.projects.organization_id",
        "organizations.id"
      )
      .select("website_builder.projects.*")
      .where(function () {
        if (hostname) {
          this.where("website_builder.projects.hostname", hostname).orWhere(
            "website_builder.projects.generated_hostname",
            hostname
          );
        }
        this.orWhere("website_builder.projects.custom_domain", cleanHost)
          .orWhere("website_builder.projects.custom_domain_alt", cleanHost);
      })
      .whereNull("website_builder.projects.archived_at")
      .where(function () {
        this.whereNull("website_builder.projects.organization_id").orWhereNull(
          "organizations.archived_at"
        );
      })
      .first();
  }

  static async findPublicActiveById(
    id: string,
    trx?: QueryContext,
  ): Promise<IProject | undefined> {
    return this.table(trx)
      .leftJoin(
        "organizations",
        "website_builder.projects.organization_id",
        "organizations.id"
      )
      .select("website_builder.projects.*")
      .where("website_builder.projects.id", id)
      .whereNull("website_builder.projects.archived_at")
      .where(function () {
        this.whereNull("website_builder.projects.organization_id").orWhereNull(
          "organizations.archived_at"
        );
      })
      .first();
  }

  static async archiveForOrganization(
    orgId: number,
    archivedAt: Date,
    trx?: QueryContext,
  ): Promise<number> {
    return this.table(trx)
      .where({ organization_id: orgId })
      .update({ archived_at: archivedAt, updated_at: new Date() });
  }

  static async disconnectDomainsForOrganization(
    orgId: number,
    trx?: QueryContext,
  ): Promise<number> {
    return this.table(trx)
      .where({ organization_id: orgId })
      .update({
        custom_domain: null,
        custom_domain_alt: null,
        domain_verified_at: null,
        updated_at: new Date(),
      });
  }

  static async listAdmin(
    filters: ProjectFilters,
    pagination: PaginationParams,
    trx?: QueryContext,
  ): Promise<PaginatedResult<IProject>> {
    const buildQuery = (qb: Knex.QueryBuilder) => {
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
    return this.paginate<IProject>(buildQuery, pagination, trx);
  }
}
