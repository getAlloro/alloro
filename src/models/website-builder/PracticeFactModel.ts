import { BaseModel, QueryContext } from "../BaseModel";

export type PracticeFactSourceField =
  | "business_data"
  | "page_content"
  | "post_content";

export interface IPracticeFact {
  id: string;
  organization_id: number;
  location_id: number | null;
  page_id: string | null;
  post_id: string | null;
  fact_text: string;
  source_field: PracticeFactSourceField;
  source_excerpt: string;
  extracted_at: Date;
}

/**
 * DB-correctness layer for `practice_facts` — source-traceable facts
 * extracted from `business_data` / page / post content. Every row carries a
 * literal `source_excerpt`, enforced upstream by the extraction worker (T3),
 * never by this model.
 *
 * Mirrors `src/models/GbpReviewInsightModel.ts` (§6.1 reference: thin model,
 * all DB access here, no business logic). Every org/location-scoped read is
 * tenant-scoped per §11.7/§5.5 — `organizationId`/`locationId` are required
 * parameters on every such method, never optional filters a caller can skip.
 */
export class PracticeFactModel extends BaseModel {
  protected static tableName = "practice_facts";

  /** Insert a single fact row. */
  static async create(
    fact: Omit<IPracticeFact, "id" | "extracted_at">,
    trx?: QueryContext
  ): Promise<IPracticeFact> {
    const [row] = await this.table(trx)
      .insert({
        ...fact,
        extracted_at: new Date(),
      })
      .returning("*");
    return row;
  }

  /**
   * Bulk-insert facts (extraction worker's clear-and-replace write). Returns
   * the inserted rows. No-ops on an empty array rather than issuing an empty
   * INSERT.
   */
  static async createMany(
    facts: Array<Omit<IPracticeFact, "id" | "extracted_at">>,
    trx?: QueryContext
  ): Promise<IPracticeFact[]> {
    if (facts.length === 0) return [];
    const now = new Date();
    const rows = await this.table(trx)
      .insert(facts.map((fact) => ({ ...fact, extracted_at: now })))
      .returning("*");
    return rows;
  }

  /**
   * Facts for an organization (+ optional location), newest first.
   * Tenant-scoped per §11.7 — `organizationId` is required, never optional.
   */
  static async findByOrgAndLocation(
    organizationId: number,
    locationId: number | null,
    trx?: QueryContext
  ): Promise<IPracticeFact[]> {
    const query = this.table(trx).where({ organization_id: organizationId });
    if (locationId === null) {
      query.whereNull("location_id");
    } else {
      query.where({ location_id: locationId });
    }
    return query.orderBy("extracted_at", "desc");
  }

  /** Facts extracted for a specific page, newest first. */
  static async findByPageId(
    pageId: string,
    trx?: QueryContext
  ): Promise<IPracticeFact[]> {
    return this.table(trx)
      .where({ page_id: pageId })
      .orderBy("extracted_at", "desc");
  }

  /** Facts extracted for a specific post, newest first. */
  static async findByPostId(
    postId: string,
    trx?: QueryContext
  ): Promise<IPracticeFact[]> {
    return this.table(trx)
      .where({ post_id: postId })
      .orderBy("extracted_at", "desc");
  }

  /**
   * Delete all facts for a page (idempotent clear-and-replace, §21.1) ahead
   * of a re-extraction run. Returns the deleted row count.
   */
  static async deleteByPageId(
    pageId: string,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx).where({ page_id: pageId }).del();
  }

  /**
   * Delete all facts for a post (idempotent clear-and-replace, §21.1) ahead
   * of a re-extraction run. Returns the deleted row count.
   */
  static async deleteByPostId(
    postId: string,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx).where({ post_id: postId }).del();
  }
}
