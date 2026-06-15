import { BaseModel, QueryContext } from "../BaseModel";
import { db } from "../../database/connection";
import { encrypt, decrypt } from "../../utils/encryption";

export type IntegrationStatus = "active" | "revoked" | "broken";
export type IntegrationType = "crm_push" | "script_injection" | "data_harvest" | "hybrid";
export type IntegrationPlatform = "hubspot" | "rybbit" | "clarity" | "gsc";
export type IntegrationConnectedBy = "user" | "admin" | "system";

export interface IWebsiteIntegration {
  id: string;
  project_id: string;
  platform: IntegrationPlatform;
  type: IntegrationType;
  label: string | null;
  encrypted_credentials: string | null;
  metadata: Record<string, unknown>;
  status: IntegrationStatus;
  connected_by: IntegrationConnectedBy | null;
  last_validated_at: Date | null;
  last_error: string | null;
  created_at: Date;
  updated_at: Date;
}

export type IWebsiteIntegrationSafe = Omit<IWebsiteIntegration, "encrypted_credentials">;

const SAFE_COLUMNS = [
  "id",
  "project_id",
  "platform",
  "type",
  "label",
  "metadata",
  "status",
  "connected_by",
  "last_validated_at",
  "last_error",
  "created_at",
  "updated_at",
];

const SAFE_COLUMNS_WITH_ALIAS = SAFE_COLUMNS.map((column) => `wi.${column}`);

export class WebsiteIntegrationModel extends BaseModel {
  protected static tableName = "website_builder.website_integrations";

  private static activeIntegrationQuery(trx?: QueryContext) {
    return (trx || db)(`${this.tableName} as wi`)
      .join("website_builder.projects as p", "wi.project_id", "p.id")
      .leftJoin("organizations as o", "p.organization_id", "o.id")
      .select(SAFE_COLUMNS_WITH_ALIAS)
      .where("wi.status", "active")
      .whereNull("p.archived_at")
      .where(function () {
        this.whereNull("p.organization_id").orWhereNull("o.archived_at");
      });
  }

  static async findById(
    id: string,
    trx?: QueryContext,
  ): Promise<IWebsiteIntegrationSafe | undefined> {
    return this.table(trx).select(SAFE_COLUMNS).where({ id }).first();
  }

  static async findActiveById(
    id: string,
    trx?: QueryContext,
  ): Promise<IWebsiteIntegrationSafe | undefined> {
    return this.activeIntegrationQuery(trx)
      .where("wi.id", id)
      .first();
  }

  static async findByProjectId(
    projectId: string,
    trx?: QueryContext,
  ): Promise<IWebsiteIntegrationSafe[]> {
    return this.table(trx)
      .select(SAFE_COLUMNS)
      .where({ project_id: projectId })
      .orderBy("created_at", "desc");
  }

  static async findByProjectAndPlatform(
    projectId: string,
    platform: string,
    trx?: QueryContext,
  ): Promise<IWebsiteIntegrationSafe | undefined> {
    return this.table(trx)
      .select(SAFE_COLUMNS)
      .where({ project_id: projectId, platform })
      .first();
  }

  static async findActiveByPlatform(
    platform: IntegrationPlatform,
    trx?: QueryContext,
  ): Promise<IWebsiteIntegrationSafe[]> {
    return this.activeIntegrationQuery(trx)
      .where("wi.platform", platform)
      .orderBy("wi.created_at", "asc");
  }

  /**
   * Create a new integration with the given plaintext credentials.
   * Credentials are encrypted before insert.
   */
  static async create(
    data: {
      project_id: string;
      platform: IntegrationPlatform;
      type?: IntegrationType;
      credentials?: string | null;
      label?: string | null;
      metadata?: Record<string, unknown>;
      status?: IntegrationStatus;
      connected_by?: IntegrationConnectedBy | null;
    },
    trx?: QueryContext,
  ): Promise<IWebsiteIntegrationSafe> {
    const { credentials, ...rest } = data;
    const encrypted_credentials = credentials ? encrypt(credentials) : null;

    const [result] = await this.table(trx)
      .insert({
        ...rest,
        encrypted_credentials,
        type: rest.type ?? "crm_push",
        metadata: rest.metadata ?? {},
        status: rest.status ?? "active",
        connected_by: rest.connected_by ?? null,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning(SAFE_COLUMNS);

    return result as IWebsiteIntegrationSafe;
  }

  /**
   * Update mutable fields. If `credentials` is provided, re-encrypt and persist.
   */
  static async update(
    id: string,
    data: {
      type?: IntegrationType;
      label?: string | null;
      credentials?: string | null;
      metadata?: Record<string, unknown>;
      status?: IntegrationStatus;
      connected_by?: IntegrationConnectedBy | null;
      last_validated_at?: Date | null;
      last_error?: string | null;
    },
    trx?: QueryContext,
  ): Promise<IWebsiteIntegrationSafe | undefined> {
    const { credentials, ...rest } = data;
    const update: Record<string, unknown> = { ...rest, updated_at: new Date() };
    if (credentials !== undefined) {
      update.encrypted_credentials = credentials ? encrypt(credentials) : null;
    }

    const [result] = await this.table(trx)
      .where({ id })
      .update(update)
      .returning(SAFE_COLUMNS);

    return result as IWebsiteIntegrationSafe | undefined;
  }

  static async deleteById(
    id: string,
    trx?: QueryContext,
  ): Promise<number> {
    return this.table(trx).where({ id }).del();
  }

  static async updateStatus(
    id: string,
    status: IntegrationStatus,
    last_error: string | null = null,
    trx?: QueryContext,
  ): Promise<number> {
    return this.table(trx)
      .where({ id })
      .update({ status, last_error, updated_at: new Date() });
  }

  static async updateLastValidated(
    id: string,
    last_validated_at: Date,
    last_error: string | null = null,
    trx?: QueryContext,
  ): Promise<number> {
    return this.table(trx)
      .where({ id })
      .update({ last_validated_at, last_error, updated_at: new Date() });
  }

  static async findActiveByTypes(
    types: IntegrationType[],
    trx?: QueryContext,
  ): Promise<IWebsiteIntegrationSafe[]> {
    return this.activeIntegrationQuery(trx)
      .whereIn("wi.type", types)
      .orderBy("wi.created_at", "asc");
  }

  /**
   * INTERNAL ONLY. Returns the decrypted access token for adapter use.
   * MUST NOT be exposed via any controller endpoint or response body.
   */
  static async getDecryptedCredentials(id: string): Promise<string | null> {
    const row = await db(this.tableName)
      .select("encrypted_credentials")
      .where({ id })
      .first();
    if (!row?.encrypted_credentials) return null;
    return decrypt(row.encrypted_credentials);
  }

  static async hasCredentials(
    id: string,
    trx?: QueryContext,
  ): Promise<boolean> {
    const row = await this.table(trx)
      .select("encrypted_credentials")
      .where({ id })
      .first();
    return !!row?.encrypted_credentials;
  }

  /**
   * Active integrations across a set of project ids, projecting
   * (project_id, platform, status). Mirrors the inline rollup query in
   * service.project-manager.listProjects verbatim (the caller groups by
   * project). Caller guards the empty-id case.
   */
  static async findActiveByProjectIds(
    projectIds: string[],
    trx?: QueryContext,
  ): Promise<Array<{ project_id: string; platform: string; status: string }>> {
    return this.table(trx)
      .select("project_id", "platform", "status")
      .whereIn("project_id", projectIds)
      .where("status", "active");
  }
}
