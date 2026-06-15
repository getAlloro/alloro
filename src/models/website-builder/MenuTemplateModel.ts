import { BaseModel, QueryContext } from "../BaseModel";
import { db } from "../../database/connection";

export interface IMenuTemplate {
  id: string;
  template_id: string;
  name: string;
  slug: string;
  sections: { name: string; content: string }[];
  created_at: Date;
  updated_at: Date;
}

export class MenuTemplateModel extends BaseModel {
  protected static tableName = "website_builder.menu_templates";
  protected static jsonFields = ["sections"];

  /**
   * Menu templates for a template, projecting slug + name. Mirrors the
   * menu_templates query in service.ai-command.getProjectTemplates verbatim
   * (select slug, name).
   */
  static async findSlugNameByTemplateId(
    templateId: string,
    trx?: QueryContext
  ): Promise<Array<{ slug: string; name: string }>> {
    return this.table(trx).where("template_id", templateId).select("slug", "name");
  }

  /**
   * Fetch a single menu template by template + slug. Mirrors the inline lookup
   * in shortcodeResolver.resolveMenus. Returns the raw row (sections parsed by
   * the caller).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findByTemplateAndSlug(
    templateId: string,
    slug: string,
    trx?: QueryContext
  ): Promise<any> {
    return this.table(trx)
      .where({ template_id: templateId, slug })
      .first();
  }

  // ===================================================================
  // Admin menu-template-manager helpers (service.menu-template-manager)
  //
  // Mirror the inline `db("website_builder.menu_templates")` queries in
  // service.menu-template-manager verbatim (same columns, filters, ordering,
  // and `db.fn.now()` timestamp source). Reads return raw rows; the caller
  // parses/serializes `sections` JSON itself, so the writes accept the
  // pre-built payload as a raw passthrough.
  // ===================================================================

  /**
   * All menu templates for a template, ordered by created_at asc (full raw
   * rows). Mirrors the inline list query in
   * service.menu-template-manager.listMenuTemplates verbatim.
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
   * Fetch a single menu template by id + template (full raw row). Mirrors the
   * inline scoped lookups in service.menu-template-manager
   * (getMenuTemplate/updateMenuTemplate/deleteMenuTemplate) verbatim.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findByIdAndTemplate(
    menuTemplateId: string,
    templateId: string,
    trx?: QueryContext
  ): Promise<any> {
    return this.table(trx)
      .where({ id: menuTemplateId, template_id: templateId })
      .first();
  }

  /**
   * Fetch a menu template by template + slug, excluding a given id (slug-
   * conflict check on update). Mirrors the inline whereNot lookup in
   * service.menu-template-manager.updateMenuTemplate verbatim.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findByTemplateAndSlugExcludingId(
    templateId: string,
    slug: string,
    excludeId: string,
    trx?: QueryContext
  ): Promise<any> {
    return this.table(trx)
      .where({ template_id: templateId, slug })
      .whereNot("id", excludeId)
      .first();
  }

  /**
   * Insert a menu template row verbatim (raw passthrough — the caller
   * pre-stringifies `sections`) and return it. Mirrors the inline insert in
   * service.menu-template-manager.createMenuTemplate verbatim.
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
   * Apply a partial column update to a menu template scoped by id + template,
   * stamping updated_at via the DB clock, returning the updated row. Mirrors
   * the inline update in service.menu-template-manager.updateMenuTemplate
   * verbatim (the caller pre-strips id/template_id/created_at and pre-
   * stringifies `sections`).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async updateByIdAndTemplateReturning(
    menuTemplateId: string,
    templateId: string,
    fields: Record<string, unknown>,
    trx?: QueryContext
  ): Promise<any> {
    const [updated] = await this.table(trx)
      .where({ id: menuTemplateId, template_id: templateId })
      .update({ ...fields, updated_at: db.fn.now() })
      .returning("*");
    return updated;
  }

  /**
   * Delete a menu template scoped by id + template; returns the affected count.
   * Mirrors the inline delete in
   * service.menu-template-manager.deleteMenuTemplate verbatim.
   */
  static async deleteByIdAndTemplate(
    menuTemplateId: string,
    templateId: string,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx)
      .where({ id: menuTemplateId, template_id: templateId })
      .del();
  }
}
