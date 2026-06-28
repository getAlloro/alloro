import { isMeaningfulSearchQuery, normalizeKeyword } from "./keywordNormalization";

export interface GscQueryEvidence {
  query: string;
  normalizedQuery: string;
  impressions: number;
  clicks: number;
  lastSeenAt: Date;
}

interface GscDayData {
  queries?: { rows?: unknown[] };
}

function readNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function readQuery(row: unknown): string | null {
  if (!row || typeof row !== "object") return null;
  const query = (row as { query?: unknown }).query;
  if (typeof query === "string" && query.trim()) return query;
  const keys = (row as { keys?: unknown }).keys;
  if (!Array.isArray(keys) || typeof keys[0] !== "string") return null;
  return keys[0];
}

export function extractGscQueries(
  days: Array<{ report_date: string; data: Record<string, unknown> }>,
): GscQueryEvidence[] {
  const byQuery = new Map<string, GscQueryEvidence>();
  for (const day of days) {
    const data = day.data as GscDayData;
    const rows = Array.isArray(data.queries?.rows) ? data.queries?.rows ?? [] : [];
    for (const row of rows) {
      const query = readQuery(row);
      if (!query || !isMeaningfulSearchQuery(query)) continue;
      const normalizedQuery = normalizeKeyword(query);
      const existing = byQuery.get(normalizedQuery);
      const impressions = readNumber((row as Record<string, unknown>).impressions);
      const clicks = readNumber((row as Record<string, unknown>).clicks);
      const lastSeenAt = new Date(day.report_date);
      if (existing) {
        existing.impressions += impressions;
        existing.clicks += clicks;
        if (lastSeenAt > existing.lastSeenAt) existing.lastSeenAt = lastSeenAt;
      } else {
        byQuery.set(normalizedQuery, {
          query,
          normalizedQuery,
          impressions,
          clicks,
          lastSeenAt,
        });
      }
    }
  }
  return Array.from(byQuery.values()).sort((a, b) => b.impressions - a.impressions);
}
