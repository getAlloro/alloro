import { BaseModel, QueryContext } from "./BaseModel";

export interface IOsDocumentAiIndex {
  document_id: string;
  summary: string | null;
  category: string | null;
  tags: string[];
  generated_for: number | null;
  generated_at: Date | null;
  meta_locked: boolean;
}

export interface INewOsAiIndex {
  summary: string;
  category: string;
  tags: string[];
  /** version_no the AI metadata was generated for. */
  generatedFor: number;
}

export interface IOsMetaPatch {
  category?: string | null;
  tags?: string[];
}

/**
 * os.document_ai_index — one AI-taxonomy row per document (PK document_id):
 * summary, category, tags + the meta_locked human-override flag
 * (plans/07042026-alloro-os-admin-port, D4).
 *
 * §11.7 posture: os.* tables are internal-admin single-tenant by design;
 * isolation is the super-admin gate on every /api/admin/os route (§11.1).
 */
export class OsDocumentAiIndexModel extends BaseModel {
  protected static tableName = "os.document_ai_index";
  protected static jsonFields = ["tags"];

  static async findByDocumentId(
    documentId: string,
    trx?: QueryContext
  ): Promise<IOsDocumentAiIndex | undefined> {
    const row = await this.table(trx).where({ document_id: documentId }).first();
    return row ? this.deserializeJsonFields(row) : undefined;
  }

  /**
   * Ingest path (P4 calls this). When the existing row is meta_locked — a
   * human owns the taxonomy — refresh ONLY summary/generation fields and leave
   * category/tags untouched. Otherwise upsert the full AI-generated index.
   */
  static async upsertFromIngest(
    documentId: string,
    index: INewOsAiIndex,
    trx?: QueryContext
  ): Promise<void> {
    const existing = await this.table(trx)
      .where({ document_id: documentId })
      .first();

    if (existing?.meta_locked) {
      await this.table(trx).where({ document_id: documentId }).update({
        summary: index.summary,
        generated_for: index.generatedFor,
        generated_at: new Date(),
      });
      return;
    }

    const fields = {
      summary: index.summary,
      category: index.category,
      tags: JSON.stringify(index.tags),
      generated_for: index.generatedFor,
      generated_at: new Date(),
    };
    await this.table(trx)
      .insert({ document_id: documentId, ...fields })
      .onConflict("document_id")
      .merge(fields);
  }

  /**
   * Human edit of category/tags. Upserts the patched fields AND sets
   * meta_locked so a later re-ingest cannot overwrite the user's taxonomy
   * (only the summary is refreshed after this).
   */
  static async setMeta(
    documentId: string,
    patch: IOsMetaPatch,
    trx?: QueryContext
  ): Promise<void> {
    const fields: Record<string, unknown> = { meta_locked: true };
    if (patch.category !== undefined) fields.category = patch.category;
    if (patch.tags !== undefined) fields.tags = JSON.stringify(patch.tags);
    await this.table(trx)
      .insert({ document_id: documentId, ...fields })
      .onConflict("document_id")
      .merge(fields);
  }
}
