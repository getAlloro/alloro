import React, { useState } from "react";
import { AlertCircle, RotateCw, ChevronDown } from "lucide-react";
import { useAuth } from "../../../hooks/useAuth";
import { useLocationContext } from "../../../contexts/locationContext";
import {
  useTopAction,
  type ResolvedTopAction,
  type TopAction,
  type TopActionSupportingMetric,
  type DomainSummary,
} from "../../../hooks/queries/useTopAction";
import HighlightedText from "./HighlightedText";
import { getDomainIcon } from "./icons";
import { useIsWizardActive, useWizardDemoData } from "../../../contexts/OnboardingWizardContext";

/**
 * Hero — top-of-dashboard card surfacing the single highest-priority
 * SUMMARY-authored action for the current month. Reads from `useTopAction`
 * (which filters tasks by `agent_type='SUMMARY'` and picks max
 * `priority_score`). Renders a dark-themed card so the `mark.hl` helper
 * picks the dark variant via the `focus-card-dark` class on the wrapper.
 *
 * Spec: plans/04282026-no-ticket-focus-dashboard-frontend/spec.md (T10)
 * Visual reference: ~/Desktop/another-design/project/cards.jsx Hero (3-72)
 *                   ~/Desktop/another-design/project/Focus Dashboard.html
 */

// =====================================================================
// Helpers
// =====================================================================

function urgencyPillClasses(urgency: TopAction["urgency"]): string {
  switch (urgency) {
    case "high":
      return "bg-[rgba(179,80,62,0.18)] text-[#F0A98E] border border-[rgba(179,80,62,0.28)]";
    case "medium":
      return "bg-[rgba(214,160,80,0.16)] text-[#E8C792] border border-[rgba(214,160,80,0.24)]";
    case "low":
    default:
      return "bg-white/5 text-[#C5BEB1] border border-white/10";
  }
}

function urgencyLabel(urgency: TopAction["urgency"]): string {
  switch (urgency) {
    case "high":
      return "URGENT";
    case "medium":
      return "MEDIUM PRIORITY";
    case "low":
      return "STEADY";
    default:
      return "PRIORITY";
  }
}

const DOMAIN_LABELS: Record<string, string> = {
  review: "Reviews",
  gbp: "Google Business",
  ranking: "Local Ranking",
  "form-submission": "Form Submissions",
  "pms-data-quality": "PMS Data",
  referral: "Referrals",
};

/**
 * Splits the deliverables string at the first " (" so the leading noun
 * phrase can render as a green-bold strong tag. Mirrors the cards.jsx
 * pattern (lines 63-66).
 */
function splitDeliverables(deliverables: string): {
  head: string;
  tail: string;
} {
  const idx = deliverables.indexOf(" (");
  if (idx === -1) return { head: deliverables, tail: "" };
  return {
    head: deliverables.slice(0, idx),
    tail: deliverables.slice(idx),
  };
}

// =====================================================================
// Subcomponents
// =====================================================================

const HeroShell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <section
    data-wizard-target="dashboard-hero"
    className="focus-card-dark relative overflow-hidden rounded-[14px] border border-[#2A2722] text-[#F5F1EA]"
    style={{
      background:
        "radial-gradient(60% 50% at 88% -10%, rgba(201,118,94,0.18), rgba(201,118,94,0) 60%), radial-gradient(40% 60% at 0% 110%, rgba(201,118,94,0.08), rgba(201,118,94,0) 70%), linear-gradient(180deg, #1A1A18 0%, #0F0F0E 100%)",
    }}
  >
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-0 h-px"
      style={{
        background:
          "linear-gradient(90deg, transparent, rgba(201,118,94,0.5), transparent)",
      }}
    />
    {children}
  </section>
);

const StatCell: React.FC<{ stat: TopActionSupportingMetric; index: number }> = ({
  stat,
  index,
}) => {
  const accent = index === 0;
  return (
    <div className="rounded-[10px] border border-white/10 bg-white/[0.035] px-4 py-3">
      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#C5BEB1]">
          {stat.label}
        </div>
        <div
          className={`font-display max-w-full break-words text-left text-[24px] font-medium leading-[1.05] tracking-[-0.02em] sm:max-w-[58%] sm:text-right ${
            accent ? "text-alloro-orange" : "text-[#F5F1EA]"
          }`}
        >
          {stat.value}
          {stat.sub && (
            <span
              className={`ml-1 text-[13px] font-normal ${
                accent ? "text-[rgba(201,118,94,0.65)]" : "text-[#8E8579]"
              }`}
            >
              {stat.sub}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

// =====================================================================
// States
// =====================================================================

const HeroLoading: React.FC = () => (
  <HeroShell>
    <div className="grid gap-10 px-10 py-9 lg:grid-cols-[minmax(0,1fr)_460px]">
      <div className="min-w-0 space-y-5">
        <div className="flex gap-2">
          <div className="h-5 w-40 animate-pulse rounded-full bg-white/10" />
          <div className="h-5 w-24 animate-pulse rounded-full bg-white/10" />
          <div className="h-5 w-28 animate-pulse rounded-full bg-white/10" />
        </div>
        <div className="space-y-2">
          <div className="h-10 w-11/12 animate-pulse rounded bg-white/10" />
          <div className="h-10 w-9/12 animate-pulse rounded bg-white/10" />
        </div>
        <div className="space-y-2">
          <div className="h-3 w-10/12 animate-pulse rounded bg-white/5" />
          <div className="h-3 w-8/12 animate-pulse rounded bg-white/5" />
        </div>
      </div>
      <aside className="self-start rounded-xl border border-white/10 bg-black/30 p-6">
        <div className="mb-5">
          <div className="h-3 w-24 animate-pulse rounded bg-white/10" />
        </div>
        <div className="grid gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="space-y-2">
              <div className="h-8 w-full animate-pulse rounded bg-white/10" />
              <div className="h-2 w-3/4 animate-pulse rounded bg-white/5" />
            </div>
          ))}
        </div>
      </aside>
    </div>
  </HeroShell>
);

const HeroPmsEmpty: React.FC = () => (
  <HeroShell>
    <div className="grid gap-10 px-10 py-10 lg:grid-cols-[minmax(0,1fr)_460px]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[rgba(201,118,94,0.18)] px-2.5 py-[5px] text-[10px] font-bold uppercase tracking-[0.1em] text-[#F0A98E]">
            <span className="h-[5px] w-[5px] rounded-full bg-[#F0A98E]" />
            PMS data needed
          </span>
          <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2.5 py-[5px] text-[10px] font-bold uppercase tracking-[0.1em] text-[#D6CFC2]">
            First focus
          </span>
        </div>
        <h1 className="font-display mt-[22px] mb-[22px] max-w-[650px] text-[40px] font-medium leading-[1.04] tracking-[-0.02em] text-[#F5F1EA] lg:text-[44px]">
          Upload PMS data to unlock your first monthly focus
        </h1>
        <p className="max-w-[620px] text-[14.5px] leading-[1.65] text-[#C5BEB1]">
          Once an approved PMS dataset is available, Alloro will turn
          production trends, referral mix, source movement, and growth signals
          into the one priority that matters most.
        </p>
      </div>
      <aside className="self-start rounded-xl border border-white/10 bg-black/30 p-[22px]">
        <div className="mb-[18px] text-[10px] font-bold uppercase tracking-[0.16em] text-[#8E8579]">
          What will show here
        </div>
        <div className="grid gap-3">
          {["Production trend", "Referral mix", "Top source movement"].map(
            (label) => (
              <div
                key={label}
                className="rounded-[10px] border border-white/10 bg-white/[0.035] px-4 py-3"
              >
                <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#C5BEB1]">
                  {label}
                </div>
                <div className="mt-1 text-[12.5px] leading-relaxed text-[#8E8579]">
                  Appears after PMS data is uploaded and approved.
                </div>
              </div>
            ),
          )}
        </div>
      </aside>
    </div>
  </HeroShell>
);

const HeroEmpty: React.FC = () => (
  <HeroShell>
    <div className="flex min-h-[280px] items-center justify-center px-10 py-16">
      <p className="font-display max-w-md text-center text-[20px] font-medium leading-snug text-[#C5BEB1]">
        Your first monthly priority will appear once your data finishes
        processing.
      </p>
    </div>
  </HeroShell>
);

const HeroError: React.FC<{ message: string; onRetry: () => void }> = ({
  message,
  onRetry,
}) => (
  <HeroShell>
    <div className="flex flex-col items-center justify-center gap-4 px-10 py-16 text-center">
      <div className="flex items-center gap-2 text-[#F0A98E]">
        <AlertCircle size={16} />
        <span className="text-sm font-medium">
          {message || "Failed to load your top action."}
        </span>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-5 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#F5F1EA] transition-colors hover:bg-white/10"
      >
        <RotateCw size={12} />
        Retry
      </button>
    </div>
  </HeroShell>
);

// =====================================================================
// Domain Strips
// =====================================================================

const DomainStripRow: React.FC<{ ds: DomainSummary }> = ({ ds }) => {
  const [open, setOpen] = useState(false);
  const { Comp, cls } = getDomainIcon(ds.domain);

  return (
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      className="w-full text-left"
    >
      <div className="flex items-center gap-3 py-2.5">
        <span
          className={`flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-md ${cls}`}
          aria-hidden="true"
        >
          <Comp size={12} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="text-[12px] font-bold uppercase tracking-[0.08em] text-[#F5F1EA]">
            {ds.heading}
          </span>
          <span className="ml-2 text-[12px] text-[#8E8579]">
            {ds.summary}
          </span>
        </span>
        <ChevronDown
          size={13}
          className={`shrink-0 text-[#8E8579] transition-transform duration-150 ${
            open ? "rotate-180" : ""
          }`}
          aria-hidden="true"
        />
      </div>
      {open && (
        <p className="pb-2.5 pl-[38px] text-[12px] leading-[1.6] text-[#C5BEB1]">
          {ds.detail}
        </p>
      )}
    </button>
  );
};

const DomainStrips: React.FC<{ summaries?: DomainSummary[] }> = ({
  summaries,
}) => {
  if (!summaries || summaries.length === 0) return null;

  return (
    <div className="mt-4 divide-y divide-white/10 rounded-lg border border-white/10 bg-white/[0.03] px-4">
      {summaries.map((ds) => (
        <DomainStripRow key={ds.domain} ds={ds} />
      ))}
    </div>
  );
};

// =====================================================================
// Main render
// =====================================================================

interface HeroBodyProps {
  topAction: ResolvedTopAction;
}

const HeroBody: React.FC<HeroBodyProps> = ({ topAction }) => {
  const { Comp: DomainIcon } = getDomainIcon(topAction.domain);
  const domainLabel =
    DOMAIN_LABELS[topAction.domain] ?? topAction.domain.toUpperCase();
  const { head, tail } = splitDeliverables(topAction.outcome.deliverables);

  return (
    <HeroShell>
      <div className="grid gap-10 px-10 py-9 lg:grid-cols-[minmax(0,1fr)_460px] xl:grid-cols-[minmax(0,1fr)_500px]">
        {/* LEFT */}
        <div className="min-w-0">
          {/* Pills row */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[rgba(201,118,94,0.18)] px-2.5 py-[5px] text-[10px] font-bold uppercase tracking-[0.1em] text-[#F0A98E]">
              <span className="h-[5px] w-[5px] rounded-full bg-[#F0A98E]" />
              This month · 1 thing that matters
            </span>
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-[5px] text-[10px] font-bold uppercase tracking-[0.1em] ${urgencyPillClasses(
                topAction.urgency
              )}`}
            >
              {urgencyLabel(topAction.urgency)}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-[5px] text-[10px] font-bold uppercase tracking-[0.1em] text-[#D6CFC2]">
              <DomainIcon size={11} className="text-[#D6CFC2]" />
              {domainLabel}
            </span>
          </div>

          {/* Headline */}
          <h1 className="font-display mt-[22px] mb-[22px] max-w-[620px] text-[40px] font-medium leading-[1.04] tracking-[-0.02em] text-[#F5F1EA] lg:text-[44px]">
            <HighlightedText
              text={topAction.title}
              highlights={topAction.highlights}
            />
          </h1>

          {/* Rationale */}
          <p className="mb-5 max-w-[580px] text-[14.5px] leading-[1.65] text-[#C5BEB1]">
            <HighlightedText
              text={topAction.rationale}
              highlights={topAction.highlights}
            />
          </p>

          {/* Domain summary strips */}
          <DomainStrips summaries={topAction.domain_summaries} />
        </div>

        {/* RIGHT — Why panel */}
        <aside className="self-start rounded-xl border border-white/10 bg-black/30 p-[22px]">
          <div className="mb-[18px]">
            <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#8E8579]">
              Why this first
            </span>
          </div>

          <div className="grid gap-3">
            {topAction.supporting_metrics.slice(0, 3).map((stat, i) => (
              <StatCell key={i} stat={stat} index={i} />
            ))}
          </div>

          <div className="my-[18px] border-t border-white/10" />

          <div className="mb-2.5 flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#8E8579]">
              What this does
            </span>
          </div>
          <p className="text-[13px] leading-[1.6] text-[#E5DFD3]">
            <strong className="font-semibold text-[#B5D89C]">{head}</strong>
            {tail}
          </p>
          <p className="mt-2.5 text-[12px] leading-[1.55] text-[#8E8579]">
            {topAction.outcome.mechanism}
          </p>
        </aside>
      </div>
    </HeroShell>
  );
};

export type HeroProps = {
  hasPmsData?: boolean;
};

export function Hero({ hasPmsData = true }: HeroProps) {
  const isWizardActive = useIsWizardActive();
  const wizardDemoData = useWizardDemoData();
  const { userProfile } = useAuth();
  const organizationId = userProfile?.organizationId ?? null;
  const { selectedLocation } = useLocationContext();
  const locationId = selectedLocation?.id ?? null;

  const { topAction: realTopAction, isLoading: realLoading, error, refetch } = useTopAction(
    organizationId,
    locationId
  );

  const topAction = isWizardActive ? (wizardDemoData?.heroAction as ResolvedTopAction | undefined) ?? realTopAction : realTopAction;
  const isLoading = isWizardActive ? false : realLoading;

  if (!hasPmsData) return <HeroPmsEmpty />;
  if (isLoading) return <HeroLoading />;
  if (!isWizardActive && error) {
    return <HeroError message={error.message} onRetry={refetch} />;
  }
  if (!topAction) return <HeroEmpty />;
  return <HeroBody topAction={topAction} />;
}

export default Hero;
