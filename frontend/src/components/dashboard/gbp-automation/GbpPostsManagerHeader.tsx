import { Clock, Loader2, Plus } from "lucide-react";
import { nextPostLabel } from "./gbpReadinessUtils";

export type GbpPostsManagerHeaderProps = {
  nextPostGenerationAt?: string | null;
  isGenerationLocked: boolean;
  canCreate: boolean;
  onCreateClick: () => void;
};

// Compact actions cluster — the title/description block was dropped so this
// sits inline with the Published/Drafts tabs in a single header row.
export function GbpPostsManagerHeader({
  nextPostGenerationAt,
  isGenerationLocked,
  canCreate,
  onCreateClick,
}: GbpPostsManagerHeaderProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex items-center gap-2 rounded-[10px] border border-slate-200 bg-slate-50 px-3 py-1.5">
        <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-500">
          <Clock size={12} />
          Next draft
        </p>
        <p className="text-xs font-black text-alloro-navy">
          {nextPostLabel(nextPostGenerationAt)}
        </p>
      </div>
      <button
        type="button"
        disabled={!canCreate || isGenerationLocked}
        onClick={onCreateClick}
        className="inline-flex items-center gap-1.5 rounded-[10px] bg-alloro-orange px-3 py-2 text-[11px] font-black uppercase tracking-widest text-white transition-colors hover:bg-alloro-orange/90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isGenerationLocked ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Plus className="h-3.5 w-3.5" />
        )}
        {isGenerationLocked ? "Generating" : "Create post draft"}
      </button>
    </div>
  );
}
