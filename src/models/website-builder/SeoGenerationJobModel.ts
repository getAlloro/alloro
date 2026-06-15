import { db } from "../../database/connection";
import logger from "../../lib/logger";

const TABLE = "website_builder.seo_generation_jobs";

export interface ISeoGenerationJob {
  id: string;
  project_id: string;
  entity_type: "page" | "post";
  post_type_id: string | null;
  status: "queued" | "processing" | "completed" | "failed";
  total_count: number;
  completed_count: number;
  failed_count: number;
  failed_items: Array<{ id: string; title: string; error: string }> | null;
  created_at: string;
  updated_at: string;
}

export class SeoGenerationJobModel {
  static async create(data: {
    project_id: string;
    entity_type: "page" | "post";
    post_type_id?: string | null;
    total_count: number;
  }): Promise<ISeoGenerationJob> {
    const [result] = await db(TABLE)
      .insert({
        project_id: data.project_id,
        entity_type: data.entity_type,
        post_type_id: data.post_type_id || null,
        status: "queued",
        total_count: data.total_count,
        completed_count: 0,
        failed_count: 0,
        failed_items: null,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning("*");
    return result;
  }

  static async findById(id: string): Promise<ISeoGenerationJob | null> {
    const row = await db(TABLE).where({ id }).first();
    if (!row) return null;
    if (typeof row.failed_items === "string") {
      row.failed_items = JSON.parse(row.failed_items);
    }
    return row;
  }

  static async findActive(
    projectId: string,
    entityType: "page" | "post",
    postTypeId?: string | null
  ): Promise<ISeoGenerationJob | null> {
    let query = db(TABLE)
      .where({ project_id: projectId, entity_type: entityType })
      .whereIn("status", ["queued", "processing"]);
    if (postTypeId) {
      query = query.where("post_type_id", postTypeId);
    } else if (entityType === "page") {
      query = query.whereNull("post_type_id");
    }
    const row = await query.first();
    if (!row) return null;

    // Auto-expire stale jobs (no progress update for 10+ minutes)
    const updatedAt = new Date(row.updated_at).getTime();
    const staleThreshold = 10 * 60 * 1000; // 10 minutes
    if (Date.now() - updatedAt > staleThreshold) {
      logger.info(`[SEO-JOB] Auto-expiring stale job ${row.id} (last update: ${row.updated_at})`);
      await db(TABLE).where({ id: row.id }).update({ status: "failed", updated_at: new Date() });
      return null;
    }

    return row;
  }

  static async markProcessing(id: string): Promise<void> {
    await db(TABLE).where({ id }).update({ status: "processing", updated_at: new Date() });
  }

  static async incrementCompleted(id: string): Promise<void> {
    await db(TABLE).where({ id }).increment("completed_count", 1).update({ updated_at: new Date() });
  }

  static async incrementFailed(id: string, failedItem: { id: string; title: string; error: string }): Promise<void> {
    const job = await db(TABLE).where({ id }).first();
    const existing: Array<{ id: string; title: string; error: string }> = job?.failed_items
      ? (typeof job.failed_items === "string" ? JSON.parse(job.failed_items) : job.failed_items)
      : [];
    existing.push(failedItem);
    await db(TABLE).where({ id }).update({
      failed_count: db.raw("failed_count + 1"),
      failed_items: JSON.stringify(existing),
      updated_at: new Date(),
    });
  }

  static async markCompleted(id: string): Promise<void> {
    await db(TABLE).where({ id }).update({ status: "completed", updated_at: new Date() });
  }

  static async markFailed(id: string): Promise<void> {
    await db(TABLE).where({ id }).update({ status: "failed", updated_at: new Date() });
  }
}
