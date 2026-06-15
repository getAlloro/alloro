import { db } from "../database/connection";
import { BaseModel, QueryContext } from "./BaseModel";

export interface ICompetitorCache {
  id: number;
  cache_key: string;
  specialty: string;
  location: string;
  competitors: unknown;
  competitor_count: number;
  created_at: Date;
  expires_at: Date;
}

export interface CompetitorCacheUpsert {
  cacheKey: string;
  specialty: string;
  location: string;
  competitorsJson: string;
  competitorCount: number;
  now: Date;
  expiresAt: Date;
}

export interface CompetitorCacheStats {
  totalEntries: number;
  expiredEntries: number;
  activeEntries: number;
  oldestEntry: Date | null;
  newestEntry: Date | null;
}

/**
 * Caches WHICH competitor placeIds to compare against for a
 * specialty+location combination (not the competitor data itself).
 *
 * The table is created lazily via `ensureTable()` the first time the cache is
 * touched — the original service did this inline (no migration owns it), so
 * the bootstrap stays here, encapsulated with the table it manages.
 */
export class CompetitorCacheModel extends BaseModel {
  protected static tableName = "competitor_cache";

  /**
   * Create the cache table if it does not yet exist (lazy bootstrap).
   * Returns `true` when the table was created on this call, `false` when it
   * already existed — so callers can preserve their create-time logging.
   */
  static async ensureTable(): Promise<boolean> {
    const tableExists = await db.schema.hasTable("competitor_cache");
    if (tableExists) {
      return false;
    }
    await db.schema.createTable("competitor_cache", (table) => {
      table.increments("id").primary();
      table.string("cache_key").notNullable().unique();
      table.string("specialty").notNullable();
      table.string("location").notNullable();
      table.jsonb("competitors").notNullable();
      table.integer("competitor_count").notNullable();
      table.timestamp("created_at").defaultTo(db.fn.now());
      table.timestamp("expires_at").notNullable();
      table.index("cache_key");
      table.index("expires_at");
    });
    return true;
  }

  /** The unexpired cache entry for a key, or undefined. Raw row. */
  static async findValidByKey(
    cacheKey: string,
    now: Date,
    trx?: QueryContext
  ): Promise<ICompetitorCache | undefined> {
    return this.table(trx)
      .where({ cache_key: cacheKey })
      .where("expires_at", ">", now)
      .first();
  }

  /** Upsert a cache entry keyed by cache_key (insert or merge on conflict). */
  static async upsertByKey(
    data: CompetitorCacheUpsert,
    trx?: QueryContext
  ): Promise<void> {
    await this.table(trx)
      .insert({
        cache_key: data.cacheKey,
        specialty: data.specialty,
        location: data.location,
        competitors: data.competitorsJson,
        competitor_count: data.competitorCount,
        created_at: data.now,
        expires_at: data.expiresAt,
      })
      .onConflict("cache_key")
      .merge({
        competitors: data.competitorsJson,
        competitor_count: data.competitorCount,
        created_at: data.now,
        expires_at: data.expiresAt,
      });
  }

  /** Delete the entry for a key. Returns the number of rows deleted. */
  static async deleteByKey(
    cacheKey: string,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx).where({ cache_key: cacheKey }).del();
  }

  /** Delete all entries that expired before `now`. Returns rows deleted. */
  static async deleteExpired(
    now: Date,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx).where("expires_at", "<", now).del();
  }

  /** Aggregate cache statistics (totals, expired, oldest/newest created_at). */
  static async getStats(
    now: Date,
    trx?: QueryContext
  ): Promise<CompetitorCacheStats> {
    const [totalResult] = await this.table(trx).count("* as count");
    const [expiredResult] = await this.table(trx)
      .where("expires_at", "<", now)
      .count("* as count");
    const [oldestResult] = await this.table(trx)
      .orderBy("created_at", "asc")
      .limit(1)
      .select("created_at");
    const [newestResult] = await this.table(trx)
      .orderBy("created_at", "desc")
      .limit(1)
      .select("created_at");

    const total = parseInt(totalResult.count as string, 10) || 0;
    const expired = parseInt(expiredResult.count as string, 10) || 0;

    return {
      totalEntries: total,
      expiredEntries: expired,
      activeEntries: total - expired,
      oldestEntry: oldestResult?.created_at || null,
      newestEntry: newestResult?.created_at || null,
    };
  }
}
