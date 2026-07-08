import React from "react";
import { MapPin } from "lucide-react";
import type { LocationBillingSummary } from "../../api/billing";

/**
 * "N locations × $X/mo = $Z/mo" line for the Billing plan card.
 * Flat-rate orgs see their flat total with the location count for context.
 * Renders nothing when the summary is missing or carries no price
 * (e.g. subscription unreachable) — the card simply stays as it was.
 */

export const formatCents = (
  cents: number,
  currency: string | null
): string =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: (currency || "usd").toUpperCase(),
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);

export const PlanLocationSummary: React.FC<{
  summary?: LocationBillingSummary;
}> = ({ summary }) => {
  if (!summary || summary.monthlyTotal == null) return null;

  const count = summary.locationCount;
  const locationsLabel = `${count} ${count === 1 ? "location" : "locations"}`;
  const pending = summary.pendingCancellationCount ?? 0;

  return (
    <div className="px-4 py-3 bg-slate-50 rounded-xl border border-black/5 space-y-1">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-alloro-orange/[0.07] flex items-center justify-center shrink-0">
            <MapPin size={14} className="text-alloro-orange" />
          </div>
          <span className="text-sm text-slate-600 font-medium">
            {summary.isFlatRate
              ? `Flat rate · ${locationsLabel}`
              : summary.unitAmount != null
                ? `${locationsLabel} × ${formatCents(summary.unitAmount, summary.currency)}/mo`
                : locationsLabel}
          </span>
        </div>
        <span className="text-sm font-bold text-alloro-navy">
          {formatCents(summary.monthlyTotal, summary.currency)}/mo
        </span>
      </div>
      {pending > 0 && (
        <p className="text-xs text-amber-700 pl-[38px]">
          {pending} {pending === 1 ? "location" : "locations"} ending
          {summary.nextEndingAt
            ? ` ${new Date(summary.nextEndingAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`
            : " at period end"}{" "}
          — still active until then.
        </p>
      )}
    </div>
  );
};
