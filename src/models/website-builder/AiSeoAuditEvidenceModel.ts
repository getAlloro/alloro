import { BaseModel, QueryContext } from "../BaseModel";

export interface IAiSeoAuditEvidence {
  id: string;
  result_id: string;
  evidence_type: string;
  source: string;
  excerpt: string | null;
  value: Record<string, unknown>;
  created_at: Date;
}

export class AiSeoAuditEvidenceModel extends BaseModel {
  protected static tableName = "website_builder.ai_seo_audit_evidence";
  protected static jsonFields = ["value"];

  static async createMany(
    rows: Array<Omit<IAiSeoAuditEvidence, "id" | "created_at">>,
    trx?: QueryContext,
  ): Promise<IAiSeoAuditEvidence[]> {
    if (rows.length === 0) return [];
    const serializedRows = rows.map((row) => this.serializeJsonFields(row));
    const inserted = await this.table(trx).insert(serializedRows).returning("*");
    return inserted.map((row: IAiSeoAuditEvidence) => this.deserializeJsonFields(row));
  }

  static async findByResultIds(
    resultIds: string[],
    trx?: QueryContext,
  ): Promise<IAiSeoAuditEvidence[]> {
    if (resultIds.length === 0) return [];
    const rows = await this.table(trx)
      .select("*")
      .whereIn("result_id", resultIds)
      .orderBy("created_at", "asc");
    return rows.map((row: IAiSeoAuditEvidence) => this.deserializeJsonFields(row));
  }
}
