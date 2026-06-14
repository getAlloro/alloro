/**
 * Competitor Cache Service
 *
 * Caches competitor placeIds for specialty+location combinations to ensure
 * consistent competitor sets across multiple analyses.
 *
 * The cache stores WHICH competitors to compare against (placeIds),
 * not the competitor data itself. Fresh data is always fetched for those competitors.
 */

import { db } from "../../../database/connection";
import logger from "../../../lib/logger";

// Cache TTL in hours (30 days = 720 hours default)
// Competitors shift seasonally; Places API is fast/cheap so shorter TTL is fine
const CACHE_TTL_HOURS = parseInt(
  process.env.COMPETITOR_CACHE_TTL_HOURS || "720",
  10
);

interface CachedCompetitor {
  placeId: string;
  name: string;
  address?: string;
  category?: string;
  primaryType?: string;
  types?: string[];
  totalScore?: number;
  reviewsCount?: number;
}

interface CompetitorCacheEntry {
  id: number;
  cache_key: string;
  specialty: string;
  location: string;
  competitors: CachedCompetitor[];
  competitor_count: number;
  created_at: Date;
  expires_at: Date;
}

/**
 * Generate a cache key from specialty and location
 */
export function generateCacheKey(specialty: string, location: string): string {
  // Normalize: lowercase, trim, remove extra spaces
  const normalizedSpecialty = specialty
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
  const normalizedLocation = location.toLowerCase().trim().replace(/\s+/g, " ");
  return `${normalizedSpecialty}:${normalizedLocation}`;
}

/**
 * Log helper
 */
function log(message: string): void {
  logger.info(`[COMPETITOR-CACHE] ${message}`);
}

/**
 * Check if cache table exists, create if not
 */
async function ensureCacheTable(): Promise<void> {
  const tableExists = await db.schema.hasTable("competitor_cache");
  if (!tableExists) {
    log("Creating competitor_cache table...");
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
    log("competitor_cache table created");
  }
}

/**
 * Get cached competitors for a specialty+location combination
 * Returns null if no valid cache exists
 */
export async function getCachedCompetitors(
  specialty: string,
  location: string
): Promise<CachedCompetitor[] | null> {
  try {
    await ensureCacheTable();

    const cacheKey = generateCacheKey(specialty, location);
    const now = new Date();

    const cacheEntry = await db("competitor_cache")
      .where({ cache_key: cacheKey })
      .where("expires_at", ">", now)
      .first();

    if (!cacheEntry) {
      log(`Cache miss for ${cacheKey}`);
      return null;
    }

    // Parse competitors JSON
    const competitors =
      typeof cacheEntry.competitors === "string"
        ? JSON.parse(cacheEntry.competitors)
        : cacheEntry.competitors;

    const hoursRemaining = Math.round(
      (new Date(cacheEntry.expires_at).getTime() - now.getTime()) /
        (1000 * 60 * 60)
    );

    log(
      `Cache hit for ${cacheKey}: ${competitors.length} competitors, expires in ${hoursRemaining}h`
    );
    return competitors;
  } catch (error: any) {
    log(`Error getting cached competitors: ${error.message}`);
    return null;
  }
}

/**
 * Store competitors in cache
 */
export async function setCachedCompetitors(
  specialty: string,
  location: string,
  competitors: CachedCompetitor[]
): Promise<void> {
  try {
    await ensureCacheTable();

    const cacheKey = generateCacheKey(specialty, location);
    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + CACHE_TTL_HOURS * 60 * 60 * 1000
    );

    // Upsert: update if exists, insert if not
    await db("competitor_cache")
      .insert({
        cache_key: cacheKey,
        specialty: specialty.toLowerCase().trim(),
        location: location.toLowerCase().trim(),
        competitors: JSON.stringify(competitors),
        competitor_count: competitors.length,
        created_at: now,
        expires_at: expiresAt,
      })
      .onConflict("cache_key")
      .merge({
        competitors: JSON.stringify(competitors),
        competitor_count: competitors.length,
        created_at: now,
        expires_at: expiresAt,
      });

    log(
      `Cached ${competitors.length} competitors for ${cacheKey}, expires in ${CACHE_TTL_HOURS}h`
    );
  } catch (error: any) {
    log(`Error caching competitors: ${error.message}`);
    // Don't throw - caching failure shouldn't break the analysis
  }
}

/**
 * Invalidate cache for a specialty+location combination
 */
export async function invalidateCache(
  specialty: string,
  location: string
): Promise<boolean> {
  try {
    await ensureCacheTable();

    const cacheKey = generateCacheKey(specialty, location);
    const deleted = await db("competitor_cache")
      .where({ cache_key: cacheKey })
      .del();

    log(
      `Invalidated cache for ${cacheKey}: ${
        deleted > 0 ? "found and deleted" : "not found"
      }`
    );
    return deleted > 0;
  } catch (error: any) {
    log(`Error invalidating cache: ${error.message}`);
    return false;
  }
}

/**
 * Clean up expired cache entries
 */
export async function cleanupExpiredCache(): Promise<number> {
  try {
    await ensureCacheTable();

    const deleted = await db("competitor_cache")
      .where("expires_at", "<", new Date())
      .del();

    if (deleted > 0) {
      log(`Cleaned up ${deleted} expired cache entries`);
    }
    return deleted;
  } catch (error: any) {
    log(`Error cleaning up cache: ${error.message}`);
    return 0;
  }
}

/**
 * Get cache statistics
 */
export async function getCacheStats(): Promise<{
  totalEntries: number;
  expiredEntries: number;
  activeEntries: number;
  oldestEntry: Date | null;
  newestEntry: Date | null;
}> {
  try {
    await ensureCacheTable();

    const now = new Date();

    const [totalResult] = await db("competitor_cache").count("* as count");
    const [expiredResult] = await db("competitor_cache")
      .where("expires_at", "<", now)
      .count("* as count");
    const [oldestResult] = await db("competitor_cache")
      .orderBy("created_at", "asc")
      .limit(1)
      .select("created_at");
    const [newestResult] = await db("competitor_cache")
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
  } catch (error: any) {
    log(`Error getting cache stats: ${error.message}`);
    return {
      totalEntries: 0,
      expiredEntries: 0,
      activeEntries: 0,
      oldestEntry: null,
      newestEntry: null,
    };
  }
}

export default {
  getCachedCompetitors,
  setCachedCompetitors,
  invalidateCache,
  cleanupExpiredCache,
  getCacheStats,
  generateCacheKey,
};
