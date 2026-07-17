import { CheckCircle2 } from "lucide-react";
import type { PatientJourneyAction } from "../../../types/patientJourney";

type PatientJourneyActionNoteProps = {
  action: PatientJourneyAction;
};

function formatActionDate(value: string): string | null {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
}

export function PatientJourneyActionNote({
  action,
}: PatientJourneyActionNoteProps) {
  const completedOn = formatActionDate(action.occurredAt);

  return (
    <aside
      aria-label="Alloro action"
      className="mt-5 border-l-2 border-alloro-orange bg-[#FFF8F3] px-4 py-3.5"
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <CheckCircle2
          className="h-4 w-4 shrink-0 text-alloro-orange"
          aria-hidden="true"
        />
        <h4 className="text-[11px] font-black uppercase tracking-[0.12em] text-alloro-navy">
          Alloro did this
        </h4>
        {completedOn ? (
          <span className="text-[11px] font-semibold text-ink-muted">
            Completed {completedOn}
          </span>
        ) : null}
      </div>
      <p className="mt-2 text-[13px] font-bold leading-relaxed text-alloro-navy">
        {action.summary}
      </p>
      <p className="mt-1 text-[12px] font-semibold leading-relaxed text-ink-muted">
        {action.measurementNote}
      </p>
    </aside>
  );
}
