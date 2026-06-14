import { Knex } from "knex";
import { db } from "../database/connection";

export type QueryContext = Knex | Knex.Transaction;

export interface PaginationParams {
  limit?: number;
  offset?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
}

export abstract class BaseModel {
  protected static tableName: string;
  protected static jsonFields: string[] = [];

  protected static table(trx?: QueryContext): Knex.QueryBuilder {
    return (trx || db)(this.tableName);
  }

  /**
   * Open a database transaction without exposing the raw connection to the
   * caller. Controllers/services that compose several model writes atomically
   * call this and thread the resulting `trx` into the model methods, keeping
   * the transaction boundary in the orchestration layer while the DB handle
   * stays owned by models/.
   */
  static transaction<T>(
    callback: (trx: Knex.Transaction) => Promise<T>
  ): Promise<T> {
    return db.transaction(callback);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findById(id: number | string, trx?: QueryContext): Promise<any> {
    const row = await this.table(trx).where({ id }).first();
    return row ? this.deserializeJsonFields(row) : undefined;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findOne(conditions: Record<string, unknown>, trx?: QueryContext): Promise<any> {
    const row = await this.table(trx).where(conditions).first();
    return row ? this.deserializeJsonFields(row) : undefined;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findMany(conditions: Record<string, unknown>, trx?: QueryContext): Promise<any[]> {
    const rows = await this.table(trx).where(conditions);
    return rows.map((row: unknown) => this.deserializeJsonFields(row));
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async create(data: Record<string, unknown>, trx?: QueryContext): Promise<any> {
    const serialized = this.serializeJsonFields({
      ...data,
      created_at: new Date(),
      updated_at: new Date(),
    });
    const [result] = await this.table(trx).insert(serialized).returning("*");
    return this.deserializeJsonFields(result);
  }

  static async createReturningId(
    data: Record<string, unknown>,
    trx?: QueryContext
  ): Promise<number> {
    const serialized = this.serializeJsonFields({
      ...data,
      created_at: new Date(),
      updated_at: new Date(),
    });
    const [result] = await this.table(trx).insert(serialized).returning("id");
    return typeof result === "object" ? result.id : result;
  }

  static async updateById(
    id: number | string,
    data: Record<string, unknown>,
    trx?: QueryContext
  ): Promise<number> {
    const serialized = this.serializeJsonFields({
      ...data,
      updated_at: new Date(),
    });
    return this.table(trx).where({ id }).update(serialized);
  }

  static async deleteById(
    id: number | string,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx).where({ id }).del();
  }

  static async count(
    conditions?: Record<string, unknown>,
    trx?: QueryContext
  ): Promise<number> {
    let query = this.table(trx);
    if (conditions) {
      query = query.where(conditions);
    }
    const result = await query.count("* as count").first();
    return parseInt(result?.count as string, 10) || 0;
  }

  static async paginate<T>(
    buildQuery: (qb: Knex.QueryBuilder) => Knex.QueryBuilder,
    params: PaginationParams,
    trx?: QueryContext
  ): Promise<PaginatedResult<T>> {
    const { limit = 50, offset = 0 } = params;

    const countResult = await buildQuery(this.table(trx))
      .clone()
      .clearSelect()
      .clearOrder()
      .count("* as count")
      .first();
    const total = parseInt(countResult?.count as string, 10) || 0;

    const rows = await buildQuery(this.table(trx)).limit(limit).offset(offset);
    const data = rows.map((row: unknown) => this.deserializeJsonFields(row));

    return { data: data as T[], total };
  }

  protected static parseJson<T = unknown>(value: unknown): T | null {
    if (value === null || value === undefined) return null;
    if (typeof value === "string") {
      try {
        return JSON.parse(value);
      } catch {
        return value as unknown as T;
      }
    }
    return value as T;
  }

  protected static toJson(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    if (typeof value === "string") return value;
    return JSON.stringify(value);
  }

  protected static serializeJsonFields(
    data: Record<string, unknown>
  ): Record<string, unknown> {
    if (this.jsonFields.length === 0) return data;
    const result = { ...data };
    for (const field of this.jsonFields) {
      if (field in result && result[field] !== null && result[field] !== undefined) {
        result[field] = this.toJson(result[field]);
      }
    }
    return result;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected static deserializeJsonFields(row: any): any {
    if (!row || this.jsonFields.length === 0) return row;
    const result = { ...row };
    for (const field of this.jsonFields) {
      if (field in result) {
        result[field] = this.parseJson(result[field]);
      }
    }
    return result;
  }
}
