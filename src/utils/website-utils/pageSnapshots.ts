/**
 * Page Snapshots
 *
 * Snapshot-on-write support for the website editor versioning workflow.
 * Snapshots are regular rows in website_builder.pages with status "inactive"
 * at the same project_id + path — the same shape the version-history UI and
 * restore endpoints already consume.
 *
 * Rule: before a content write overwrites a page row, persist the
 * about-to-be-overwritten state iff it differs from the newest history entry
 * at that path (dedupe), then prune old snapshots beyond the retention cap.
 */

import { db } from "../../database/connection";

const PAGES_TABLE = "website_builder.pages";

/** Inactive rows kept per project+path beyond draft/published rows. */
const MAX_INACTIVE_SNAPSHOTS_PER_PATH = 20;

type SnapshotSourcePage = {
  id: string;
  project_id: string;
  path: string;
  sections: unknown;
  seo_data?: unknown;
  display_name?: string | null;
  template_page_id?: string | null;
  page_type?: string | null;
  change_source?: string | null;
  revision_note?: string | null;
};

/**
 * Stable string form of a sections payload for change comparison.
 * Sections arrive either as parsed JSONB (object/array) or as a JSON string
 * depending on the write path. A failed parse falls back to the raw string —
 * worst case we record one extra snapshot, never lose one.
 */
function sectionsComparisonKey(sections: unknown): string {
  if (typeof sections === "string") {
    try {
      return JSON.stringify(JSON.parse(sections));
    } catch {
      return sections;
    }
  }
  return JSON.stringify(sections ?? null);
}

function toJsonColumn(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    try {
      return JSON.stringify(JSON.parse(value));
    } catch {
      return null;
    }
  }
  return JSON.stringify(value);
}

/**
 * Persist `page`'s current state as an inactive history row, unless the
 * newest history entry (inactive or published) at the same path already
 * carries identical sections.
 *
 * Best-effort by design: a snapshot failure is logged loudly but never blocks
 * the save that triggered it — a user locked out of saving loses more work
 * than a single missing history entry.
 */
export async function snapshotPageStateIfChanged(
  page: SnapshotSourcePage
): Promise<void> {
  try {
    const newestHistory = await db(PAGES_TABLE)
      .where({ project_id: page.project_id, path: page.path })
      .whereNot("id", page.id)
      .whereIn("status", ["inactive", "published"])
      .orderBy("version", "desc")
      .first();

    const isUnchanged =
      newestHistory &&
      sectionsComparisonKey(newestHistory.sections) ===
        sectionsComparisonKey(page.sections);

    if (!isUnchanged) {
      const latestPage = await db(PAGES_TABLE)
        .where({ project_id: page.project_id, path: page.path })
        .orderBy("version", "desc")
        .first();

      const nextVersion = latestPage ? latestPage.version + 1 : 1;

      await db(PAGES_TABLE).insert({
        project_id: page.project_id,
        path: page.path,
        version: nextVersion,
        status: "inactive",
        sections: toJsonColumn(page.sections) ?? JSON.stringify([]),
        seo_data: toJsonColumn(page.seo_data),
        display_name: page.display_name || null,
        template_page_id: page.template_page_id || null,
        page_type: page.page_type || "sections",
        generation_status: "ready",
        // Provenance rides with the copied state — the source row was
        // stamped when its content was written (save/publish/restore).
        change_source: page.change_source || null,
        revision_note: page.revision_note || null,
      });

      console.log(
        `[Page Snapshots] ✓ Snapshot v${nextVersion} for page ${page.id} (${page.path})`
      );
    }

    await pruneInactiveSnapshots(page.project_id, page.path);
  } catch (error) {
    console.error(
      `[Page Snapshots] Failed to snapshot page ${page.id} (${page.path}) — save continues without history entry:`,
      error
    );
  }
}

/**
 * Delete the oldest inactive rows at project+path beyond the retention cap.
 * Draft and published rows are never touched.
 */
export async function pruneInactiveSnapshots(
  projectId: string,
  path: string
): Promise<void> {
  const staleRows = await db(PAGES_TABLE)
    .where({ project_id: projectId, path, status: "inactive" })
    .orderBy("version", "desc")
    .offset(MAX_INACTIVE_SNAPSHOTS_PER_PATH)
    .select("id");

  if (staleRows.length === 0) return;

  await db(PAGES_TABLE)
    .whereIn(
      "id",
      staleRows.map((row) => row.id)
    )
    .delete();

  console.log(
    `[Page Snapshots] Pruned ${staleRows.length} old snapshot(s) at ${path}`
  );
}
