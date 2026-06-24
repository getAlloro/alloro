import type { ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../hooks/useAuth";
import { useLabels } from "../../../hooks/useLabels";
import { useLocationContext } from "../../../contexts/locationContext";
import { usePatientJourney } from "../../../hooks/queries/usePatientJourney";
import type {
  PatientJourney,
  PatientJourneyStage,
  PatientJourneyStageKey,
} from "../../../types/patientJourney";

/**
 * PatientJourneyCard — compact Practice Hub summary of the six-stage funnel.
 *
 * Renders the biggest-leak headline one-liner plus two key stage numbers
 * (the first available website-traffic stage and leads), then links into the
 * full /patientJourneyInsights screen. Shares ONE network request with that
 * screen via usePatientJourney (same queryKey → React Query dedupes).
 *
 * Honest states: a null stage value paired with `available: false` is shown
 * as "—" with a "not connected yet" sub-line — never a misleading zero. When
 * the whole funnel is sparse (no headline, no available stages) the card
 * still links through with a calm "set up your funnel" prompt.
 *
 * Wording resolves through useLabels() so a `generic`-type org reads
 * "Customer Journey" end-to-end.
 *
 * Spec: plans/06242026-patient-journey-insights/spec.html (T9)
 *       focus/ProductionPanel.tsx Shell primitive + focus/StatCard.tsx
 */

const JOURNEY_ROUTE = "/patientJourneyInsights";

function formatStageValue(value: number | null): string {
  if (value === null) return "—";
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function findStage(
  stages: PatientJourneyStage[],
  key: PatientJourneyStageKey,
): PatientJourneyStage | undefined {
  return stages.find((s) => s.key === key);
}

/** A small headline number tile: stage value + uppercase meta label. */
function StageTile({ stage }: { stage: PatientJourneyStage | undefined }) {
  if (!stage) return null;
  const empty = !stage.available || stage.value === null;
  return (
    <div className="min-w-0 flex-1">
      <span className="block font-display text-[26px] font-medium leading-none tracking-[-0.02em] text-alloro-navy tabular-nums">
        {formatStageValue(stage.value)}
      </span>
      <span className="mt-1.5 block truncate text-[10px] font-bold uppercase tracking-[0.08em] text-ink-muted">
        {stage.label}
      </span>
      {empty ? (
        <span className="mt-0.5 block truncate text-[10.5px] font-medium text-ink-muted">
          not connected yet
        </span>
      ) : null}
    </div>
  );
}

function Shell({
  children,
  onClick,
  label,
}: {
  children: ReactNode;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Open ${label}`}
      className="group flex w-full flex-col rounded-[14px] border border-line-soft bg-white px-6 pb-[22px] pt-6 text-left shadow-premium transition-colors hover:border-line-medium"
    >
      {children}
    </button>
  );
}

function Eyebrow({ label }: { label: string }) {
  return (
    <div className="flex w-full items-center justify-between">
      <span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-ink-muted">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-alloro-navy" />
        {label}
      </span>
      <ArrowUpRight
        size={15}
        strokeWidth={2}
        className="text-ink-muted transition-colors group-hover:text-alloro-navy"
      />
    </div>
  );
}

/**
 * The first website-traffic stage that has data, so the card always leads
 * with a real number when one exists (impressions → visits → leads).
 */
function pickHeadlineStage(
  journey: PatientJourney,
): PatientJourneyStage | undefined {
  const order: PatientJourneyStageKey[] = ["visits", "impressions", "leads"];
  for (const key of order) {
    const stage = findStage(journey.stages, key);
    if (stage?.available && stage.value !== null) return stage;
  }
  return findStage(journey.stages, "visits") ?? journey.stages[0];
}

export function PatientJourneyCard() {
  const navigate = useNavigate();
  const labels = useLabels();
  const { userProfile } = useAuth();
  const { selectedLocation } = useLocationContext();
  const orgId = userProfile?.organizationId ?? null;
  const locationId = selectedLocation?.id ?? null;

  const { data, isLoading } = usePatientJourney(orgId, locationId);
  const goToJourney = () => navigate(JOURNEY_ROUTE);

  // Loading skeleton (real path only — keyed on the same request as the screen).
  if (isLoading) {
    return (
      <Shell onClick={goToJourney} label={labels.journeyInsights}>
        <Eyebrow label={labels.journey} />
        <div className="mt-3 h-5 w-3/4 animate-pulse rounded bg-neutral-100" />
        <div className="mt-4 h-9 w-full animate-pulse rounded bg-neutral-100" />
      </Shell>
    );
  }

  // No data yet (location not selected, sparse org) → calm setup prompt that
  // still links through. Never a misleading zero.
  if (!data) {
    return (
      <Shell onClick={goToJourney} label={labels.journeyInsights}>
        <Eyebrow label={labels.journey} />
        <h3 className="mt-3 font-display text-lg leading-snug text-alloro-navy">
          See your {labels.journey.toLowerCase()}.
        </h3>
        <p className="mt-1 text-[13px] text-ink-muted">
          Connect your sources to map every step from search to a booked{" "}
          {labels.customer}.
        </p>
      </Shell>
    );
  }

  const headlineText = data.headline.text?.trim();
  const leadStage = findStage(data.stages, "leads");
  const trafficStage = pickHeadlineStage(data);
  const sameStage = trafficStage && leadStage && trafficStage.key === leadStage.key;

  return (
    <Shell onClick={goToJourney} label={labels.journeyInsights}>
      <Eyebrow label={labels.journey} />

      <h3 className="mt-3 font-display text-lg leading-snug text-alloro-navy">
        {headlineText || `Track your ${labels.journey.toLowerCase()}.`}
      </h3>

      <div className="mt-4 flex items-end gap-5 border-t border-line-soft pt-4">
        <StageTile stage={trafficStage} />
        {!sameStage ? <StageTile stage={leadStage} /> : null}
      </div>
    </Shell>
  );
}

export default PatientJourneyCard;
