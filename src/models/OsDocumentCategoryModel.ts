import { BaseModel, QueryContext } from "./BaseModel";

export interface IOsDocumentCategory {
  id: string;
  name: string;
  normalized_name: string;
  created_by: number | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * os.document_categories — the persisted category registry. The category list
 * an admin sees is this registry merged with the distinct categories the AI
 * has already written onto documents (OsCategoryService owns the merge).
 *
 * §11.7 posture: os.* tables are internal-admin single-tenant by design;
 * isolation is the super-admin gate on every /api/admin/os route (§11.1).
 */
export class OsDocumentCategoryModel extends BaseModel {
  protected static tableName = "os.document_categories";

  static async listPersisted(trx?: QueryContext): Promise<IOsDocumentCategory[]> {
    return this.table(trx).orderBy("name", "asc");
  }

  /** Distinct non-empty category names already living on document AI rows. */
  static async listDocumentCategoryNames(
    trx?: QueryContext
  ): Promise<{ name: string }[]> {
    return this.table(trx)
      .from("os.document_ai_index")
      .whereNotNull("category")
      .whereRaw("btrim(category) <> ''")
      .distinct("category as name")
      .orderBy("category", "asc");
  }

  static async findByNormalizedName(
    normalizedName: string,
    trx?: QueryContext
  ): Promise<IOsDocumentCategory | undefined> {
    return this.table(trx).where({ normalized_name: normalizedName }).first();
  }

  /** Insert-if-absent; returns undefined when the normalized name already exists. */
  static async createCategory(
    input: { name: string; normalizedName: string; createdBy: number | null },
    trx?: QueryContext
  ): Promise<IOsDocumentCategory | undefined> {
    const [row] = await this.table(trx)
      .insert({
        name: input.name,
        normalized_name: input.normalizedName,
        created_by: input.createdBy,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .onConflict("normalized_name")
      .ignore()
      .returning("*");
    return row;
  }
}
