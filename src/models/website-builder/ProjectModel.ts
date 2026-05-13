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
  domain_verified_at?: Date | null;
  settings: Record<string, unknown> | null;
  primary_color: string | null;
  accent_color: string | null;
  recipients: string[];
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

  static async findAllVerifiedDomains(
    trx?: QueryContext,
  ): Promise<{ custom_domain: string; custom_domain_alt: string | null }[]> {
    return this.table(trx)
      .select("custom_domain", "custom_domain_alt")
      .whereNotNull("domain_verified_at")
      .whereNotNull("custom_domain");
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
          this.where("hostname", hostname);
        }
        this.orWhere("custom_domain", cleanHost)
          .orWhere("custom_domain_alt", cleanHost);
      })
      .first();
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
