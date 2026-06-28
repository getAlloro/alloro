import { HelpCircle } from "lucide-react";

import type { GateDetailMetric } from "./patientJourneyDetailDeck.utils";

export type PatientJourneyDetailMetricCardProps = {
  item: GateDetailMetric;
};

function metricTooltipId(label: string): string {
  return `patient-journey-metric-${label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}`;
}

export function PatientJourneyDetailMetricCard({
  item,
}: PatientJourneyDetailMetricCardProps) {
  const tooltipId = metricTooltipId(item.label);

  return (
    <div className="rounded-[12px] bg-alloro-bg px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <dt className="text-[10px] font-black uppercase tracking-[0.1em] text-ink-muted">
          {item.label}
        </dt>
        {item.tooltip ? (
          <span className="group/help relative inline-flex shrink-0">
            <button
              type="button"
              aria-label={`About ${item.label}`}
              aria-describedby={tooltipId}
              className={[
                "inline-flex h-6 w-6 items-center justify-center rounded-full",
                "text-ink-muted transition-colors duration-150",
                "hover:bg-white hover:text-alloro-navy",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-alloro-orange/50",
              ].join(" ")}
            >
              <HelpCircle className="h-4 w-4" aria-hidden="true" />
            </button>
            <span
              id={tooltipId}
              role="tooltip"
              className={[
                "pointer-events-none invisible absolute right-0 top-7 z-20 w-56",
                "rounded-[10px] border border-line-soft bg-white px-3 py-2",
                "text-[11px] font-semibold leading-snug text-ink-muted shadow-[0_12px_28px_rgba(17,21,28,0.14)]",
                "opacity-0 motion-safe:translate-y-1 motion-safe:scale-[0.98]",
                "motion-safe:transition-all motion-safe:duration-200 motion-safe:ease-out",
                "group-hover/help:visible group-hover/help:translate-y-0 group-hover/help:scale-100 group-hover/help:opacity-100",
                "group-focus-within/help:visible group-focus-within/help:translate-y-0 group-focus-within/help:scale-100 group-focus-within/help:opacity-100",
              ].join(" ")}
            >
              {item.tooltip}
            </span>
          </span>
        ) : null}
      </div>
      <dd className="mt-2 text-[14px] font-extrabold leading-snug text-alloro-navy">
        {item.value}
      </dd>
    </div>
  );
}
