/* eslint-disable @typescript-eslint/no-explicit-any */
import { Knex } from "knex";
import { db } from "../../database/connection";
import { QueryContext } from "../BaseModel";
import { IPage } from "./PageModel";

/**
 * Query-builder bodies for {@link PageModel}, extracted verbatim so the model
 * stays under the file-size ceiling while its public static surface is
 * unchanged (every PageModel method delegates here). The page-editor surface
 * plus the live-section save and the three multi-statement transactions live in
 * {@link import("./pageEditorQueries")}; this module holds the reads, simple
 * writes, snapshot history, backup/SEO-bulk, and generation-pipeline helpers.
 *
 * Behavior-preserving contract: every function builds the SAME query as the
 * original inline body in PageModel — identical columns, filters, joins,
 * ordering, limits, return shapes, and timestamp clocks (`db.fn.now()` vs the
 * JS `new Date()`). The table is referenced through the same literal the model
 * used (`PAGES_TABLE` === PageModel.tableName), so the SQL is byte-identical.
 *
 * JSON (de)serialization stays owned by the model/BaseModel: the four list/read
 * helpers that previously called `this.deserializeJsonFields` return RAW rows
 * here, and PageModel applies `deserializeJsonFields` after delegation.
 */

const PAGES_TABLE = "website_builder.pages";
const TEMPLATE_PAGES_TABLE = "website_builder.template_pages";

/** Mirror of BaseModel.table(trx) for the pages table. */
function table(trx?: QueryContext): Knex.QueryBuilder {
  return (trx || db)(PAGES_TABLE);
}

// ===================================================================
// Reads — list/lookup
// ===================================================================

/** Raw rows for findByProjectId (caller deserializes). */
export function findByProjectIdQuery(
  projectId: string,
  status: string | undefined,
  trx?: QueryContext
): Knex.QueryBuilder {
  let query = table(trx).where({ project_id: projectId });
  if (status) {
    query = query.where({ status });
  }
  return query.orderBy("sort_order", "asc");
}

export function findByProjectWithFieldsQuery(
  projectId: string,
  fields: string[],
  trx?: QueryContext
): Promise<Partial<IPage>[]> {
  return table(trx).where({ project_id: projectId }).select(fields);
}

/** Raw rows for findSectionsByProjectId (caller deserializes). */
export function findSectionsByProjectIdQuery(
  projectId: string,
  trx?: QueryContext
): Knex.QueryBuilder {
  return table(trx)
    .where({ project_id: projectId })
    .select("id", "path", "sections");
}

/** Raw rows for findPublishedByProjectId (caller deserializes). */
export function findPublishedByProjectIdQuery(
  projectId: string,
  trx?: QueryContext
): Knex.QueryBuilder {
  return table(trx)
    .where({ project_id: projectId, status: "published" })
    .orderBy("path");
}

/** Raw row (or undefined) for findByIdAndProject (caller deserializes). */
export function findByIdAndProjectQuery(
  pageId: string,
  projectId: string,
  trx?: QueryContext
): Knex.QueryBuilder {
  return table(trx).where({ id: pageId, project_id: projectId }).first();
}

export function findRawByIdAndProjectQuery(
  pageId: string,
  projectId: string,
  trx?: QueryContext
): Promise<any> {
  return table(trx).where({ id: pageId, project_id: projectId }).first();
}

/** Version-history rows for a path, newest first (raw rows). */
export function listVersionsByProjectAndPathQuery(
  projectId: string,
  path: string,
  trx?: QueryContext
): Promise<any[]> {
  return table(trx)
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

export function findVersionByIdAndProjectQuery(
  versionId: string,
  projectId: string,
  trx?: QueryContext
): Promise<any> {
  return table(trx).where({ id: versionId, project_id: projectId }).first();
}

export function findLatestByProjectAndPathQuery(
  projectId: string,
  path: string,
  trx?: QueryContext
): Promise<any> {
  return table(trx)
    .where({ project_id: projectId, path })
    .orderBy("version", "desc")
    .first();
}

export function findRawByIdQuery(id: string, trx?: QueryContext): Promise<any> {
  return table(trx).where("id", id).first();
}

export function findRawByProjectPathStatusQuery(
  projectId: string,
  path: string,
  status: string,
  trx?: QueryContext
): Promise<any> {
  return table(trx).where({ project_id: projectId, path, status }).first();
}

export function findActiveByProjectAndPathQuery(
  projectId: string,
  path: string,
  trx?: QueryContext
): Promise<any> {
  return table(trx)
    .where({ project_id: projectId, path })
    .whereIn("status", ["draft", "published"])
    .first();
}

export function findPublishedByProjectIdLimitQuery(
  projectId: string,
  limit: number,
  trx?: QueryContext
): Promise<any[]> {
  return table(trx)
    .where({ project_id: projectId, status: "published" })
    .limit(limit);
}

/** Draft + published, path asc, drafts before published at the same path (raw rows). */
export function findResolvableByProjectIdQuery(
  projectId: string,
  trx?: QueryContext
): Promise<any[]> {
  return table(trx)
    .where({ project_id: projectId })
    .whereIn("status", ["draft", "published"])
    .orderBy("path", "asc")
    .orderByRaw("CASE WHEN status = 'draft' THEN 0 ELSE 1 END ASC");
}

export function findByIdsQuery(
  ids: string[],
  trx?: QueryContext
): Promise<any[]> {
  return table(trx).whereIn("id", ids);
}

/** Distinct path list across draft + published pages. */
export function findExistingPathsQuery(
  projectId: string,
  trx?: QueryContext
): Promise<{ path: string }[]> {
  return table(trx)
    .where({ project_id: projectId })
    .whereIn("status", ["draft", "published"])
    .select("path")
    .groupBy("path");
}

// ===================================================================
// Writes / inserts
// ===================================================================

/** Insert a page row verbatim (raw passthrough), returning the row. */
export async function insertReturningQuery(
  row: Record<string, unknown>,
  trx?: QueryContext
): Promise<any> {
  const [page] = await table(trx).insert(row).returning("*");
  return page;
}

/** Mark pages at a project+path+status inactive (DB clock); returns count. */
export function markStatusInactiveByProjectPathStatusQuery(
  projectId: string,
  path: string,
  status: string,
  trx?: QueryContext
): Promise<number> {
  return table(trx)
    .where({ project_id: projectId, path, status })
    .update({ status: "inactive", updated_at: db.fn.now() });
}

/** Touch updated_at via the DB clock, returning the updated row. */
export async function touchUpdatedAtReturningQuery(
  id: string,
  trx?: QueryContext
): Promise<any> {
  const [updated] = await table(trx)
    .where("id", id)
    .update({ updated_at: db.fn.now() })
    .returning("*");
  return updated;
}

/**
 * Overwrite a draft's restored content (sections + seo_data), set
 * change_source='restore', clear revision_note, stamp updated_at via the DB
 * clock; returns the updated row (caller pre-stringifies sections + seo_data).
 */
export async function updateRestoredDraftReturningQuery(
  id: string,
  restoredSectionsJson: string,
  restoredSeoDataJson: string | null,
  trx?: QueryContext
): Promise<any> {
  const [updated] = await table(trx)
    .where("id", id)
    .update({
      sections: restoredSectionsJson,
      seo_data: restoredSeoDataJson,
      change_source: "restore",
      revision_note: null,
      updated_at: db.fn.now(),
    })
    .returning("*");
  return updated;
}

/** Set sections (pre-stringified) by id, stamping updated_at via the DB clock. */
export function updateSectionsByIdQuery(
  id: string,
  sectionsJson: string,
  trx?: QueryContext
): Promise<number> {
  return table(trx)
    .where("id", id)
    .update({
      sections: sectionsJson,
      updated_at: db.fn.now(),
    });
}

/** Partial column update by id, stamping updated_at via the DB clock. */
export function updateFieldsByIdQuery(
  id: string,
  fields: Record<string, unknown>,
  trx?: QueryContext
): Promise<number> {
  return table(trx)
    .where("id", id)
    .update({ ...fields, updated_at: db.fn.now() });
}

// ===================================================================
// Snapshot-on-write history helpers (utils/website-utils/pageSnapshots)
// ===================================================================

/** Newest inactive/published entry at a path excluding a page id, version desc. */
export function findNewestHistoryAtPathQuery(
  projectId: string,
  path: string,
  excludePageId: string,
  trx?: QueryContext
): Promise<any> {
  return table(trx)
    .where({ project_id: projectId, path })
    .whereNot("id", excludePageId)
    .whereIn("status", ["inactive", "published"])
    .orderBy("version", "desc")
    .first();
}

/** Latest row (any status) at a project+path, version desc. */
export function findLatestAtPathQuery(
  projectId: string,
  path: string,
  trx?: QueryContext
): Promise<any> {
  return table(trx)
    .where({ project_id: projectId, path })
    .orderBy("version", "desc")
    .first();
}

/** Insert an inactive history snapshot row verbatim (raw passthrough). */
export async function insertSnapshotRowQuery(
  row: Record<string, unknown>,
  trx?: QueryContext
): Promise<void> {
  await table(trx).insert(row);
}

/** id projection for inactive snapshots beyond a retention offset, version desc. */
export function findStaleInactiveSnapshotIdsQuery(
  projectId: string,
  path: string,
  offset: number,
  trx?: QueryContext
): Promise<{ id: string }[]> {
  return table(trx)
    .where({ project_id: projectId, path, status: "inactive" })
    .orderBy("version", "desc")
    .offset(offset)
    .select("id");
}

/** Delete page rows by id set. */
export function deleteByIdsQuery(
  ids: string[],
  trx?: QueryContext
): Promise<number> {
  return table(trx).whereIn("id", ids).delete();
}

// ===================================================================
// Backup / SEO bulk
// ===================================================================

/** All rows for a project (raw, un-deserialized), created_at asc (backup export). */
export function findAllByProjectIdForBackupQuery(
  projectId: string,
  trx?: QueryContext
): Promise<any[]> {
  return table(trx)
    .where({ project_id: projectId })
    .orderBy("created_at", "asc");
}

/** Set seo_data (pre-stringified) by id, updated_at via the JS clock; count. */
export function updateSeoDataByIdQuery(
  pageId: string,
  seoDataValue: string,
  trx?: QueryContext
): Promise<number> {
  return table(trx)
    .where({ id: pageId })
    .update({
      seo_data: seoDataValue,
      updated_at: new Date(),
    });
}

/**
 * Propagate seo_data to null-seo siblings at a project+path, excluding the
 * source page; returns rows updated (no updated_at stamp).
 */
export function propagateSeoDataToSiblingsQuery(
  params: {
    projectId: string;
    path: string;
    excludePageId: string;
    seoDataValue: string;
  },
  trx?: QueryContext
): Promise<number> {
  return table(trx)
    .where({ project_id: params.projectId, path: params.path })
    .whereNull("seo_data")
    .whereNot("id", params.excludePageId)
    .update({ seo_data: params.seoDataValue });
}

/** Mark queued/generating pages of a project failed, clearing progress (DB clock). */
export function markQueuedGeneratingAsFailedQuery(
  projectId: string,
  trx?: QueryContext
): Promise<number> {
  return table(trx)
    .where("project_id", projectId)
    .whereIn("generation_status", ["queued", "generating"])
    .update({
      generation_status: "failed",
      generation_progress: null,
      updated_at: db.fn.now(),
    });
}

/** Set a single page's generation_status, clearing progress (DB clock). */
export function setGenerationStatusByIdQuery(
  pageId: string,
  status: string,
  trx?: QueryContext
): Promise<number> {
  return table(trx)
    .where("id", pageId)
    .update({
      generation_status: status,
      generation_progress: null,
      updated_at: db.fn.now(),
    });
}

/** All rows for a project (raw), optional path narrowing, path asc then version desc. */
export function findByProjectIdForSeoQuery(
  projectId: string,
  pagePaths: string[] | undefined,
  trx?: QueryContext
): Promise<any[]> {
  let query = table(trx)
    .where({ project_id: projectId })
    .orderBy("path", "asc")
    .orderBy("version", "desc");

  if (pagePaths && pagePaths.length > 0) {
    query = query.whereIn("path", pagePaths);
  }

  return query;
}

/** seo_data values for all pages of a project that have non-null seo_data. */
export function findSeoDataByProjectIdQuery(
  projectId: string,
  trx?: QueryContext
): Promise<Array<{ seo_data: unknown }>> {
  return table(trx)
    .where({ project_id: projectId })
    .whereNotNull("seo_data")
    .select("seo_data");
}

// ===================================================================
// Generation-pipeline + admin-controller helpers
// ===================================================================

/** Mark queued/generating pages cancelled, clearing progress (DB clock); count. */
export function cancelQueuedGeneratingByProjectIdQuery(
  projectId: string,
  trx?: QueryContext
): Promise<number> {
  return table(trx)
    .where("project_id", projectId)
    .whereIn("generation_status", ["queued", "generating"])
    .update({
      generation_status: "cancelled",
      generation_progress: null,
      updated_at: db.fn.now(),
    });
}

/** Insert a page row verbatim (raw passthrough), returning only its new id. */
export async function insertReturningIdQuery(
  row: Record<string, unknown>,
  trx?: QueryContext
): Promise<{ id: string }> {
  const [page] = await table(trx).insert(row).returning("id");
  return page;
}

/** Bulk-insert page rows (raw passthrough), returning the requested columns. */
export function insertManyReturningQuery(
  rows: Record<string, unknown>[],
  returning: string[],
  trx?: QueryContext
): Promise<any[]> {
  return table(trx).insert(rows).returning(returning);
}

/** Published/draft pages for a project: id/path/status/version/seo_data (raw rows). */
export function findSeoMetaByProjectIdQuery(
  projectId: string,
  trx?: QueryContext
): Promise<any[]> {
  return table(trx)
    .where({ project_id: projectId })
    .whereIn("status", ["published", "draft"])
    .select("id", "path", "status", "version", "seo_data");
}

/** path projection for all pages of a project. */
export function findPathsByProjectIdQuery(
  projectId: string,
  trx?: QueryContext
): Promise<{ path: string }[]> {
  return table(trx).where({ project_id: projectId }).select("path");
}

/** All rows for a project (raw), path asc then version desc (admin detail view). */
export function findByProjectOrderedPathVersionQuery(
  projectId: string,
  trx?: QueryContext
): Promise<any[]> {
  return table(trx)
    .where("project_id", projectId)
    .orderBy("path", "asc")
    .orderBy("version", "desc");
}

/**
 * Per-page generation-status rows left-joined to template_pages for the
 * template page name, filtered to non-null generation_status, path asc.
 */
export function findGenerationStatusWithTemplateNameQuery(
  projectId: string,
  trx?: QueryContext
): Promise<any[]> {
  return table(trx)
    .leftJoin(
      TEMPLATE_PAGES_TABLE,
      `${PAGES_TABLE}.template_page_id`,
      `${TEMPLATE_PAGES_TABLE}.id`
    )
    .select(
      `${PAGES_TABLE}.id`,
      `${PAGES_TABLE}.path`,
      `${PAGES_TABLE}.status`,
      `${PAGES_TABLE}.generation_status`,
      `${PAGES_TABLE}.generation_progress`,
      `${PAGES_TABLE}.updated_at`,
      db.raw(`${TEMPLATE_PAGES_TABLE}.name as template_page_name`)
    )
    .where(`${PAGES_TABLE}.project_id`, projectId)
    .whereNotNull(`${PAGES_TABLE}.generation_status`)
    .orderBy(`${PAGES_TABLE}.path`, "asc");
}

/**
 * Progressive-state projection for a single page scoped to its project:
 * id/path/generation_status/generation_progress/sections/template_page_id.
 */
export function findProgressiveStateByIdAndProjectQuery(
  pageId: string,
  projectId: string,
  trx?: QueryContext
): Promise<any> {
  return table(trx)
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
