import { BaseModel, QueryContext } from "../BaseModel";
import { db } from "../../database/connection";

export interface ITemplatePage {
  id: string;
  template_id: string;
  title: string;
  path: string;
  sections: Record<string, unknown>[] | null;
  meta_title: string | null;
  meta_description: string | null;
  sort_order: number | null;
  created_at: Date;
  updated_at: Date;
}

export class TemplatePageModel extends BaseModel {
  protected static tableName = "website_builder.template_pages";
  protected static jsonFields = ["sections"];

  static async findByTemplateId(
    templateId: string,
    trx?: QueryContext
  ): Promise<ITemplatePage[]> {
    const rows = await this.table(trx)
      .where({ template_id: templateId })
      .orderBy("sort_order", "asc");
    return rows.map((row: ITemplatePage) =>
      this.deserializeJsonFields(row)
    );
  }

  static async findSectionsByTemplateId(
    templateId: string,
    trx?: QueryContext
  ): Promise<Array<Pick<ITemplatePage, "id" | "sections">>> {
    const rows = await this.table(trx)
      .where({ template_id: templateId })
      .select("id", "sections");
    return rows.map((row: ITemplatePage) =>
      this.deserializeJsonFields(row)
    );
  }

  // ===================================================================
  // Admin controller + generation-pipeline helpers
  //
  // These mirror inline `db("website_builder.template_pages")` queries in
  // AdminWebsitesController and service.generation-pipeline verbatim. They
  // select raw columns (dynamic_slots / name / sections) the callers parse
  // themselves, so they return raw rows and accept pre-stringified JSON.
  // ===================================================================

  /**
   * dynamic_slots projection for a template page by id. Mirrors the inline
   * select in AdminWebsitesController.getTemplatePageSlots verbatim (raw row or
   * undefined; the caller JSON-parses the column).
   */
  static async findDynamicSlotsById(
    pageId: string,
    trx?: QueryContext
  ): Promise<{ dynamic_slots: unknown } | undefined> {
    return this.table(trx)
      .where("id", pageId)
      .select("dynamic_slots")
      .first();
  }

  /**
   * Fetch the (name, dynamic_slots) projection for a template page by id.
   * Mirrors the inline select in
   * service.slot-generator.generateSlotValuesFromIdentity verbatim (raw row or
   * undefined; the caller parses dynamic_slots itself).
   */
  static async findNameDynamicSlotsById(
    pageId: string,
    trx?: QueryContext
  ): Promise<{ name: string | null; dynamic_slots: unknown } | undefined> {
    return this.table(trx)
      .where("id", pageId)
      .select("name", "dynamic_slots")
      .first();
  }

  /**
   * Set dynamic_slots (pre-stringified JSON) on a template page by id, stamping
   * updated_at via the DB clock; returns the affected count. Mirrors the inline
   * update in AdminWebsitesController.updateTemplatePageSlots verbatim.
   */
  static async updateDynamicSlotsById(
    pageId: string,
    dynamicSlotsJson: string,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx)
      .where("id", pageId)
      .update({
        dynamic_slots: dynamicSlotsJson,
        updated_at: db.fn.now(),
      });
  }

  /**
   * name + sections projection for a template page by id. Mirrors the inline
   * select in service.generation-pipeline.getPageProgressiveState verbatim
   * (raw row or undefined; the caller parses sections itself).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findNameSectionsById(
    pageId: string,
    trx?: QueryContext
  ): Promise<any> {
    return this.table(trx)
      .where("id", pageId)
      .select("name", "sections")
      .first();
  }

  /**
   * Fetch a template page (full raw row) by id. Mirrors the inline
   * db("website_builder.template_pages").where("id").first() in
   * service.generation-pipeline.generatePageComponents verbatim — the caller
   * forwards the row to buildComponentList, which reads `.sections` directly.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findRawById(id: string, trx?: QueryContext): Promise<any> {
    return this.table(trx).where("id", id).first();
  }

  // ===================================================================
  // Admin template-manager helpers (service.template-manager)
  //
  // Mirror the inline `db("website_builder.template_pages")` queries in
  // service.template-manager verbatim (same columns, filters, ordering, and
  // `db.fn.now()` timestamp source). Distinct from findByTemplateId, which
  // orders by sort_order — the admin manager orders by created_at asc, so it
  // gets its own method to keep the output identical. Returns raw rows.
  // ===================================================================

  /**
   * All template pages for a template, ordered created_at asc (full raw rows).
   * Mirrors the inline list query in service.template-manager.getTemplateById /
   * listTemplatePages verbatim.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findByTemplateIdOrderedByCreatedAt(
    templateId: string,
    trx?: QueryContext
  ): Promise<any[]> {
    return this.table(trx)
      .where("template_id", templateId)
      .orderBy("created_at", "asc");
  }

  /**
   * Fetch a template page by id scoped to its template (raw row or undefined).
   * Mirrors the existence/ownership lookups in
   * service.template-manager.getTemplatePage / updateTemplatePage /
   * deleteTemplatePage.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findByIdAndTemplate(
    pageId: string,
    templateId: string,
    trx?: QueryContext
  ): Promise<any> {
    return this.table(trx)
      .where({ id: pageId, template_id: templateId })
      .first();
  }

  /**
   * Insert a template page row verbatim (raw passthrough) and return it.
   * Mirrors the inline insert in service.template-manager.createTemplatePage
   * verbatim (caller pre-stringifies sections).
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
   * Apply a partial column update to a template page scoped to its template,
   * stamping updated_at via the DB clock, returning the updated row. Mirrors the
   * inline update in service.template-manager.updateTemplatePage verbatim (the
   * caller pre-strips id/template_id/created_at and pre-stringifies sections).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async updateByIdAndTemplateReturning(
    pageId: string,
    templateId: string,
    fields: Record<string, unknown>,
    trx?: QueryContext
  ): Promise<any> {
    const [updated] = await this.table(trx)
      .where({ id: pageId, template_id: templateId })
      .update({ ...fields, updated_at: db.fn.now() })
      .returning("*");
    return updated;
  }

  /**
   * Delete a template page scoped to its template; returns the affected count.
   * Mirrors the inline delete in service.template-manager.deleteTemplatePage.
   */
  static async deleteByIdAndTemplate(
    pageId: string,
    templateId: string,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx)
      .where({ id: pageId, template_id: templateId })
      .del();
  }
}
