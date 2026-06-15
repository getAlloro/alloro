import { Loader2, Sparkles } from "lucide-react";
import { useBulkSeoProgress } from "../../../../hooks/useBulkSeoProgress";

/** Inline component: per-post-type "Generate SEO" button with progress */
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

  if (isActive && status) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1 text-xs text-alloro-orange">
        <Loader2 className="w-3 h-3 animate-spin" />
        <span>
          {status.completed_count}/{status.total_count}
        </span>
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
      title="Generate SEO for all posts of this type"
    >
      <Sparkles className="w-3.5 h-3.5" />
    </button>
  );
}
