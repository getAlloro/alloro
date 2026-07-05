import { format, formatDistanceToNowStrict } from "date-fns";
import type { OsDocumentOwner } from "../../../../api/admin-os";

/**
 * Formatting helpers shared across the OS knowledge base surfaces
 * (plans/07042026-alloro-os-admin-port P3). Pure functions only — timestamps
 * render in JetBrains Mono per the D13 design contract.
 */

/** "3h ago" — compact relative time for row meta. */
export function formatOsRelativeTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `${formatDistanceToNowStrict(date)} ago`;
}

/** "12:03" — the autosave stamp ("Saved · 12:03"). */
export function formatOsClockTime(date: Date): string {
  return format(date, "HH:mm");
}

/** "Jul 4, 2026 · 12:03" — full timestamps (version history). */
export function formatOsDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return format(date, "MMM d, yyyy · HH:mm");
}

/** Owner display: name, else email, else empty. */
export function osOwnerLabel(owner: OsDocumentOwner | null): string {
  if (!owner) return "";
  return owner.name || owner.email || "";
}

/**
 * Heading slug — mirrors the backend's osSlug.slugify verbatim so the
 * reading-view anchor ids line up with version.toc_json slugs.
 */
export function slugifyOsHeading(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
