import { BaseModel, QueryContext } from "./BaseModel";
import { db } from "../database/connection";

const MAX_WORK_ITEM_LIST_LIMIT = 500;

export type GbpContentType = "review_reply" | "local_post";
export type GbpSafetyStatus = "safe" | "needs_review" | "blocked";
export type GbpWorkItemStatus =
  | "draft"
  | "awaiting_approval"
  | "approved"
  | "deploying"
  | "published"
  | "rejected";

export interface IGbpWorkItem {
  id: string;
  organization_id: number;
  location_id: number;
  google_property_id: number;
  content_type: GbpContentType;
  source_review_id: string | null;
  status: GbpWorkItemStatus;
  draft_content: string;
  approved_content: string | null;
  published_content: string | null;
  local_post_payload: Record<string, unknown> | null;
  featured_image_url: string | null;
  google_resource_name: string | null;
  google_response: Record<string, unknown> | null;
  safety_status: GbpSafetyStatus | null;
  safety_reason_codes: string[];
  safety_reasons: string[];
  safety_confidence: number | null;
  deploy_preview_payload: Record<string, unknown> | null;
  generation_prompt_key: string | null;
  generation_input: Record<string, unknown> | null;
  generation_customizations: string | null;
  created_by_user_id: number | null;
  approved_by_user_id: number | null;
  published_by_user_id: number | null;
  rejected_by_user_id: number | null;
  approved_at: Date | null;
  published_at: Date | null;
  rejected_at: Date | null;
  last_deploy_failed_at: Date | null;
  next_retry_at: Date | null;
  last_error_code: string | null;
  last_error_message: string | null;
  retry_count: number;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export interface GbpWorkItemFilters {
  organizationId: number;
  locationId?: number;
  status?: GbpWorkItemStatus;
  contentType?: GbpContentType;
  limit?: number;
}

export class GbpWorkItemModel extends BaseModel {
  protected static tableName = "gbp_work_items";
  protected static jsonFields = [
    "local_post_payload",
    "google_response",
    "safety_reason_codes",
    "safety_reasons",
    "deploy_preview_payload",
    "generation_input",
    "metadata",
  ];

  static async findById(
    id: string,
    trx?: QueryContext
  ): Promise<IGbpWorkItem | undefined> {
    return super.findById(id, trx);
  }

  static async findByIdForScope(
    id: string,
    organizationId: number,
    locationId?: number,
    trx?: QueryContext
  ): Promise<IGbpWorkItem | undefined> {
    const query = this.table(trx).where({ id, organization_id: organizationId });
    if (typeof locationId === "number") query.where({ location_id: locationId });
    const row = await query.first();
    return row ? this.deserializeJsonFields(row) : undefined;
  }

  static async findActiveReviewReplyForReview(
    reviewId: string,
    trx?: QueryContext
  ): Promise<IGbpWorkItem | undefined> {
    const row = await this.table(trx)
      .where({
        source_review_id: reviewId,
        content_type: "review_reply",
      })
      .whereIn("status", ["draft", "awaiting_approval", "approved", "deploying"])
      .orderBy("created_at", "desc")
      .first();
    return row ? this.deserializeJsonFields(row) : undefined;
  }

  static async findLocalPostForGenerationWindow(
    organizationId: number,
    locationId: number,
    generationWindow: string,
    trx?: QueryContext
  ): Promise<IGbpWorkItem | undefined> {
    const row = await this.table(trx)
      .where({
        organization_id: organizationId,
        location_id: locationId,
        content_type: "local_post",
      })
      .whereRaw("metadata ->> 'generationWindow' = ?", [generationWindow])
      .whereIn("status", ["draft", "awaiting_approval", "approved", "deploying", "published"])
      .orderBy("created_at", "desc")
      .first();
    return row ? this.deserializeJsonFields(row) : undefined;
  }

  static async findRunningLocalPostGeneration(
    organizationId: number,
    locationId: number,
    trx?: QueryContext
  ): Promise<IGbpWorkItem | undefined> {
    const row = await this.table(trx)
      .where({
        organization_id: organizationId,
        location_id: locationId,
        content_type: "local_post",
      })
      .whereRaw("metadata ->> 'generationStatus' = ?", ["running"])
      .whereIn("status", ["draft", "awaiting_approval"])
      .orderBy("created_at", "desc")
      .first();
    return row ? this.deserializeJsonFields(row) : undefined;
  }

  static async findPublishedLocalPostByGoogleResourceName(
    organizationId: number,
    locationId: number,
    googleResourceName: string,
    trx?: QueryContext
  ): Promise<IGbpWorkItem | undefined> {
    const row = await this.table(trx)
      .where({
        organization_id: organizationId,
        location_id: locationId,
        content_type: "local_post",
        status: "published",
        google_resource_name: googleResourceName,
      })
      .orderBy("updated_at", "desc")
      .first();
    return row ? this.deserializeJsonFields(row) : undefined;
  }

  static async list(
    filters: GbpWorkItemFilters,
    trx?: QueryContext
  ): Promise<IGbpWorkItem[]> {
    const limit = Math.min(Math.max(filters.limit || 50, 1), MAX_WORK_ITEM_LIST_LIMIT);
    let query = this.table(trx)
      .where({ organization_id: filters.organizationId })
      .orderBy("created_at", "desc")
      .limit(limit);

    if (typeof filters.locationId === "number") {
      query = query.where({ location_id: filters.locationId });
    }
    if (filters.status) query = query.where({ status: filters.status });
    if (filters.contentType) query = query.where({ content_type: filters.contentType });

    const rows = await query;
    return rows.map((row: IGbpWorkItem) => this.deserializeJsonFields(row));
  }

  /**
   * Owner-facing proof-receipt read (Tier 1): PUBLISHED work items for an org
   * within [since, until), by published_at desc. The dated "what Alloro did"
   * rollup that list() and gbp_work_events did not expose — see
   * services/proofReceiptService + specs/proof-receipt-build-spec.md.
   */
  static async listPublishedForOrgInRange(
    organizationId: number,
    since: Date,
    until: Date,
    trx?: QueryContext
  ): Promise<IGbpWorkItem[]> {
    const rows = await this.table(trx)
      .where({ organization_id: organizationId, status: "published" })
      .andWhere("published_at", ">=", since)
      .andWhere("published_at", "<", until)
      .orderBy("published_at", "desc");
    return rows.map((row: IGbpWorkItem) => this.deserializeJsonFields(row));
  }

  static async create(
    data: Partial<IGbpWorkItem>,
    trx?: QueryContext
  ): Promise<IGbpWorkItem> {
    return super.create(data as Record<string, unknown>, trx);
  }

  static async updateById(
    id: string,
    data: Partial<IGbpWorkItem>,
    trx?: QueryContext
  ): Promise<number> {
    return super.updateById(id, data as Record<string, unknown>, trx);
  }

  static async updateDraft(
    id: string,
    draftContent: string,
    safety?: {
      status: GbpSafetyStatus;
      reasonCodes: string[];
      reasons: string[];
      confidence: number;
    },
    trx?: QueryContext
  ): Promise<number> {
    return this.updateById(id, {
      draft_content: draftContent,
      status: "draft",
      approved_content: null,
      approved_by_user_id: null,
      approved_at: null,
      rejected_by_user_id: null,
      rejected_at: null,
      last_error_code: null,
      last_error_message: null,
      ...(safety
        ? {
            safety_status: safety.status,
            safety_reason_codes: safety.reasonCodes,
            safety_reasons: safety.reasons,
            safety_confidence: safety.confidence,
          }
        : {}),
    }, trx);
  }

  static async updateLocalPostDraft(
    id: string,
    data: {
      draftContent: string;
      localPostPayload: Record<string, unknown>;
      featuredImageUrl: string | null;
      safety?: {
        status: GbpSafetyStatus;
        reasonCodes: string[];
        reasons: string[];
        confidence: number;
      };
    },
    trx?: QueryContext
  ): Promise<number> {
    return this.updateById(id, {
      draft_content: data.draftContent,
      local_post_payload: data.localPostPayload,
      featured_image_url: data.featuredImageUrl,
      status: "draft",
      approved_content: null,
      approved_by_user_id: null,
      approved_at: null,
      rejected_by_user_id: null,
      rejected_at: null,
      last_error_code: null,
      last_error_message: null,
      ...(data.safety
        ? {
            safety_status: data.safety.status,
            safety_reason_codes: data.safety.reasonCodes,
            safety_reasons: data.safety.reasons,
            safety_confidence: data.safety.confidence,
          }
        : {}),
    }, trx);
  }

  static async replaceGeneratedDraft(
    id: string,
    data: {
      draftContent: string;
      promptKey: string;
      generationInput: Record<string, unknown>;
      customizations: string | null;
      metadata: Record<string, unknown>;
      safety?: {
        status: GbpSafetyStatus;
        reasonCodes: string[];
        reasons: string[];
        confidence: number;
      };
    },
    trx?: QueryContext
  ): Promise<number> {
    return this.updateById(id, {
      draft_content: data.draftContent,
      status: "draft",
      approved_content: null,
      approved_by_user_id: null,
      approved_at: null,
      rejected_by_user_id: null,
      rejected_at: null,
      generation_prompt_key: data.promptKey,
      generation_input: data.generationInput,
      generation_customizations: data.customizations,
      last_error_code: null,
      last_error_message: null,
      metadata: data.metadata,
      ...(data.safety
        ? {
            safety_status: data.safety.status,
            safety_reason_codes: data.safety.reasonCodes,
            safety_reasons: data.safety.reasons,
            safety_confidence: data.safety.confidence,
          }
        : {}),
    }, trx);
  }

  static async replaceGeneratedLocalPostDraft(
    id: string,
    data: {
      draftContent: string;
      localPostPayload: Record<string, unknown>;
      featuredImageUrl: string | null;
      sourceReviewId?: string | null;
      promptKey: string;
      generationInput: Record<string, unknown>;
      customizations: string | null;
      metadata: Record<string, unknown>;
      safety?: {
        status: GbpSafetyStatus;
        reasonCodes: string[];
        reasons: string[];
        confidence: number;
      };
    },
    trx?: QueryContext
  ): Promise<number> {
    return this.updateById(id, {
      draft_content: data.draftContent,
      local_post_payload: data.localPostPayload,
      featured_image_url: data.featuredImageUrl,
      ...(data.sourceReviewId !== undefined
        ? { source_review_id: data.sourceReviewId }
        : {}),
      status: "draft",
      approved_content: null,
      approved_by_user_id: null,
      approved_at: null,
      rejected_by_user_id: null,
      rejected_at: null,
      generation_prompt_key: data.promptKey,
      generation_input: data.generationInput,
      generation_customizations: data.customizations,
      last_error_code: null,
      last_error_message: null,
      metadata: data.metadata,
      ...(data.safety
        ? {
            safety_status: data.safety.status,
            safety_reason_codes: data.safety.reasonCodes,
            safety_reasons: data.safety.reasons,
            safety_confidence: data.safety.confidence,
          }
        : {}),
    }, trx);
  }

  static async approve(
    id: string,
    userId: number | null,
    approvedContent: string,
    safety?: {
      status: GbpSafetyStatus;
      reasonCodes: string[];
      reasons: string[];
      confidence: number;
    },
    trx?: QueryContext
  ): Promise<number> {
    const serialized = this.serializeJsonFields({
      status: "approved",
      approved_content: approvedContent,
      approved_by_user_id: userId,
      approved_at: new Date(),
      rejected_by_user_id: null,
      rejected_at: null,
      last_error_code: null,
      last_error_message: null,
      ...(safety
        ? {
            safety_status: safety.status,
            safety_reason_codes: safety.reasonCodes,
            safety_reasons: safety.reasons,
            safety_confidence: safety.confidence,
          }
        : {}),
      updated_at: new Date(),
    });
    return this.table(trx)
      .where({ id })
      .whereIn("status", ["draft", "awaiting_approval"])
      .update(serialized);
  }

  static async updateDeployPreview(
    id: string,
    deployPreviewPayload: Record<string, unknown>,
    trx?: QueryContext
  ): Promise<number> {
    return this.updateById(id, {
      deploy_preview_payload: deployPreviewPayload,
    }, trx);
  }

  static async markDeploying(
    id: string,
    userId: number | null,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx)
      .where({ id, status: "approved" })
      .update({
      status: "deploying",
      published_by_user_id: userId,
      last_error_code: null,
      last_error_message: null,
      updated_at: new Date(),
    });
  }

  static async markPublished(
    id: string,
    data: {
      publishedContent: string;
      googleResourceName: string | null;
      googleResponse: Record<string, unknown>;
    },
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx)
      .where({ id, status: "deploying" })
      .update(this.serializeJsonFields({
      status: "published",
      published_content: data.publishedContent,
      google_resource_name: data.googleResourceName,
      google_response: data.googleResponse,
      published_at: new Date(),
      last_error_code: null,
      last_error_message: null,
      next_retry_at: null,
      updated_at: new Date(),
    }));
  }

  static async syncPublishedLocalPost(
    id: string,
    data: {
      publishedContent: string;
      localPostPayload: Record<string, unknown>;
      featuredImageUrl: string | null;
      googleResponse: Record<string, unknown>;
      metadata: Record<string, unknown>;
    },
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx)
      .where({ id, status: "published", content_type: "local_post" })
      .update(this.serializeJsonFields({
        draft_content: data.publishedContent,
        approved_content: data.publishedContent,
        published_content: data.publishedContent,
        local_post_payload: data.localPostPayload,
        featured_image_url: data.featuredImageUrl,
        google_response: data.googleResponse,
        metadata: data.metadata,
        last_error_code: null,
        last_error_message: null,
        updated_at: new Date(),
      }));
  }

  static async markPublishedLocalPostDeleted(
    id: string,
    userId: number | null,
    metadata: Record<string, unknown>,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx)
      .where({ id, status: "published", content_type: "local_post" })
      .update(this.serializeJsonFields({
        status: "rejected",
        rejected_by_user_id: userId,
        rejected_at: new Date(),
        last_error_code: null,
        last_error_message: null,
        metadata,
        updated_at: new Date(),
      }));
  }

  static async markFailedToDraft(
    id: string,
    errorCode: string,
    errorMessage: string,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx).where({ id, status: "deploying" }).update({
      status: "draft",
      last_error_code: errorCode,
      last_error_message: errorMessage,
      last_deploy_failed_at: new Date(),
      next_retry_at: new Date(),
      retry_count: (trx || db).raw("retry_count + 1"),
      updated_at: new Date(),
    });
  }
}
