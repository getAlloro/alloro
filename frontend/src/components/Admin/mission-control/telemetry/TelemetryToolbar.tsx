import { RefreshCw, ShieldCheck } from "lucide-react";
import type { MissionControlTelemetryRange } from "../../../../api/admin-mission-control";
import { TelemetryClarityLink } from "./TelemetryClarityLink";
import { TelemetryFilterToggle } from "./TelemetryFilterToggle";

const RANGES: MissionControlTelemetryRange[] = ["7d", "30d", "90d"];

type TelemetryToolbarProps = {
  range: MissionControlTelemetryRange;
  includeAdmin: boolean;
  isFetching: boolean;
  onRangeChange: (range: MissionControlTelemetryRange) => void;
  onIncludeAdminChange: (checked: boolean) => void;
  onRefresh: () => void;
};

export function TelemetryToolbar({
  range,
  includeAdmin,
  isFetching,
  onRangeChange,
  onIncludeAdminChange,
  onRefresh,
}: TelemetryToolbarProps) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
      <div>
        <h2 className="text-base font-black text-alloro-navy">
          Product Telemetry
        </h2>
        <p className="mt-1 text-xs font-medium text-gray-500">
          First-party app usage by organization, user, page, and surface.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <TelemetryClarityLink />
        {RANGES.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onRangeChange(option)}
            className={`rounded-lg px-3 py-2 text-[11px] font-black uppercase tracking-wider transition-all ${
              range === option
                ? "bg-alloro-navy text-white"
                : "bg-gray-50 text-gray-500 hover:bg-gray-100 hover:text-alloro-navy"
            }`}
          >
            {option}
          </button>
        ))}
        <TelemetryFilterToggle
          id="telemetry-include-admin"
          label="Admin"
          checked={includeAdmin}
          onChange={onIncludeAdminChange}
          icon={ShieldCheck}
        />
        <button
          type="button"
          onClick={onRefresh}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-[11px] font-black uppercase tracking-wider text-gray-500 transition-all hover:border-alloro-teal/40 hover:text-alloro-navy"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`}
          />
          Refresh
        </button>
      </div>
    </div>
  );
}
