import { Check, Loader2, Lock } from "lucide-react";
import type { WebsiteProjectWithPages } from "../../../api/websites";

// ---------------------------------------------------------------------------
// ThreeStepOnboarding — shown on CREATED projects as a visual progress guide
// ---------------------------------------------------------------------------

export function ThreeStepOnboarding({
  website,
  onOpenIdentity,
  onOpenLayouts,
  onOpenFirstPage,
}: {
  website: WebsiteProjectWithPages;
  onOpenIdentity: () => void;
  onOpenLayouts: () => void;
  onOpenFirstPage: () => void;
}) {
  const identityStatus = website.project_identity?.meta?.warmup_status || null;
  const identityReady = identityStatus === "ready";
  const identityRunning = identityStatus === "running" || identityStatus === "queued";
  const layoutsReady = !!website.wrapper && website.wrapper.length > 100;
  const hasPages = (website.pages?.length || 0) > 0;

  return (
    <div className="flex flex-col divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
      <StepRow
        title="Project Identity"
        state={identityReady ? "ready" : identityRunning ? "running" : "active"}
        onStart={onOpenIdentity}
        startLabel={identityReady ? "Edit" : identityRunning ? "Warming up…" : "Start"}
      />
      <StepRow
        title="Generate Layouts"
        state={layoutsReady ? "ready" : identityReady ? "active" : "locked"}
        onStart={onOpenLayouts}
        startLabel={layoutsReady ? "Regenerate" : "Start"}
        disabled={!identityReady && !layoutsReady}
      />
      <StepRow
        title="Generate First Page"
        state={hasPages ? "ready" : layoutsReady ? "active" : "locked"}
        onStart={onOpenFirstPage}
        startLabel={hasPages ? "View pages" : "Start"}
        disabled={!layoutsReady && !hasPages}
      />
    </div>
  );
}

type StepState = "active" | "active-soon" | "running" | "ready" | "locked";

function StepRow({
  title,
  state,
  onStart,
  startLabel,
  disabled,
}: {
  title: string;
  state: StepState;
  onStart: () => void;
  startLabel: string;
  disabled?: boolean;
}) {
  const isReady = state === "ready";
  const isRunning = state === "running";
  const isLocked = state === "locked";

  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2">
      <div className="flex items-center gap-2.5 min-w-0">
        <div
          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border ${
            isReady
              ? "border-green-500 bg-green-500 text-white"
              : isRunning
                ? "border-amber-400 bg-amber-50 text-amber-600"
                : isLocked
                  ? "border-gray-200 bg-gray-50 text-gray-300"
                  : "border-gray-300 bg-white"
          }`}
        >
          {isReady && <Check className="h-3 w-3 stroke-[3]" strokeWidth={3} />}
          {isRunning && <Loader2 className="h-2.5 w-2.5 animate-spin" />}
          {isLocked && <Lock className="h-2.5 w-2.5" />}
        </div>
        <span className={`text-sm ${isLocked ? "text-gray-400" : "text-gray-800"}`}>
          {title}
        </span>
      </div>
      <button
        onClick={onStart}
        disabled={disabled || isRunning}
        className={`text-xs font-medium transition ${
          isLocked || disabled
            ? "text-gray-300 cursor-not-allowed"
            : isRunning
              ? "text-amber-600 cursor-default"
              : isReady
                ? "text-gray-500 hover:text-alloro-orange"
                : "text-alloro-orange hover:underline"
        }`}
      >
        {startLabel}
      </button>
    </div>
  );
}
