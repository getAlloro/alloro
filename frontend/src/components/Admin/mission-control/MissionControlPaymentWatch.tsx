import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { MissionControlOrganization } from "../../../api/admin-mission-control";

export type MissionControlPaymentWatchProps = {
  organizations: MissionControlOrganization[];
};

type WatchMode = "lifetime" | "flags";

export function MissionControlPaymentWatch({
  organizations,
}: MissionControlPaymentWatchProps) {
  const [mode, setMode] = useState<WatchMode>("lifetime");
  const watchedOrgs = useMemo(
    () => buildWatchedOrganizations(organizations, mode),
    [mode, organizations],
  );

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-black text-alloro-navy">
            Payment Watch
          </h2>
          <p className="mt-1 text-xs font-medium leading-5 text-gray-500">
            {mode === "lifetime"
              ? "Highest lifetime revenue accounts."
              : "Billing flags that need attention."}
          </p>
        </div>
        <span className="rounded-full bg-alloro-orange/10 px-2.5 py-1 text-xs font-black text-alloro-orange">
          {watchedOrgs.length}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <WatchToggle active={mode === "lifetime"} onClick={() => setMode("lifetime")}>
          Lifetime
        </WatchToggle>
        <WatchToggle active={mode === "flags"} onClick={() => setMode("flags")}>
          Billing Flags
        </WatchToggle>
      </div>

      <div className="mt-4 space-y-2.5">
        {watchedOrgs.length === 0 ? (
          <div className="rounded-lg border border-green-100 bg-green-50 px-3 py-2 text-xs font-bold text-green-700">
            No accounts match this watch view.
          </div>
        ) : (
          watchedOrgs.map((org) => (
            <Link
              key={org.id}
              to={`/admin/organizations/${org.id}`}
              className="block rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5 transition-colors hover:border-alloro-orange/30 hover:bg-alloro-orange/5"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="min-w-0 truncate text-xs font-black text-alloro-navy">
                  {org.name}
                </p>
                <p
                  className={`shrink-0 text-xs font-black tabular-nums ${
                    mode === "lifetime" ? "text-emerald-600" : "text-alloro-orange"
                  }`}
                >
                  {formatCurrency(
                    mode === "lifetime"
                      ? org.lifetimePaid
                      : org.expectedMonthlyAmount,
                  )}
                </p>
              </div>
              <p className="mt-1 truncate text-[10px] font-bold uppercase tracking-wider text-gray-500">
                {mode === "lifetime"
                  ? "Lifetime received"
                  : org.riskFlags.join(" / ").replace(/_/g, " ")}
              </p>
            </Link>
          ))
        )}
      </div>
    </section>
  );
}

function WatchToggle({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-3 py-2 text-[11px] font-bold uppercase tracking-wider transition-all ${
        active
          ? "bg-alloro-navy text-white"
          : "border border-gray-200 bg-gray-50 text-gray-500 hover:border-alloro-orange/30 hover:text-alloro-orange"
      }`}
    >
      {children}
    </button>
  );
}

function buildWatchedOrganizations(
  organizations: MissionControlOrganization[],
  mode: WatchMode,
): MissionControlOrganization[] {
  if (mode === "flags") {
    return [...organizations]
      .filter((org) => org.riskFlags.length > 0)
      .sort((a, b) => b.expectedMonthlyAmount - a.expectedMonthlyAmount)
      .slice(0, 5);
  }

  return [...organizations]
    .filter((org) => org.lifetimePaid > 0)
    .sort((a, b) => b.lifetimePaid - a.lifetimePaid)
    .slice(0, 5);
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}
