/**
 * Post Importer — shared types
 *
 * The contract shared between the post-importer orchestrator
 * (service.post-importer.ts) and the per-entry handlers
 * (service.post-import-entries.ts). Lives in its own module so both can
 * import it without a circular dependency.
 *
 * Extracted from service.post-importer.ts (behavior-preserving). The public
 * names are re-exported from service.post-importer.ts so existing consumers
 * keep importing them from the same path.
 */

export type ImportPostType = "doctor" | "service" | "location";

export interface ImportEntryObject {
  source_url: string;
  name: string;
}

export interface ImportFromIdentityArgs {
  postType: ImportPostType;
  /**
   * For location: list of `place_id` strings.
   * For doctor/service: `{ source_url, name }` objects (or legacy bare-URL strings).
   */
  entries: Array<string | ImportEntryObject>;
  overwrite?: boolean;
}

export type ImportEntryStatus = "created" | "updated" | "skipped" | "failed";

export interface ImportEntryResult {
  /** Echo of the entry key (URL for doctor/service, place_id for location). */
  key: string;
  status: ImportEntryStatus;
  post_id?: string;
  /** Title we persisted (helps the UI render a friendly result row). */
  title?: string;
  /** Reason — populated for skipped + failed. */
  error?: string;
  /** True if the scrape ran via browser/screenshot fallback (admin should review). */
  used_fallback?: boolean;
}

export interface ImportResultSummary {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  results: ImportEntryResult[];
}

export interface ImportFromIdentityCallbacks {
  /** Optional progress hook — called after each entry settles. */
  onEntry?: (
    result: ImportEntryResult,
    progress: { completed: number; total: number },
  ) => Promise<void> | void;
}
