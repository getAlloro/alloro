import { BaseModel, QueryContext } from "./BaseModel";

export interface IGoogleProperty {
  id: number;
  location_id: number;
  google_connection_id: number;
  type: "gbp";
  external_id: string;
  account_id: string | null;
  display_name: string | null;
  metadata: Record<string, unknown> | null;
  selected: boolean;
  created_at: Date;
  updated_at: Date;
}

export class GooglePropertyModel extends BaseModel {
  protected static tableName = "google_properties";
  protected static jsonFields = ["metadata"];

  static async findById(
    id: number,
    trx?: QueryContext
  ): Promise<IGoogleProperty | undefined> {
    return super.findById(id, trx);
  }

  static async findByConnectionId(
    googleConnectionId: number,
    trx?: QueryContext
  ): Promise<IGoogleProperty[]> {
    const rows = await this.table(trx).where({
      google_connection_id: googleConnectionId,
    });
    return rows.map((row: IGoogleProperty) => this.deserializeJsonFields(row));
  }

  static async findByLocationId(
    locationId: number,
    trx?: QueryContext
  ): Promise<IGoogleProperty[]> {
    const rows = await this.table(trx).where({ location_id: locationId });
    return rows.map((row: IGoogleProperty) => this.deserializeJsonFields(row));
  }

  static async findSelectedGbpByLocationId(
    locationId: number,
    trx?: QueryContext
  ): Promise<IGoogleProperty | undefined> {
    const row = await this.table(trx)
      .where({ location_id: locationId, type: "gbp", selected: true })
      .orderBy("updated_at", "desc")
      .first();
    return row ? this.deserializeJsonFields(row) : undefined;
  }

  static async findByExternalId(
    externalId: string,
    trx?: QueryContext
  ): Promise<IGoogleProperty | undefined> {
    const row = await this.table(trx)
      .where({ external_id: externalId })
      .first();
    return row ? this.deserializeJsonFields(row) : undefined;
  }

  static async findByConnectionAndExternalId(
    connectionId: number,
    externalId: string,
    trx?: QueryContext
  ): Promise<IGoogleProperty | undefined> {
    const row = await this.table(trx)
      .where({ google_connection_id: connectionId, external_id: externalId })
      .first();
    return row ? this.deserializeJsonFields(row) : undefined;
  }

  static async deleteByConnectionId(
    connectionId: number,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx).where({ google_connection_id: connectionId }).del();
  }

  static async deleteByLocationId(
    locationId: number,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx).where({ location_id: locationId }).del();
  }

  static async create(
    data: Omit<IGoogleProperty, "id" | "created_at" | "updated_at">,
    trx?: QueryContext
  ): Promise<IGoogleProperty> {
    return super.create(data as Record<string, unknown>, trx);
  }
}
