import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { InfoTip } from "../../dashboard/shared/InfoTip";

/**
 * Shared shell for the Websites overview cards — white line-soft detail card in
 * the owner-readable design system. Eyebrow (dot + mono label + optional InfoTip),
 * a body, and an optional footer "open" affordance that links into the tool.
 *
 * Must render inside a `.pm-light` wrapper (WebsiteOverview provides it).
 */
export type OverviewCardProps = {
  eyebrow: string;
  infoTip?: string;
  onOpen?: () => void;
  openLabel?: string;
  children: ReactNode;
  className?: string;
};

export function OverviewCard({
  eyebrow,
  infoTip,
  onOpen,
  openLabel = "Open",
  children,
  className = "",
}: OverviewCardProps) {
  return (
    <section
      className={`flex flex-col rounded-[14px] border border-line-soft bg-white p-5 shadow-premium ${className}`}
    >
      <div className="mb-3 flex items-center gap-2">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-alloro-navy" />
        <span className="font-mono-display text-[10px] font-bold uppercase tracking-[0.16em] text-[color:var(--color-pm-text-secondary)]">
          {eyebrow}
        </span>
        {infoTip ? <InfoTip content={infoTip} placement="bottom" /> : null}
      </div>
      <div className="flex-1">{children}</div>
      {onOpen ? (
        <div className="mt-4 border-t border-line-soft pt-3">
          <button
            type="button"
            onClick={onOpen}
            className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-alloro-navy/70 transition-colors hover:text-alloro-orange focus:outline-none focus:ring-2 focus:ring-alloro-orange/40 rounded"
          >
            {openLabel}
            <ChevronRight size={13} />
          </button>
        </div>
      ) : null}
    </section>
  );
}

/** Centered icon + title + hint, used by cards for empty / not-connected states. */
export function OverviewCardEmptyState({
  icon,
  title,
  hint,
}: {
  icon: ReactNode;
  title: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-6 text-center">
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-[#FFF7F2] text-alloro-orange">
        {icon}
      </div>
      <p className="text-[13.5px] font-semibold leading-snug text-alloro-navy">
        {title}
      </p>
      {hint ? (
        <p className="mt-1 max-w-[230px] text-[12px] leading-relaxed text-[color:var(--color-pm-text-secondary)]">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Big Fraunces stat number + unit, used by the simple count cards. */
export function OverviewStat({
  value,
  unit,
}: {
  value: number | string;
  unit: string;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-2">
      <span className="font-display text-[32px] font-medium leading-none tracking-tight text-alloro-navy tabular-nums">
        {value}
      </span>
      <span className="text-xs font-medium text-[color:var(--color-pm-text-secondary)]">
        {unit}
      </span>
    </div>
  );
}
