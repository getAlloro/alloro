import { BaseModel, QueryContext } from "../BaseModel";
import type {
  AiSeoConfidence,
  AiSeoTargetType,
} from "../../services/ai-seo-audit/types";

export interface IAiSeoAuditTarget {
  id: string;
  run_id: string;
  target_type: AiSeoTargetType;
  page_id: string | null;
  location_id: number | null;
  url: string;
  label: string | null;
  score: string | number | null;
  data_coverage: string | number | null;
  confidence: AiSeoConfidence | null;
  mapping_confidence: string | number | null;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export class AiSeoAuditTargetModel extends BaseModel {
  protected static tableName = "website_builder.ai_seo_audit_targets";
  protected static jsonFields = ["metadata"];

  static async createTarget(
    data: Omit<IAiSeoAuditTarget, "id" | "created_at" | "updated_at">,
    trx?: QueryContext,
  ): Promise<IAiSeoAuditTarget> {
    return super.create(data as Record<string, unknown>, trx);
  }

  static async updateTarget(
    id: string,
    data: Partial<IAiSeoAuditTarget>,
    trx?: QueryContext,
  ): Promise<number> {
    return super.updateById(id, data as Record<string, unknown>, trx);
  }

  static async findByRunId(
    runId: string,
    trx?: QueryContext,
  ): Promise<IAiSeoAuditTarget[]> {
    const rows = await this.table(trx)
      .select("*")
      .where({ run_id: runId })
      .orderBy("created_at", "asc");
    return rows.map((row: IAiSeoAuditTarget) => this.deserializeJsonFields(row));
  }
}
