import {
  Clock3,
  Eye,
  MousePointer2,
  Radio,
  Timer,
  UserRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { MissionControlTelemetryUserRow } from "../../../../api/admin-mission-control";

export type TelemetryUserDetailCardsProps = {
  user: MissionControlTelemetryUserRow;
};

type CardConfig = {
  label: string;
  value: string | number;
  helper: string;
  icon: LucideIcon;
  tone: string;
};

export function TelemetryUserDetailCards({
  user,
}: TelemetryUserDetailCardsProps) {
  const cards: CardConfig[] = [
    {
      label: "User",
      value: user.name || user.email,
      helper: user.role || "Tracked account",
      icon: UserRound,
      tone: "bg-sky-50 text-sky-700",
    },
    {
      label: "Sessions",
      value: user.sessions,
      helper: "Distinct sessions",
      icon: Radio,
      tone: "bg-alloro-orange/10 text-alloro-orange",
    },
    {
      label: "Views",
      value: user.pageViews,
      helper: "Route views",
      icon: MousePointer2,
      tone: "bg-emerald-50 text-emerald-700",
    },
    {
      label: "Active Time",
      value: `${user.activeMinutes}m`,
      helper: "Visible focused activity",
      icon: Timer,
      tone: "bg-blue-50 text-blue-700",
    },
    {
      label: "Last Active",
      value: formatDate(user.lastActiveAt),
      helper: "Most recent event",
      icon: Clock3,
      tone: "bg-gray-100 text-alloro-navy",
    },
    {
      label: "Top Surface",
      value: formatSurface(user.topSurface),
      helper: "Most viewed area",
      icon: Eye,
      tone: "bg-gray-100 text-alloro-navy",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
      {cards.map((card) => (
        <TelemetryUserDetailCard key={card.label} card={card} />
      ))}
    </div>
  );
}

function TelemetryUserDetailCard({ card }: { card: CardConfig }) {
  const Icon = card.icon;
  return (
    <article className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-wider text-gray-500">
            {card.label}
          </p>
          <p className="mt-3 truncate text-2xl font-black tabular-nums text-alloro-navy">
            {card.value}
          </p>
          <p className="mt-2 truncate text-xs font-medium text-gray-500">
            {card.helper}
          </p>
        </div>
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${card.tone}`}
        >
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </article>
  );
}

function formatDate(value: string | null): string {
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
