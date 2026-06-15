/**
 * ImportFromIdentityModal — T9 + F4
 *
 * Modal launched from the Posts tab when the active post type is `doctor`,
 * `service`, or `location`. Lets the admin tick which identity entries to
 * turn into draft posts, fires the BullMQ job via `startPostImport`, and
 * polls `fetchPostImportStatus` until the job completes (or fails).
 *
 * Interaction model:
 *   - Each entry is either a plain checkbox (not yet imported) or an
 *     "Already imported — overwrite" toggle (already imported, will be
 *     re-fetched + updated when toggled on).
 *   - Footer button label reflects current selection count.
 *   - On import start: switch to a results view that streams per-entry
 *     status as it lands.
 *   - On failed entries: a Retry button kicks off a single-entry import.
 *
 * No new toast wrappers — uses the shared `lib/toast` helpers used by other
 * admin modals (AddLocationModal etc).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  X,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Loader2,
  ExternalLink,
  Download,
  RefreshCcw,
  MapPin,
} from "lucide-react";
import {
  startPostImport,
  fetchPostImportStatus,
  type ImportPostType,
  type ProjectIdentity,
  type ProjectIdentityListEntry,
  type ProjectIdentityLocation,
  type PostImportEntryResult,
  type PostImportProgress,
  type PostImportResultSummary,
} from "../../../api/websites";
import { showSuccessToast, showErrorToast, showInfoToast } from "../../../lib/toast";
import { logger } from "../../../lib/logger";
import { getErrorMessage } from "../../../lib/errorMessage";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ImportFromIdentityModalProps {
  projectId: string;
  /** Discriminator for which identity list to render. */
  postType: ImportPostType;
  /** Live identity blob — the modal reads doctors / services / locations from here. */
  identity: ProjectIdentity | null;
  /**
   * Set of `source_url` values already attached to existing posts of this
   * post type. Used to flip rows from "checkbox" to "overwrite toggle".
   * For locations the `place_id` is the dedup key (it's stored in source_url).
   */
  existingSourceUrls: Set<string>;
  onClose: () => void;
  /** Called after the import job reports a final state. */
  onCompleted: (summary: PostImportResultSummary) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 1500;

function feSlugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function pluralLabel(postType: ImportPostType): string {
  switch (postType) {
    case "doctor":
      return "Doctors";
    case "service":
      return "Services";
    case "location":
      return "Locations";
  }
}

function formatRelativeTime(iso?: string | null): string {
  if (!iso) return "—";
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return "—";
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  return `${days}d ago`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ImportFromIdentityModal({
  projectId,
  postType,
  identity,
  existingSourceUrls,
  onClose,
  onCompleted,
}: ImportFromIdentityModalProps) {
  // Build the entry list once per identity change. Each entry carries a
  // stable `key` (URL or place_id) we use everywhere — selection map, results
  // map, and the Set lookup against `existingSourceUrls`.
  const allEntries: Array<{
    key: string;
    sourceUrl: string;
    name: string;
    title: string;
    subtitle: string;
    metaPills: Array<{ label: string; tone: "default" | "primary" | "warn" }>;
    last_synced_at?: string;
    alreadyImported: boolean;
  }> = useMemo(() => {
    if (!identity) return [];
    if (postType === "location") {
      const list: ProjectIdentityLocation[] = Array.isArray(identity.locations)
        ? identity.locations
        : [];
      return list.filter((loc) => !!loc.place_id).map((loc) => {
        const placeId = loc.place_id as string;
        const pills: Array<{
          label: string;
          tone: "default" | "primary" | "warn";
        }> = [];
        if (loc.is_primary) pills.push({ label: "Primary", tone: "primary" });
        if (loc.warmup_status === "failed")
          pills.push({ label: "Scrape failed", tone: "warn" });
        if (loc.stale) pills.push({ label: "Stale", tone: "warn" });
        return {
          key: placeId,
          sourceUrl: placeId,
          name: loc.name || "Untitled location",
          title: loc.name || "Untitled location",
          subtitle: loc.address || "No address on file",
          metaPills: pills,
          last_synced_at: loc.last_synced_at,
          alreadyImported: existingSourceUrls.has(placeId),
        };
      });
    }

    // doctor / service — composite key: source_url#slugified-name
    const list: ProjectIdentityListEntry[] =
      postType === "doctor"
        ? identity.content_essentials?.doctors || []
        : identity.content_essentials?.services || [];
    return list
      .filter((e) => e?.source_url)
      .map((e) => {
        const entryName = e.name || "(unnamed)";
        const compositeKey = `${e.source_url}#${feSlugify(entryName)}`;
        const pills: Array<{
          label: string;
          tone: "default" | "primary" | "warn";
        }> = [];
        if (e.stale) pills.push({ label: "Stale", tone: "warn" });
        return {
          key: compositeKey,
          sourceUrl: e.source_url as string,
          name: entryName,
          title: entryName,
          subtitle: e.short_blurb || e.source_url || "",
          metaPills: pills,
          last_synced_at: e.last_synced_at,
          alreadyImported: existingSourceUrls.has(compositeKey),
        };
      });
  }, [identity, postType, existingSourceUrls]);

  // Selection state. For "fresh" rows it's a regular checkbox; for "already
  // imported" rows it's the overwrite toggle (off by default).
  const [selectedFresh, setSelectedFresh] = useState<Set<string>>(new Set());
  const [overwriteSelected, setOverwriteSelected] = useState<Set<string>>(
    new Set(),
  );

  // Polling state
  const [view, setView] = useState<"select" | "running">("select");
  const [jobId, setJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState<PostImportProgress | null>(null);
  const [summary, setSummary] = useState<PostImportResultSummary | null>(null);
  const [jobFailedReason, setJobFailedReason] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<Record<string, boolean>>({});
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const totalSelected = selectedFresh.size + overwriteSelected.size;

  const toggleFresh = (key: string) => {
    setSelectedFresh((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const toggleOverwrite = (key: string) => {
    setOverwriteSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // The backend wants two separate calls when both fresh and overwrite-yes
  // entries are queued (one with overwrite=false, one with overwrite=true).
  // We collapse this by making two sequential job enqueues, but we render
  // one results panel by waiting on both.
  const startImport = async () => {
    if (totalSelected === 0) return;

    // We support a single combined job by sending overwrite=true ONLY when the
    // user explicitly opted into overwrite. To preserve the "fresh entries
    // create + duplicate entries skip" semantics, we make TWO calls when both
    // bins have selections: one with overwrite=false (fresh), one with
    // overwrite=true (overwrite bin). Empirically simplest, no backend change.
    try {
      const isLocation = postType === "location";
      const entryMap = new Map(allEntries.map((e) => [e.key, e]));
      const resolveEntries = (keys: Set<string>) =>
        Array.from(keys).map((k) => {
          if (isLocation) return k;
          const found = entryMap.get(k);
          return found
            ? { source_url: found.sourceUrl, name: found.name }
            : k;
        });

      let primaryJobId: string | null = null;
      let secondaryJobId: string | null = null;

      if (selectedFresh.size > 0) {
        const freshRes = await startPostImport(projectId, {
          postType,
          entries: resolveEntries(selectedFresh),
          overwrite: false,
        });
        primaryJobId = freshRes.data.jobId;
      }
      if (overwriteSelected.size > 0) {
        const overwriteRes = await startPostImport(projectId, {
          postType,
          entries: resolveEntries(overwriteSelected),
          overwrite: true,
        });
        if (!primaryJobId) primaryJobId = overwriteRes.data.jobId;
        else secondaryJobId = overwriteRes.data.jobId;
      }

      if (!primaryJobId) {
        throw new Error("No import job was created.");
      }

      setJobId(primaryJobId);
      setView("running");
      showInfoToast(
        "Import started",
        `${totalSelected} ${pluralLabel(postType).toLowerCase()} queued. We'll let you know when it's done.`,
      );

      pollRef.current = setInterval(async () => {
        try {
          const main = await fetchPostImportStatus(projectId, primaryJobId!);
          let mergedProgress = main.data.progress;
          let mergedSummary = main.data.summary;
          let combinedFailed = main.data.failedReason;

          if (secondaryJobId) {
            const second = await fetchPostImportStatus(projectId, secondaryJobId);
            mergedProgress = mergeProgress(mergedProgress, second.data.progress);
            mergedSummary = mergeSummary(mergedSummary, second.data.summary);
            combinedFailed = combinedFailed || second.data.failedReason;
          }

          setProgress(mergedProgress);
          setJobFailedReason(combinedFailed || null);

          const mainDone =
            main.data.state === "completed" || main.data.state === "failed";
          const secondDone = secondaryJobId
            ? false // we re-poll below
            : true;

          // Recompute secondary completion
          let secondReallyDone = secondDone;
          if (secondaryJobId) {
            const second = await fetchPostImportStatus(projectId, secondaryJobId);
            secondReallyDone =
              second.data.state === "completed" ||
              second.data.state === "failed";
          }

          if (mainDone && secondReallyDone) {
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;

            const finalSummary: PostImportResultSummary =
              mergedSummary || summarizeFromResults(mergedProgress.results);
            setSummary(finalSummary);
            onCompleted(finalSummary);

            const totalCreated = finalSummary.created + finalSummary.updated;
            if (finalSummary.failed > 0) {
              showErrorToast(
                "Import finished with errors",
                `${totalCreated} processed, ${finalSummary.failed} failed.`,
              );
            } else {
              showSuccessToast(
                "Import complete",
                `${totalCreated} ${pluralLabel(postType).toLowerCase()} ready.`,
              );
            }
          }
        } catch (err: unknown) {
          // A transient poll failure shouldn't kill the whole flow — log it.
          logger.error("[ImportFromIdentityModal] poll error", err);
        }
      }, POLL_INTERVAL_MS);
    } catch (err: unknown) {
      const msg = getErrorMessage(err) || "Failed to start import";
      showErrorToast("Import failed to start", msg);
    }
  };

  const retryEntry = async (entry: PostImportEntryResult) => {
    setRetrying((m) => ({ ...m, [entry.key]: true }));
    try {
      const found = allEntries.find((e) => e.key === entry.key);
      const retryEntries: Array<string | { source_url: string; name: string }> =
        isLocation || !found
          ? [entry.key]
          : [{ source_url: found.sourceUrl, name: found.name }];
      const res = await startPostImport(projectId, {
        postType,
        entries: retryEntries,
        overwrite: false,
      });
      // Poll briefly until this single-entry job lands, then merge into summary.
      const singleJobId = res.data.jobId;
      const settled = await pollUntilDone(
        projectId,
        singleJobId,
        POLL_INTERVAL_MS,
      );
      const last = settled.summary?.results?.[0];
      if (last) {
        setSummary((cur) => {
          const base =
            cur ||
            (progress ? summarizeFromResults(progress.results) : EMPTY_SUMMARY);
          const nextResults = base.results.map((r) =>
            r.key === entry.key ? last : r,
          );
          // If retry inserted a new key (shouldn't normally), append.
          if (!nextResults.some((r) => r.key === entry.key)) {
            nextResults.push(last);
          }
          return summarizeFromResults(nextResults);
        });
        if (last.status === "created" || last.status === "updated") {
          showSuccessToast("Retry succeeded", last.title || entry.key);
        } else {
          showErrorToast(
            "Retry failed",
            last.error || `Status: ${last.status}`,
          );
        }
      }
    } catch (err: unknown) {
      showErrorToast("Retry failed", getErrorMessage(err) || "Unknown error");
    } finally {
      setRetrying((m) => ({ ...m, [entry.key]: false }));
    }
  };

  const isLocation = postType === "location";

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto">
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        onClick={view === "running" ? undefined : onClose}
      />
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative w-full max-w-2xl rounded-2xl bg-white shadow-2xl">
          {/* Header */}
          <div className="flex items-start justify-between border-b border-gray-100 px-6 py-4">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-orange-50 p-2">
                {isLocation ? (
                  <MapPin className="h-5 w-5 text-alloro-orange" />
                ) : (
                  <Download className="h-5 w-5 text-alloro-orange" />
                )}
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900">
                  Import {pluralLabel(postType)} from Identity
                </h2>
                <p className="mt-0.5 text-xs text-gray-500">
                  {isLocation
                    ? "Pick which locations to import. Content is built from the structured GBP data — no scraping needed."
                    : `Pick which ${pluralLabel(
                        postType,
                      ).toLowerCase()} to import. We'll fetch each page, download images, and create draft posts.`}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition"
              title="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Body */}
          {view === "select" ? (
            <div className="max-h-[60vh] overflow-y-auto px-6 py-4">
              {allEntries.length === 0 ? (
                <div className="py-12 text-center text-sm text-gray-500">
                  No {pluralLabel(postType).toLowerCase()} are tracked in
                  identity yet.{" "}
                  {!isLocation
                    ? "Run identity warmup or add them manually before importing."
                    : "Add a location from the Identity modal first."}
                </div>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {allEntries.map((entry) => {
                    const isAlready = entry.alreadyImported;
                    const isChecked = isAlready
                      ? overwriteSelected.has(entry.key)
                      : selectedFresh.has(entry.key);
                    return (
                      <li
                        key={entry.key}
                        className="flex items-start gap-3 py-3"
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() =>
                            isAlready
                              ? toggleOverwrite(entry.key)
                              : toggleFresh(entry.key)
                          }
                          className="mt-1 h-4 w-4 rounded border-gray-300 text-alloro-orange focus:ring-alloro-orange"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold text-gray-900">
                              {entry.title}
                            </span>
                            {entry.metaPills.map((p) => (
                              <span
                                key={p.label}
                                className={
                                  "rounded-full px-2 py-0.5 text-[10px] font-semibold " +
                                  (p.tone === "primary"
                                    ? "bg-orange-100 text-orange-700"
                                    : p.tone === "warn"
                                      ? "bg-yellow-100 text-yellow-700"
                                      : "bg-gray-100 text-gray-600")
                                }
                              >
                                {p.label}
                              </span>
                            ))}
                            {isAlready && (
                              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                                Already imported — overwrite
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 truncate text-xs text-gray-500">
                            {entry.subtitle}
                          </div>
                          <div className="mt-1 flex items-center gap-3 text-[11px] text-gray-400">
                            <span>
                              Last synced{" "}
                              {formatRelativeTime(entry.last_synced_at)}
                            </span>
                            {!isLocation && entry.sourceUrl && (
                              <a
                                href={entry.sourceUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-0.5 hover:text-gray-600"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <ExternalLink className="h-3 w-3" />
                                source
                              </a>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ) : (
            <RunningView
              progress={progress}
              summary={summary}
              jobFailedReason={jobFailedReason}
              postType={postType}
              onRetry={retryEntry}
              retrying={retrying}
            />
          )}

          {/* Footer */}
          <div className="flex items-center justify-between gap-2 border-t border-gray-100 px-6 py-4">
            {view === "select" ? (
              <>
                <div className="text-xs text-gray-500">
                  {selectedFresh.size > 0 && (
                    <span>{selectedFresh.size} new</span>
                  )}
                  {selectedFresh.size > 0 && overwriteSelected.size > 0 && (
                    <span> · </span>
                  )}
                  {overwriteSelected.size > 0 && (
                    <span>{overwriteSelected.size} overwrite</span>
                  )}
                  {totalSelected === 0 && <span>Nothing selected</span>}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={onClose}
                    className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={startImport}
                    disabled={totalSelected === 0}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-alloro-orange px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
                  >
                    Import {totalSelected || ""} selected
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="text-xs text-gray-500">
                  {summary
                    ? `Done — ${summary.created + summary.updated} processed, ${summary.skipped} skipped, ${summary.failed} failed.`
                    : `Importing… ${progress?.completed ?? 0} / ${progress?.total ?? 0}`}
                </div>
                <button
                  onClick={onClose}
                  disabled={!summary && !jobFailedReason}
                  className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-black disabled:opacity-50"
                >
                  {summary || jobFailedReason ? "Close" : "Working…"}
                </button>
              </>
            )}
          </div>

          {jobId && (
            <div className="border-t border-gray-100 px-6 py-2 text-[10px] text-gray-400">
              Job <code>{jobId}</code>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-views + utilities
// ---------------------------------------------------------------------------

const EMPTY_SUMMARY: PostImportResultSummary = {
  total: 0,
  created: 0,
  updated: 0,
  skipped: 0,
  failed: 0,
  results: [],
};

function summarizeFromResults(
  results: PostImportEntryResult[],
): PostImportResultSummary {
  return {
    total: results.length,
    created: results.filter((r) => r.status === "created").length,
    updated: results.filter((r) => r.status === "updated").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    failed: results.filter((r) => r.status === "failed").length,
    results,
  };
}

function mergeProgress(
  a: PostImportProgress,
  b: PostImportProgress,
): PostImportProgress {
  const map = new Map<string, PostImportEntryResult>();
  for (const r of a.results || []) map.set(r.key, r);
  for (const r of b.results || []) map.set(r.key, r);
  return {
    total: (a.total || 0) + (b.total || 0),
    completed: (a.completed || 0) + (b.completed || 0),
    results: Array.from(map.values()),
  };
}

function mergeSummary(
  a: PostImportResultSummary | null,
  b: PostImportResultSummary | null,
): PostImportResultSummary | null {
  if (!a && !b) return null;
  const left = a || EMPTY_SUMMARY;
  const right = b || EMPTY_SUMMARY;
  const map = new Map<string, PostImportEntryResult>();
  for (const r of left.results) map.set(r.key, r);
  for (const r of right.results) map.set(r.key, r);
  return summarizeFromResults(Array.from(map.values()));
}

async function pollUntilDone(
  projectId: string,
  jobId: string,
  intervalMs: number,
): Promise<{
  state: string;
  summary: PostImportResultSummary | null;
}> {
  // Cap at 5 minutes for a single retry so a stuck job doesn't hang the UI.
  const start = Date.now();
  while (Date.now() - start < 5 * 60_000) {
    const res = await fetchPostImportStatus(projectId, jobId);
    if (res.data.state === "completed" || res.data.state === "failed") {
      return { state: res.data.state, summary: res.data.summary };
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return { state: "stuck", summary: null };
}

function StatusIcon({ status }: { status: PostImportEntryResult["status"] }) {
  if (status === "created" || status === "updated")
    return <CheckCircle2 className="h-4 w-4 text-green-600" />;
  if (status === "skipped")
    return <AlertTriangle className="h-4 w-4 text-yellow-600" />;
  return <XCircle className="h-4 w-4 text-red-600" />;
}

function RunningView({
  progress,
  summary,
  jobFailedReason,
  postType,
  onRetry,
  retrying,
}: {
  progress: PostImportProgress | null;
  summary: PostImportResultSummary | null;
  jobFailedReason: string | null;
  postType: ImportPostType;
  onRetry: (entry: PostImportEntryResult) => void;
  retrying: Record<string, boolean>;
}) {
  const total = summary?.total ?? progress?.total ?? 0;
  const completed = summary?.total ?? progress?.completed ?? 0;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const results = summary?.results ?? progress?.results ?? [];

  return (
    <div className="max-h-[60vh] overflow-y-auto px-6 py-4">
      {!summary && (
        <div className="mb-4">
          <div className="mb-1 flex items-center justify-between text-xs text-gray-500">
            <span>Importing {pluralLabel(postType).toLowerCase()}…</span>
            <span>
              {completed} / {total}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-alloro-orange transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      {summary && (
        <div className="mb-4 grid grid-cols-4 gap-2 text-center">
          <Stat label="Created" value={summary.created} tone="green" />
          <Stat label="Updated" value={summary.updated} tone="blue" />
          <Stat label="Skipped" value={summary.skipped} tone="yellow" />
          <Stat label="Failed" value={summary.failed} tone="red" />
        </div>
      )}

      {jobFailedReason && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          Job failed at the queue level: {jobFailedReason}
        </div>
      )}

      {results.length === 0 ? (
        <div className="py-8 text-center text-xs text-gray-400">
          Waiting for the first entry to land…
        </div>
      ) : (
        <ul className="divide-y divide-gray-100">
          {results.map((r) => (
            <li key={r.key} className="flex items-start gap-2 py-2">
              <StatusIcon status={r.status} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-gray-900">
                    {r.title || r.key}
                  </span>
                  {r.used_fallback && (
                    <span className="rounded-full bg-yellow-100 px-1.5 py-0.5 text-[10px] font-semibold text-yellow-700">
                      fallback
                    </span>
                  )}
                  <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                    {titleCase(r.status)}
                  </span>
                </div>
                {r.error && (
                  <div className="mt-0.5 text-xs text-red-600">{r.error}</div>
                )}
                {!r.error && r.title && r.title !== r.key && (
                  <div className="mt-0.5 truncate text-xs text-gray-400">
                    {r.key}
                  </div>
                )}
              </div>
              {r.status === "failed" && (
                <button
                  type="button"
                  onClick={() => onRetry(r)}
                  disabled={!!retrying[r.key]}
                  className="inline-flex shrink-0 items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  {retrying[r.key] ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <RefreshCcw className="h-3 w-3" />
                  )}
                  Retry
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "green" | "blue" | "yellow" | "red";
}) {
  const toneClass =
    tone === "green"
      ? "text-green-700 bg-green-50"
      : tone === "blue"
        ? "text-blue-700 bg-blue-50"
        : tone === "yellow"
          ? "text-yellow-700 bg-yellow-50"
          : "text-red-700 bg-red-50";
  return (
    <div className={`rounded-lg p-2 ${toneClass}`}>
      <div className="text-lg font-bold">{value}</div>
      <div className="text-[10px] uppercase tracking-wide">{label}</div>
    </div>
  );
}
