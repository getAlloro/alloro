/**
 * Controlled audit-action vocabulary for the OS knowledge base — not free
 * text. The activity feed and any later permission model rely on this closed
 * set; every consequential state change writes exactly one of these through
 * OsActivityModel (ported from alloro-os/backend/src/config/activityActions.ts,
 * trimmed to the P2 surface; later phases append — never repurpose — entries).
 */

export const OS_ACTIVITY_ACTIONS = [
  "document.created",
  "document.renamed",
  "document.meta_updated",
  "document.version_published",
  "document.reverted",
  "document.reindexed",
  "document.archived",
  "document.restored",
  "document.purge_requested",
  "document.purged",
  "lock.acquired",
  "lock.released",
  "folder.created",
  "folder.updated",
  "folder.deleted",
  "category.created",
  // P4 (plans/07042026-alloro-os-admin-port) — related-document link lifecycle.
  "link.accepted",
  "link.rejected",
] as const;

export type OsActivityAction = (typeof OS_ACTIVITY_ACTIONS)[number];

/** target_type vocabulary paired with the actions above. */
export const OS_ACTIVITY_TARGET_TYPES = [
  "document",
  "version",
  "folder",
  "category",
  "lock",
  // P4 — target of link.accepted / link.rejected (os.document_links.id).
  "link",
] as const;

export type OsActivityTargetType = (typeof OS_ACTIVITY_TARGET_TYPES)[number];
