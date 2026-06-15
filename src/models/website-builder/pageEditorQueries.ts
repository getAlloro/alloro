/* eslint-disable @typescript-eslint/no-explicit-any */
import { Knex } from "knex";
import { db } from "../../database/connection";
import { QueryContext } from "../BaseModel";

/**
 * Query-builder bodies for the page-editor surface of {@link PageModel}
 * (service.page-editor) plus the live-section save and the three
 * multi-statement page transactions. Split out of {@link pageQueries} so each
 * model-layer file stays under the size ceiling.
 *
 * Behavior-preserving: every function builds the SAME query as the original
 * inline body in PageModel — identical columns/filters/ordering/returning
 * shapes, transaction boundaries, and timestamp clocks. The createPage/
 * publishPage transactions use `trx.fn.now()`; the SEO/display writes use
 * `db.fn.now()`. The pages table is referenced through the same literal the
 * model used (`PAGES_TABLE` === PageModel.tableName), so the SQL is identical.
 */

const PAGES_TABLE = "website_builder.pages";

/** Mirror of BaseModel.table(trx) for the pages table. */
function table(trx?: QueryContext): Knex.QueryBuilder {
  return (trx || db)(PAGES_TABLE);
}

// ===================================================================
// service.page-editor reads
// ===================================================================

/** Pages for a project, optional single-path filter, path asc then version desc. */
export function findByProjectWithOptionalPathQuery(
  projectId: string,
  pathFilter: string | undefined,
  trx?: QueryContext
): Promise<any[]> {
  let query = table(trx).where("project_id", projectId);
  if (pathFilter) {
    query = query.where("path", pathFilter);
  }
  return query.orderBy("path", "asc").orderBy("version", "desc");
}

/** id projection for every version at a project + path. */
export function findIdsByProjectAndPathQuery(
  projectId: string,
  path: string,
  trx?: QueryContext
): Promise<{ id: string }[]> {
  return table(trx).where({ project_id: projectId, path }).select("id");
}

/** Delete every version at a project + path; returns affected count. */
export function deleteByProjectAndPathQuery(
  projectId: string,
  path: string,
  trx?: QueryContext
): Promise<number> {
  return table(trx).where({ project_id: projectId, path }).del();
}

/** Count rows at a project + path (caller parses the count). */
export function countByProjectAndPathQuery(
  projectId: string,
  path: string,
  trx?: QueryContext
): Promise<{ count: string | number } | undefined> {
  return table(trx)
    .where({ project_id: projectId, path })
    .count("* as count")
    .first();
}

// ===================================================================
// service.page-editor writes
// ===================================================================

/**
 * Save a draft's prebuilt update payload in place, optionally guarded by an
 * optimistic-concurrency timestamp window; returns the updated row (or
 * undefined when the guard matched nothing). The caller pre-builds
 * `updatePayload` and it passes through unchanged (may carry no version bump).
 */
export async function updateDraftWithConcurrencyGuardQuery(
  params: {
    pageId: string;
    updatePayload: Record<string, unknown>;
    expectedUpdatedAt?: Date;
  },
  trx?: QueryContext
): Promise<any> {
  let updateQuery = (trx || db)(PAGES_TABLE).where("id", params.pageId);
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
 * updated_at via the DB clock; returns the updated row (caller pre-stringifies
 * sections/seo_data/edit_chat_history and nulls change_source/revision_note).
 */
export async function refreshDraftByIdQuery(
  pageId: string,
  fields: Record<string, unknown>,
  trx?: QueryContext
): Promise<any> {
  const [updated] = await table(trx)
    .where("id", pageId)
    .update({ ...fields, updated_at: db.fn.now() })
    .returning("*");
  return updated;
}

/**
 * Propagate seo_data to all null-seo siblings at a project+path, optionally
 * excluding one page id; returns rows updated. Distinct from
 * propagateSeoDataToSiblingsQuery: conditional exclude, no updated_at stamp.
 */
export function propagateSeoToSiblingsOptionalExcludeQuery(
  params: {
    projectId: string;
    path: string;
    seoDataValue: string;
    excludePageId?: string;
  },
  trx?: QueryContext
): Promise<number> {
  const query = table(trx)
    .where({ project_id: params.projectId, path: params.path })
    .whereNull("seo_data");
  if (params.excludePageId) {
    query.whereNot("id", params.excludePageId);
  }
  return query.update({ seo_data: params.seoDataValue });
}

/**
 * Set seo_data on a single page by id, stamping updated_at via the DB clock;
 * returns the updated row. Distinct from updateSeoDataByIdQuery (JS clock,
 * returns a count).
 */
export async function updateSeoDataByIdReturningQuery(
  pageId: string,
  seoDataValue: string,
  trx?: QueryContext
): Promise<any> {
  const [updated] = await table(trx)
    .where("id", pageId)
    .update({
      seo_data: seoDataValue,
      updated_at: db.fn.now(),
    })
    .returning("*");
  return updated;
}

/** Set display_name on every version at a project+path; returns affected count. */
export function updateDisplayNameByProjectAndPathQuery(
  projectId: string,
  path: string,
  displayName: string | null,
  trx?: QueryContext
): Promise<number> {
  return table(trx)
    .where({ project_id: projectId, path })
    .update({
      display_name: displayName,
      updated_at: db.fn.now(),
    });
}

// ===================================================================
// Live-section save (optimistic-concurrency window)
// ===================================================================

/**
 * Save sections on the live row in place, optionally guarded by an
 * optimistic-concurrency window, bumping version + change_source. Returns the
 * written row's updated_at, or undefined when the guarded update matched nothing.
 */
export async function saveLiveSectionsQuery(
  params: {
    pageId: string;
    sectionsJson: string;
    nextVersion: number;
    expectedUpdatedAt?: Date;
  },
  trx?: QueryContext
): Promise<{ updated_at: Date } | undefined> {
  let updateQuery = (trx || db)(PAGES_TABLE).where("id", params.pageId);
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
// Multi-statement transactions
//
// Each owns its transaction boundary exactly as the original PageModel method
// did (mirrors ReviewModel.replaceApifyReviewsForPlace); an injected trx is
// honored. The table is referenced by the PAGES_TABLE literal (=== tableName).
// ===================================================================

/**
 * Restore a page version: mark current draft + published rows at the path
 * inactive, then insert a new published row and a new draft row carrying the
 * target version's full state. Mirrors userWebsite.service.restorePageVersion.
 */
export async function restoreVersionQuery(
  params: {
    projectId: string;
    path: string;
    latestVersionNum: number;
    sectionsData: string;
    carriedFields: Record<string, unknown>;
  },
  trx?: QueryContext
): Promise<{ publishedPage: any; draftPage: any }> {
  const run = async (
    t: Knex.Transaction
  ): Promise<{ publishedPage: any; draftPage: any }> => {
    // Mark current draft(s) as inactive
    await t(PAGES_TABLE)
      .where({
        project_id: params.projectId,
        path: params.path,
        status: "draft",
      })
      .update({ status: "inactive", updated_at: t.fn.now() });

    // Mark current published as inactive
    await t(PAGES_TABLE)
      .where({
        project_id: params.projectId,
        path: params.path,
        status: "published",
      })
      .update({ status: "inactive", updated_at: t.fn.now() });

    // Create new published version (copy of target's full state)
    const [publishedPage] = await t(PAGES_TABLE)
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
    const [draftPage] = await t(PAGES_TABLE)
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
    return run(trx as Knex.Transaction);
  }
  return db.transaction(run);
}

/**
 * Create a new page version atomically: mark existing drafts inactive, insert
 * the new row (returning *), and — when publishing — retire any other published
 * row at the path. Mirrors service.page-editor.createPage (trx.fn.now() clock).
 */
export async function createPageVersionQuery(
  params: {
    projectId: string;
    path: string;
    publish: boolean;
    insertData: Record<string, unknown>;
  },
  trx?: QueryContext
): Promise<any> {
  const run = async (t: Knex.Transaction): Promise<any> => {
    // Mark existing drafts as inactive
    await t(PAGES_TABLE)
      .where({
        project_id: params.projectId,
        path: params.path,
        status: "draft",
      })
      .update({ status: "inactive", updated_at: t.fn.now() });

    const [created] = await t(PAGES_TABLE)
      .insert(params.insertData)
      .returning("*");

    // If publishing, mark previous published as inactive
    if (params.publish) {
      await t(PAGES_TABLE)
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
    return run(trx as Knex.Transaction);
  }
  return db.transaction(run);
}

/**
 * Publish a page version atomically: retire any other published row at the
 * page's project+path, then flip the target row to published
 * (change_source="publish") and return it. Mirrors service.page-editor.publishPage.
 */
export async function publishPageVersionQuery(
  params: {
    pageId: string;
    projectId: string;
    path: string;
  },
  trx?: QueryContext
): Promise<any> {
  const run = async (t: Knex.Transaction): Promise<any> => {
    await t(PAGES_TABLE)
      .where({
        project_id: params.projectId,
        path: params.path,
        status: "published",
      })
      .whereNot("id", params.pageId)
      .update({ status: "inactive", updated_at: t.fn.now() });

    const [row] = await t(PAGES_TABLE)
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
    return run(trx as Knex.Transaction);
  }
  return db.transaction(run);
}
