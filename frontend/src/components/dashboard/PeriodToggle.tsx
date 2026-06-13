/**
 * PeriodToggle — the shared period/timeframe switcher for every hub.
 * Terracotta active pill, muted inactive (the locked "terracotta active-pill"
 * decision — terracotta keeps meaning "where you are" without flooding the UI).
 * Label-agnostic: each surface supplies its own options.
 *
 * Spec: plans/06132026-dashboard-timeframe-foundation
 */

export type PeriodOption<T extends string = string> = {
  key: T;
  label: string;
  tooltip?: string;
};

export type PeriodToggleProps<T extends string = string> = {
  options: PeriodOption<T>[];
  active: T;
  onChange: (key: T) => void;
  ariaLabel?: string;
};

export function PeriodToggle<T extends string = string>({
  options,
  active,
  onChange,
  ariaLabel = "Timeframe",
}: PeriodToggleProps<T>) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="inline-flex rounded-full bg-[#EDEAE5] p-0.5"
    >
      {options.map((o) => {
        const isActive = o.key === active;
        return (
          <button
            key={o.key}
            type="button"
            title={o.tooltip}
            aria-pressed={isActive}
            onClick={() => onChange(o.key)}
            className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-alloro-orange/30 ${
              isActive
                ? "bg-alloro-orange text-white shadow-sm"
                : "text-ink-muted hover:text-alloro-navy"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export default PeriodToggle;
