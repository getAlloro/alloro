import { BaseModel, QueryContext } from "../BaseModel";
import type {
  AiSeoAuditScope,
  AiSeoAuditStatus,
  AiSeoConfidence,
  AiSeoHardCap,
} from "../../services/ai-seo-audit/types";

export interface IAiSeoAuditRun {
  id: string;
  scope: AiSeoAuditScope;
  status: AiSeoAuditStatus;
  organization_id: number | null;
  project_id: string | null;
  requested_url: string | null;
  normalized_url: string | null;
  score: string | number | null;
  data_coverage: string | number | null;
  confidence: AiSeoConfidence | null;
  rule_version: string;
  hard_caps: AiSeoHardCap[];
  summary: Record<string, unknown>;
  error_code: string | null;
  error_message: string | null;
  created_by_user_id: number | null;
  started_at: Date | null;
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export class AiSeoAuditRunModel extends BaseModel {
  protected static tableName = "website_builder.ai_seo_audit_runs";
  protected static jsonFields = ["hard_caps", "summary"];

  static async createRun(
    data: {
      scope: AiSeoAuditScope;
      organization_id?: number | null;
      project_id?: string | null;
      requested_url?: string | null;
      normalized_url?: string | null;
      rule_version: string;
      created_by_user_id?: number | null;
    },
    trx?: QueryContext,
  ): Promise<IAiSeoAuditRun> {
    return super.create({
      ...data,
      status: "queued",
      hard_caps: [],
      summary: {},
    }, trx);
  }

  static async updateRun(
    id: string,
    data: Partial<IAiSeoAuditRun>,
    trx?: QueryContext,
  ): Promise<number> {
    return super.updateById(id, data as Record<string, unknown>, trx);
  }

  static async findById(
    id: string,
    trx?: QueryContext,
  ): Promise<IAiSeoAuditRun | undefined> {
    return super.findById(id, trx);
  }

  static async listRecent(
    filters: {
      organizationId?: number;
      projectId?: string;
      scope?: AiSeoAuditScope;
      limit?: number;
    },
    trx?: QueryContext,
  ): Promise<IAiSeoAuditRun[]> {
    const query = this.table(trx).select("*").orderBy("created_at", "desc");
    if (filters.organizationId) {
      query.where("organization_id", filters.organizationId);
    }
    if (filters.projectId) {
      query.where("project_id", filters.projectId);
    }
    if (filters.scope) {
      query.where("scope", filters.scope);
    }
    const rows = await query.limit(filters.limit ?? 25);
    return rows.map((row: IAiSeoAuditRun) => this.deserializeJsonFields(row));
  }

  static async deleteById(id: string, trx?: QueryContext): Promise<number> {
    return this.table(trx).where({ id }).delete();
  }

  static async deleteAll(
    filters: { organizationId?: number; scope?: AiSeoAuditScope } = {},
    trx?: QueryContext,
  ): Promise<number> {
    const query = this.table(trx);
    if (filters.organizationId) {
      query.where("organization_id", filters.organizationId);
    }
    if (filters.scope) {
      query.where("scope", filters.scope);
    }
    return query.delete();
  }
}
