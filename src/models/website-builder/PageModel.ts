import { BaseModel, QueryContext } from "../BaseModel";
import { db } from "../../database/connection";

export interface IPage {
  id: string;
  project_id: string;
  title: string;
  path: string;
  sections: Record<string, unknown>[] | null;
  seo_data: Record<string, unknown> | null;
  status: string;
  sort_order: number | null;
  created_at: Date;
  updated_at: Date;
}

export class PageModel extends BaseModel {
  protected static tableName = "website_builder.pages";
  protected static jsonFields = ["sections", "seo_data"];

  static async findById(
    id: string,
    trx?: QueryContext
  ): Promise<IPage | undefined> {
    return super.findById(id, trx);
  }

  static async findByProjectId(
    projectId: string,
    status?: string,
    trx?: QueryContext
  ): Promise<IPage[]> {
    let query = this.table(trx).where({ project_id: projectId });
    if (status) {
      query = query.where({ status });
    }
    const rows = await query.orderBy("sort_order", "asc");
    return rows.map((row: IPage) => this.deserializeJsonFields(row));
  }

  /**
   * Find pages by project with specific field selection.
   * Used by media usage tracking to only fetch path + sections.
   */
  static async findByProjectWithFields(
    projectId: string,
    fields: string[],
    trx?: QueryContext
  ): Promise<Partial<IPage>[]> {
    return this.table(trx)
      .where({ project_id: projectId })
      .select(fields);
  }

  static async findSectionsByProjectId(
    projectId: string,
    trx?: QueryContext
  ): Promise<Array<Pick<IPage, "id" | "path" | "sections">>> {
    const rows = await this.table(trx)
      .where({ project_id: projectId })
      .select("id", "path", "sections");
    return rows.map((row: IPage) => this.deserializeJsonFields(row));
  }

  /**
   * Find published pages by project, ordered by path.
   * Used by the user-facing website endpoint.
   */
  static async findPublishedByProjectId(
    projectId: string,
    trx?: QueryContext
  ): Promise<IPage[]> {
    const rows = await this.table(trx)
      .where({ project_id: projectId, status: "published" })
      .orderBy("path");
    return rows.map((row: IPage) => this.deserializeJsonFields(row));
  }

  /**
   * Find a page by ID scoped to a specific project (ownership check).
   */
  static async findByIdAndProject(
    pageId: string,
    projectId: string,
    trx?: QueryContext
  ): Promise<IPage | undefined> {
    const row = await this.table(trx)
      .where({ id: pageId, project_id: projectId })
      .first();
    return row ? this.deserializeJsonFields(row) : undefined;
  }

  static async create(
    data: Partial<IPage>,
    trx?: QueryContext
  ): Promise<IPage> {
    return super.create(data as Record<string, unknown>, trx);
  }

  static async updateById(
    id: string,
    data: Partial<IPage>,
    trx?: QueryContext
  ): Promise<number> {
    return super.updateById(id, data as Record<string, unknown>, trx);
  }

  static async deleteById(
    id: string,
    trx?: QueryContext
  ): Promise<number> {
    return super.deleteById(id, trx);
  }

  /**
   * Fetch a page row (full, un-deserialized) by id scoped to a project.
   * Mirrors the inline db("website_builder.pages").where({id,project_id}).first()
   * in UserWebsiteController.savePageSections, where the caller reads
   * version-history columns (version, change_source) not present on IPage and
   * forwards the raw row to snapshotPageStateIfChanged. Returns the raw row.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findRawByIdAndProject(
    pageId: string,
    projectId: string,
    trx?: QueryContext
  ): Promise<any> {
    return this.table(trx).where({ id: pageId, project_id: projectId }).first();
  }

  /**
   * List all version rows for a page's path within a project, newest first,
   * selecting only the version-history columns. Mirrors the inline query in
   * userWebsite.service.listPageVersions. Returns raw rows (version-history
   * columns are not on IPage).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async listVersionsByProjectAndPath(
    projectId: string,
    path: string,
    trx?: QueryContext
  ): Promise<any[]> {
    return this.table(trx)
      .where({ project_id: projectId, path })
      .orderBy("version", "desc")
      .select(
        "id",
        "version",
        "status",
        "created_at",
        "updated_at",
        "change_source",
        "revision_note"
      );
  }

  /**
   * Fetch a specific version row (full row) by id scoped to a project. Mirrors
   * the inline lookups in userWebsite.service.getPageVersionContent and
   * restorePageVersion. Returns the raw row.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findVersionByIdAndProject(
    versionId: string,
    projectId: string,
    trx?: QueryContext
  ): Promise<any> {
    return this.table(trx)
      .where({ id: versionId, project_id: projectId })
      .first();
  }

  /**
   * Fetch the highest-version row for a project + path (full row). Mirrors the
   * inline "newest version" lookups in userWebsite.service.restorePageVersion
   * and UserWebsiteController.savePageSections. Returns the raw row.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findLatestByProjectAndPath(
    projectId: string,
    path: string,
    trx?: QueryContext
  ): Promise<any> {
    return this.table(trx)
      .where({ project_id: projectId, path })
      .orderBy("version", "desc")
      .first();
  }

  /**
   * Restore a page version: within a transaction, mark the current draft and
   * published rows for the path inactive, then insert a new published row and a
   * new draft row carrying the target version's full state. Mirrors the inline
   * transaction in userWebsite.service.restorePageVersion verbatim. The model
   * owns the transaction boundary (mirrors ReviewModel.replaceApifyReviewsForPlace).
   */
  static async restoreVersion(
    params: {
      projectId: string;
      path: string;
      latestVersionNum: number;
      sectionsData: string;
      carriedFields: Record<string, unknown>;
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    trx?: QueryContext
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<{ publishedPage: any; draftPage: any }> {
    const run = async (
      t: import("knex").Knex.Transaction
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ): Promise<{ publishedPage: any; draftPage: any }> => {
      // Mark current draft(s) as inactive
      await t(this.tableName)
        .where({
          project_id: params.projectId,
          path: params.path,
          status: "draft",
        })
        .update({ status: "inactive", updated_at: t.fn.now() });

      // Mark current published as inactive
      await t(this.tableName)
        .where({
          project_id: params.projectId,
          path: params.path,
          status: "published",
        })
        .update({ status: "inactive", updated_at: t.fn.now() });

      // Create new published version (copy of target's full state)
      const [publishedPage] = await t(this.tableName)
        .insert({
          project_id: params.projectId,
          path: params.path,
          version: params.latestVersionNum + 1,
          status: "published",
          sections: params.sectionsData,
          ...params.carriedFields,
        })
        .returning("*");

      // Create new draft version (based on published)
      const [draftPage] = await t(this.tableName)
        .insert({
          project_id: params.projectId,
          path: params.path,
          version: params.latestVersionNum + 2,
          status: "draft",
          sections: params.sectionsData,
          ...params.carriedFields,
        })
        .returning("*");

      return { publishedPage, draftPage };
    };

    if (trx) {
      return run(trx as import("knex").Knex.Transaction);
    }
    return db.transaction(run);
  }

  /**
   * Save sections for the live page row in place, optionally guarded by an
   * optimistic-concurrency timestamp window, bumping version + change_source.
   * Mirrors the inline conditional update in
   * UserWebsiteController.savePageSections (returns the updated_at of the
   * written row, or undefined when the guarded update matched nothing).
   */
  static async saveLiveSections(
    params: {
      pageId: string;
      sectionsJson: string;
      nextVersion: number;
      expectedUpdatedAt?: Date;
    },
    trx?: QueryContext
  ): Promise<{ updated_at: Date } | undefined> {
    let updateQuery = (trx || db)("website_builder.pages").where(
      "id",
      params.pageId
    );
    if (params.expectedUpdatedAt) {
      const expected = params.expectedUpdatedAt;
      updateQuery = updateQuery
        .where("updated_at", ">=", expected)
        .where("updated_at", "<", new Date(expected.getTime() + 1));
    }
    const [updatedPage] = await updateQuery
      .update({
        sections: params.sectionsJson,
        version: params.nextVersion,
        change_source: "save",
        updated_at: db.fn.now(),
      })
      .returning(["updated_at"]);
    return updatedPage;
  }

  // ===================================================================
  // AI command pipeline helpers
  //
  // These mirror the inline `db("website_builder.pages")` queries previously
  // held in admin-websites/feature-services/service.ai-command verbatim (same
  // columns, filters, ordering, and `db.fn.now()` timestamp sources). The AI
  // command pipeline reads raw page rows (status/version/sections/path columns
  // accessed directly), so the read methods return raw rows.
  // ===================================================================

  /**
   * Fetch a page (full raw row) by id. Mirrors the inline
   * db(PAGES_TABLE).where("id").first() lookups in service.ai-command
   * (executeBatch auto-publish, getCurrentHtml, saveEditedHtml,
   * executeUpdatePagePath).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findRawById(id: string, trx?: QueryContext): Promise<any> {
    return this.table(trx).where("id", id).first();
  }

  /**
   * Fetch a page (full raw row) by project + path + status. Mirrors the inline
   * draft/published lookups in service.ai-command's getCurrentHtml and
   * saveEditedHtml.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findRawByProjectPathStatus(
    projectId: string,
    path: string,
    status: string,
    trx?: QueryContext
  ): Promise<any> {
    return this.table(trx)
      .where({ project_id: projectId, path, status })
      .first();
  }

  /**
   * Fetch the first draft-or-published page (full raw row) at a project + path.
   * Mirrors the existence check in service.ai-command.executeCreatePage.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findActiveByProjectAndPath(
    projectId: string,
    path: string,
    trx?: QueryContext
  ): Promise<any> {
    return this.table(trx)
      .where({ project_id: projectId, path })
      .whereIn("status", ["draft", "published"])
      .first();
  }

  /**
   * Published pages for a project, capped to `limit` (full raw rows). Mirrors
   * the style-context fetch in service.ai-command.executeCreatePage.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findPublishedByProjectIdLimit(
    projectId: string,
    limit: number,
    trx?: QueryContext
  ): Promise<any[]> {
    return this.table(trx)
      .where({ project_id: projectId, status: "published" })
      .limit(limit);
  }

  /**
   * Page rows for a project, draft + published, ordered path asc with drafts
   * before published at the same path (full raw rows). Mirrors the inline
   * "resolve all pages" query in service.ai-command.resolvePages verbatim
   * (including the orderByRaw draft-first tiebreak); the caller dedups by path.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findResolvableByProjectId(
    projectId: string,
    trx?: QueryContext
  ): Promise<any[]> {
    return this.table(trx)
      .where({ project_id: projectId })
      .whereIn("status", ["draft", "published"])
      .orderBy("path", "asc")
      .orderByRaw("CASE WHEN status = 'draft' THEN 0 ELSE 1 END ASC");
  }

  /**
   * Page rows for an explicit id set (full raw rows). Mirrors the
   * specific-ids branch of service.ai-command.resolvePages.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findByIds(ids: string[], trx?: QueryContext): Promise<any[]> {
    return this.table(trx).whereIn("id", ids);
  }

  /**
   * Distinct path list for a project across draft + published pages. Mirrors
   * service.ai-command.getExistingPaths verbatim (select("path").groupBy("path")).
   */
  static async findExistingPaths(
    projectId: string,
    trx?: QueryContext
  ): Promise<{ path: string }[]> {
    return this.table(trx)
      .where({ project_id: projectId })
      .whereIn("status", ["draft", "published"])
      .select("path")
      .groupBy("path");
  }

  /**
   * Insert a page row verbatim (raw passthrough) and return it. Mirrors the
   * insert in service.ai-command.executeCreatePage (project_id, path, version,
   * status, sections as pre-stringified JSON).
   */
  static async insertReturning(
    row: Record<string, unknown>,
    trx?: QueryContext
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any> {
    const [page] = await this.table(trx).insert(row).returning("*");
    return page;
  }

  /**
   * Set sections (pre-stringified) on a page by id, stamping updated_at via the
   * DB clock. Mirrors the section-write in service.ai-command.saveEditedHtml for
   * the page_section branch verbatim (distinct from saveLiveSections, which also
   * bumps version + change_source).
   */
  static async updateSectionsById(
    id: string,
    sectionsJson: string,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx)
      .where("id", id)
      .update({
        sections: sectionsJson,
        updated_at: db.fn.now(),
      });
  }

  /**
   * Apply a partial column update to a page by id, stamping updated_at via the
   * DB clock. The caller passes only the fields it wants to change. Mirrors the
   * inline db(PAGES_TABLE).where("id").update(updates) in
   * service.ai-command.executeUpdatePagePath verbatim, where `updates` is
   * `{ updated_at: db.fn.now(), ...conditionalFields }`.
   */
  static async updateFieldsById(
    id: string,
    fields: Record<string, unknown>,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx)
      .where("id", id)
      .update({ ...fields, updated_at: db.fn.now() });
  }

  // ===================================================================
  // Snapshot-on-write history helpers
  //
  // These mirror the inline queries previously held in
  // utils/website-utils/pageSnapshots.ts verbatim. The insert is a raw
  // passthrough (the caller pre-builds the column payload, including
  // pre-stringified JSON), so behavior is byte-identical to the original.
  // ===================================================================

  /**
   * Newest history entry (inactive or published) at a project+path, excluding
   * a given page id, ordered by version desc. Raw row. Mirrors the dedup read
   * in pageSnapshots.snapshotPageStateIfChanged.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findNewestHistoryAtPath(
    projectId: string,
    path: string,
    excludePageId: string,
    trx?: QueryContext
  ): Promise<any> {
    return this.table(trx)
      .where({ project_id: projectId, path })
      .whereNot("id", excludePageId)
      .whereIn("status", ["inactive", "published"])
      .orderBy("version", "desc")
      .first();
  }

  /**
   * Latest row (any status) at a project+path, ordered by version desc. Raw
   * row. Mirrors the next-version lookup in
   * pageSnapshots.snapshotPageStateIfChanged.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findLatestAtPath(
    projectId: string,
    path: string,
    trx?: QueryContext
  ): Promise<any> {
    return this.table(trx)
      .where({ project_id: projectId, path })
      .orderBy("version", "desc")
      .first();
  }

  /**
   * Insert an inactive history snapshot row verbatim (raw passthrough).
   * Mirrors the insert in pageSnapshots.snapshotPageStateIfChanged.
   */
  static async insertSnapshotRow(
    row: Record<string, unknown>,
    trx?: QueryContext
  ): Promise<void> {
    await this.table(trx).insert(row);
  }

  /**
   * id projection for inactive snapshot rows at a project+path beyond a
   * retention offset, version desc. Mirrors the stale-rows read in
   * pageSnapshots.pruneInactiveSnapshots.
   */
  static async findStaleInactiveSnapshotIds(
    projectId: string,
    path: string,
    offset: number,
    trx?: QueryContext
  ): Promise<{ id: string }[]> {
    return this.table(trx)
      .where({ project_id: projectId, path, status: "inactive" })
      .orderBy("version", "desc")
      .offset(offset)
      .select("id");
  }

  /**
   * Delete page rows by id set. Mirrors the prune delete in
   * pageSnapshots.pruneInactiveSnapshots.
   */
  static async deleteByIds(
    ids: string[],
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx).whereIn("id", ids).delete();
  }

  /**
   * All page rows for a project (full, un-deserialized rows), ordered by
   * created_at asc. Mirrors the inline export query in
   * workers/processors/websiteBackup verbatim — the backup serializes the raw
   * rows to JSON, so it must NOT use findByProjectId (which orders by
   * sort_order, a column the backup query does not reference).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findAllByProjectIdForBackup(
    projectId: string,
    trx?: QueryContext
  ): Promise<any[]> {
    return this.table(trx)
      .where({ project_id: projectId })
      .orderBy("created_at", "asc");
  }

  /**
   * Set seo_data (pre-stringified) on a single page by id, bumping updated_at
   * via the JS clock. Mirrors the inline update in
   * workers/processors/seoBulkGenerate.processSeoBulkGenerate for the page
   * branch verbatim.
   */
  static async updateSeoDataById(
    pageId: string,
    seoDataValue: string,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx)
      .where({ id: pageId })
      .update({
        seo_data: seoDataValue,
        updated_at: new Date(),
      });
  }

  /**
   * Propagate seo_data (pre-stringified) to all sibling page versions sharing a
   * project+path that currently have null seo_data, excluding the source page.
   * Returns the number of rows updated. Mirrors the inline sibling-propagation
   * update in workers/processors/seoBulkGenerate verbatim.
   */
  static async propagateSeoDataToSiblings(
    params: {
      projectId: string;
      path: string;
      excludePageId: string;
      seoDataValue: string;
    },
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx)
      .where({ project_id: params.projectId, path: params.path })
      .whereNull("seo_data")
      .whereNot("id", params.excludePageId)
      .update({ seo_data: params.seoDataValue });
  }

  /**
   * Mark all queued/generating pages of a project as failed, clearing progress.
   * Mirrors the inline catch-block update in
   * workers/processors/websiteGeneration.processProjectScrape verbatim
   * (updated_at via the DB clock).
   */
  static async markQueuedGeneratingAsFailed(
    projectId: string,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx)
      .where("project_id", projectId)
      .whereIn("generation_status", ["queued", "generating"])
      .update({
        generation_status: "failed",
        generation_progress: null,
        updated_at: db.fn.now(),
      });
  }

  /**
   * Set a single page's generation_status (clearing progress) by id, bumping
   * updated_at via the DB clock. Mirrors the inline cancelled/failed
   * single-page updates in workers/processors/websiteGeneration.processPageGenerate.
   */
  static async setGenerationStatusById(
    pageId: string,
    status: string,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx)
      .where("id", pageId)
      .update({
        generation_status: status,
        generation_progress: null,
        updated_at: db.fn.now(),
      });
  }

  /**
   * All page rows for a project (full raw rows), optionally narrowed to a set
   * of paths, ordered path asc then version desc. Mirrors the inline pages
   * query in workers/processors/seoBulkGenerate.getPageEntities verbatim (the
   * caller groups versions per path and picks the best). Returns raw rows
   * (status/version/sections columns are read directly).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findByProjectIdForSeo(
    projectId: string,
    pagePaths?: string[],
    trx?: QueryContext
  ): Promise<any[]> {
    let query = this.table(trx)
      .where({ project_id: projectId })
      .orderBy("path", "asc")
      .orderBy("version", "desc");

    if (pagePaths && pagePaths.length > 0) {
      query = query.whereIn("path", pagePaths);
    }

    return query;
  }

  /**
   * seo_data values for all pages of a project that have non-null seo_data.
   * Mirrors the pages half of the inline meta gather in
   * workers/processors/seoBulkGenerate.getAllSeoMeta verbatim.
   */
  static async findSeoDataByProjectId(
    projectId: string,
    trx?: QueryContext
  ): Promise<Array<{ seo_data: unknown }>> {
    return this.table(trx)
      .where({ project_id: projectId })
      .whereNotNull("seo_data")
      .select("seo_data");
  }

  // ===================================================================
  // Generation-pipeline + admin-controller helpers
  //
  // Mirror the inline `db("website_builder.pages")` queries previously held in
  // admin-websites/feature-services/service.generation-pipeline and
  // AdminWebsitesController verbatim (same columns, filters, and `db.fn.now()`
  // timestamp source). The generation pipeline reads/writes raw page rows
  // (status/version/sections/generation_* columns directly), so the read
  // methods return raw rows and the updates accept a computed fields bag.
  // ===================================================================

  /**
   * Mark all queued/generating pages of a project as cancelled, clearing
   * progress, stamping updated_at via the DB clock; returns the affected count.
   * Mirrors the inline cancel update in
   * service.generation-pipeline.cancelProjectGeneration verbatim.
   */
  static async cancelQueuedGeneratingByProjectId(
    projectId: string,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx)
      .where("project_id", projectId)
      .whereIn("generation_status", ["queued", "generating"])
      .update({
        generation_status: "cancelled",
        generation_progress: null,
        updated_at: db.fn.now(),
      });
  }

  /**
   * Insert a page row verbatim (raw passthrough) and return only its new id.
   * Mirrors the `.insert({...}).returning("id")` in
   * AdminWebsitesController.startPipeline verbatim.
   */
  static async insertReturningId(
    row: Record<string, unknown>,
    trx?: QueryContext
  ): Promise<{ id: string }> {
    const [page] = await this.table(trx).insert(row).returning("id");
    return page;
  }

  /**
   * Bulk-insert page rows (raw passthrough), returning the requested column
   * subset for each. Mirrors the `.insert([...]).returning([...])` in
   * service.project-manager.createAllFromTemplate verbatim.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async insertManyReturning(
    rows: Record<string, unknown>[],
    returning: string[],
    trx?: QueryContext
  ): Promise<any[]> {
    return this.table(trx).insert(rows).returning(returning);
  }

  /**
   * Conditionally advance a project's own pages? No — this is the page-table
   * twin used by AdminWebsitesController.getAllSeoMeta: pages for a project that
   * are published or draft, selecting id/path/status/version/seo_data. Mirrors
   * that inline query verbatim (the caller dedups by path). Raw rows.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findSeoMetaByProjectId(
    projectId: string,
    trx?: QueryContext
  ): Promise<any[]> {
    return this.table(trx)
      .where({ project_id: projectId })
      .whereIn("status", ["published", "draft"])
      .select("id", "path", "status", "version", "seo_data");
  }

  /**
   * path projection for all pages of a project. Mirrors the unique-path count
   * read in AdminWebsitesController.startBulkSeoGenerate verbatim (the caller
   * builds a Set of paths).
   */
  static async findPathsByProjectId(
    projectId: string,
    trx?: QueryContext
  ): Promise<{ path: string }[]> {
    return this.table(trx).where({ project_id: projectId }).select("path");
  }

  /**
   * All page rows for a project (full raw rows), ordered path asc then version
   * desc. Mirrors the inline pages query in
   * service.project-manager.getProjectById verbatim — distinct from
   * findByProjectId (which orders by sort_order) and from the SEO/backup
   * variants. The admin project detail view consumes the raw rows directly.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findByProjectOrderedPathVersion(
    projectId: string,
    trx?: QueryContext
  ): Promise<any[]> {
    return this.table(trx)
      .where("project_id", projectId)
      .orderBy("path", "asc")
      .orderBy("version", "desc");
  }

  /**
   * Per-page generation-status rows for a project, left-joined to template_pages
   * to surface the template page name, filtered to rows with a non-null
   * generation_status, ordered path asc. Mirrors the inline join query in
   * service.project-manager.getPagesGenerationStatus verbatim (same column list,
   * the `template_pages.name as template_page_name` raw alias, and the filter).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findGenerationStatusWithTemplateName(
    projectId: string,
    trx?: QueryContext
  ): Promise<any[]> {
    return this.table(trx)
      .leftJoin(
        "website_builder.template_pages",
        `${this.tableName}.template_page_id`,
        "website_builder.template_pages.id"
      )
      .select(
        `${this.tableName}.id`,
        `${this.tableName}.path`,
        `${this.tableName}.status`,
        `${this.tableName}.generation_status`,
        `${this.tableName}.generation_progress`,
        `${this.tableName}.updated_at`,
        db.raw(`website_builder.template_pages.name as template_page_name`)
      )
      .where(`${this.tableName}.project_id`, projectId)
      .whereNotNull(`${this.tableName}.generation_status`)
      .orderBy(`${this.tableName}.path`, "asc");
  }

  /**
   * Progressive-state projection for a single page scoped to its project:
   * id/path/generation_status/generation_progress/sections/template_page_id.
   * Mirrors the inline select in
   * service.project-manager.getPageProgressiveState verbatim (raw row or
   * undefined; the caller parses sections/progress itself).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findProgressiveStateByIdAndProject(
    pageId: string,
    projectId: string,
    trx?: QueryContext
  ): Promise<any> {
    return this.table(trx)
      .where({ id: pageId, project_id: projectId })
      .select(
        "id",
        "path",
        "generation_status",
        "generation_progress",
        "sections",
        "template_page_id"
      )
      .first();
  }

  // ===================================================================
  // Admin page-editor helpers (service.page-editor)
  //
  // Mirror the inline `db("website_builder.pages")` queries (and the two
  // multi-statement transactions) in service.page-editor verbatim — same
  // columns, filters, ordering, returning shapes, transaction boundaries, and
  // timestamp clocks (createPage/publishPage use trx.fn.now(); the SEO/display
  // writes use db.fn.now()). The page editor reads raw page rows (version,
  // change_source, generation_status, template_page_id columns accessed
  // directly), so the read methods return raw rows.
  // ===================================================================

  /**
   * Pages for a project, optionally narrowed to one path, ordered path asc then
   * version desc (full raw rows). Mirrors the inline list query in
   * service.page-editor.listPages verbatim.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findByProjectWithOptionalPath(
    projectId: string,
    pathFilter: string | undefined,
    trx?: QueryContext
  ): Promise<any[]> {
    let query = this.table(trx).where("project_id", projectId);
    if (pathFilter) {
      query = query.where("path", pathFilter);
    }
    return query.orderBy("path", "asc").orderBy("version", "desc");
  }

  /**
   * id projection for every version at a project + path. Mirrors the inline
   * select-ids read in service.page-editor.deletePagesByPath verbatim.
   */
  static async findIdsByProjectAndPath(
    projectId: string,
    path: string,
    trx?: QueryContext
  ): Promise<{ id: string }[]> {
    return this.table(trx)
      .where({ project_id: projectId, path })
      .select("id");
  }

  /**
   * Delete every version at a project + path; returns the affected count.
   * Mirrors the inline delete in service.page-editor.deletePagesByPath.
   */
  static async deleteByProjectAndPath(
    projectId: string,
    path: string,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx)
      .where({ project_id: projectId, path })
      .del();
  }

  /**
   * Count rows at a project + path. Mirrors the inline sibling-count read in
   * service.page-editor.deletePage verbatim
   * (.count("* as count").first(), parsed by the caller).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async countByProjectAndPath(
    projectId: string,
    path: string,
    trx?: QueryContext
  ): Promise<{ count: string | number } | undefined> {
    return this.table(trx)
      .where({ project_id: projectId, path })
      .count("* as count")
      .first();
  }

  /**
   * Create a new page version atomically: within a transaction, mark existing
   * drafts at the project+path inactive, insert the new row (returning *), and
   * — when publishing — retire any other published row at the path. Mirrors the
   * inline db.transaction in service.page-editor.createPage verbatim (trx.fn.now()
   * clock, the publish-only retire branch). The model owns the transaction
   * boundary (mirrors ReviewModel.replaceApifyReviewsForPlace); an injected trx
   * is honored if the caller composes further writes.
   */
  static async createPageVersion(
    params: {
      projectId: string;
      path: string;
      publish: boolean;
      insertData: Record<string, unknown>;
    },
    trx?: QueryContext
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const run = async (t: import("knex").Knex.Transaction): Promise<any> => {
      // Mark existing drafts as inactive
      await t(this.tableName)
        .where({
          project_id: params.projectId,
          path: params.path,
          status: "draft",
        })
        .update({ status: "inactive", updated_at: t.fn.now() });

      const [created] = await t(this.tableName)
        .insert(params.insertData)
        .returning("*");

      // If publishing, mark previous published as inactive
      if (params.publish) {
        await t(this.tableName)
          .where({
            project_id: params.projectId,
            path: params.path,
            status: "published",
          })
          .whereNot("id", created.id)
          .update({ status: "inactive", updated_at: t.fn.now() });
      }

      return created;
    };

    if (trx) {
      return run(trx as import("knex").Knex.Transaction);
    }
    return db.transaction(run);
  }

  /**
   * Publish a page version atomically: within a transaction, retire any other
   * published row at the page's project+path, then flip the target row to
   * published (change_source="publish") and return it. Mirrors the inline
   * db.transaction in service.page-editor.publishPage verbatim (trx.fn.now()
   * clock). The model owns the transaction boundary; an injected trx is honored.
   */
  static async publishPageVersion(
    params: {
      pageId: string;
      projectId: string;
      path: string;
    },
    trx?: QueryContext
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const run = async (t: import("knex").Knex.Transaction): Promise<any> => {
      await t(this.tableName)
        .where({
          project_id: params.projectId,
          path: params.path,
          status: "published",
        })
        .whereNot("id", params.pageId)
        .update({ status: "inactive", updated_at: t.fn.now() });

      const [row] = await t(this.tableName)
        .where("id", params.pageId)
        .update({
          status: "published",
          change_source: "publish",
          updated_at: t.fn.now(),
        })
        .returning("*");
      return row;
    };

    if (trx) {
      return run(trx as import("knex").Knex.Transaction);
    }
    return db.transaction(run);
  }

  /**
   * Save a draft page's prebuilt update payload in place, optionally guarded by
   * an optimistic-concurrency timestamp window, returning the updated row (or
   * undefined when the guarded update matched nothing). Mirrors the inline
   * conditional update in service.page-editor.updatePage verbatim — distinct
   * from saveLiveSections (which always sets change_source + bumps version):
   * here the caller pre-builds `updatePayload` (which may be only
   * edit_chat_history, with no version bump) and the method passes it through
   * unchanged.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async updateDraftWithConcurrencyGuard(
    params: {
      pageId: string;
      updatePayload: Record<string, unknown>;
      expectedUpdatedAt?: Date;
    },
    trx?: QueryContext
  ): Promise<any> {
    let updateQuery = (trx || db)("website_builder.pages").where(
      "id",
      params.pageId
    );
    if (params.expectedUpdatedAt) {
      const expected = params.expectedUpdatedAt;
      updateQuery = updateQuery
        .where("updated_at", ">=", expected)
        .where("updated_at", "<", new Date(expected.getTime() + 1));
    }
    const [updatedPage] = await updateQuery
      .update(params.updatePayload)
      .returning("*");
    return updatedPage;
  }

  /**
   * Refresh an existing draft row in place with a prebuilt field bag, stamping
   * updated_at via the DB clock, returning the updated row. Mirrors the inline
   * stale-draft refresh in service.page-editor.createDraft verbatim (caller
   * pre-stringifies sections/seo_data/edit_chat_history and nulls
   * change_source/revision_note).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async refreshDraftById(
    pageId: string,
    fields: Record<string, unknown>,
    trx?: QueryContext
  ): Promise<any> {
    const [updated] = await this.table(trx)
      .where("id", pageId)
      .update({ ...fields, updated_at: db.fn.now() })
      .returning("*");
    return updated;
  }

  /**
   * Propagate seo_data (pre-stringified) to all sibling versions at a
   * project+path that currently have null seo_data, optionally excluding one
   * page id; returns the number of rows updated. Mirrors the inline update in
   * service.page-editor.propagateSeoToSiblings verbatim — distinct from
   * propagateSeoDataToSiblings (which requires an exclude id and does not stamp
   * updated_at): here the exclude is conditional and no timestamp is set.
   */
  static async propagateSeoToSiblingsOptionalExclude(
    params: {
      projectId: string;
      path: string;
      seoDataValue: string;
      excludePageId?: string;
    },
    trx?: QueryContext
  ): Promise<number> {
    const query = this.table(trx)
      .where({ project_id: params.projectId, path: params.path })
      .whereNull("seo_data");
    if (params.excludePageId) {
      query.whereNot("id", params.excludePageId);
    }
    return query.update({ seo_data: params.seoDataValue });
  }

  /**
   * Set seo_data (pre-stringified) on a single page by id, stamping updated_at
   * via the DB clock, returning the updated row. Mirrors the inline update in
   * service.page-editor.updatePageSeo verbatim (distinct from
   * updateSeoDataById, which uses the JS clock and returns a count).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async updateSeoDataByIdReturning(
    pageId: string,
    seoDataValue: string,
    trx?: QueryContext
  ): Promise<any> {
    const [updated] = await this.table(trx)
      .where("id", pageId)
      .update({
        seo_data: seoDataValue,
        updated_at: db.fn.now(),
      })
      .returning("*");
    return updated;
  }

  /**
   * Set display_name on every version at a project+path, stamping updated_at via
   * the DB clock; returns the affected count. Mirrors the inline update in
   * service.page-editor.updatePageDisplayName verbatim.
   */
  static async updateDisplayNameByProjectAndPath(
    projectId: string,
    path: string,
    displayName: string | null,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx)
      .where({ project_id: projectId, path })
      .update({
        display_name: displayName,
        updated_at: db.fn.now(),
      });
  }
}
