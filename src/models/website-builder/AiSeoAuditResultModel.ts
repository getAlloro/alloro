import { BaseModel, QueryContext } from "../BaseModel";
import type {
  AiSeoCategoryId,
  AiSeoDataScope,
  AiSeoMethod,
  AiSeoResultStatus,
} from "../../services/ai-seo-audit/types";

export interface IAiSeoAuditResult {
  id: string;
  run_id: string;
  target_id: string | null;
  category: AiSeoCategoryId;
  check_id: string;
  status: AiSeoResultStatus;
  weight: string | number;
  points_awarded: string | number;
  method: AiSeoMethod;
  data_scope: AiSeoDataScope;
  remediation: string | null;
  details: Record<string, unknown>;
  created_at: Date;
}

export class AiSeoAuditResultModel extends BaseModel {
  protected static tableName = "website_builder.ai_seo_audit_results";
  protected static jsonFields = ["details"];

  static async createMany(
    rows: Array<Omit<IAiSeoAuditResult, "id" | "created_at">>,
    trx?: QueryContext,
  ): Promise<IAiSeoAuditResult[]> {
    if (rows.length === 0) return [];
    const serializedRows = rows.map((row) => this.serializeJsonFields(row));
    const inserted = await this.table(trx).insert(serializedRows).returning("*");
    return inserted.map((row: IAiSeoAuditResult) => this.deserializeJsonFields(row));
  }

  static async findByRunId(
    runId: string,
    trx?: QueryContext,
  ): Promise<IAiSeoAuditResult[]> {
    const rows = await this.table(trx)
      .select("*")
      .where({ run_id: runId })
      .orderBy("created_at", "asc");
    return rows.map((row: IAiSeoAuditResult) => this.deserializeJsonFields(row));
  }
}
