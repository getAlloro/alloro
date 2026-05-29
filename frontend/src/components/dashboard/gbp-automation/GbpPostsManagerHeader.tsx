import { Clock, Loader2, Plus } from "lucide-react";
import { nextPostLabel } from "./gbpReadinessUtils";

export type GbpPostsManagerHeaderProps = {
  nextPostGenerationAt?: string | null;
  isGenerationLocked: boolean;
  canCreate: boolean;
  onCreateClick: () => void;
};

export function GbpPostsManagerHeader({
  nextPostGenerationAt,
  isGenerationLocked,
  canCreate,
  onCreateClick,
}: GbpPostsManagerHeaderProps) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div>
        <h3 className="text-base font-black text-alloro-navy">Google posts</h3>
        <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">
          Manage published posts and keep new drafts separate until you publish.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center gap-2 rounded-[10px] border border-slate-200 bg-slate-50 px-3 py-2">
          <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-500">
            <Clock size={12} />
            Next draft
          </p>
          <p className="text-sm font-black text-alloro-navy">
            {nextPostLabel(nextPostGenerationAt)}
          </p>
        </div>
        <button
          type="button"
          disabled={!canCreate || isGenerationLocked}
          onClick={onCreateClick}
          className="inline-flex items-center gap-2 rounded-[10px] bg-alloro-orange px-4 py-3 text-xs font-black uppercase tracking-widest text-white transition-colors hover:bg-alloro-orange/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isGenerationLocked ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          {isGenerationLocked ? "Generating" : "Create post draft"}
        </button>
      </div>
    </div>
  );
}
