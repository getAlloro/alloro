import { BaseModel, QueryContext } from "../BaseModel";
import { db } from "../../database/connection";

export interface ITemplate {
  id: string;
  name: string;
  status: string;
  wrapper: string | null;
  header: string | null;
  footer: string | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * Owns the `website_builder.templates` table. Introduced so the generation
 * pipeline can resolve a project's template through a model instead of inline
 * `db("website_builder.templates")`. The pipeline reads arbitrary columns off
 * the row (template_id linkage, layout fields), so the read returns the raw row.
 * Mirrors the inline lookup in service.generation-pipeline verbatim.
 */
export class TemplateModel extends BaseModel {
  protected static tableName = "website_builder.templates";

  /**
   * Fetch a template (full raw row) by id. Mirrors the inline
   * db("website_builder.templates").where("id").first() in
   * service.generation-pipeline.generatePageComponents verbatim.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findRawById(id: string, trx?: QueryContext): Promise<any> {
    return this.table(trx).where("id", id).first();
  }

  // ===================================================================
  // Admin template-manager helpers (service.template-manager)
  //
  // Mirror the inline `db("website_builder.templates")` queries in
  // service.template-manager verbatim (same columns, filters, ordering, and
  // `db.fn.now()` timestamp source). Reads return raw rows.
  // ===================================================================

  /**
   * All templates ordered by created_at desc (full raw rows). Mirrors the
   * inline list query in service.template-manager.listTemplates verbatim.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findAllOrderedByCreatedAt(trx?: QueryContext): Promise<any[]> {
    return this.table(trx).orderBy("created_at", "desc");
  }

  /**
   * Deactivate every currently-active template, stamping updated_at via the DB
   * clock; returns the affected count. Mirrors the inline
   * db(TEMPLATES_TABLE).where({is_active:true}).update({is_active:false, ...})
   * in service.template-manager.createTemplate / activateTemplate verbatim.
   */
  static async deactivateAllActive(trx?: QueryContext): Promise<number> {
    return this.table(trx)
      .where({ is_active: true })
      .update({ is_active: false, updated_at: db.fn.now() });
  }

  /**
   * Insert a template row verbatim (raw passthrough) and return it. Mirrors the
   * inline insert in service.template-manager.createTemplate verbatim.
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
   * Apply a partial column update to a template by id, stamping updated_at via
   * the DB clock, returning the updated row. Mirrors the inline update in
   * service.template-manager.updateTemplate verbatim (the caller pre-strips
   * id/created_at).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async updateByIdReturning(
    id: string,
    fields: Record<string, unknown>,
    trx?: QueryContext
  ): Promise<any> {
    const [updated] = await this.table(trx)
      .where("id", id)
      .update({ ...fields, updated_at: db.fn.now() })
      .returning("*");
    return updated;
  }

  /**
   * Delete a template by id; returns the affected count. Mirrors the inline
   * delete in service.template-manager.deleteTemplate.
   */
  static async deleteByIdRaw(id: string, trx?: QueryContext): Promise<number> {
    return this.table(trx).where("id", id).del();
  }

  /**
   * Set is_active=true on a template by id, stamping updated_at via the DB
   * clock, returning the updated row. Mirrors the activation write in
   * service.template-manager.activateTemplate verbatim.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async activateByIdReturning(
    id: string,
    trx?: QueryContext
  ): Promise<any> {
    const [updated] = await this.table(trx)
      .where("id", id)
      .update({ is_active: true, updated_at: db.fn.now() })
      .returning("*");
    return updated;
  }
}
