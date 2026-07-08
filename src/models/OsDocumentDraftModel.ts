import { BaseModel, QueryContext } from "./BaseModel";

export interface IOsDocumentDraft {
  document_id: string;
  content_md: string;
  base_version: number | null;
  updated_by: number | null;
  updated_at: Date;
}

/**
 * os.document_drafts — exactly one autosave row per document (PK document_id),
 * upserted on every save; cleared by publish (plans/07042026-alloro-os-admin-port).
 *
 * §11.7 posture: os.* tables are internal-admin single-tenant by design;
 * isolation is the super-admin gate on every /api/admin/os route (§11.1).
 */
export class OsDocumentDraftModel extends BaseModel {
  protected static tableName = "os.document_drafts";

  static async findByDocumentId(
    documentId: string,
    trx?: QueryContext
  ): Promise<IOsDocumentDraft | undefined> {
    return this.table(trx).where({ document_id: documentId }).first();
  }

  static async saveDraft(
    documentId: string,
    contentMd: string,
    baseVersion: number | null,
    updatedBy: number | null,
    trx?: QueryContext
  ): Promise<void> {
    const fields = {
      content_md: contentMd,
      base_version: baseVersion,
      updated_by: updatedBy,
      updated_at: new Date(),
    };
    await this.table(trx)
      .insert({ document_id: documentId, ...fields })
      .onConflict("document_id")
      .merge(fields);
  }

  static async removeDraft(
    documentId: string,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx).where({ document_id: documentId }).del();
  }
}
