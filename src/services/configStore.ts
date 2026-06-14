/**
 * Config Store -- Editable business values, backed by system_config table.
 *
 * Every hardcoded business value that should be editable from the dashboard
 * lives here. Clean station, sharp knives.
 *
 * Pattern: getConfig("monthly_burn", 9500) reads from DB with fallback.
 * Cache: 60-second in-memory TTL. Reads are fast. Writes bust the cache.
 */

import { db } from "../database/connection";
import logger from "../lib/logger";

// ---- Cache ------------------------------------------------------------------

interface CacheEntry { value: any; expiresAt: number; }
const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 60_000;

function getCached(key: string): any | undefined {
  const e = cache.get(key);
  if (!e || Date.now() > e.expiresAt) { cache.delete(key); return undefined; }
  return e.value;
}

// ---- Public API -------------------------------------------------------------

export async function getConfig<T>(key: string, defaultValue: T): Promise<T> {
  const cached = getCached(key);
  if (cached !== undefined) return cached as T;
  try {
    const row = await db("system_config").where({ key }).first();
    if (row?.value != null) {
      const val = typeof row.value === "string" ? JSON.parse(row.value) : row.value;
      cache.set(key, { value: val, expiresAt: Date.now() + CACHE_TTL });
      return val as T;
    }
  } catch (err: any) {
    logger.warn({ detail: err.message }, `[ConfigStore] Read "${key}" failed:`);
  }
  return defaultValue;
}

export async function setConfig(key: string, value: any): Promise<void> {
  const existing = await db("system_config").where({ key }).first();
  if (existing) {
    await db("system_config").where({ key }).update({ value: JSON.stringify(value), updated_at: new Date() });
  } else {
    await db("system_config").insert({ key, value: JSON.stringify(value), updated_at: new Date() });
  }
  cache.delete(key);
}

export async function getAllConfig(): Promise<Record<string, any>> {
  try {
    const rows = await db("system_config").orderBy("key");
    const result: Record<string, any> = {};
    for (const row of rows) {
      result[row.key] = typeof row.value === "string" ? JSON.parse(row.value) : row.value;
    }
    return result;
  } catch { return {}; }
}

export async function deleteConfig(key: string): Promise<void> {
  await db("system_config").where({ key }).del();
  cache.delete(key);
}

// ---- Registry: every editable value documented ------------------------------

export interface ConfigDefinition {
  key: string;
  label: string;
  category: "financial" | "scoring" | "thresholds" | "marketing";
  description: string;
  defaultValue: any;
  type: "number" | "string" | "json";
  unit?: string;
}

export const CONFIG_REGISTRY: ConfigDefinition[] = [
  { key: "monthly_burn", label: "Monthly Burn Rate", category: "financial", description: "Fixed monthly operational costs.", defaultValue: 9500, type: "number", unit: "$/month" },
  { key: "org_monthly_rates", label: "Per-Client Monthly Rates", category: "financial", description: "Contracted rate per org ID. {\"5\": 2000, ...}", defaultValue: { 5: 2000, 6: 3500, 8: 1500, 21: 0, 25: 5000, 34: 0, 39: 1500, 42: 0 }, type: "json", unit: "$/month per org" },
  { key: "tier_pricing_dwy", label: "DWY Tier Price", category: "financial", description: "Monthly price for Clarity tier.", defaultValue: 997, type: "number", unit: "$/month" },
  { key: "tier_pricing_dfy", label: "DFY Tier Price", category: "financial", description: "Monthly price for Freedom tier.", defaultValue: 2497, type: "number", unit: "$/month" },
  { key: "clarity_score_strong", label: "Score: Strong Threshold", category: "scoring", description: "Score >= this = 'Strong first impression'", defaultValue: 80, type: "number" },
  { key: "clarity_score_solid", label: "Score: Solid Threshold", category: "scoring", description: "Score >= this = 'Solid foundation'", defaultValue: 60, type: "number" },
  { key: "clarity_score_grow", label: "Score: Room to Grow", category: "scoring", description: "Score >= this = 'Room to grow'", defaultValue: 40, type: "number" },
  { key: "cs_stalled_hours", label: "CS: Stalled Onboarding", category: "thresholds", description: "Hours before stalled onboarding triggers CS.", defaultValue: 48, type: "number", unit: "hours" },
  { key: "cs_trial_warning_days", label: "CS: Trial Warning", category: "thresholds", description: "Days before trial end to warn.", defaultValue: 7, type: "number", unit: "days" },
  { key: "health_red_days", label: "Health: Red Threshold", category: "thresholds", description: "Days without login before health goes red.", defaultValue: 14, type: "number", unit: "days" },
  { key: "health_amber_days", label: "Health: Amber Threshold", category: "thresholds", description: "Days without login before health goes amber.", defaultValue: 7, type: "number", unit: "days" },
  { key: "avg_case_value", label: "Default Case Value", category: "marketing", description: "Per-patient case value for economic modeling.", defaultValue: 1200, type: "number", unit: "$" },
];
