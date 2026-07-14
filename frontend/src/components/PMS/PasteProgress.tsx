import { Check, Loader2, Sparkles } from "lucide-react";

import type { PastePhase } from "./pastePipeline";

export type PasteProgressProps = {
  phase: Exclude<PastePhase, "idle">;
  rowsParsed: number | null;
  requiresSanitization: boolean;
};

function getStatusText({ phase, rowsParsed }: PasteProgressProps): string {
  if (phase === "parsing") return "Parsing the complete pasted dataset";
  if (phase === "sanitizing") {
    return `Parsed ${rowsParsed ?? 0} rows. Cleaning similar sources`;
  }
  return `${rowsParsed ?? 0} rows are ready`;
}

export function PasteProgress(props: PasteProgressProps) {
  const { phase, requiresSanitization } = props;
  const statusText = getStatusText(props);
  const isParseDone = phase === "sanitizing" || phase === "ready";
  const isCleanDone = phase === "ready" && requiresSanitization;

  return (
    <div className="mt-3 w-full">
      <div className="mb-3 flex items-center justify-center gap-2 text-alloro-navy/70">
        {phase === "ready" ? (
          <Check className="h-4 w-4 text-emerald-600" />
        ) : phase === "sanitizing" ? (
          <Sparkles className="h-4 w-4 animate-pulse text-alloro-orange" />
        ) : (
          <Loader2 className="h-4 w-4 animate-spin text-alloro-orange" />
        )}
        <span className="text-sm">{statusText}</span>
      </div>

      <div
        className="flex gap-2"
        role="progressbar"
        aria-label="PMS paste processing"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={phase === "ready" ? 100 : undefined}
        aria-valuetext={statusText}
      >
        <div className="flex-1">
          <div
            className={`h-2 rounded-full ${
              isParseDone
                ? "bg-alloro-orange"
                : "animate-pulse bg-alloro-orange/70"
            }`}
          />
          <p className="mt-1 text-center text-[10px] font-semibold uppercase text-alloro-navy/50">
            Parse
          </p>
        </div>
        {requiresSanitization && (
          <div className="flex-1">
            <div
              className={`h-2 rounded-full ${
                isCleanDone
                  ? "bg-alloro-orange"
                  : phase === "sanitizing"
                    ? "animate-pulse bg-alloro-orange/70"
                    : "bg-alloro-navy/10"
              }`}
            />
            <p className="mt-1 text-center text-[10px] font-semibold uppercase text-alloro-navy/50">
              Clean sources
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
