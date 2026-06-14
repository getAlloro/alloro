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
}
