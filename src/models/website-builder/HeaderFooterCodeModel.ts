import { BaseModel, QueryContext } from "../BaseModel";
import { db } from "../../database/connection";

export type HeaderFooterLocation = "head_start" | "head_end" | "body_start" | "body_end";

export interface IHeaderFooterCode {
  id: string;
  project_id: string | null;
  template_id: string | null;
  name: string;
  code: string;
  location: HeaderFooterLocation;
  is_enabled: boolean;
  order_index: number;
  page_ids: string[];
  created_at: Date;
  updated_at: Date;
}

export class HeaderFooterCodeModel extends BaseModel {
  protected static tableName = "website_builder.header_footer_code";
  protected static jsonFields = ["page_ids"];

  static async findByProjectId(
    projectId: string,
    trx?: QueryContext
  ): Promise<IHeaderFooterCode[]> {
    const rows = await this.table(trx)
      .where({ project_id: projectId })
      .orderBy("location", "asc")
      .orderBy("order_index", "asc");
    return rows.map((row: IHeaderFooterCode) => this.deserializeJsonFields(row));
  }

  static async findByTemplateId(
    templateId: string,
    trx?: QueryContext
  ): Promise<IHeaderFooterCode[]> {
    const rows = await this.table(trx)
      .where({ template_id: templateId })
      .orderBy("location", "asc")
      .orderBy("order_index", "asc");
    return rows.map((row: IHeaderFooterCode) => this.deserializeJsonFields(row));
  }

  static async findByProjectAndSnippetIds(
    projectId: string,
    snippetIds: string[],
    trx?: QueryContext,
  ): Promise<IHeaderFooterCode[]> {
    if (snippetIds.length === 0) return [];

    const rows = await this.table(trx)
      .where({ project_id: projectId })
      .whereIn("id", snippetIds)
      .orderBy("location", "asc")
      .orderBy("order_index", "asc");
    return rows.map((row: IHeaderFooterCode) => this.deserializeJsonFields(row));
  }

  static async setProjectSnippetsEnabled(
    projectId: string,
    snippetIds: string[],
    isEnabled: boolean,
    trx?: QueryContext,
  ): Promise<number> {
    if (snippetIds.length === 0) return 0;

    return this.table(trx)
      .where({ project_id: projectId })
      .whereIn("id", snippetIds)
      .update({
        is_enabled: isEnabled,
        updated_at: new Date(),
      });
  }

  static async create(
    data: Partial<IHeaderFooterCode>,
    trx?: QueryContext
  ): Promise<IHeaderFooterCode> {
    return super.create(
      data as Record<string, unknown>,
      trx
    );
  }

  static async updateById(
    id: string,
    data: Partial<IHeaderFooterCode>,
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

  static async updateSortOrder(
    id: string,
    orderIndex: number,
    trx?: QueryContext
  ): Promise<number> {
    return super.updateById(id, { order_index: orderIndex }, trx);
  }

  static async toggleEnabled(
    id: string,
    isEnabled: boolean,
    trx?: QueryContext
  ): Promise<number> {
    return super.updateById(id, { is_enabled: isEnabled }, trx);
  }

  /**
   * All header/footer code rows for a project, ordered created_at asc, as raw
   * rows. Mirrors the inline export query in workers/processors/websiteBackup
   * verbatim. Distinct from findByProjectId, which orders by
   * location/order_index — the backup query orders by created_at, so it gets
   * its own method to keep the serialized output identical.
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

  // ===================================================================
  // Admin hfcm-manager helpers (service.hfcm-manager)
  //
  // Mirror the inline `db("website_builder.header_footer_code")` queries in
  // service.hfcm-manager verbatim (same columns, filters, ordering, and
  // `db.fn.now()` timestamp source). Reads return raw rows (callers read
  // is_enabled/name/template_id/project_id directly and ship rows to the
  // client), so these bypass deserialization. Distinct from findByTemplateId /
  // findByProjectId above, which deserialize page_ids.
  // ===================================================================

  /**
   * All snippets for a template, ordered location asc then order_index asc (raw
   * rows). Mirrors service.hfcm-manager.listTemplateSnippets verbatim.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findByTemplateIdRaw(
    templateId: string,
    trx?: QueryContext
  ): Promise<any[]> {
    return this.table(trx)
      .where({ template_id: templateId })
      .orderBy("location", "asc")
      .orderBy("order_index", "asc");
  }

  /**
   * All snippets for a project, ordered location asc then order_index asc (raw
   * rows). Mirrors service.hfcm-manager.listProjectSnippets verbatim.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findByProjectIdRaw(
    projectId: string,
    trx?: QueryContext
  ): Promise<any[]> {
    return this.table(trx)
      .where({ project_id: projectId })
      .orderBy("location", "asc")
      .orderBy("order_index", "asc");
  }

  /**
   * Fetch a single snippet by id (raw row). Mirrors the ownership-verification
   * lookups in service.hfcm-manager (update/delete/toggle, both flavors).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findByIdRaw(id: string, trx?: QueryContext): Promise<any> {
    return this.table(trx).where({ id }).first();
  }

  /**
   * Insert a snippet row verbatim (raw passthrough) and return it. Mirrors the
   * inserts in service.hfcm-manager.createTemplateSnippet /
   * createProjectSnippet verbatim.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async insertReturning(
    row: Record<string, unknown>,
    trx?: QueryContext
  ): Promise<any> {
    const [created] = await this.table(trx).insert(row).returning("*");
    return created;
  }

  /**
   * Apply a partial column update to a snippet by id, stamping updated_at via
   * the DB clock, returning the updated row. The caller passes only the
   * conditional name/location/code/page_ids/order_index fields it wants to
   * change. Mirrors the inline update in
   * service.hfcm-manager.updateTemplateSnippet / updateProjectSnippet verbatim
   * (where the patch was `{ updated_at: db.fn.now(), ...conditionalFields }`).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async updateByIdReturningRaw(
    id: string,
    fields: Record<string, unknown>,
    trx?: QueryContext
  ): Promise<any> {
    const [updated] = await this.table(trx)
      .where({ id })
      .update({ ...fields, updated_at: db.fn.now() })
      .returning("*");
    return updated;
  }

  /**
   * Set a snippet's is_enabled flag by id, stamping updated_at via the DB clock.
   * Mirrors the toggle write in service.hfcm-manager.toggleTemplateSnippet /
   * toggleProjectSnippet verbatim.
   */
  static async setEnabledById(
    id: string,
    isEnabled: boolean,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx)
      .where({ id })
      .update({ is_enabled: isEnabled, updated_at: db.fn.now() });
  }

  /**
   * Delete a snippet by id. Mirrors the delete in
   * service.hfcm-manager.deleteTemplateSnippet / deleteProjectSnippet verbatim
   * (`.delete()`).
   */
  static async deleteByIdRaw(id: string, trx?: QueryContext): Promise<number> {
    return this.table(trx).where({ id }).delete();
  }

  /**
   * Re-index a template's snippets to match the given order, atomically. Mirrors
   * service.hfcm-manager.reorderTemplateSnippets verbatim: per-id
   * `where({ id, template_id }).update({ order_index: i, updated_at })` inside a
   * single transaction. The model owns the transaction boundary; the per-row
   * timestamp uses the transaction clock (`trx.fn.now()`).
   */
  static async reorderForTemplate(
    templateId: string,
    snippetIds: string[]
  ): Promise<void> {
    await db.transaction(async (trx) => {
      for (let i = 0; i < snippetIds.length; i++) {
        await trx(this.tableName)
          .where({ id: snippetIds[i], template_id: templateId })
          .update({ order_index: i, updated_at: trx.fn.now() });
      }
    });
  }

  /**
   * Re-index a project's snippets to match the given order, atomically. Mirrors
   * service.hfcm-manager.reorderProjectSnippets verbatim: per-id
   * `where({ id, project_id }).update({ order_index: i, updated_at })` inside a
   * single transaction. The model owns the transaction boundary; the per-row
   * timestamp uses the transaction clock (`trx.fn.now()`).
   */
  static async reorderForProject(
    projectId: string,
    snippetIds: string[]
  ): Promise<void> {
    await db.transaction(async (trx) => {
      for (let i = 0; i < snippetIds.length; i++) {
        await trx(this.tableName)
          .where({ id: snippetIds[i], project_id: projectId })
          .update({ order_index: i, updated_at: trx.fn.now() });
      }
    });
  }
}
