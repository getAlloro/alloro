import { HelpCircle } from "lucide-react";

export type PatientJourneyArrowHelpProps = {
  caption: string;
  helpText: string;
};

function arrowHelpTooltipId(caption: string): string {
  return `patient-journey-arrow-${caption
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}`;
}

export function PatientJourneyArrowHelp({
  caption,
  helpText,
}: PatientJourneyArrowHelpProps) {
  const tooltipId = arrowHelpTooltipId(caption);

  return (
    <span className="group/help relative inline-flex">
      <button
        type="button"
        aria-label={`About ${caption}`}
        aria-describedby={tooltipId}
        className={[
          "inline-flex h-[18px] w-[18px] items-center justify-center rounded-full",
          "text-ink-muted transition-colors duration-150",
          "hover:bg-alloro-bg hover:text-alloro-navy",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-alloro-orange/50",
        ].join(" ")}
      >
        <HelpCircle className="h-[13px] w-[13px]" aria-hidden="true" />
      </button>
      <span
        id={tooltipId}
        role="tooltip"
        className={[
          "pointer-events-none invisible absolute bottom-5 left-1/2 z-40 w-56 -translate-x-1/2",
          "rounded-full border border-line-soft bg-white px-3 py-1.5",
          "text-[10.5px] font-semibold normal-case leading-snug tracking-normal text-ink-muted shadow-[0_10px_24px_rgba(17,21,28,0.14)]",
          "opacity-0 motion-safe:-translate-y-0.5 motion-safe:scale-[0.98]",
          "motion-safe:transition-all motion-safe:duration-200 motion-safe:ease-out",
          "group-hover/help:visible group-hover/help:translate-y-0 group-hover/help:scale-100 group-hover/help:opacity-100",
          "group-focus-within/help:visible group-focus-within/help:translate-y-0 group-focus-within/help:scale-100 group-focus-within/help:opacity-100",
        ].join(" ")}
      >
        {helpText}
      </span>
    </span>
  );
}
