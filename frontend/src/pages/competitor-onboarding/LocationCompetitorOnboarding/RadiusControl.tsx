import { Loader2, Sparkles } from "lucide-react";
import { type ComparisonSpecialtyOption } from "../../../api/practiceRanking";
import {
  DISCOVERY_RADIUS_OPTIONS,
  RECOMMENDED_RADIUS_TOOLTIP,
} from "../locationCompetitorOnboarding.utils";

export function RadiusControl({
  value,
  onChange,
  onRefresh,
  refreshing,
  comparisonSpecialty,
  comparisonSpecialtyOptions,
  onComparisonSpecialtyChange,
}: {
  value: number;
  onChange: (value: number) => void;
  onRefresh: (value?: number) => void;
  refreshing: boolean;
  comparisonSpecialty: string | null;
  comparisonSpecialtyOptions: ComparisonSpecialtyOption[];
  onComparisonSpecialtyChange: (value: string | null) => void;
}) {
  const hasSelectedSpecialty = comparisonSpecialtyOptions.some(
    (option) => option.value === comparisonSpecialty
  );
  return (
    <div className="rounded-[14px] border border-line-soft bg-white p-4 shadow-premium">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <label className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-black/5 bg-slate-50 px-3 py-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              Type
            </span>
            <select
              value={comparisonSpecialty ?? ""}
              onChange={(event) =>
                onComparisonSpecialtyChange(event.target.value || null)
              }
              className="bg-transparent text-xs font-black text-alloro-textDark outline-none"
            >
              {!comparisonSpecialty && (
                <option value="">Practice specialty</option>
              )}
              {comparisonSpecialty && !hasSelectedSpecialty && (
                <option value={comparisonSpecialty}>
                  {comparisonSpecialty.replace(/_/g, " ")}
                </option>
              )}
              {comparisonSpecialtyOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <div className="inline-flex shrink-0 overflow-visible rounded-xl border border-black/5 bg-slate-50 p-1">
            {DISCOVERY_RADIUS_OPTIONS.map((option) => {
              const active = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => onChange(option.value)}
                  className={`group relative min-w-12 rounded-lg px-2.5 py-2 text-xs font-black transition lg:min-w-14 lg:px-3 ${
                    active
                      ? "bg-alloro-navy text-white shadow-sm"
                      : "text-slate-500 hover:bg-white"
                  }`}
                  aria-describedby={
                    option.recommended ? "recommended-radius-tooltip" : undefined
                  }
                >
                  {option.label}
                  {option.recommended && (
                    <>
                      <span className="absolute -right-1.5 -top-2 rounded-full border border-white bg-alloro-orange px-1.5 py-0.5 text-[7px] font-black uppercase tracking-wider text-white shadow-sm">
                        Rec
                      </span>
                      <span
                        id="recommended-radius-tooltip"
                        role="tooltip"
                        className="pointer-events-none absolute left-1/2 top-full z-30 mt-2 hidden w-64 -translate-x-1/2 rounded-xl border border-black/5 bg-alloro-navy px-3 py-2 text-left text-[10px] font-semibold leading-relaxed text-white shadow-xl group-hover:block group-focus-visible:block"
                      >
                        {RECOMMENDED_RADIUS_TOOLTIP}
                      </span>
                    </>
                  )}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => onRefresh(value)}
            disabled={refreshing}
            className="inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-alloro-orange px-4 py-2 text-sm font-black text-white shadow-md transition hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60"
          >
            {refreshing ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Sparkles size={16} />
            )}
            Refresh suggestions
          </button>
      </div>
    </div>
  );
}
