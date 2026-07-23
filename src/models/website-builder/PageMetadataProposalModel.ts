import { BaseModel, QueryContext } from "../BaseModel";

/** A page title / meta-description rewrite awaiting, or having received, review. */
export type PageMetadataProposalStatus = "pending" | "approved" | "rejected";

export interface IPageMetadataProposal {
  id: string;
  project_id: string;
  page_id: string;
  page_path: string;
  before_title: string | null;
  before_description: string | null;
  proposed_title: string;
  proposed_description: string;
  rationale: Record<string, unknown> | null;
  status: PageMetadataProposalStatus;
  reviewed_by: number | null;
  reviewed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

/** The columns a caller supplies when staging a new proposal. */
export interface NewPageMetadataProposal {
  project_id: string;
  page_id: string;
  page_path: string;
  before_title: string | null;
  before_description: string | null;
  proposed_title: string;
  proposed_description: string;
  rationale: Record<string, unknown>;
}

/**
 * Owns `website_builder.page_metadata_proposals`. Every read and write is scoped
 * by `project_id` (§5.5/§11.7): the project is the tenant boundary on this schema,
 * so a caller can never reach a row belonging to a project it did not name. The
 * scope is a REQUIRED argument on every method, not an optional filter.
 */
export class PageMetadataProposalModel extends BaseModel {
  protected static tableName = "website_builder.page_metadata_proposals";
  protected static jsonFields = ["rationale"];

  /** Insert a staged proposal (status defaults to `pending`) and return the row. */
  static async createProposal(
    input: NewPageMetadataProposal,
    trx?: QueryContext
  ): Promise<IPageMetadataProposal> {
    return this.create({ ...input } as Record<string, unknown>, trx);
  }

  /** One proposal by id, scoped to its project. Undefined if absent or out-of-scope. */
  static async findByIdForProject(
    id: string,
    projectId: string,
    trx?: QueryContext
  ): Promise<IPageMetadataProposal | undefined> {
    const row = await this.table(trx).where({ id, project_id: projectId }).first();
    return row ? this.deserializeJsonFields(row) : undefined;
  }

  /** Proposals for a project, newest first, optionally narrowed by status. */
  static async listForProject(
    projectId: string,
    filters?: { status?: PageMetadataProposalStatus },
    trx?: QueryContext
  ): Promise<IPageMetadataProposal[]> {
    let query = this.table(trx)
      .where("project_id", projectId)
      .orderBy("created_at", "desc");

    if (filters?.status) {
      query = query.where("status", filters.status);
    }

    const rows = await query;
    return rows.map((row: unknown) => this.deserializeJsonFields(row));
  }

  /**
   * Move a proposal to a terminal review status, scoped to its project, and return
   * the updated row. The `pending` guard in the WHERE clause makes the transition
   * idempotent — a second approve/reject affects zero rows and returns undefined.
   */
  static async setReviewStatusForProject(
    id: string,
    projectId: string,
    status: Extract<PageMetadataProposalStatus, "approved" | "rejected">,
    reviewedBy: number,
    trx?: QueryContext
  ): Promise<IPageMetadataProposal | undefined> {
    const [row] = await this.table(trx)
      .where({ id, project_id: projectId, status: "pending" })
      .update({
        status,
        reviewed_by: reviewedBy,
        reviewed_at: new Date(),
        updated_at: new Date(),
      })
      .returning("*");
    return row ? this.deserializeJsonFields(row) : undefined;
  }
}
