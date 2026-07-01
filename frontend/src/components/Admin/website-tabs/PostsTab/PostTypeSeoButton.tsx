import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { useBulkSeoProgress } from "../../../../hooks/useBulkSeoProgress";
import BulkSeoProgressPopover from "../../../PageEditor/SeoPanel/BulkSeoProgressPopover";

/**
 * Inline component: per-post-type "Generate SEO" button with progress.
 *
 * This button triggers bulk generation across every post of the type — there
 * is no single post in scope here, so per-post practice-fact provenance
 * (source excerpts, GEO recommendation fields) isn't shown at this level; it
 * lives in SeoPanel + PracticeFactsPanel/GeoFields/AutoApplyBanner, reachable
 * by opening an individual post's SEO tab (PostsEditorView.tsx). The tooltip
 * here only flags that bulk generation auto-applies GEO opening content with
 * a recoverable previous_content snapshot per post (service.seo-generation.ts
 * applyGeoToPost), so editors aren't surprised by content changing in bulk —
 * full provenance review happens per-post. Clicking the counter opens the
 * shared BulkSeoProgressPopover (same component as PagesTab.tsx — spec §4.3,
 * not forked) for a live grouped per-item breakdown.
 */
export function PostTypeSeoButton({
  projectId,
  postTypeId,
  onComplete,
}: {
  projectId: string;
  postTypeId: string;
  onComplete: () => void;
}) {
  const { start, status, isActive } = useBulkSeoProgress(
    projectId,
    "post",
    postTypeId,
    onComplete
  );
  const [isProgressPopoverOpen, setIsProgressPopoverOpen] = useState(false);

  if (isActive && status) {
    return (
      <div className="relative">
        <button
          type="button"
          onClick={() => setIsProgressPopoverOpen((open) => !open)}
          className="flex items-center gap-1.5 px-2 py-1 text-xs text-alloro-orange hover:text-alloro-orange/80 transition-colors"
          title="View live per-post SEO generation progress"
        >
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>
            {status.completed_count}/{status.total_count}
          </span>
        </button>
        <BulkSeoProgressPopover
          items={status.item_statuses}
          isOpen={isProgressPopoverOpen}
          onOpenChange={setIsProgressPopoverOpen}
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        start();
      }}
      className="p-1.5 text-gray-400 hover:text-alloro-orange rounded-lg hover:bg-orange-50 transition-colors"
      title="Generate SEO for all posts of this type. GEO opening content is auto-applied per post (prior body is snapshotted first) — review provenance on each post's SEO tab."
    >
      <Sparkles className="w-3.5 h-3.5" />
    </button>
  );
}
