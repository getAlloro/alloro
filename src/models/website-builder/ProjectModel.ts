import {
  BaseModel,
  PaginatedResult,
  PaginationParams,
  QueryContext,
} from "../BaseModel";
import * as q from "./projectQueries";

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

export type ProjectListViewFilter = "active" | "inactive" | "archive";

/**
 * DB-correctness layer for `website_builder.projects`.
 *
 * This class is a thin public facade: every non-trivial method delegates to a
 * query-builder body in {@link import("./projectQueries")}, keeping this file
 * under the size ceiling while the public surface — and every caller of it —
 * stays unchanged. The BaseModel passthroughs (findById / create / updateById /
 * deleteById) and the `paginate`-driven list methods remain here because they
 * need `this`-bound BaseModel internals.
 *
 * Behavior is preserved: each delegate builds the SAME query as the original
 * inline body (identical columns/filters/joins/ordering/limits/return-shapes,
 * trx threading, raw SQL, and timestamp clocks). ProjectModel sets no
 * `jsonFields`, so there is no JSON-deserialization seam — the facade returns
 * each delegate's result verbatim.
 */
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
    return q.findByOrganizationIdQuery(orgId, trx);
  }

  /** Full raw project row by id (callers read arbitrary/layout columns). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findRawById(id: string, trx?: QueryContext): Promise<any> {
    return q.findRawByIdQuery(id, trx);
  }

  /** Set one dynamic layout column (wrapper|header|footer) to HTML (DB clock). */
  static async updateLayoutField(
    id: string,
    layoutField: string,
    html: string,
    trx?: QueryContext,
  ): Promise<number> {
    return q.updateLayoutFieldQuery(id, layoutField, html, trx);
  }

  static async findAllByOrganizationId(
    orgId: number,
    trx?: QueryContext,
  ): Promise<IProject[]> {
    return q.findAllByOrganizationIdQuery(orgId, trx);
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

  /** Set layouts_generation_status (clearing progress) by id (DB clock). */
  static async setLayoutsGenerationStatus(
    id: string,
    status: string,
    trx?: QueryContext,
  ): Promise<number> {
    return q.setLayoutsGenerationStatusQuery(id, status, trx);
  }

  /** Mark layouts ready: status, clear progress, stamp generated_at (DB clock). */
  static async markLayoutsReady(
    id: string,
    trx?: QueryContext,
  ): Promise<number> {
    return q.markLayoutsReadyQuery(id, trx);
  }

  /**
   * Atomically create the instant-website project + homepage row and flip the
   * owning organization's patientpath status, in one transaction. The model
   * owns the transaction boundary (passes BaseModel.transaction to the
   * delegate); callers composing further writes may inject a `trx`. The
   * companion "preview ready" notification stays outside the transaction at the
   * call site so a notification failure never rolls back the committed website.
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
    return q.createInstantWebsiteWithHomepageQuery(
      params,
      (cb) => this.transaction(cb),
      trx,
    );
  }

  static async updateRecipientsByOrganization(
    orgId: number,
    recipients: string[],
    trx?: QueryContext,
  ): Promise<number> {
    return q.updateRecipientsByOrganizationQuery(orgId, recipients, trx);
  }

  static async setReadOnly(orgId: number, trx?: QueryContext): Promise<number> {
    return q.setReadOnlyQuery(orgId, trx);
  }

  static async updateRybbitSiteId(
    projectId: string,
    siteId: string | null,
    trx?: QueryContext,
  ): Promise<number> {
    return q.updateRybbitSiteIdQuery(projectId, siteId, trx);
  }

  /** (rybbit_site_id, rybbit_time_zone) projection for an org's project. */
  static async findRybbitConfigByOrganizationId(
    organizationId: number,
    trx?: QueryContext,
  ): Promise<
    | { rybbit_site_id: string | null; rybbit_time_zone: string | null }
    | undefined
  > {
    return q.findRybbitConfigByOrganizationIdQuery(organizationId, trx);
  }

  static async getRybbitTimeZone(
    projectId: string,
    trx?: QueryContext,
  ): Promise<string | null> {
    return q.getRybbitTimeZoneQuery(projectId, trx);
  }

  static async updateRybbitTimeZone(
    projectId: string,
    timeZone: string | null,
    trx?: QueryContext,
  ): Promise<number> {
    return q.updateRybbitTimeZoneQuery(projectId, timeZone, trx);
  }

  static async findAllVerifiedDomains(
    trx?: QueryContext,
  ): Promise<{ custom_domain: string; custom_domain_alt: string | null }[]> {
    return q.findAllVerifiedDomainsQuery(trx);
  }

  // ===================================================================
  // Custom-domain helpers (service.custom-domain)
  //
  // Mirror the inline `db("website_builder.projects")` queries in
  // service.custom-domain verbatim (same columns, joins, filters, and
  // `db.fn.now()` timestamp source). Reads return raw rows (the caller reads
  // the org-archived join alias + custom-domain columns directly).
  // ===================================================================

  /** Project joined to org, selecting project.* + o.archived_at as org_archived_at. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findWithOrgArchivedById(
    projectId: string,
    trx?: QueryContext,
  ): Promise<any> {
    return q.findWithOrgArchivedByIdQuery(projectId, trx);
  }

  /** Domain-verification fields for a project joined to its org's archived_at. */
  static async findDomainVerificationContextById(
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
    return q.findDomainVerificationContextByIdQuery(projectId, trx);
  }

  /** Active project (not this one, not archived) matching either domain. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findDomainConflict(
    domain: string,
    altDomain: string,
    excludeProjectId: string,
    trx?: QueryContext,
  ): Promise<any> {
    return q.findDomainConflictQuery(domain, altDomain, excludeProjectId, trx);
  }

  /** Save both custom-domain columns, clear domain_verified_at (DB clock). */
  static async setCustomDomain(
    projectId: string,
    customDomain: string,
    customDomainAlt: string,
    trx?: QueryContext,
  ): Promise<number> {
    return q.setCustomDomainQuery(projectId, customDomain, customDomainAlt, trx);
  }

  /** Mark custom domain verified now (DB clock). */
  static async markDomainVerified(
    projectId: string,
    trx?: QueryContext,
  ): Promise<number> {
    return q.markDomainVerifiedQuery(projectId, trx);
  }

  /** Clear both custom-domain columns and domain_verified_at (DB clock). */
  static async clearCustomDomain(
    projectId: string,
    trx?: QueryContext,
  ): Promise<number> {
    return q.clearCustomDomainQuery(projectId, trx);
  }

  /** Custom-domain status projection for a project. */
  static async findDomainStatusById(
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
    return q.findDomainStatusByIdQuery(projectId, trx);
  }

  /** (rybbit_site_id) projection for a project (raw row). */
  static async findRybbitSiteIdById(
    projectId: string,
    trx?: QueryContext,
  ): Promise<{ rybbit_site_id: string | null } | undefined> {
    return q.findRybbitSiteIdByIdQuery(projectId, trx);
  }

  /**
   * Preview-provisioning projection: identity + both hostnames + custom domain +
   * lifecycle (status, archived_at). Used to gate + derive the preview domain for
   * on-demand Rybbit provisioning of *.sites.getalloro.com sites.
   */
  static async findPreviewProvisioningContextById(
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
      }
    | undefined
  > {
    return q.findPreviewProvisioningContextByIdQuery(projectId, trx);
  }

  /**
   * Find a project by hostname, generated_hostname, custom_domain, or custom_domain_alt.
   * Used by form submissions that identify the project by the page's hostname.
   */
  static async findByHostnameOrDomain(
    host: string,
    trx?: QueryContext,
  ): Promise<IProject | undefined> {
    return q.findByHostnameOrDomainQuery(host, trx);
  }

  static async findActiveByHostnameOrDomain(
    host: string,
    trx?: QueryContext,
  ): Promise<IProject | undefined> {
    return q.findActiveByHostnameOrDomainQuery(host, trx);
  }

  static async findPublicActiveById(
    id: string,
    trx?: QueryContext,
  ): Promise<IProject | undefined> {
    return q.findPublicActiveByIdQuery(id, trx);
  }

  static async archiveForOrganization(
    orgId: number,
    archivedAt: Date,
    trx?: QueryContext,
  ): Promise<number> {
    return q.archiveForOrganizationQuery(orgId, archivedAt, trx);
  }

  static async disconnectDomainsForOrganization(
    orgId: number,
    trx?: QueryContext,
  ): Promise<number> {
    return q.disconnectDomainsForOrganizationQuery(orgId, trx);
  }

  static async listAdmin(
    filters: ProjectFilters,
    pagination: PaginationParams,
    trx?: QueryContext,
  ): Promise<PaginatedResult<IProject>> {
    return this.paginate<IProject>(
      q.listAdminBuildQuery(filters),
      pagination,
      trx,
    );
  }

  // ===================================================================
  // Admin project-manager service helpers
  //
  // These mirror the inline `db("website_builder.projects")` queries
  // previously held in admin-websites/feature-services/service.project-manager
  // verbatim (same columns, filters, joins, ordering, limits, and timestamp
  // sources). Several read raw rows with a json_build_object('organization')
  // projection, so they return raw rows.
  // ===================================================================

  /** Count projects for the admin list view (status + link + archived filters). */
  static async countAdminList(
    filters: { status?: string; projectListView?: ProjectListViewFilter },
    trx?: QueryContext,
  ): Promise<number> {
    return q.countAdminListQuery(filters, trx);
  }

  /** Admin list-view data: projects + json_build_object('organization') (raw rows). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async listAdminWithOrganization(
    filters: {
      status?: string;
      projectListView?: ProjectListViewFilter;
      limit: number;
      offset: number;
    },
    trx?: QueryContext,
  ): Promise<any[]> {
    return q.listAdminWithOrganizationQuery(filters, trx);
  }

  /** Insert a project from raw column data, returning the full inserted row. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async insertReturning(
    row: Record<string, unknown>,
    trx?: QueryContext,
  ): Promise<any> {
    return q.insertReturningQuery(row, trx);
  }

  /** Set a project's display_name by id (no updated_at bump in the original). */
  static async updateDisplayNameById(
    projectId: string,
    displayName: string,
    trx?: QueryContext,
  ): Promise<number> {
    return q.updateDisplayNameByIdQuery(projectId, displayName, trx);
  }

  /** Distinct non-null status values, ordered asc. */
  static async findDistinctStatuses(trx?: QueryContext): Promise<string[]> {
    return q.findDistinctStatusesQuery(trx);
  }

  /** Lightweight status projection for polling (row or null). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findStatusById(id: string, trx?: QueryContext): Promise<any> {
    return q.findStatusByIdQuery(id, trx);
  }

  /** Project linked to an org, excluding a specific project id. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findLinkedToOrganizationExcept(
    organizationId: number,
    exceptProjectId: string,
    trx?: QueryContext,
  ): Promise<any> {
    return q.findLinkedToOrganizationExceptQuery(
      organizationId,
      exceptProjectId,
      trx,
    );
  }

  /** Set/clear organization_id (DB clock), return the updated row. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async setOrganizationIdReturning(
    projectId: string,
    organizationId: number | null,
    trx?: QueryContext,
  ): Promise<any> {
    return q.setOrganizationIdReturningQuery(projectId, organizationId, trx);
  }

  /** Single project + json_build_object('organization') projection (raw row). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findByIdWithOrganization(
    id: string,
    trx?: QueryContext,
  ): Promise<any> {
    return q.findByIdWithOrganizationQuery(id, trx);
  }

  /** Partial column update by id (DB clock), returning the full updated row. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async updateFieldsByIdReturning(
    id: string,
    fields: Record<string, unknown>,
    trx?: QueryContext,
  ): Promise<any> {
    return q.updateFieldsByIdReturningQuery(id, fields, trx);
  }

  /** Advance a project to IN_PROGRESS unconditionally (DB clock). */
  static async setStatusInProgressById(
    projectId: string,
    trx?: QueryContext,
  ): Promise<number> {
    return q.setStatusInProgressByIdQuery(projectId, trx);
  }

  /** Advance CREATED → IN_PROGRESS only (guarded on current status, DB clock). */
  static async advanceCreatedToInProgress(
    projectId: string,
    trx?: QueryContext,
  ): Promise<number> {
    return q.advanceCreatedToInProgressQuery(projectId, trx);
  }

  /** Delete a project row by id (pages cascade at the DB level). */
  static async deleteById(id: string, trx?: QueryContext): Promise<number> {
    return q.deleteByIdQuery(id, trx);
  }

  // ===================================================================
  // Generation-pipeline service helpers
  //
  // Mirror the inline scrape-step + per-page generation updates previously held
  // in admin-websites/feature-services/service.generation-pipeline verbatim
  // (same columns, filters, and `db.fn.now()` timestamp source). Several set a
  // dynamic set of columns the pipeline computes, so they accept a fields bag.
  // ===================================================================

  /** Partial column update by id, stamping updated_at via the DB clock. */
  static async updateFieldsById(
    id: string,
    fields: Record<string, unknown>,
    trx?: QueryContext,
  ): Promise<number> {
    return q.updateFieldsByIdQuery(id, fields, trx);
  }

  /** Read the generation-cancel flag for a project (raw row or undefined). */
  static async findCancelRequestedById(
    projectId: string,
    trx?: QueryContext,
  ): Promise<{ generation_cancel_requested: boolean } | undefined> {
    return q.findCancelRequestedByIdQuery(projectId, trx);
  }

  /** (id, template_id, project_identity) for a project (raw row). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findIdentityContextById(
    projectId: string,
    trx?: QueryContext,
  ): Promise<any> {
    return q.findIdentityContextByIdQuery(projectId, trx);
  }

  // ===================================================================
  // Admin controller helpers (AdminWebsitesController)
  // ===================================================================

  /** wrapper/header/footer projection (raw row or undefined). */
  static async findLayoutFieldsById(
    id: string,
    trx?: QueryContext,
  ): Promise<
    | { wrapper: string | null; header: string | null; footer: string | null }
    | undefined
  > {
    return q.findLayoutFieldsByIdQuery(id, trx);
  }

  /** Layouts-status projection for polling (raw row or undefined). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findLayoutsStatusById(
    id: string,
    trx?: QueryContext,
  ): Promise<any> {
    return q.findLayoutsStatusByIdQuery(id, trx);
  }

  /** Recipients + organization_id projection (raw row or undefined). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findRecipientsContextById(
    id: string,
    trx?: QueryContext,
  ): Promise<any> {
    return q.findRecipientsContextByIdQuery(id, trx);
  }

  /** id + organization_id projection (raw row or undefined). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findOrganizationContextById(
    id: string,
    trx?: QueryContext,
  ): Promise<any> {
    return q.findOrganizationContextByIdQuery(id, trx);
  }

  /** Set recipients (pre-stringified JSON) by id (DB clock). */
  static async updateRecipientsById(
    id: string,
    recipientsJson: string,
    trx?: QueryContext,
  ): Promise<number> {
    return q.updateRecipientsByIdQuery(id, recipientsJson, trx);
  }

  /** organization_id projection (raw row or undefined). */
  static async findOrganizationIdById(
    id: string,
    trx?: QueryContext,
  ): Promise<{ organization_id: number | null } | undefined> {
    return q.findOrganizationIdByIdQuery(id, trx);
  }

  /** id-only existence projection (raw row or undefined). */
  static async findIdOnlyById(
    id: string,
    trx?: QueryContext,
  ): Promise<{ id: string } | undefined> {
    return q.findIdOnlyByIdQuery(id, trx);
  }

  /** Place-selection projection (caller supplies the column list); raw row. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findLocationSelectionById(
    id: string,
    columns: string[],
    trx?: QueryContext,
  ): Promise<any> {
    return q.findLocationSelectionByIdQuery(id, columns, trx);
  }

  /**
   * Set the place-selection columns on a project by id, stamping updated_at via
   * the DB clock. Threads `trx` so the caller composes it with
   * ProjectIdentityModel.updateByProjectId inside one transaction.
   */
  static async updatePlaceSelectionById(
    id: string,
    placeFields: Record<string, unknown>,
    trx?: QueryContext,
  ): Promise<number> {
    return q.updatePlaceSelectionByIdQuery(id, placeFields, trx);
  }
}
