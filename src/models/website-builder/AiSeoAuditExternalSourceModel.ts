import { BaseModel, QueryContext } from "../BaseModel";
import type {
  AiSeoExternalMatchState,
  ExtractedBusinessIdentity,
} from "../../services/ai-seo-audit/types";

export interface IAiSeoAuditExternalSource {
  id: string;
  run_id: string;
  target_id: string | null;
  query: string;
  url: string;
  title: string | null;
  source_host: string;
  source_type: string | null;
  reliability_score: string | number | null;
  entity_match_state: AiSeoExternalMatchState;
  extracted_fields: ExtractedBusinessIdentity;
  compared_fields: Record<string, unknown>;
  metadata: Record<string, unknown>;
  fetched_at: Date | null;
  created_at: Date;
}

export class AiSeoAuditExternalSourceModel extends BaseModel {
  protected static tableName = "website_builder.ai_seo_audit_external_sources";
  protected static jsonFields = ["extracted_fields", "compared_fields", "metadata"];

  static async createMany(
    rows: Array<Omit<IAiSeoAuditExternalSource, "id" | "created_at">>,
    trx?: QueryContext,
  ): Promise<IAiSeoAuditExternalSource[]> {
    if (rows.length === 0) return [];
    const serializedRows = rows.map((row) => this.serializeJsonFields(row));
    const inserted = await this.table(trx).insert(serializedRows).returning("*");
    return inserted.map((row: IAiSeoAuditExternalSource) =>
      this.deserializeJsonFields(row)
    );
  }

  static async findByRunId(
    runId: string,
    trx?: QueryContext,
  ): Promise<IAiSeoAuditExternalSource[]> {
    const rows = await this.table(trx)
      .select("*")
      .where({ run_id: runId })
      .orderBy("created_at", "asc");
    return rows.map((row: IAiSeoAuditExternalSource) =>
      this.deserializeJsonFields(row)
    );
  }
}
