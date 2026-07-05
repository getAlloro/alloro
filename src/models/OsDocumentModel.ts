import { Knex } from "knex";
import { db } from "../database/connection";
import { BaseModel, QueryContext } from "./BaseModel";

export type OsDocumentStatus =
  | "processing"
  | "indexed"
  | "archived"
  | "processing_failed";

/**
 * Row shape for os.documents. The `search_tsv` tsvector column is intentionally
 * omitted — it is written by rebuildSearchTsv/the ingest pipeline and only read
 * inside FTS queries, never returned to callers.
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

export interface IOsDocumentOwner {
  id: number;
  name: string | null;
  email: string;
}

/** Enriched read shape — a document row joined to its AI taxonomy + owner. */
export interface IOsDocumentListItem extends IOsDocument {
  category: string | null;
  tags: string[];
  owner: IOsDocumentOwner | null;
}

export interface IOsDocumentListFilters {
  folderId?: string;
  status?: OsDocumentStatus;
  ownerId?: number;
  category?: string;
  tag?: string;
  /** Trash view: only archived docs. Default (false) excludes archived. */
  archivedOnly?: boolean;
}

export interface IOsDocumentSearchFilters {
  folderId?: string;
  category?: string;
  tag?: string;
  ownerId?: number;
  status?: OsDocumentStatus;
  /** FTS excludes archived by default; true widens to archived rows too. */
  includeArchived?: boolean;
}

export interface IOsDocumentSearchHit {
  id: string;
  title: string;
  slug: string;
  status: OsDocumentStatus;
  folder_id: string | null;
  owner_id: number | null;
  updated_at: Date;
  summary: string | null;
  category: string | null;
  tags: string[];
  rank: number;
  snippet: string;
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
 * Weighted tsvector rebuild for os.documents.search_tsv — the ONE vetted SQL
 * literal for the search index (weights: title A · live content B · summary C ·
 * tags C). Exported so the P4 ingest pipeline reuses the exact same fragment
 * via OsDocumentModel.rebuildSearchTsv — never re-derive these weights.
 * Parameterized (§10.2): the only binding is the document id.
 */
export const OS_DOCUMENT_SEARCH_TSV_REBUILD_SQL = `
  update os.documents d set search_tsv =
    setweight(to_tsvector('english', coalesce(d.title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce((select v.content_md from os.document_versions v where v.id = d.current_version_id), '')), 'B') ||
    setweight(to_tsvector('english', coalesce((select ai.summary from os.document_ai_index ai where ai.document_id = d.id), '')), 'C') ||
    setweight(to_tsvector('english', coalesce((select string_agg(t, ' ') from os.document_ai_index ai, jsonb_array_elements_text(ai.tags) t where ai.document_id = d.id), '')), 'C')
  where d.id = ?`;

/** Vetted tsquery fragment shared by the FTS match/rank/snippet selects. */
const OS_TSQUERY_SQL = "websearch_to_tsquery('english', ?)";

/**
 * os.documents — the knowledge-base documents themselves
 * (plans/07042026-alloro-os-admin-port, D4/D11).
 *
 * §11.7 posture: os.* tables are internal-admin SINGLE-TENANT by design — no
 * organization/location column exists. Isolation is enforced by the
 * super-admin gate on every /api/admin/os route (§11.1), not by per-row
 * tenant scoping. P2 completes the document API surface (list/detail/create/
 * rename/meta/status/archive/restore/tsv/FTS); versions, drafts, locks and the
 * AI index live in their own Os*Model files.
 */
export class OsDocumentModel extends BaseModel {
  protected static tableName = "os.documents";

  /** Enriched base query: documents ⋈ ai_index ⋈ owner (one builder, §7.4). */
  private static enrichedQuery(trx?: QueryContext): Knex.QueryBuilder {
    return this.table(trx)
      .from("os.documents as d")
      .leftJoin("os.document_ai_index as ai", "ai.document_id", "d.id")
      .leftJoin("users as u", "u.id", "d.owner_id")
      .select("d.*")
      .select("ai.category as category")
      .select((trx || db).raw("coalesce(ai.tags, '[]'::jsonb) as tags"))
      .select(
        (trx || db).raw(
          "case when u.id is null then null else json_build_object('id', u.id, 'name', u.name, 'email', u.email) end as owner"
        )
      );
  }

  private static applyListFilters(
    query: Knex.QueryBuilder,
    filters: IOsDocumentListFilters
  ): Knex.QueryBuilder {
    if (filters.archivedOnly) {
      query.whereNotNull("d.archived_at");
    } else {
      query.whereNull("d.archived_at");
    }
    if (filters.folderId !== undefined) query.where("d.folder_id", filters.folderId);
    if (filters.status) query.where("d.status", filters.status);
    if (filters.ownerId !== undefined) query.where("d.owner_id", filters.ownerId);
    if (filters.category) query.where("ai.category", filters.category);
    if (filters.tag) {
      query.whereRaw("ai.tags @> ?::jsonb", [JSON.stringify([filters.tag])]);
    }
    return query;
  }

  static async listPaginated(
    filters: IOsDocumentListFilters,
    pagination: { limit: number; offset: number },
    trx?: QueryContext
  ): Promise<{ documents: IOsDocumentListItem[]; total: number }> {
    const documents = await this.applyListFilters(this.enrichedQuery(trx), filters)
      .orderBy("d.updated_at", "desc")
      .limit(pagination.limit)
      .offset(pagination.offset);

    const countQuery = this.applyListFilters(
      this.table(trx)
        .from("os.documents as d")
        .leftJoin("os.document_ai_index as ai", "ai.document_id", "d.id"),
      filters
    );
    const countRow = await countQuery.count("d.id as count").first();
    return {
      documents: documents as IOsDocumentListItem[],
      total: parseInt(String(countRow?.count ?? "0"), 10) || 0,
    };
  }

  static async findEnrichedById(
    id: string,
    trx?: QueryContext
  ): Promise<IOsDocumentListItem | undefined> {
    return this.enrichedQuery(trx).where("d.id", id).first() as Promise<
      IOsDocumentListItem | undefined
    >;
  }

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

  /** Does another document already use this slug? (rename/create collisions) */
  static async slugExists(
    slug: string,
    excludeId?: string,
    trx?: QueryContext
  ): Promise<boolean> {
    const query = this.table(trx).where({ slug });
    if (excludeId) query.whereNot({ id: excludeId });
    return Boolean(await query.first("id"));
  }

  static async updateTitleAndSlug(
    id: string,
    title: string,
    slug: string,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx).where({ id }).update({ title, slug, updated_at: new Date() });
  }

  static async updateDocumentMeta(
    id: string,
    patch: { folder_id?: string | null; owner_id?: number | null },
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx).where({ id }).update({ ...patch, updated_at: new Date() });
  }

  static async setStatus(
    id: string,
    status: OsDocumentStatus,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx).where({ id }).update({ status, updated_at: new Date() });
  }

  static async setCurrentVersion(
    id: string,
    versionId: string,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx)
      .where({ id })
      .update({ current_version_id: versionId, updated_at: new Date() });
  }

  static async archiveDocument(id: string, trx?: QueryContext): Promise<number> {
    return this.table(trx)
      .where({ id })
      .update({ status: "archived", archived_at: new Date(), updated_at: new Date() });
  }

  /** Trash restore — back to `processing`; the re-ingest job finishes the job. */
  static async restoreDocument(id: string, trx?: QueryContext): Promise<number> {
    return this.table(trx)
      .where({ id })
      .update({ status: "processing", archived_at: null, updated_at: new Date() });
  }

  /** Hard delete — CASCADE removes versions/drafts/ai_index/chunks/locks/etc. */
  static async deleteDocumentById(id: string, trx?: QueryContext): Promise<number> {
    return this.table(trx).where({ id }).del();
  }

  /** Rebuild the weighted search_tsv for one document (see the exported SQL). */
  static async rebuildSearchTsv(id: string, trx?: QueryContext): Promise<void> {
    await (trx || db).raw(OS_DOCUMENT_SEARCH_TSV_REBUILD_SQL, [id]);
  }

  private static applySearchFilters(
    query: Knex.QueryBuilder,
    tsQuery: string,
    filters: IOsDocumentSearchFilters
  ): Knex.QueryBuilder {
    query.whereRaw(`d.search_tsv @@ ${OS_TSQUERY_SQL}`, [tsQuery]);
    if (!filters.includeArchived) query.whereNull("d.archived_at");
    if (filters.folderId !== undefined) query.where("d.folder_id", filters.folderId);
    if (filters.category) query.where("ai.category", filters.category);
    if (filters.tag) {
      query.whereRaw("ai.tags @> ?::jsonb", [JSON.stringify([filters.tag])]);
    }
    if (filters.ownerId !== undefined) query.where("d.owner_id", filters.ownerId);
    if (filters.status) query.where("d.status", filters.status);
    return query;
  }

  /**
   * Weighted full-text search: websearch_to_tsquery match, ts_rank ordering,
   * ts_headline snippet over coalesce(summary, title). All raw fragments are
   * vetted literals; every user value rides a binding (§10.2).
   */
  static async searchFullText(
    tsQuery: string,
    filters: IOsDocumentSearchFilters,
    pagination: { limit: number; offset: number },
    trx?: QueryContext
  ): Promise<IOsDocumentSearchHit[]> {
    const query = this.table(trx)
      .from("os.documents as d")
      .leftJoin("os.document_ai_index as ai", "ai.document_id", "d.id")
      .select(
        "d.id",
        "d.title",
        "d.slug",
        "d.status",
        "d.folder_id",
        "d.owner_id",
        "d.updated_at",
        "ai.summary",
        "ai.category"
      )
      .select((trx || db).raw("coalesce(ai.tags, '[]'::jsonb) as tags"))
      .select((trx || db).raw(`ts_rank(d.search_tsv, ${OS_TSQUERY_SQL}) as rank`, [tsQuery]))
      .select(
        (trx || db).raw(
          `ts_headline('english', coalesce(ai.summary, d.title), ${OS_TSQUERY_SQL}, 'StartSel=<<,StopSel=>>') as snippet`,
          [tsQuery]
        )
      );
    return this.applySearchFilters(query, tsQuery, filters)
      .orderByRaw("rank desc")
      .orderBy("d.updated_at", "desc")
      .limit(pagination.limit)
      .offset(pagination.offset) as Promise<IOsDocumentSearchHit[]>;
  }

  static async countFullTextMatches(
    tsQuery: string,
    filters: IOsDocumentSearchFilters,
    trx?: QueryContext
  ): Promise<number> {
    const query = this.table(trx)
      .from("os.documents as d")
      .leftJoin("os.document_ai_index as ai", "ai.document_id", "d.id");
    const row = await this.applySearchFilters(query, tsQuery, filters)
      .count("d.id as count")
      .first();
    return parseInt(String(row?.count ?? "0"), 10) || 0;
  }
}
