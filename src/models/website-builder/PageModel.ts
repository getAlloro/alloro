import { BaseModel, QueryContext } from "../BaseModel";
import * as q from "./pageQueries";
import * as eq from "./pageEditorQueries";

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

/**
 * DB-correctness layer for `website_builder.pages`.
 *
 * This class is a thin public facade: every method delegates to a query-builder
 * body in {@link import("./pageQueries")} (reads, simple writes, snapshot,
 * backup/SEO, generation-pipeline) or {@link import("./pageEditorQueries")}
 * (page-editor surface, live-section save, the three multi-statement
 * transactions). The split keeps each model-layer file under the size ceiling
 * while this public surface — and every caller of it — stays unchanged.
 *
 * Behavior is preserved: each delegate builds the SAME query as the original
 * inline body (identical columns/filters/joins/ordering/limits/return-shapes,
 * trx threading, raw SQL, and timestamp clocks). The full provenance ("mirrors
 * X verbatim") lives next to each query body in the helper modules. JSON
 * (de)serialization stays here via BaseModel: the four list/read methods below
 * fetch raw rows from the helper and map through `this.deserializeJsonFields`.
 */
export class PageModel extends BaseModel {
  protected static tableName = "website_builder.pages";
  protected static jsonFields = ["sections", "seo_data"];

  static async findById(
    id: string,
    trx?: QueryContext
  ): Promise<IPage | undefined> {
    return super.findById(id, trx);
  }

  /** Pages for a project (optional status), sort_order asc; deserialized. */
  static async findByProjectId(
    projectId: string,
    status?: string,
    trx?: QueryContext
  ): Promise<IPage[]> {
    const rows = await q.findByProjectIdQuery(projectId, status, trx);
    return rows.map((row: IPage) => this.deserializeJsonFields(row));
  }

  /** Pages by project with an explicit field selection (media usage tracking). */
  static async findByProjectWithFields(
    projectId: string,
    fields: string[],
    trx?: QueryContext
  ): Promise<Partial<IPage>[]> {
    return q.findByProjectWithFieldsQuery(projectId, fields, trx);
  }

  /** id/path/sections for a project; deserialized. */
  static async findSectionsByProjectId(
    projectId: string,
    trx?: QueryContext
  ): Promise<Array<Pick<IPage, "id" | "path" | "sections">>> {
    const rows = await q.findSectionsByProjectIdQuery(projectId, trx);
    return rows.map((row: IPage) => this.deserializeJsonFields(row));
  }

  /** Published pages for a project, path asc; deserialized (user-facing site). */
  static async findPublishedByProjectId(
    projectId: string,
    trx?: QueryContext
  ): Promise<IPage[]> {
    const rows = await q.findPublishedByProjectIdQuery(projectId, trx);
    return rows.map((row: IPage) => this.deserializeJsonFields(row));
  }

  /** Page by id scoped to a project (ownership check); deserialized. */
  static async findByIdAndProject(
    pageId: string,
    projectId: string,
    trx?: QueryContext
  ): Promise<IPage | undefined> {
    const row = await q.findByIdAndProjectQuery(pageId, projectId, trx);
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

  /** Full raw row by id scoped to a project (reads version-history columns). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findRawByIdAndProject(
    pageId: string,
    projectId: string,
    trx?: QueryContext
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any> {
    return q.findRawByIdAndProjectQuery(pageId, projectId, trx);
  }

  /** Version-history rows for a path within a project, newest first (raw rows). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async listVersionsByProjectAndPath(
    projectId: string,
    path: string,
    trx?: QueryContext
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any[]> {
    return q.listVersionsByProjectAndPathQuery(projectId, path, trx);
  }

  /** Full raw version row by id scoped to a project. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findVersionByIdAndProject(
    versionId: string,
    projectId: string,
    trx?: QueryContext
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any> {
    return q.findVersionByIdAndProjectQuery(versionId, projectId, trx);
  }

  /** Highest-version raw row for a project + path. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findLatestByProjectAndPath(
    projectId: string,
    path: string,
    trx?: QueryContext
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any> {
    return q.findLatestByProjectAndPathQuery(projectId, path, trx);
  }

  /** Restore a page version atomically (transaction owned by the model layer). */
  static async restoreVersion(
    params: {
      projectId: string;
      path: string;
      latestVersionNum: number;
      sectionsData: string;
      carriedFields: Record<string, unknown>;
    },
    trx?: QueryContext
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<{ publishedPage: any; draftPage: any }> {
    return eq.restoreVersionQuery(params, trx);
  }

  /** Save live-row sections in place (optimistic guard, bumps version + source). */
  static async saveLiveSections(
    params: {
      pageId: string;
      sectionsJson: string;
      nextVersion: number;
      expectedUpdatedAt?: Date;
    },
    trx?: QueryContext
  ): Promise<{ updated_at: Date } | undefined> {
    return eq.saveLiveSectionsQuery(params, trx);
  }

  // ===================================================================
  // AI command pipeline helpers (service.ai-command)
  // ===================================================================

  /** Full raw page row by id. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findRawById(id: string, trx?: QueryContext): Promise<any> {
    return q.findRawByIdQuery(id, trx);
  }

  /** Full raw page row by project + path + status. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findRawByProjectPathStatus(
    projectId: string,
    path: string,
    status: string,
    trx?: QueryContext
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any> {
    return q.findRawByProjectPathStatusQuery(projectId, path, status, trx);
  }

  /** First draft-or-published page (raw row) at a project + path. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findActiveByProjectAndPath(
    projectId: string,
    path: string,
    trx?: QueryContext
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any> {
    return q.findActiveByProjectAndPathQuery(projectId, path, trx);
  }

  /** Published pages for a project, capped to `limit` (raw rows). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findPublishedByProjectIdLimit(
    projectId: string,
    limit: number,
    trx?: QueryContext
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any[]> {
    return q.findPublishedByProjectIdLimitQuery(projectId, limit, trx);
  }

  /** Draft + published rows, path asc with drafts first at a path (raw rows). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findResolvableByProjectId(
    projectId: string,
    trx?: QueryContext
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any[]> {
    return q.findResolvableByProjectIdQuery(projectId, trx);
  }

  /** Page rows for an explicit id set (raw rows). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findByIds(ids: string[], trx?: QueryContext): Promise<any[]> {
    return q.findByIdsQuery(ids, trx);
  }

  /** Distinct path list across draft + published pages. */
  static async findExistingPaths(
    projectId: string,
    trx?: QueryContext
  ): Promise<{ path: string }[]> {
    return q.findExistingPathsQuery(projectId, trx);
  }

  /** Insert a page row verbatim (raw passthrough), returning the row. */
  static async insertReturning(
    row: Record<string, unknown>,
    trx?: QueryContext
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any> {
    return q.insertReturningQuery(row, trx);
  }

  /** Mark pages at a project+path+status inactive (DB clock); returns count. */
  static async markStatusInactiveByProjectPathStatus(
    projectId: string,
    path: string,
    status: string,
    trx?: QueryContext
  ): Promise<number> {
    return q.markStatusInactiveByProjectPathStatusQuery(
      projectId,
      path,
      status,
      trx
    );
  }

  /** Touch updated_at via the DB clock, returning the updated row. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async touchUpdatedAtReturning(
    id: string,
    trx?: QueryContext
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any> {
    return q.touchUpdatedAtReturningQuery(id, trx);
  }

  /** Overwrite a draft's restored content (change_source='restore'); returns row. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async updateRestoredDraftReturning(
    id: string,
    restoredSectionsJson: string,
    restoredSeoDataJson: string | null,
    trx?: QueryContext
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any> {
    return q.updateRestoredDraftReturningQuery(
      id,
      restoredSectionsJson,
      restoredSeoDataJson,
      trx
    );
  }

  /** Set sections (pre-stringified) by id (DB clock); no version/source bump. */
  static async updateSectionsById(
    id: string,
    sectionsJson: string,
    trx?: QueryContext
  ): Promise<number> {
    return q.updateSectionsByIdQuery(id, sectionsJson, trx);
  }

  /** Partial column update by id, stamping updated_at via the DB clock. */
  static async updateFieldsById(
    id: string,
    fields: Record<string, unknown>,
    trx?: QueryContext
  ): Promise<number> {
    return q.updateFieldsByIdQuery(id, fields, trx);
  }

  // ===================================================================
  // Snapshot-on-write history helpers (utils/website-utils/pageSnapshots)
  // ===================================================================

  /** Newest inactive/published entry at a path excluding a page id, version desc. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findNewestHistoryAtPath(
    projectId: string,
    path: string,
    excludePageId: string,
    trx?: QueryContext
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any> {
    return q.findNewestHistoryAtPathQuery(projectId, path, excludePageId, trx);
  }

  /** Latest row (any status) at a project+path, version desc. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findLatestAtPath(
    projectId: string,
    path: string,
    trx?: QueryContext
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any> {
    return q.findLatestAtPathQuery(projectId, path, trx);
  }

  /** Insert an inactive history snapshot row verbatim (raw passthrough). */
  static async insertSnapshotRow(
    row: Record<string, unknown>,
    trx?: QueryContext
  ): Promise<void> {
    return q.insertSnapshotRowQuery(row, trx);
  }

  /** id projection for inactive snapshots beyond a retention offset, version desc. */
  static async findStaleInactiveSnapshotIds(
    projectId: string,
    path: string,
    offset: number,
    trx?: QueryContext
  ): Promise<{ id: string }[]> {
    return q.findStaleInactiveSnapshotIdsQuery(projectId, path, offset, trx);
  }

  /** Delete page rows by id set. */
  static async deleteByIds(
    ids: string[],
    trx?: QueryContext
  ): Promise<number> {
    return q.deleteByIdsQuery(ids, trx);
  }

  /** All rows for a project (raw), created_at asc (backup export). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findAllByProjectIdForBackup(
    projectId: string,
    trx?: QueryContext
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any[]> {
    return q.findAllByProjectIdForBackupQuery(projectId, trx);
  }

  /** Set seo_data (pre-stringified) by id, updated_at via the JS clock; count. */
  static async updateSeoDataById(
    pageId: string,
    seoDataValue: string,
    trx?: QueryContext
  ): Promise<number> {
    return q.updateSeoDataByIdQuery(pageId, seoDataValue, trx);
  }

  /** Propagate seo_data to null-seo siblings, excluding the source page; count. */
  static async propagateSeoDataToSiblings(
    params: {
      projectId: string;
      path: string;
      excludePageId: string;
      seoDataValue: string;
    },
    trx?: QueryContext
  ): Promise<number> {
    return q.propagateSeoDataToSiblingsQuery(params, trx);
  }

  /** Mark queued/generating pages failed, clearing progress (DB clock); count. */
  static async markQueuedGeneratingAsFailed(
    projectId: string,
    trx?: QueryContext
  ): Promise<number> {
    return q.markQueuedGeneratingAsFailedQuery(projectId, trx);
  }

  /** Set a single page's generation_status, clearing progress (DB clock); count. */
  static async setGenerationStatusById(
    pageId: string,
    status: string,
    trx?: QueryContext
  ): Promise<number> {
    return q.setGenerationStatusByIdQuery(pageId, status, trx);
  }

  /** All rows for a project (raw), optional path narrowing, path asc/version desc. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findByProjectIdForSeo(
    projectId: string,
    pagePaths?: string[],
    trx?: QueryContext
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any[]> {
    return q.findByProjectIdForSeoQuery(projectId, pagePaths, trx);
  }

  /** seo_data values for all pages of a project that have non-null seo_data. */
  static async findSeoDataByProjectId(
    projectId: string,
    trx?: QueryContext
  ): Promise<Array<{ seo_data: unknown }>> {
    return q.findSeoDataByProjectIdQuery(projectId, trx);
  }

  // ===================================================================
  // Generation-pipeline + admin-controller helpers
  // ===================================================================

  /** Mark queued/generating pages cancelled, clearing progress (DB clock); count. */
  static async cancelQueuedGeneratingByProjectId(
    projectId: string,
    trx?: QueryContext
  ): Promise<number> {
    return q.cancelQueuedGeneratingByProjectIdQuery(projectId, trx);
  }

  /** Insert a page row verbatim (raw passthrough), returning only its new id. */
  static async insertReturningId(
    row: Record<string, unknown>,
    trx?: QueryContext
  ): Promise<{ id: string }> {
    return q.insertReturningIdQuery(row, trx);
  }

  /** Bulk-insert page rows (raw passthrough), returning the requested columns. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async insertManyReturning(
    rows: Record<string, unknown>[],
    returning: string[],
    trx?: QueryContext
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any[]> {
    return q.insertManyReturningQuery(rows, returning, trx);
  }

  /** Published/draft pages: id/path/status/version/seo_data (raw rows). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findSeoMetaByProjectId(
    projectId: string,
    trx?: QueryContext
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any[]> {
    return q.findSeoMetaByProjectIdQuery(projectId, trx);
  }

  /** path projection for all pages of a project. */
  static async findPathsByProjectId(
    projectId: string,
    trx?: QueryContext
  ): Promise<{ path: string }[]> {
    return q.findPathsByProjectIdQuery(projectId, trx);
  }

  /** All rows for a project (raw), path asc then version desc (admin detail view). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findByProjectOrderedPathVersion(
    projectId: string,
    trx?: QueryContext
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any[]> {
    return q.findByProjectOrderedPathVersionQuery(projectId, trx);
  }

  /** Per-page generation-status rows joined to template_pages for the name. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findGenerationStatusWithTemplateName(
    projectId: string,
    trx?: QueryContext
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any[]> {
    return q.findGenerationStatusWithTemplateNameQuery(projectId, trx);
  }

  /** Progressive-state projection for a single page scoped to its project. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findProgressiveStateByIdAndProject(
    pageId: string,
    projectId: string,
    trx?: QueryContext
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any> {
    return q.findProgressiveStateByIdAndProjectQuery(pageId, projectId, trx);
  }

  // ===================================================================
  // Admin page-editor helpers (service.page-editor)
  // ===================================================================

  /** Pages for a project, optional single-path filter, path asc/version desc. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findByProjectWithOptionalPath(
    projectId: string,
    pathFilter: string | undefined,
    trx?: QueryContext
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any[]> {
    return eq.findByProjectWithOptionalPathQuery(projectId, pathFilter, trx);
  }

  /** id projection for every version at a project + path. */
  static async findIdsByProjectAndPath(
    projectId: string,
    path: string,
    trx?: QueryContext
  ): Promise<{ id: string }[]> {
    return eq.findIdsByProjectAndPathQuery(projectId, path, trx);
  }

  /** Delete every version at a project + path; returns affected count. */
  static async deleteByProjectAndPath(
    projectId: string,
    path: string,
    trx?: QueryContext
  ): Promise<number> {
    return eq.deleteByProjectAndPathQuery(projectId, path, trx);
  }

  /** Count rows at a project + path (caller parses the count). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async countByProjectAndPath(
    projectId: string,
    path: string,
    trx?: QueryContext
  ): Promise<{ count: string | number } | undefined> {
    return eq.countByProjectAndPathQuery(projectId, path, trx);
  }

  /** Create a new page version atomically (transaction owned by the model layer). */
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
    return eq.createPageVersionQuery(params, trx);
  }

  /** Publish a page version atomically (transaction owned by the model layer). */
  static async publishPageVersion(
    params: {
      pageId: string;
      projectId: string;
      path: string;
    },
    trx?: QueryContext
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any> {
    return eq.publishPageVersionQuery(params, trx);
  }

  /** Save a draft's prebuilt update payload in place (optional optimistic guard). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async updateDraftWithConcurrencyGuard(
    params: {
      pageId: string;
      updatePayload: Record<string, unknown>;
      expectedUpdatedAt?: Date;
    },
    trx?: QueryContext
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any> {
    return eq.updateDraftWithConcurrencyGuardQuery(params, trx);
  }

  /** Refresh an existing draft row in place with a prebuilt field bag (DB clock). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async refreshDraftById(
    pageId: string,
    fields: Record<string, unknown>,
    trx?: QueryContext
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any> {
    return eq.refreshDraftByIdQuery(pageId, fields, trx);
  }

  /** Propagate seo_data to null-seo siblings (conditional exclude, no stamp); count. */
  static async propagateSeoToSiblingsOptionalExclude(
    params: {
      projectId: string;
      path: string;
      seoDataValue: string;
      excludePageId?: string;
    },
    trx?: QueryContext
  ): Promise<number> {
    return eq.propagateSeoToSiblingsOptionalExcludeQuery(params, trx);
  }

  /** Set seo_data by id (DB clock), returning the updated row. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async updateSeoDataByIdReturning(
    pageId: string,
    seoDataValue: string,
    trx?: QueryContext
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any> {
    return eq.updateSeoDataByIdReturningQuery(pageId, seoDataValue, trx);
  }

  /** Set display_name on every version at a project+path (DB clock); count. */
  static async updateDisplayNameByProjectAndPath(
    projectId: string,
    path: string,
    displayName: string | null,
    trx?: QueryContext
  ): Promise<number> {
    return eq.updateDisplayNameByProjectAndPathQuery(
      projectId,
      path,
      displayName,
      trx
    );
  }
}
