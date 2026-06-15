import { Loader2, Sparkles } from "lucide-react";
import type { WarmupStatus } from "../../../../api/websites";

// ---------------------------------------------------------------------------
// WarmingUpView — shown while warmup is in progress
// ---------------------------------------------------------------------------

export function WarmingUpView({
  status,
  onCancel,
}: {
  status: WarmupStatus;
  onCancel: () => void;
}) {
  return (
    <div className="px-6 py-16 flex flex-col items-center justify-center text-center space-y-4">
      <div className="relative">
        <div className="absolute inset-0 rounded-full bg-amber-200 blur-xl opacity-40 animate-pulse" />
        <div className="relative rounded-full bg-amber-500 p-4">
          <Sparkles className="h-6 w-6 text-white" />
        </div>
      </div>
      <div>
        <div className="text-base font-semibold text-gray-900">
          {status === "queued" ? "Queued..." : "Analyzing sources..."}
        </div>
        <div className="text-sm text-gray-500 mt-1">
          Scraping, analyzing images, classifying the practice, distilling content.
        </div>
      </div>
      <div className="flex items-center gap-2 text-xs text-gray-400">
        <Loader2 className="h-4 w-4 animate-spin" />
        This usually takes 1-3 minutes.
      </div>
      <button
        onClick={onCancel}
        className="text-xs font-medium text-red-600 hover:text-red-800 px-3 py-1.5 rounded-lg border border-red-200 hover:bg-red-50"
      >
        Cancel
      </button>
    </div>
  );
}
