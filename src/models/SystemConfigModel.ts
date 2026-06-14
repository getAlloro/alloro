import { BaseModel, QueryContext } from "./BaseModel";

export interface ISystemConfig {
  key: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  value: any;
  updated_at: Date;
}

/**
 * Owns the `system_config` table (editable business values backed by the
 * dashboard). Methods mirror the inline queries previously held in
 * services/configStore.ts verbatim — `value` is written as a pre-stringified
 * payload (raw passthrough), reads return the raw row, and the read-then-
 * insert-or-update branch in `setConfig` is preserved (no onConflict upsert)
 * to keep behavior byte-identical to the original.
 */
export class SystemConfigModel extends BaseModel {
  protected static tableName = "system_config";

  /** Single config row by key (raw row, or undefined). */
  static async findByKey(
    key: string,
    trx?: QueryContext
  ): Promise<ISystemConfig | undefined> {
    return this.table(trx).where({ key }).first();
  }

  /** All config rows ordered by key (raw rows). */
  static async findAllOrderedByKey(
    trx?: QueryContext
  ): Promise<ISystemConfig[]> {
    return this.table(trx).orderBy("key");
  }

  /**
   * Update the (already-stringified) value for an existing key, stamping
   * updated_at. Mirrors the update branch of configStore.setConfig.
   */
  static async updateValueByKey(
    key: string,
    stringifiedValue: string,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx)
      .where({ key })
      .update({ value: stringifiedValue, updated_at: new Date() });
  }

  /**
   * Insert a new config row with an (already-stringified) value, stamping
   * updated_at. Mirrors the insert branch of configStore.setConfig.
   */
  static async insertValue(
    key: string,
    stringifiedValue: string,
    trx?: QueryContext
  ): Promise<void> {
    await this.table(trx).insert({
      key,
      value: stringifiedValue,
      updated_at: new Date(),
    });
  }

  /** Delete a config row by key. Mirrors configStore.deleteConfig. */
  static async deleteByKey(key: string, trx?: QueryContext): Promise<number> {
    return this.table(trx).where({ key }).del();
  }
}
