import { Building2, Clock3, MousePointerClick, Users } from "lucide-react";
import type { ReactNode } from "react";
import type { MissionControlTelemetrySummary } from "../../../../api/admin-mission-control";

export type TelemetrySummaryCardsProps = {
  summary: MissionControlTelemetrySummary;
};

export function TelemetrySummaryCards({ summary }: TelemetrySummaryCardsProps) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      <MetricCard
        label="Active Orgs"
        value={summary.activeOrganizations}
        hint={`${summary.inactivePaidOrganizations} paid orgs quiet`}
        icon={<Building2 className="h-4.5 w-4.5" />}
        tone="teal"
      />
      <MetricCard
        label="Active Users"
        value={summary.activeUsers}
        hint={`${summary.totalSessions} sessions`}
        icon={<Users className="h-4.5 w-4.5" />}
        tone="orange"
      />
      <MetricCard
        label="Page Views"
        value={summary.totalPageViews}
        hint="Tracked route views"
        icon={<MousePointerClick className="h-4.5 w-4.5" />}
        tone="green"
      />
      <MetricCard
        label="Active Time"
        value={`${formatNumber(summary.totalActiveMinutes)}m`}
        hint={`${formatNumber(summary.averageActiveMinutesPerUser)}m / user`}
        icon={<Clock3 className="h-4.5 w-4.5" />}
        tone="blue"
      />
    </div>
  );
}

function MetricCard({
  label,
  value,
  hint,
  icon,
  tone,
}: {
  label: string;
  value: string | number;
  hint: string;
  icon: ReactNode;
  tone: "teal" | "orange" | "green" | "blue";
}) {
  const toneClass = {
    teal: "bg-alloro-teal/10 text-alloro-teal",
    orange: "bg-alloro-orange/10 text-alloro-orange",
    green: "bg-emerald-50 text-emerald-700",
    blue: "bg-sky-50 text-sky-700",
  }[tone];

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
            {label}
          </p>
          <p className="mt-2 text-2xl font-black tabular-nums text-alloro-navy">
            {value}
          </p>
        </div>
        <div className={`rounded-lg p-2.5 ${toneClass}`}>{icon}</div>
      </div>
      <p className="mt-2 text-xs font-medium text-gray-500">{hint}</p>
    </div>
  );
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: value >= 10 ? 0 : 1,
  }).format(value);
}
