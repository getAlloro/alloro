import { BaseModel, QueryContext } from "./BaseModel";

export type OsDocumentStatus =
  | "processing"
  | "indexed"
  | "archived"
  | "processing_failed";

/**
 * Row shape for os.documents. The `search_tsv` tsvector column is intentionally
 * omitted — it is written by the ingest pipeline (P4) and only read inside
 * FTS queries, never returned to callers.
 */
export interface IOsDocument {
  id: string;
  folder_id: string | null;
  title: string;
  slug: string;
  current_version_id: string | null;
  status: OsDocumentStatus;
  owner_id: number | null;
  created_by: number | null;
  created_at: Date;
  updated_at: Date;
  archived_at: Date | null;
}

const DOCUMENT_COLUMNS = [
  "id",
  "folder_id",
  "title",
  "slug",
  "current_version_id",
  "status",
  "owner_id",
  "created_by",
  "created_at",
  "updated_at",
  "archived_at",
] as const;

/**
 * os.documents — the knowledge-base documents themselves
 * (plans/07042026-alloro-os-admin-port, D4/D11).
 *
 * §11.7 posture: os.* tables are internal-admin SINGLE-TENANT by design — no
 * organization/location column exists. Isolation is enforced by the
 * super-admin gate on every /api/admin/os route (§11.1), not by per-row
 * tenant scoping. P1 ships the minimal reads/writes; P2 completes the
 * document API (versions, drafts, publish, trash).
 */
export class OsDocumentModel extends BaseModel {
  protected static tableName = "os.documents";

  static async createDocument(
    data: {
      title: string;
      slug: string;
      folder_id?: string | null;
      status?: OsDocumentStatus;
      owner_id?: number | null;
      created_by?: number | null;
    },
    trx?: QueryContext
  ): Promise<IOsDocument> {
    return super.create(data, trx);
  }

  static async listAll(trx?: QueryContext): Promise<IOsDocument[]> {
    return this.table(trx)
      .select(...DOCUMENT_COLUMNS)
      .orderBy("updated_at", "desc");
  }

  static async findDocumentById(
    id: string,
    trx?: QueryContext
  ): Promise<IOsDocument | undefined> {
    return this.table(trx)
      .select(...DOCUMENT_COLUMNS)
      .where({ id })
      .first();
  }
}
