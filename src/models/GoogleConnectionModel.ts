import { BaseModel, QueryContext } from "./BaseModel";

export interface IGoogleConnection {
  id: number;
  google_user_id: string;
  email: string;
  refresh_token: string;
  access_token: string | null;
  token_type: string | null;
  expiry_date: Date | null;
  scopes: string | null;
  organization_id: number;
  google_property_ids: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}

export class GoogleConnectionModel extends BaseModel {
  protected static tableName = "google_connections";
  protected static jsonFields = ["google_property_ids"];

  static async findById(
    id: number,
    trx?: QueryContext
  ): Promise<IGoogleConnection | undefined> {
    return super.findById(id, trx);
  }

  /**
   * Find a connection by Google user ID.
   * The user_id column was dropped in migration 20260221000004.
   * Looks up by google_user_id only; optionally narrows by organization_id.
   */
  static async findByGoogleUserId(
    googleUserId: string,
    organizationId?: number,
    trx?: QueryContext
  ): Promise<IGoogleConnection | undefined> {
    const query = this.table(trx).where({ google_user_id: googleUserId });

    if (organizationId) {
      query.andWhere({ organization_id: organizationId });
    }

    const row = await query.first();
    return row ? this.deserializeJsonFields(row) : undefined;
  }

  static async findByOrganization(
    orgId: number,
    trx?: QueryContext
  ): Promise<IGoogleConnection[]> {
    const rows = await this.table(trx)
      .where({ organization_id: orgId });
    return rows.map((row: IGoogleConnection) =>
      this.deserializeJsonFields(row)
    );
  }

  static async findOneByOrganization(
    orgId: number,
    trx?: QueryContext
  ): Promise<IGoogleConnection | undefined> {
    const row = await this.table(trx)
      .where({ organization_id: orgId })
      .first();
    return row ? this.deserializeJsonFields(row) : undefined;
  }

  static async create(
    data: Partial<IGoogleConnection>,
    trx?: QueryContext
  ): Promise<IGoogleConnection> {
    return super.create(data as Record<string, unknown>, trx);
  }

  static async updateById(
    id: number,
    data: Partial<IGoogleConnection>,
    trx?: QueryContext
  ): Promise<number> {
    return super.updateById(id, data as Record<string, unknown>, trx);
  }

  static async updatePropertyIds(
    id: number,
    propertyIds: Record<string, unknown>,
    trx?: QueryContext
  ): Promise<number> {
    return super.updateById(
      id,
      { google_property_ids: propertyIds } as Record<string, unknown>,
      trx
    );
  }

  static async updateTokens(
    id: number,
    tokens: {
      access_token: string;
      refresh_token?: string;
      token_type?: string;
      expiry_date?: Date;
      scopes?: string;
    },
    trx?: QueryContext
  ): Promise<number> {
    return super.updateById(id, tokens as Record<string, unknown>, trx);
  }

  static async findByOrgWithScope(
    orgId: number,
    scopeSubstring: string,
    trx?: QueryContext
  ): Promise<IGoogleConnection[]> {
    const rows = await this.table(trx)
      .where({ organization_id: orgId })
      .andWhere("scopes", "ilike", `%${scopeSubstring}%`);
    return rows.map((row: IGoogleConnection) =>
      this.deserializeJsonFields(row)
    );
  }

  static async findAllWithScope(
    scopeSubstring: string,
    trx?: QueryContext
  ): Promise<IGoogleConnection[]> {
    const rows = await this.table(trx)
      .where("scopes", "ilike", `%${scopeSubstring}%`);
    return rows.map((row: IGoogleConnection) =>
      this.deserializeJsonFields(row)
    );
  }

  /**
   * Generic findOne for arbitrary where clauses.
   */
  static async findOne(
    where: Record<string, unknown>,
    trx?: QueryContext
  ): Promise<IGoogleConnection | undefined> {
    const row = await this.table(trx).where(where).first();
    return row ? this.deserializeJsonFields(row) : undefined;
  }
}
