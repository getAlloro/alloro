import { useEffect } from "react";
import { toast } from "react-hot-toast";
import { RotateCw } from "lucide-react";

/**
 * Query error state (D13 / §16.3): fires one toast when it appears and
 * renders an inline retry so the surface never dead-ends.
 */
export function OsErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  useEffect(() => {
    toast.error(message);
  }, [message]);

  return (
    <div className="mt-6 flex items-center justify-between gap-3 rounded-xl bg-danger-soft px-4 py-3">
      <p className="text-sm text-alloro-danger">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-[9px] border border-alloro-danger/30 bg-alloro-surface px-3 py-1.5 text-[12px] font-semibold text-alloro-danger transition-colors duration-150 hover:bg-danger-soft"
      >
        <RotateCw className="h-3.5 w-3.5" strokeWidth={1.5} />
        Retry
      </button>
    </div>
  );
}
