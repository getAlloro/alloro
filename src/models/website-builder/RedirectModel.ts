import { BaseModel, QueryContext } from "../BaseModel";
import { db } from "../../database/connection";

/**
 * Owns the `website_builder.redirects` table. Callers that need redirect CRUD
 * or resolution go through this model instead of inline
 * `db("website_builder.redirects")`. Reads return raw rows to preserve original
 * consumption (the caller reads from_path/to_path/type/is_wildcard directly).
 */
export class RedirectModel extends BaseModel {
  protected static tableName = "website_builder.redirects";

  /**
   * Fetch a redirect (full raw row) by project + from_path. Mirrors the inline
   * existing-redirect lookups in service.ai-command's executeUpdateRedirect and
   * executeDeleteRedirect, and the chain/duplicate checks in
   * service.redirects.createRedirect.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findByProjectAndFromPath(
    projectId: string,
    fromPath: string,
    trx?: QueryContext
  ): Promise<any> {
    return this.table(trx)
      .where({ project_id: projectId, from_path: fromPath })
      .first();
  }

  // ===================================================================
  // Admin redirects-manager helpers (service.redirects)
  //
  // Mirror the inline `db("website_builder.redirects")` queries in
  // service.redirects verbatim (same columns, filters, ordering, and
  // `db.fn.now()` timestamp source).
  // ===================================================================

  /**
   * List redirects for a project ordered by from_path asc, optionally filtered
   * by type. Mirrors the inline query in service.redirects.listRedirects
   * verbatim. Returns raw rows.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async listByProject(
    projectId: string,
    filters?: { type?: number },
    trx?: QueryContext
  ): Promise<any[]> {
    let query = this.table(trx)
      .where("project_id", projectId)
      .orderBy("from_path", "asc");

    if (filters?.type) {
      query = query.where("type", filters.type);
    }

    return query;
  }

  /**
   * Insert a redirect row verbatim (raw passthrough) and return it. Mirrors the
   * inline insert in service.redirects.createRedirect verbatim.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async insertReturning(
    row: Record<string, unknown>,
    trx?: QueryContext
  ): Promise<any> {
    const [redirect] = await this.table(trx).insert(row).returning("*");
    return redirect;
  }

  /**
   * Fetch a redirect (full raw row) by id. Mirrors the inline
   * db(TABLE).where("id").first() lookup in service.redirects.updateRedirect.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findRawById(redirectId: string, trx?: QueryContext): Promise<any> {
    return this.table(trx).where("id", redirectId).first();
  }

  /**
   * Apply a partial column update to a redirect by id, stamping updated_at via
   * the DB clock, returning the updated row. Mirrors the inline update in
   * service.redirects.updateRedirect verbatim (the caller pre-builds the
   * changed fields; the original always set `updated_at: db.fn.now()`).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async updateByIdReturning(
    redirectId: string,
    fields: Record<string, unknown>,
    trx?: QueryContext
  ): Promise<any> {
    const [redirect] = await this.table(trx)
      .where("id", redirectId)
      .update({ ...fields, updated_at: db.fn.now() })
      .returning("*");
    return redirect;
  }

  /**
   * Delete a redirect by id; returns the affected count. Mirrors the inline
   * delete in service.redirects.deleteRedirect verbatim.
   */
  static async deleteByIdRaw(
    redirectId: string,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx).where("id", redirectId).del();
  }

  /**
   * Fetch the non-wildcard redirect for a project + exact from_path. Mirrors the
   * inline exact-match lookup in service.redirects.resolveRedirect verbatim.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findExactByProjectAndFromPath(
    projectId: string,
    fromPath: string,
    trx?: QueryContext
  ): Promise<any> {
    return this.table(trx)
      .where({ project_id: projectId, from_path: fromPath, is_wildcard: false })
      .first();
  }

  /**
   * Fetch a project's wildcard redirects ordered by from_path length desc
   * (longest prefix first). Mirrors the inline wildcard scan in
   * service.redirects.resolveRedirect verbatim. Returns raw rows.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findWildcardsByProject(
    projectId: string,
    trx?: QueryContext
  ): Promise<any[]> {
    return this.table(trx)
      .where({ project_id: projectId, is_wildcard: true })
      .orderByRaw("LENGTH(from_path) DESC");
  }

  /**
   * Fetch (from_path, to_path) for every redirect on a project. Mirrors the
   * inline select in service.redirects.getExistingRedirects verbatim.
   */
  static async findFromToByProject(
    projectId: string,
    trx?: QueryContext
  ): Promise<Array<{ from_path: string; to_path: string }>> {
    return this.table(trx)
      .where("project_id", projectId)
      .select("from_path", "to_path");
  }
}
