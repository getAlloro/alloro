import { Knex } from "knex";
import { db } from "../../database/connection";
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

export type ProjectListViewFilter = "active" | "inactive" | "archive";

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

  /**
   * Fetch a project row (full raw row) by id. Mirrors the inline
   * db("website_builder.projects").where("id").first() lookups in
   * service.ai-command, where callers read arbitrary columns off the row
   * (dynamic layout fields wrapper/header/footer, primary_color, accent_color,
   * template_id, generated_hostname, custom_domain). Returns the raw row so
   * those reads stay valid.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findRawById(id: string, trx?: QueryContext): Promise<any> {
    return this.table(trx).where("id", id).first();
  }

  /**
   * Set a single layout field (wrapper | header | footer) on a project to an
   * HTML string, stamping updated_at via the DB clock. Mirrors the inline
   * db(PROJECTS_TABLE).where("id").update({ [layout_field]: html, updated_at })
   * in service.ai-command.saveEditedHtml for the layout branch verbatim. The
   * column name is dynamic, so it cannot reuse the typed updateById.
   */
  static async updateLayoutField(
    id: string,
    layoutField: string,
    html: string,
    trx?: QueryContext,
  ): Promise<number> {
    return this.table(trx)
      .where("id", id)
      .update({
        [layoutField]: html,
        updated_at: db.fn.now(),
      });
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
   * Set a project's layouts_generation_status (clearing progress) by id,
   * bumping updated_at via the DB clock. Mirrors the inline cancelled-state
   * update in workers/processors/websiteLayouts.processLayoutGenerate verbatim.
   * Uses a dedicated method because layouts_generation_* are not on IProject.
   */
  static async setLayoutsGenerationStatus(
    id: string,
    status: string,
    trx?: QueryContext,
  ): Promise<number> {
    return this.table(trx)
      .where("id", id)
      .update({
        layouts_generation_status: status,
        layouts_generation_progress: null,
        updated_at: db.fn.now(),
      });
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

  // ===================================================================
  // Admin project-manager service helpers
  //
  // These mirror the inline `db("website_builder.projects")` queries
  // previously held in admin-websites/feature-services/service.project-manager
  // verbatim (same columns, filters, joins, ordering, limits, and timestamp
  // sources). Several read raw rows with a json_build_object('organization')
  // projection, so they return raw rows.
  // ===================================================================

  /**
   * Count projects for the admin list view, applying the same status +
   * organization-link + archived filters as the data query. Mirrors the inline
   * count branch in service.project-manager.listProjects verbatim.
   */
  static async countAdminList(
    filters: { status?: string; projectListView?: ProjectListViewFilter },
    trx?: QueryContext,
  ): Promise<number> {
    let countQuery = this.table(trx);
    if (filters.status) {
      countQuery = countQuery.where("status", filters.status);
    }
    if (filters.projectListView === "active") {
      countQuery = countQuery.whereNotNull("organization_id");
    }
    if (filters.projectListView === "inactive") {
      countQuery = countQuery.whereNull("organization_id");
    }
    if (
      filters.projectListView === "active" ||
      filters.projectListView === "inactive"
    ) {
      countQuery = countQuery.whereNull("archived_at");
    }
    if (filters.projectListView === "archive") {
      countQuery = countQuery.whereNotNull("archived_at");
    }
    const [{ count }] = await countQuery.count("* as count");
    return parseInt(count as string, 10);
  }

  /**
   * Admin list-view data query: projects joined to organizations with a
   * json_build_object('organization') projection, applying status + link +
   * archived filters, ordered created_at desc with limit/offset. Mirrors the
   * inline data branch in service.project-manager.listProjects verbatim.
   * Returns raw rows (the projection column is not on IProject).
   */
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
    let dataQuery = this.table(trx)
      .leftJoin(
        "organizations",
        `${this.tableName}.organization_id`,
        "organizations.id",
      )
      .select(
        `${this.tableName}.id`,
        `${this.tableName}.user_id`,
        `${this.tableName}.generated_hostname`,
        `${this.tableName}.status`,
        `${this.tableName}.selected_place_id`,
        `${this.tableName}.selected_website_url`,
        `${this.tableName}.template_id`,
        `${this.tableName}.step_gbp_scrape`,
        `${this.tableName}.display_name`,
        `${this.tableName}.custom_domain`,
        `${this.tableName}.primary_color`,
        `${this.tableName}.accent_color`,
        `${this.tableName}.archived_at`,
        `${this.tableName}.created_at`,
        `${this.tableName}.updated_at`,
        db.raw(
          "json_build_object('id', organizations.id, 'name', organizations.name, 'subscription_tier', organizations.subscription_tier) as organization",
        ),
      );

    if (filters.status) {
      dataQuery = dataQuery.where(`${this.tableName}.status`, filters.status);
    }
    if (filters.projectListView === "active") {
      dataQuery = dataQuery.whereNotNull(`${this.tableName}.organization_id`);
    }
    if (filters.projectListView === "inactive") {
      dataQuery = dataQuery.whereNull(`${this.tableName}.organization_id`);
    }
    if (
      filters.projectListView === "active" ||
      filters.projectListView === "inactive"
    ) {
      dataQuery = dataQuery.whereNull(`${this.tableName}.archived_at`);
    }
    if (filters.projectListView === "archive") {
      dataQuery = dataQuery.whereNotNull(`${this.tableName}.archived_at`);
    }

    return dataQuery
      .orderBy(`${this.tableName}.created_at`, "desc")
      .limit(filters.limit)
      .offset(filters.offset);
  }

  /**
   * Insert a project from raw column data, returning the full inserted row.
   * Mirrors the insert in service.project-manager.createProject verbatim
   * (user_id, generated_hostname, display_name, status).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async insertReturning(
    row: Record<string, unknown>,
    trx?: QueryContext,
  ): Promise<any> {
    const [project] = await this.table(trx).insert(row).returning("*");
    return project;
  }

  /**
   * Set a project's display_name (trimmed by the caller) by id. Mirrors
   * service.project-manager.updateProjectDisplayName verbatim (no updated_at
   * bump in the original).
   */
  static async updateDisplayNameById(
    projectId: string,
    displayName: string,
    trx?: QueryContext,
  ): Promise<number> {
    return this.table(trx)
      .where({ id: projectId })
      .update({ display_name: displayName });
  }

  /**
   * Distinct non-null status values, ordered asc. Mirrors
   * service.project-manager.getProjectStatuses verbatim.
   */
  static async findDistinctStatuses(
    trx?: QueryContext,
  ): Promise<string[]> {
    const rows = await this.table(trx)
      .distinct("status")
      .whereNotNull("status")
      .orderBy("status", "asc");
    return rows.map((s: { status: string }) => s.status);
  }

  /**
   * Lightweight status projection for polling. Mirrors
   * service.project-manager.getProjectStatus verbatim (returns the row or null).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findStatusById(id: string, trx?: QueryContext): Promise<any> {
    const project = await this.table(trx)
      .select(
        "id",
        "status",
        "selected_place_id",
        "selected_website_url",
        "step_gbp_scrape",
        "step_website_scrape",
        "step_image_analysis",
        "updated_at",
      )
      .where("id", id)
      .first();
    return project || null;
  }

  /**
   * Find the project linked to a given organization, excluding a specific
   * project id. Mirrors the "already linked to another website" check in
   * service.project-manager.linkOrganization verbatim.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findLinkedToOrganizationExcept(
    organizationId: number,
    exceptProjectId: string,
    trx?: QueryContext,
  ): Promise<any> {
    return this.table(trx)
      .where("organization_id", organizationId)
      .whereNot("id", exceptProjectId)
      .first();
  }

  /**
   * Set/clear organization_id on a project, stamping updated_at via the DB
   * clock, then return the updated row. Mirrors the link/unlink update+reselect
   * pair in service.project-manager.linkOrganization verbatim.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async setOrganizationIdReturning(
    projectId: string,
    organizationId: number | null,
    trx?: QueryContext,
  ): Promise<any> {
    await this.table(trx)
      .where("id", projectId)
      .update({ organization_id: organizationId, updated_at: db.fn.now() });

    const [updatedProject] = await this.table(trx)
      .where("id", projectId)
      .returning("*");
    return updatedProject;
  }

  /**
   * Fetch a single project joined to its organization with a
   * json_build_object('organization') projection. Mirrors the inline lookup in
   * service.project-manager.getProjectById verbatim. Returns the raw row or
   * undefined.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findByIdWithOrganization(
    id: string,
    trx?: QueryContext,
  ): Promise<any> {
    return this.table(trx)
      .leftJoin(
        "organizations",
        `${this.tableName}.organization_id`,
        "organizations.id",
      )
      .select(
        `${this.tableName}.*`,
        db.raw(
          "json_build_object('id', organizations.id, 'name', organizations.name, 'subscription_tier', organizations.subscription_tier) as organization",
        ),
      )
      .where(`${this.tableName}.id`, id)
      .first();
  }

  /**
   * Apply a partial column update to a project by id, stamping updated_at via
   * the DB clock. The caller passes only the fields it wants to change and
   * receives the full updated row. Mirrors the sanitized update in
   * service.project-manager.updateProject verbatim.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async updateFieldsByIdReturning(
    id: string,
    fields: Record<string, unknown>,
    trx?: QueryContext,
  ): Promise<any> {
    const [project] = await this.table(trx)
      .where("id", id)
      .update({ ...fields, updated_at: db.fn.now() })
      .returning("*");
    return project;
  }

  /**
   * Advance a project to IN_PROGRESS unconditionally, stamping updated_at via
   * the DB clock. Mirrors the post-bulk-create update in
   * service.project-manager.createAllFromTemplate verbatim.
   */
  static async setStatusInProgressById(
    projectId: string,
    trx?: QueryContext,
  ): Promise<number> {
    return this.table(trx)
      .where("id", projectId)
      .update({ status: "IN_PROGRESS", updated_at: db.fn.now() });
  }

  /**
   * Advance a project from CREATED to IN_PROGRESS only (guarded on the current
   * status), stamping updated_at via the DB clock. Mirrors the guarded update in
   * AdminWebsitesController.startPipeline verbatim (`.where("status","CREATED")`).
   */
  static async advanceCreatedToInProgress(
    projectId: string,
    trx?: QueryContext,
  ): Promise<number> {
    return this.table(trx)
      .where("id", projectId)
      .where("status", "CREATED")
      .update({ status: "IN_PROGRESS", updated_at: db.fn.now() });
  }

  /**
   * Delete a project row by id (pages cascade at the DB level). Mirrors the
   * delete in service.project-manager.deleteProject verbatim.
   */
  static async deleteById(id: string, trx?: QueryContext): Promise<number> {
    return this.table(trx).where("id", id).del();
  }

  // ===================================================================
  // Generation-pipeline service helpers
  //
  // Mirror the inline scrape-step + per-page generation updates previously held
  // in admin-websites/feature-services/service.generation-pipeline verbatim
  // (same columns, filters, and `db.fn.now()` timestamp source). Several set a
  // dynamic set of columns the pipeline computes, so they accept a fields bag.
  // ===================================================================

  /**
   * Apply a partial column update to a project by id, stamping updated_at via
   * the DB clock. Mirrors the scrape-step + cancel/reset/homepage updates in
   * service.generation-pipeline verbatim, where each update is
   * `{ ...computedFields, updated_at: db.fn.now() }`.
   */
  static async updateFieldsById(
    id: string,
    fields: Record<string, unknown>,
    trx?: QueryContext,
  ): Promise<number> {
    return this.table(trx)
      .where("id", id)
      .update({ ...fields, updated_at: db.fn.now() });
  }

  /**
   * Read the generation-cancel flag for a project. Mirrors
   * service.generation-pipeline.isCancelled verbatim (raw row or undefined).
   */
  static async findCancelRequestedById(
    projectId: string,
    trx?: QueryContext,
  ): Promise<{ generation_cancel_requested: boolean } | undefined> {
    return this.table(trx)
      .where("id", projectId)
      .select("generation_cancel_requested")
      .first();
  }

  // ===================================================================
  // Admin controller helpers (AdminWebsitesController)
  // ===================================================================

  /**
   * wrapper/header/footer projection. Mirrors the inline select in
   * service.project-manager.getPageProgressiveState verbatim (raw row or
   * undefined).
   */
  static async findLayoutFieldsById(
    id: string,
    trx?: QueryContext,
  ): Promise<{ wrapper: string | null; header: string | null; footer: string | null } | undefined> {
    return this.table(trx)
      .where("id", id)
      .select("wrapper", "header", "footer")
      .first();
  }

  /**
   * Layouts-status projection for polling. Mirrors the inline select in
   * AdminWebsitesController.getLayoutsStatus verbatim (raw row or undefined).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findLayoutsStatusById(
    id: string,
    trx?: QueryContext,
  ): Promise<any> {
    return this.table(trx)
      .where("id", id)
      .select(
        "layouts_generation_status",
        "layouts_generation_progress",
        "layouts_generated_at",
        "layout_slot_values",
        "wrapper",
        "header",
        "footer",
      )
      .first();
  }

  /**
   * Recipients + organization_id projection. Mirrors the inline select in
   * AdminWebsitesController.getRecipients verbatim (raw row or undefined).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findRecipientsContextById(
    id: string,
    trx?: QueryContext,
  ): Promise<any> {
    return this.table(trx)
      .where("id", id)
      .select("id", "recipients", "organization_id")
      .first();
  }

  /**
   * id + organization_id projection. Mirrors the inline select in
   * AdminWebsitesController.updateRecipients verbatim (raw row or undefined).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findOrganizationContextById(
    id: string,
    trx?: QueryContext,
  ): Promise<any> {
    return this.table(trx)
      .where("id", id)
      .select("id", "organization_id")
      .first();
  }

  /**
   * Set recipients (pre-stringified JSON) on a project by id, stamping
   * updated_at via the DB clock. Mirrors the legacy-project recipients write in
   * AdminWebsitesController.updateRecipients verbatim.
   */
  static async updateRecipientsById(
    id: string,
    recipientsJson: string,
    trx?: QueryContext,
  ): Promise<number> {
    return this.table(trx)
      .where("id", id)
      .update({ recipients: recipientsJson, updated_at: db.fn.now() });
  }

  /**
   * organization_id projection. Mirrors the inline select in
   * AdminWebsitesController.triggerReviewSync verbatim (raw row or undefined).
   */
  static async findOrganizationIdById(
    id: string,
    trx?: QueryContext,
  ): Promise<{ organization_id: number | null } | undefined> {
    return this.table(trx)
      .where("id", id)
      .select("organization_id")
      .first();
  }

  /**
   * id-only existence projection. Mirrors the inline 404-guard select in
   * AdminWebsitesController.getProjectCosts verbatim (raw row or undefined).
   */
  static async findIdOnlyById(
    id: string,
    trx?: QueryContext,
  ): Promise<{ id: string } | undefined> {
    return this.table(trx).where("id", id).select("id").first();
  }

  /**
   * Place-selection projection used by the location CRUD endpoints. Mirrors the
   * inline selects in addProjectLocation / setPrimaryLocation /
   * removeProjectLocation / resyncProjectLocation. Returns the raw row (the
   * caller picks columns off it); the column list is passed by the caller to
   * preserve each call site's exact projection.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findLocationSelectionById(
    id: string,
    columns: string[],
    trx?: QueryContext,
  ): Promise<any> {
    return this.table(trx).where("id", id).select(columns).first();
  }

  /**
   * Set the place-selection columns on a project by id, stamping updated_at via
   * the DB clock. The caller passes only the place-id fields it changes
   * (selected_place_ids / primary_place_id / selected_place_id). Mirrors the
   * `trx("website_builder.projects").update({...})` half of the location CRUD
   * transactions in addProjectLocation / setPrimaryLocation /
   * removeProjectLocation verbatim. Threads `trx` so the caller composes it
   * with ProjectIdentityModel.updateByProjectId inside one transaction.
   */
  static async updatePlaceSelectionById(
    id: string,
    placeFields: Record<string, unknown>,
    trx?: QueryContext,
  ): Promise<number> {
    return this.table(trx)
      .where("id", id)
      .update({ ...placeFields, updated_at: db.fn.now() });
  }
}
