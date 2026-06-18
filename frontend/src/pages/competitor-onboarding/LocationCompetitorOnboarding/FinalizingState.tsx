import { Loader2 } from "lucide-react";

export function FinalizingState({
  isReselectMode,
}: {
  isReselectMode: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-32">
      <Loader2 className="w-10 h-10 text-alloro-orange animate-spin" />
      <h2 className="mt-6 text-2xl font-black font-heading text-alloro-navy">
        {isReselectMode
          ? "Saving your comparison set and reranking…"
          : "Locking your list and starting analysis…"}
      </h2>
      <p className="mt-2 text-sm text-alloro-textDark/60 font-medium max-w-md text-center">
        {isReselectMode
          ? "This starts a ranking rerun only and usually takes around 5-10 minutes. Your current dashboard stays visible until the new snapshot finishes."
          : "Hang tight — this typically takes 60–90 seconds. We'll redirect you to the dashboard once it's queued."}
      </p>
    </div>
  );
}
