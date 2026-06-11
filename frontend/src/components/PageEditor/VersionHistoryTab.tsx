import { useState, useEffect, useCallback } from "react";
import { Clock, Eye, RotateCcw, CheckCircle, FileEdit, Archive } from "lucide-react";
import { toast } from "react-hot-toast";
import { apiGet } from "../../api";
import type { SectionDiffEntry } from "../../utils/sectionDiff";

export interface PageVersion {
  id: string;
  version: number;
  status: "draft" | "published" | "inactive";
  created_at: string;
  updated_at: string;
  change_source?: string | null;
  revision_note?: string | null;
}

const SOURCE_LABELS: Record<string, string> = {
  save: "Saved",
  publish: "Published",
  restore: "Restored",
  "restore-section": "Section restore",
  "find-replace": "Find & replace",
};

interface Props {
  pageId: string | null;
  onPreview: (version: PageVersion) => void;
  onRestore: (versionId: string) => Promise<void>;
  isPreviewMode: boolean;
  previewVersionId: string | null;
  onExitPreview: () => void;
  /** Override the version list source (defaults to the user-website endpoint). */
  fetchVersions?: (pageId: string) => Promise<PageVersion[]>;
  /** Allow restoring published rows too (admin restores into the draft). */
  allowRestorePublished?: boolean;
  /** Per-section diff vs the current draft for the previewed version. */
  previewDiff?: SectionDiffEntry[] | null;
  /** Restore a single section from the previewed version into the draft. */
  onRestoreSection?: (name: string) => void;
}

const STATUS_CONFIG: Record<
  string,
  { label: string; icon: typeof FileEdit; color: string }
> = {
  draft: {
    label: "Draft",
    icon: FileEdit,
    color: "text-blue-600 bg-blue-50 border-blue-200",
  },
  published: {
    label: "Live",
    icon: CheckCircle,
    color: "text-green-600 bg-green-50 border-green-200",
  },
  inactive: {
    label: "Archived",
    icon: Archive,
    color: "text-gray-500 bg-gray-50 border-gray-200",
  },
};

export default function VersionHistoryTab({
  pageId,
  onPreview,
  onRestore,
  isPreviewMode,
  previewVersionId,
  onExitPreview,
  fetchVersions,
  allowRestorePublished = false,
  previewDiff,
  onRestoreSection,
}: Props) {
  const [versions, setVersions] = useState<PageVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState<string | null>(null);

  const loadVersions = useCallback(async () => {
    if (!pageId) return;
    try {
      setLoading(true);
      if (fetchVersions) {
        setVersions(await fetchVersions(pageId));
      } else {
        const res = await apiGet({
          path: `/user/website/pages/${pageId}/versions`,
        });
        setVersions(res.data?.versions || []);
      }
    } catch {
      toast.error("Failed to load version history");
    } finally {
      setLoading(false);
    }
  }, [pageId, fetchVersions]);

  useEffect(() => {
    loadVersions();
  }, [loadVersions]);

  const handleRestore = async (versionId: string) => {
    try {
      setRestoring(versionId);
      await onRestore(versionId);
      await loadVersions();
    } catch {
      toast.error("Failed to restore version");
    } finally {
      setRestoring(null);
    }
  };

  const relativeTime = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString();
  };

  if (!pageId) {
    return (
      <div className="flex-1 flex items-center justify-center px-6">
        <p className="text-sm text-gray-400">
          Select a page to view version history.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="animate-spin w-5 h-5 border-2 border-alloro-orange border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {isPreviewMode && (
        <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-200">
          <p className="text-xs text-amber-700 font-medium">
            Preview mode — editing disabled
          </p>
          <button
            onClick={onExitPreview}
            className="text-xs text-amber-600 hover:text-amber-800 underline mt-1"
          >
            Exit preview
          </button>
        </div>
      )}

      <div className="divide-y divide-gray-100">
        {versions.map((version) => {
          const config = STATUS_CONFIG[version.status] || STATUS_CONFIG.inactive;
          const StatusIcon = config.icon;
          const isPreviewing = previewVersionId === version.id;

          return (
            <div
              key={version.id}
              className={`px-4 py-3 ${isPreviewing ? "bg-amber-50/50" : "hover:bg-gray-50"} transition-colors`}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-800">
                    v{version.version}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border ${config.color}`}
                  >
                    <StatusIcon size={10} />
                    {config.label}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  {version.change_source && (
                    <span className="text-[10px] text-gray-400">
                      {SOURCE_LABELS[version.change_source] || version.change_source}
                    </span>
                  )}
                  <span className="text-[11px] text-gray-400">
                    {relativeTime(version.updated_at)}
                  </span>
                </div>
              </div>

              {version.revision_note && (
                <p className="text-[11px] text-gray-500 italic mt-0.5 truncate" title={version.revision_note}>
                  "{version.revision_note}"
                </p>
              )}

              {isPreviewing && previewDiff && previewDiff.length > 0 && (
                <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50/60 px-2.5 py-2">
                  <p className="text-[11px] font-semibold text-amber-700 mb-1">
                    {previewDiff.length} section{previewDiff.length === 1 ? "" : "s"} differ from the draft
                  </p>
                  <div className="space-y-1">
                    {previewDiff.map((entry) => (
                      <div key={entry.name} className="flex items-center justify-between gap-2">
                        <span className="text-[11px] text-amber-800 truncate">
                          {entry.name}
                          <span className="text-amber-600/70">
                            {entry.status === "added"
                              ? " (not in draft)"
                              : entry.status === "removed"
                                ? " (only in draft)"
                                : ""}
                          </span>
                        </span>
                        {onRestoreSection && entry.status !== "removed" && (
                          <button
                            onClick={() => onRestoreSection(entry.name)}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 hover:bg-amber-200 transition-colors shrink-0"
                          >
                            Restore section
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-1.5 mt-2">
                {version.status !== "draft" && (
                  <button
                    onClick={() =>
                      isPreviewing ? onExitPreview() : onPreview(version)
                    }
                    className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                      isPreviewing
                        ? "bg-amber-100 text-amber-700 hover:bg-amber-200"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    <Eye size={11} />
                    {isPreviewing ? "Previewing" : "Preview"}
                  </button>
                )}
                {(version.status === "inactive" ||
                  (allowRestorePublished && version.status === "published")) && (
                  <button
                    onClick={() => handleRestore(version.id)}
                    disabled={restoring === version.id}
                    className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium bg-alloro-orange/10 text-alloro-orange hover:bg-alloro-orange/20 transition-colors disabled:opacity-50"
                  >
                    <RotateCcw
                      size={11}
                      className={
                        restoring === version.id ? "animate-spin" : ""
                      }
                    />
                    {restoring === version.id ? "Restoring..." : "Restore"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {versions.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center py-8 px-6">
          <Clock className="text-gray-300 mb-2" size={24} />
          <p className="text-sm text-gray-400 text-center">
            No version history yet
          </p>
        </div>
      )}
    </div>
  );
}
