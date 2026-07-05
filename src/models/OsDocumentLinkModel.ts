import { Knex } from "knex";
import { BaseModel, QueryContext } from "./BaseModel";

export type OsLinkOrigin = "manual" | "ai_suggested" | "content_parsed";
export type OsLinkStatus = "suggested" | "accepted" | "rejected";

export interface IOsDocumentLink {
  id: string;
  source_document_id: string;
  target_document_id: string;
  origin: OsLinkOrigin;
  status: OsLinkStatus;
  created_by: number | null;
  created_at: Date;
}

/** A link edge joined to the "other" document's display fields. */
export interface IOsLinkView {
  id: string;
  origin: OsLinkOrigin;
  status: OsLinkStatus;
  created_at: Date;
  doc_id: string;
  doc_title: string;
  doc_status: string;
  doc_archived_at: Date | null;
}

const LINK_COLUMNS = [
  "id",
  "source_document_id",
  "target_document_id",
  "origin",
  "status",
  "created_by",
  "created_at",
] as const;

/**
 * os.document_links — related-document edges (plans/07042026-alloro-os-
 * admin-port, D4; P4 T2). One row per directed (source, target) pair (unique
 * index); origin ∈ manual|ai_suggested|content_parsed, status ∈ suggested|
 * accepted|rejected. AI suggestions are written by the ingest pipeline with
 * unique-pair upserts so re-ingest never duplicates an edge.
 *
 * §11.7 posture: os.* tables are internal-admin single-tenant by design;
 * isolation is the super-admin gate on every /api/admin/os route (§11.1).
 */
export class OsDocumentLinkModel extends BaseModel {
  protected static tableName = "os.document_links";

  /** One edge joined to the "other" document for display (§7.4: one builder). */
  private static linkView(
    query: Knex.QueryBuilder,
    otherColumn: "target_document_id" | "source_document_id"
  ): Promise<IOsLinkView[]> {
    return query
      .join("os.documents as o", "o.id", `os.document_links.${otherColumn}`)
      .select(
        "os.document_links.id",
        "os.document_links.origin",
        "os.document_links.status",
        "os.document_links.created_at",
        "o.id as doc_id",
        "o.title as doc_title",
        "o.status as doc_status",
        "o.archived_at as doc_archived_at"
      )
      .orderBy("os.document_links.created_at", "desc") as unknown as Promise<
      IOsLinkView[]
    >;
  }

  static async findLinkById(
    id: string,
    trx?: QueryContext
  ): Promise<IOsDocumentLink | undefined> {
    return this.table(trx)
      .select(...LINK_COLUMNS)
      .where({ id })
      .first();
  }

  static async findPair(
    sourceDocumentId: string,
    targetDocumentId: string,
    trx?: QueryContext
  ): Promise<IOsDocumentLink | undefined> {
    return this.table(trx)
      .select(...LINK_COLUMNS)
      .where({
        source_document_id: sourceDocumentId,
        target_document_id: targetDocumentId,
      })
      .first();
  }

  /**
   * AI suggestion from the ingest pipeline. Unique-pair upsert: any existing
   * edge for the pair (manual, accepted, even rejected — the human already
   * decided) wins and the insert is ignored. Self-links never insert.
   */
  static async suggestPair(
    sourceDocumentId: string,
    targetDocumentId: string,
    trx?: QueryContext
  ): Promise<void> {
    if (sourceDocumentId === targetDocumentId) return;
    await this.table(trx)
      .insert({
        source_document_id: sourceDocumentId,
        target_document_id: targetDocumentId,
        origin: "ai_suggested",
        status: "suggested",
        created_by: null,
      })
      .onConflict(["source_document_id", "target_document_id"])
      .ignore();
  }

  /**
   * Manual link: create accepted, or flip an existing pair (suggested /
   * rejected) to accepted — the existing row keeps its origin, which is the
   * "accept a suggestion by adding it manually" path. Callers 409 on an
   * already-accepted pair BEFORE calling this (OsLinkService owns that rule).
   */
  static async upsertManualAccepted(
    sourceDocumentId: string,
    targetDocumentId: string,
    createdBy: number,
    trx?: QueryContext
  ): Promise<IOsDocumentLink> {
    const [row] = await this.table(trx)
      .insert({
        source_document_id: sourceDocumentId,
        target_document_id: targetDocumentId,
        origin: "manual",
        status: "accepted",
        created_by: createdBy,
      })
      .onConflict(["source_document_id", "target_document_id"])
      .merge({ status: "accepted" })
      .returning([...LINK_COLUMNS]);
    return row as IOsDocumentLink;
  }

  static async setStatus(
    id: string,
    status: OsLinkStatus,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx).where({ id }).update({ status });
  }

  /** Outbound accepted links (this document → others). */
  static async listOutboundAccepted(
    documentId: string,
    trx?: QueryContext
  ): Promise<IOsLinkView[]> {
    return this.linkView(
      this.table(trx).where({
        "os.document_links.source_document_id": documentId,
        "os.document_links.status": "accepted",
      }),
      "target_document_id"
    );
  }

  /** Backlinks — accepted links pointing AT this document. */
  static async listInboundAccepted(
    documentId: string,
    trx?: QueryContext
  ): Promise<IOsLinkView[]> {
    return this.linkView(
      this.table(trx).where({
        "os.document_links.target_document_id": documentId,
        "os.document_links.status": "accepted",
      }),
      "source_document_id"
    );
  }

  /** Pending AI suggestions for this document (source side). */
  static async listSuggested(
    documentId: string,
    trx?: QueryContext
  ): Promise<IOsLinkView[]> {
    return this.linkView(
      this.table(trx).where({
        "os.document_links.source_document_id": documentId,
        "os.document_links.status": "suggested",
      }),
      "target_document_id"
    );
  }
}
