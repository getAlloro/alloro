import { BaseModel, QueryContext } from "../BaseModel";

/**
 * Owns the `website_builder.redirects` table. Created so callers that only need
 * to look a redirect up by (project_id, from_path) can do so through a model
 * instead of inline `db("website_builder.redirects")`. The CRUD currently held
 * in feature-services/service.redirects is migrated under a separate domain
 * task; this model only exposes the lookups its current model-layer consumers
 * need. Returns the raw row to preserve original consumption.
 */
export class RedirectModel extends BaseModel {
  protected static tableName = "website_builder.redirects";

  /**
   * Fetch a redirect (full raw row) by project + from_path. Mirrors the inline
   * existing-redirect lookups in service.ai-command's executeUpdateRedirect and
   * executeDeleteRedirect.
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
}
