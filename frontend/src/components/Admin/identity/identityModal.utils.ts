/**
 * IdentityModal — pure utilities
 *
 * Extracted verbatim from IdentityModal.tsx (no behavior change). These helpers
 * carry no React/hook state: constants, manual-input factories/validators,
 * identity-shape narrowers, GBP hours normalization, and small formatters.
 */

import type {
  ProjectIdentity,
  ProjectIdentityLocation,
  ManualBusinessInput,
  ManualLocationInput,
} from "../../../api/websites";
import { DAY_ORDER, type DayName, type GbpPeriod } from "./identityModal.types";

export const MANUAL_HOUR_DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

export function createManualLocation(isPrimary = false): ManualLocationInput {
  return {
    id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: "",
    address: "",
    city: "",
    state: "",
    zip: "",
    phone: "",
    websiteUrl: "",
    hours: {},
    isPrimary,
  };
}

export function emptyManualBusiness(): ManualBusinessInput {
  return {
    name: "",
    category: "",
    phone: "",
    websiteUrl: "",
  };
}

export function hasText(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export function hasManualHours(hours: ManualLocationInput["hours"]): boolean {
  return Object.values(hours || {}).some((value) => hasText(value));
}

export function isCompleteManualLocation(location: ManualLocationInput): boolean {
  return (
    hasText(location.name) &&
    hasText(location.address) &&
    hasText(location.city) &&
    hasText(location.state) &&
    hasText(location.zip) &&
    hasText(location.phone) &&
    hasManualHours(location.hours)
  );
}

export function isCompleteManualIdentity(
  business: ManualBusinessInput,
  locations: ManualLocationInput[],
): boolean {
  return (
    hasText(business.name) &&
    hasText(business.category) &&
    hasText(business.phone) &&
    locations.some(isCompleteManualLocation)
  );
}

/**
 * `identity.locations[]` isn't declared on ProjectIdentity yet (it's a JSONB
 * extension shipped in the identity-enrichments plan) — this helper narrows
 * the untyped lookup in one place so consumers don't reach for `as any`.
 */
export function readIdentityLocations(
  identity: ProjectIdentity,
): ProjectIdentityLocation[] {
  const raw = (identity as unknown as { locations?: unknown }).locations;
  return Array.isArray(raw) ? (raw as ProjectIdentityLocation[]) : [];
}

export function isManualIdentityLocation(location: ProjectIdentityLocation): boolean {
  return location.source === "manual" || !location.place_id;
}

export function getIdentityLocationKey(location: ProjectIdentityLocation): string {
  return (
    location.place_id ||
    location.id ||
    `${location.source || "location"}-${location.name}-${location.address || ""}`
  );
}

export function buildBusinessFromLocation(
  location: ProjectIdentityLocation,
  fallback?: ProjectIdentity["business"],
): ProjectIdentity["business"] {
  return {
    name: location.name || fallback?.name || null,
    category: location.category || fallback?.category || null,
    phone: location.phone || fallback?.phone || null,
    address: location.address || fallback?.address || null,
    city: location.city || fallback?.city || null,
    state: location.state || fallback?.state || null,
    zip: location.zip || fallback?.zip || null,
    hours: location.hours ?? fallback?.hours ?? null,
    rating: location.rating ?? null,
    review_count: location.review_count ?? null,
    website_url: location.website_url || fallback?.website_url || null,
    place_id: location.place_id || null,
  };
}

/**
 * `sources_used.urls[].url` shape drift: older identities store a bare
 * string, newer ones wrap it as `{url: string, strategy: string}`. Narrow
 * to a trimmed string either way.
 */
export function extractSourceUrlString(entry: unknown): string {
  if (!entry || typeof entry !== "object") return "";
  const raw = (entry as { url?: unknown }).url;
  if (typeof raw === "string") return raw.trim();
  if (raw && typeof raw === "object") {
    const inner = (raw as { url?: unknown }).url;
    if (typeof inner === "string") return inner.trim();
  }
  return "";
}

// GBP periods[] uses 0=Sunday. Map to our Monday-first labels.
export const WEEKDAY_INDEX_TO_NAME: Record<number, DayName> = {
  0: "Sunday",
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
};

export function normalizeHours(raw: unknown): Array<{ day: DayName; text: string }> {
  const empty: Array<{ day: DayName; text: string }> = [];
  if (!raw) return empty;

  // Shape A: array of display strings — e.g. ["Monday: 9:00 AM – 5:00 PM", ...]
  if (Array.isArray(raw) && raw.every((r) => typeof r === "string")) {
    const byDay = new Map<DayName, string>();
    for (const line of raw as string[]) {
      const match = line.match(/^\s*(Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*\s*[:\-–]\s*(.+?)\s*$/i);
      if (!match) continue;
      const prefix = match[1].toLowerCase().slice(0, 3);
      const day = DAY_ORDER.find((d) => d.toLowerCase().startsWith(prefix));
      if (!day) continue;
      byDay.set(day, match[2].trim());
    }
    if (byDay.size > 0) {
      return DAY_ORDER.map((day) => ({ day, text: byDay.get(day) || "Closed" }));
    }
  }

  // Shape B: openingHours object with weekdayDescriptions: string[]
  if (typeof raw === "object" && raw !== null) {
    const obj = raw as Record<string, unknown>;
    const descriptions = obj.weekdayDescriptions;
    if (Array.isArray(descriptions) && descriptions.every((d) => typeof d === "string")) {
      return normalizeHours(descriptions);
    }

    // Shape C: openingHours.periods[] — [{open:{day,hour,minute}, close:{...}}]
    const periods = obj.periods;
    if (Array.isArray(periods)) {
      const byDay = new Map<DayName, string[]>();
      for (const p of periods as GbpPeriod[]) {
        const open = p?.open;
        const close = p?.close;
        if (!open || typeof open !== "object") continue;
        const dayIdx = typeof open.day === "number" ? open.day : -1;
        const day = WEEKDAY_INDEX_TO_NAME[dayIdx];
        if (!day) continue;
        const openStr = formatPeriodTime(open.hour, open.minute);
        const closeStr = close ? formatPeriodTime(close.hour, close.minute) : null;
        const range = closeStr ? `${openStr} – ${closeStr}` : `${openStr} (open 24h)`;
        const existing = byDay.get(day) || [];
        existing.push(range);
        byDay.set(day, existing);
      }
      if (byDay.size > 0) {
        return DAY_ORDER.map((day) => ({
          day,
          text: (byDay.get(day) || []).join(", ") || "Closed",
        }));
      }
    }
  }

  return empty;
}

export function formatPeriodTime(hour: unknown, minute: unknown): string {
  const h = typeof hour === "number" ? hour : 0;
  const m = typeof minute === "number" ? minute : 0;
  const suffix = h >= 12 ? "PM" : "AM";
  const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
  const mm = m.toString().padStart(2, "0");
  return `${displayH}:${mm} ${suffix}`;
}

/** Format an ISO timestamp as a compact relative string (e.g. "3h ago"). */
export function humanizeTimestamp(iso: string | null | undefined): string {
  if (!iso) return "never";
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return "never";
  const diffMs = Date.now() - ts;
  if (diffMs < 0) return "just now";
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.round(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  const yr = Math.round(mo / 12);
  return `${yr}y ago`;
}

/** Find the most-recent `last_synced_at` across a list, or null if empty. */
export function mostRecentSync(entries: Array<{ last_synced_at?: string }>): string | null {
  const valid = entries
    .map((e) => (e.last_synced_at ? Date.parse(e.last_synced_at) : NaN))
    .filter((n) => !Number.isNaN(n));
  if (valid.length === 0) return null;
  return new Date(Math.max(...valid)).toISOString();
}

/**
 * Validate a URL string via native `new URL()`. Returns the trimmed URL on
 * success, or throws with a human-readable message.
 */
export function validateUrlOrThrow(raw: string, label = "URL"): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  try {
    // Throws TypeError on invalid URLs.
    new URL(trimmed);
    return trimmed;
  } catch {
    throw new Error(`${label} is not a valid URL`);
  }
}

/**
 * Merge semantics per Dave: placeholder shows current value. Empty input =
 * no change (returns current). Non-empty = new value. Explicit null clear is
 * only reachable via the raw JSON editor, not this UI.
 */
export function mergeField(
  nextRaw: string,
  current: string | null | undefined,
): string | null {
  const trimmed = nextRaw.trim();
  if (!trimmed) return (current ?? null) as string | null;
  return trimmed;
}
