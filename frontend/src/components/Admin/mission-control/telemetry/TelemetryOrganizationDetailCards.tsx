import {
  Activity,
  Clock3,
  Eye,
  MousePointerClick,
  Radio,
  Users,
} from "lucide-react";
import type { ReactNode } from "react";
import type {
  MissionControlTelemetryOrganizationRow,
  MissionControlTelemetryOrganizationSummary,
} from "../../../../api/admin-mission-control";

export type TelemetryOrganizationDetailCardsProps = {
  organization: MissionControlTelemetryOrganizationRow;
  summary: MissionControlTelemetryOrganizationSummary;
};

export function TelemetryOrganizationDetailCards({
  organization,
  summary,
}: TelemetryOrganizationDetailCardsProps) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-6">
      <DetailCard
        label="Active Users"
        value={summary.activeUsers}
        hint="Tracked users"
        icon={<Users className="h-4.5 w-4.5" />}
        tone="teal"
      />
      <DetailCard
        label="Sessions"
        value={summary.totalSessions}
        hint="Distinct sessions"
        icon={<Radio className="h-4.5 w-4.5" />}
        tone="orange"
      />
      <DetailCard
        label="Views"
        value={summary.totalPageViews}
        hint="Route views"
        icon={<MousePointerClick className="h-4.5 w-4.5" />}
        tone="green"
      />
      <DetailCard
        label="Active Time"
        value={`${formatNumber(summary.totalActiveMinutes)}m`}
        hint={`${formatNumber(summary.averageActiveMinutesPerUser)}m / user`}
        icon={<Clock3 className="h-4.5 w-4.5" />}
        tone="blue"
      />
      <DetailCard
        label="Last Active"
        value={formatLastActive(summary.lastActiveAt)}
        hint={organization.domain || "No domain"}
        icon={<Activity className="h-4.5 w-4.5" />}
        tone="navy"
      />
      <DetailCard
        label="Top Surface"
        value={formatSurface(summary.topSurface)}
        hint="Most viewed area"
        icon={<Eye className="h-4.5 w-4.5" />}
        tone="slate"
      />
    </div>
  );
}

function DetailCard({
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
  tone: "teal" | "orange" | "green" | "blue" | "navy" | "slate";
}) {
  const toneClass = {
    teal: "bg-alloro-teal/10 text-alloro-teal",
    orange: "bg-alloro-orange/10 text-alloro-orange",
    green: "bg-emerald-50 text-emerald-700",
    blue: "bg-sky-50 text-sky-700",
    navy: "bg-alloro-navy/5 text-alloro-navy",
    slate: "bg-slate-100 text-slate-700",
  }[tone];

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
            {label}
          </p>
          <p className="mt-2 truncate text-xl font-black tabular-nums text-alloro-navy">
            {value}
          </p>
        </div>
        <div className={`rounded-lg p-2.5 ${toneClass}`}>{icon}</div>
      </div>
      <p className="mt-2 truncate text-xs font-medium text-gray-500">{hint}</p>
    </div>
  );
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: value >= 10 ? 0 : 1,
  }).format(value);
}

function formatLastActive(value: string | null): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function formatSurface(value: string | null): string {
  if (!value) return "-";
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
