import { ExternalLink, MousePointer2 } from "lucide-react";
import {
  CLARITY_PROJECT_URL,
  isClarityMonitoringConfigured,
} from "../../../../utils/telemetry/clarityMonitoring";

export function TelemetryClarityLink() {
  if (!isClarityMonitoringConfigured()) return null;

  return (
    <a
      href={CLARITY_PROJECT_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Open Clarity replays and heatmaps"
      className="inline-flex h-10 items-center gap-2 rounded-xl border border-alloro-orange/20 bg-alloro-orange/10 px-3 text-[11px] font-black uppercase tracking-wider text-alloro-navy shadow-sm transition-all duration-200 hover:border-alloro-orange/40 hover:bg-alloro-orange/15 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-alloro-teal/40"
    >
      <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-white text-alloro-orange">
        <MousePointer2 className="h-3.5 w-3.5" />
      </span>
      <span className="hidden sm:inline">Replays &amp; Heatmaps</span>
      <ExternalLink className="h-3.5 w-3.5" />
    </a>
  );
}
