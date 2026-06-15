/**
 * Websites API - project identity, identity lists + locations, post import,
 * identity slice patch
 *
 * Re-exported via the `src/api/websites.ts` barrel.
 */

import { adminFetch } from "../index";
import { API_BASE } from "./_shared";
import type {
  ProjectIdentity,
  ProjectIdentityListEntry,
  ProjectIdentityLocation,
  WarmupStatus,
} from "./_shared";

// =====================================================================
// PROJECT IDENTITY
// =====================================================================

export type ScrapeStrategy = "fetch" | "browser" | "screenshot";

export interface WarmupUrlInput {
  url: string;
  strategy?: ScrapeStrategy;
}

export type ManualHours = Record<string, string>;

export interface ManualBusinessInput {
  name: string;
  category: string;
  phone: string;
  websiteUrl?: string;
}

export interface ManualLocationInput {
  id?: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  websiteUrl?: string;
  hours: ManualHours;
  isPrimary?: boolean;
}

export interface WarmupInputs {
  /** Primary GBP place_id. When `placeIds` is present, primary should match its first entry. */
  placeId?: string;
  /** Full set of GBP place_ids (one per physical location). First is treated as primary. */
  placeIds?: string[];
  practiceSearchString?: string;
  /** String or object-with-strategy. Backend accepts both. */
  urls?: Array<string | WarmupUrlInput>;
  texts?: Array<{ label?: string; text: string }>;
  manualBusiness?: ManualBusinessInput;
  manualLocations?: ManualLocationInput[];
  logoUrl?: string;
  primaryColor?: string;
  accentColor?: string;
  gradient?: {
    enabled: boolean;
    from?: string;
    to?: string;
    direction?: string;
  };
}

/** Start the identity warmup for a project. */
export const startIdentityWarmup = async (
  projectId: string,
  inputs: WarmupInputs,
): Promise<{ success: boolean }> => {
  const response = await adminFetch(`${API_BASE}/${projectId}/identity/warmup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(inputs),
  });
  if (!response.ok) throw new Error(`Failed to start warmup: ${response.statusText}`);
  return response.json();
};

/** Fetch the full project identity. */
export const fetchIdentity = async (
  projectId: string,
): Promise<{ success: boolean; data: ProjectIdentity | null }> => {
  const response = await adminFetch(`${API_BASE}/${projectId}/identity`);
  if (!response.ok) throw new Error(`Failed to fetch identity: ${response.statusText}`);
  return response.json();
};

/** Poll warmup status (lightweight). */
export const fetchIdentityStatus = async (
  projectId: string,
): Promise<{
  success: boolean;
  data: { warmup_status: WarmupStatus; warmed_up_at: string | null };
}> => {
  const response = await adminFetch(`${API_BASE}/${projectId}/identity/status`);
  if (!response.ok) throw new Error(`Failed to fetch identity status: ${response.statusText}`);
  return response.json();
};

/** Replace identity with admin-edited JSON. */
export const updateIdentity = async (
  projectId: string,
  identity: ProjectIdentity,
): Promise<{ success: boolean; data: ProjectIdentity }> => {
  const response = await adminFetch(`${API_BASE}/${projectId}/identity`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identity }),
  });
  if (!response.ok) throw new Error(`Failed to update identity: ${response.statusText}`);
  return response.json();
};

// =====================================================================
// IDENTITY LISTS + LOCATIONS — T7 / F3
// Appended for plan
// `plans/04182026-no-ticket-identity-enrichments-and-post-imports/spec.md`.
// =====================================================================

export type IdentityListName = "doctors" | "services";

/**
 * Re-run extraction of the doctor/service list against the cached scraped
 * pages on identity. Returns the merged list (fresh entries first, then
 * carry-over entries marked `stale: true`).
 */
export const resyncProjectIdentityList = async (
  projectId: string,
  list: IdentityListName,
): Promise<{
  success: boolean;
  data: {
    list: IdentityListName;
    entries: ProjectIdentityListEntry[];
    refreshed_count: number;
    stale_count: number;
  };
}> => {
  const response = await adminFetch(
    `${API_BASE}/${projectId}/identity/resync-list`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ list }),
    },
  );
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || "Failed to resync identity list");
  }
  return response.json();
};

/**
 * Append a new GBP location to the project. Backend kicks off a targeted
 * Apify scrape for the place_id and returns the updated locations array.
 */
export const addProjectLocation = async (
  projectId: string,
  placeId: string,
): Promise<{
  success: boolean;
  data: {
    locations: ProjectIdentityLocation[];
    added: ProjectIdentityLocation;
  };
}> => {
  const response = await adminFetch(`${API_BASE}/${projectId}/locations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ place_id: placeId }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || "Failed to add location");
  }
  return response.json();
};

/**
 * Switch the project's primary location. Backend rewrites identity.business
 * from the new primary's data so existing consumers stay correct.
 */
export const setPrimaryLocation = async (
  projectId: string,
  placeId: string,
): Promise<{
  success: boolean;
  data: { identity: ProjectIdentity; primary_place_id: string };
}> => {
  const response = await adminFetch(`${API_BASE}/${projectId}/locations/primary`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ place_id: placeId }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || "Failed to set primary location");
  }
  return response.json();
};

/**
 * Remove a non-primary location. Returns 409 from the API if the location
 * is the project's primary.
 */
export const removeProjectLocation = async (
  projectId: string,
  placeId: string,
): Promise<{
  success: boolean;
  data: { locations: ProjectIdentityLocation[] };
}> => {
  const response = await adminFetch(
    `${API_BASE}/${projectId}/locations/${encodeURIComponent(placeId)}`,
    { method: "DELETE" },
  );
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || "Failed to remove location");
  }
  return response.json();
};

/** Re-scrape a single location's GBP data. */
export const resyncProjectLocation = async (
  projectId: string,
  placeId: string,
): Promise<{
  success: boolean;
  data: {
    location: ProjectIdentityLocation;
    locations: ProjectIdentityLocation[];
  };
}> => {
  const response = await adminFetch(
    `${API_BASE}/${projectId}/locations/${encodeURIComponent(placeId)}/resync`,
    { method: "POST" },
  );
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || "Failed to re-sync location");
  }
  return response.json();
};

// =====================================================================
// POST IMPORT FROM IDENTITY — T8 + F4
// =====================================================================
//
// Appended for plan
// `plans/04182026-no-ticket-identity-enrichments-and-post-imports/spec.md`
// tasks T8 + F4. Frontend posts a list of entries (URLs for doctor/service,
// place_ids for location) and polls the returned jobId for live status.

/** Post type that can be imported from the identity blob. */
export type ImportPostType = "doctor" | "service" | "location";

export type PostImportEntryStatus =
  | "created"
  | "updated"
  | "skipped"
  | "failed";

export interface PostImportEntryResult {
  /** Echoed entry key — URL for doctor/service, place_id for location. */
  key: string;
  status: PostImportEntryStatus;
  post_id?: string;
  title?: string;
  error?: string;
  /** True when the URL scrape needed the browser/screenshot fallback. */
  used_fallback?: boolean;
}

export interface PostImportResultSummary {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  results: PostImportEntryResult[];
}

export interface PostImportProgress {
  total: number;
  completed: number;
  results: PostImportEntryResult[];
}

export type PostImportJobState =
  | "waiting"
  | "active"
  | "completed"
  | "failed"
  | "delayed"
  | "paused"
  | "stuck"
  | "unknown";

export interface PostImportStatusResponse {
  success: boolean;
  data: {
    jobId: string;
    state: PostImportJobState;
    progress: PostImportProgress;
    summary: PostImportResultSummary | null;
    failedReason: string | null;
  };
}

/** Enqueue an import-from-identity job. Returns the BullMQ jobId. */
export const startPostImport = async (
  projectId: string,
  args: {
    postType: ImportPostType;
    entries: Array<string | { source_url: string; name: string }>;
    overwrite?: boolean;
  },
): Promise<{ success: boolean; data: { jobId: string; total: number } }> => {
  const response = await adminFetch(`${API_BASE}/${projectId}/posts/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || "Failed to start post import");
  }
  return response.json();
};

/** Poll job state + per-entry results for a running/finished post import. */
export const fetchPostImportStatus = async (
  projectId: string,
  jobId: string,
): Promise<PostImportStatusResponse> => {
  const response = await adminFetch(
    `${API_BASE}/${projectId}/posts/import/${jobId}`,
  );
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || "Failed to fetch post import status");
  }
  return response.json();
};

// =====================================================================
// IDENTITY SLICE PATCH
// =====================================================================
//
// Appended for plan
// `plans/04202026-no-ticket-identity-modal-cleanup-and-crud/spec.md` T3.
// Backend allow-list: `content_essentials.doctors`, `.services`,
// `.featured_testimonials`, `.core_values`, `.certifications`,
// `.service_areas`, `.social_links`, `.unique_value_proposition`,
// `.founding_story`, `.review_themes`, `locations`, `brand`,
// `voice_and_tone`. Everything else returns 400 `INVALID_PATH`.

/** Replace a single allow-listed slice of `project_identity`. */
export const patchIdentitySlice = async (
  projectId: string,
  path: string,
  value: unknown,
): Promise<{ success: boolean; data: ProjectIdentity }> => {
  const response = await adminFetch(
    `${API_BASE}/${projectId}/identity/slice`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, value }),
    },
  );
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      error.message || `Failed to patch identity slice: ${response.statusText}`,
    );
  }
  return response.json();
};
