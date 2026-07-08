import { BaseModel, QueryContext } from "./BaseModel";

export interface IOsDocumentVersion {
  id: string;
  document_id: string;
  version_no: number;
  title: string | null;
  content_md: string;
  toc_json: unknown;
  ai_change_summary: string | null;
  human_note: string | null;
  author_id: number | null;
  created_at: Date;
}

export interface INewOsDocumentVersion {
  document_id: string;
  version_no: number;
  title: string | null;
  content_md: string;
  toc_json: unknown;
  ai_change_summary: string | null;
  human_note: string | null;
  author_id: number | null;
}

/**
 * os.document_versions — immutable full-content snapshots, one per publish
 * (plans/07042026-alloro-os-admin-port, D4). version_no is unique per document;
 * the live version is documents.current_version_id.
 *
 * §11.7 posture: os.* tables are internal-admin single-tenant by design;
 * isolation is the super-admin gate on every /api/admin/os route (§11.1).
 */
export class OsDocumentVersionModel extends BaseModel {
  protected static tableName = "os.document_versions";
  protected static jsonFields = ["toc_json"];

  static async createVersion(
    input: INewOsDocumentVersion,
    trx?: QueryContext
  ): Promise<IOsDocumentVersion> {
    // created_at has a DB default; BaseModel.create would also try to set a
    // non-existent updated_at column, so insert directly here.
    const [row] = await this.table(trx)
      .insert(this.serializeJsonFields({ ...input }))
      .returning("*");
    return this.deserializeJsonFields(row);
  }

  static async findVersionById(
    id: string,
    trx?: QueryContext
  ): Promise<IOsDocumentVersion | undefined> {
    return super.findById(id, trx);
  }

  static async findByVersionNo(
    documentId: string,
    versionNo: number,
    trx?: QueryContext
  ): Promise<IOsDocumentVersion | undefined> {
    const row = await this.table(trx)
      .where({ document_id: documentId, version_no: versionNo })
      .first();
    return row ? this.deserializeJsonFields(row) : undefined;
  }

  static async listForDocumentPaginated(
    documentId: string,
    pagination: { limit: number; offset: number },
    trx?: QueryContext
  ): Promise<{ versions: IOsDocumentVersion[]; total: number }> {
    const rows = await this.table(trx)
      .where({ document_id: documentId })
      .orderBy("version_no", "desc")
      .limit(pagination.limit)
      .offset(pagination.offset);
    const countRow = await this.table(trx)
      .where({ document_id: documentId })
      .count("id as count")
      .first();
    return {
      versions: rows.map((row: unknown) => this.deserializeJsonFields(row)),
      total: parseInt(String(countRow?.count ?? "0"), 10) || 0,
    };
  }

  static async maxVersionNo(
    documentId: string,
    trx?: QueryContext
  ): Promise<number> {
    const row = await this.table(trx)
      .where({ document_id: documentId })
      .max("version_no as max")
      .first();
    return Number((row as { max: number | null } | undefined)?.max ?? 0);
  }
}
