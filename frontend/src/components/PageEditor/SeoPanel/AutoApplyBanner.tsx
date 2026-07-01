import { useState } from "react";
import DOMPurify from "dompurify";
import { History, ChevronDown, ChevronUp } from "lucide-react";
import { usePageAutoApplyStatus } from "../../../hooks/queries/usePageAutoApplyStatus";

/**
 * Auto-apply provenance indicator (spec Must: "for auto-applied content, a
 * link/diff to the prior version or snapshot"). Pages: GEO auto-apply always
 * creates a NEW draft page version, never bumps the live row — so "a newer
 * draft exists" is the signal. Posts: GEO auto-apply snapshots the prior
 * body into previous_content before overwriting — so a non-null
 * previous_content is the signal.
 *
 * Pages point the editor at the existing Version History tab (EditorSidebar /
 * VersionHistoryTab) rather than duplicating a diff view here — that tab
 * isn't reachable via a callback prop from this panel without threading one
 * through PageEditorBody, so this banner names the version number and tells
 * the editor where to look instead of faking a link. Posts get an inline
 * plain-text previous-vs-current compare (no version-history system exists
 * for posts — spec Out of Scope), proportional per spec scope (no new
 * diff-viewer component).
 */
export default function AutoApplyBanner({
  projectId,
  entityId,
  entityType,
  currentVersion,
  previousContent,
  currentContent,
}: {
  projectId: string;
  entityId: string;
  entityType: "page" | "post";
  currentVersion?: number;
  previousContent?: string | null;
  currentContent?: string;
}) {
  const [showCompare, setShowCompare] = useState(false);

  const pageStatus = usePageAutoApplyStatus(
    projectId,
    entityType === "page" ? entityId : "",
    currentVersion ?? 0,
  );

  if (entityType === "page") {
    if (!currentVersion || !pageStatus.data?.hasNewerDraft) return null;
    return (
      <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200 mb-4">
        <History className="w-3.5 h-3.5 text-blue-500 mt-0.5 shrink-0" />
        <div className="flex-1">
          <p className="text-xs font-semibold text-blue-800">GEO content auto-applied</p>
          <p className="text-[11px] text-blue-700 mt-0.5">
            A newer draft version (v{pageStatus.data.latestDraft?.version}) was created with the
            generated opening content. The live page is unchanged until you publish it — open the{" "}
            <strong>Version History</strong> tab in the sidebar to review or restore it.
          </p>
        </div>
      </div>
    );
  }

  // Posts
  if (!previousContent) return null;
  return (
    <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 mb-4">
      <div className="flex items-start gap-2">
        <History className="w-3.5 h-3.5 text-blue-500 mt-0.5 shrink-0" />
        <div className="flex-1">
          <p className="text-xs font-semibold text-blue-800">GEO content auto-applied</p>
          <p className="text-[11px] text-blue-700 mt-0.5">
            The opening content was prepended to this post. The prior body was snapshotted before
            the change.
          </p>
        </div>
        <button
          onClick={() => setShowCompare((v) => !v)}
          className="flex items-center gap-1 text-[11px] font-semibold text-blue-700 hover:text-blue-900 transition-colors whitespace-nowrap"
        >
          {showCompare ? "Hide" : "Compare"}
          {showCompare ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
      </div>
      {showCompare && (
        <div className="grid grid-cols-2 gap-2 mt-3">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-blue-500">Previous</span>
            <div
              className="text-[11px] text-gray-600 bg-white rounded-md p-2 mt-1 border border-blue-100 max-h-40 overflow-y-auto"
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(previousContent) }}
            />
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-blue-500">Current</span>
            <div
              className="text-[11px] text-gray-600 bg-white rounded-md p-2 mt-1 border border-blue-100 max-h-40 overflow-y-auto"
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(currentContent || "") }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
