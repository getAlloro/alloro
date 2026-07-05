import { BaseModel, QueryContext } from "./BaseModel";

/** Extension → parser routing (master spec P6). Markdown is a passthrough. */
export type OsImportConverter = "docx" | "xlsx" | "pdf" | "markdown";

/** Provenance lifecycle: pending → converted | failed (§21 convert job). */
export type OsImportStatus = "pending" | "converted" | "failed";

/**
 * Row shape for os.document_imports. `size_bytes` is a bigint, which pg returns
 * as a string; `warnings` is jsonb (deserialized to string[] here).
 */
export interface IOsDocumentImport {
  id: string;
  document_id: string;
  original_filename: string;
  source_mime: string | null;
  source_s3_key: string | null;
  size_bytes: string | null;
  converter: OsImportConverter | null;
  status: OsImportStatus;
  warnings: string[];
  imported_by: number | null;
  created_at: Date;
  converted_at: Date | null;
}

export interface INewOsDocumentImport {
  document_id: string;
  original_filename: string;
  source_mime: string | null;
  source_s3_key: string | null;
  size_bytes: number | null;
  converter: OsImportConverter;
  imported_by: number | null;
}

/**
 * os.document_imports — one provenance row per imported file
 * (plans/07042026-alloro-os-admin-port, D4/D14; P6 T1). Records the original
 * filename, S3 archive key, chosen converter, conversion status, and any
 * best-effort warnings the converter surfaced. A document has one import row
 * today (byDocument returns the latest); re-import in a future version may add
 * more.
 *
 * §11.7 posture: os.* tables are internal-admin single-tenant by design;
 * isolation is the super-admin gate on every /api/admin/os route (§11.1).
 */
export class OsDocumentImportModel extends BaseModel {
  protected static tableName = "os.document_imports";
  protected static jsonFields = ["warnings"];

  /**
   * Insert a provenance row in `pending`. created_at + status + warnings have
   * DB defaults; size_bytes is bigint so a number is stringified for pg. The
   * write joins the doc-creation transaction (§10.5) — pass the trx.
   */
  static async createImport(
    input: INewOsDocumentImport,
    trx?: QueryContext
  ): Promise<IOsDocumentImport> {
    const [row] = await this.table(trx)
      .insert({
        ...input,
        size_bytes: input.size_bytes == null ? null : String(input.size_bytes),
      })
      .returning("*");
    return this.deserializeJsonFields(row);
  }

  static async findById(
    id: string,
    trx?: QueryContext
  ): Promise<IOsDocumentImport | undefined> {
    const row = await this.table(trx).where({ id }).first();
    return row ? this.deserializeJsonFields(row) : undefined;
  }

  /** Latest import row for a document (a doc has one today). */
  static async byDocument(
    documentId: string,
    trx?: QueryContext
  ): Promise<IOsDocumentImport | undefined> {
    const row = await this.table(trx)
      .where({ document_id: documentId })
      .orderBy("created_at", "desc")
      .first();
    return row ? this.deserializeJsonFields(row) : undefined;
  }

  /**
   * Terminal status write from the convert job. warnings carry the best-effort
   * conversion notes (§ no silent caps). converted_at stamps only when the
   * status is `converted`; a failure leaves it null.
   */
  static async setStatus(
    id: string,
    status: OsImportStatus,
    warnings: string[] = [],
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx)
      .where({ id })
      .update({
        status,
        warnings: JSON.stringify(warnings),
        converted_at: status === "converted" ? new Date() : null,
      });
  }

  /** Replace the accumulated warnings array without touching status. */
  static async setWarnings(
    id: string,
    warnings: string[],
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx)
      .where({ id })
      .update({ warnings: JSON.stringify(warnings) });
  }
}
