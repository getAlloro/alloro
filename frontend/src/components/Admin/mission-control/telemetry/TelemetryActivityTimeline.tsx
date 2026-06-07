import { Clock3, MousePointerClick, Radio, Route, Timer } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { MissionControlTelemetryMovementRow } from "../../../../api/admin-mission-control";

export type TelemetryActivityTimelineProps = {
  movements: MissionControlTelemetryMovementRow[];
};

export function TelemetryActivityTimeline({
  movements,
}: TelemetryActivityTimelineProps) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-start gap-3 border-b border-gray-100 p-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-alloro-orange/10 text-alloro-orange">
          <Route className="h-4.5 w-4.5" />
        </span>
        <div>
          <h2 className="text-base font-black text-alloro-navy">
            Activity Timeline
          </h2>
          <p className="mt-1 text-xs font-medium text-gray-500">
            Recent route and session movement from first-party telemetry.
          </p>
        </div>
      </div>

      <div className="max-h-[520px] space-y-3 overflow-y-auto p-4">
        {movements.length === 0 ? (
          <div className="flex min-h-[220px] items-center justify-center rounded-lg border border-dashed border-gray-200 bg-gray-50 text-sm font-bold text-gray-500">
            No tracked activity in this range.
          </div>
        ) : (
          movements.map((movement) => (
            <TimelineItem key={movement.id} movement={movement} />
          ))
        )}
      </div>
    </section>
  );
}

function TimelineItem({
  movement,
}: {
  movement: MissionControlTelemetryMovementRow;
}) {
  const Icon = getEventIcon(movement.eventName);

  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-3">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-alloro-teal shadow-sm">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-black text-alloro-navy">
              {movement.eventLabel}
            </p>
            <time className="text-[11px] font-bold text-gray-400">
              {formatTimestamp(movement.createdAt)}
            </time>
          </div>
          <p className="mt-1 truncate text-xs font-semibold text-gray-600">
            {movement.pageLabel || movement.routeTemplate || "Unknown route"}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-bold text-gray-500">
            <span>
              {movement.userName || movement.userEmail || "Unknown user"}
            </span>
            <span>·</span>
            <span>{formatSurface(movement.surface)}</span>
            {movement.activeMinutes > 0 && (
              <>
                <span>·</span>
                <span>{movement.activeMinutes}m active</span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function getEventIcon(eventName: string): LucideIcon {
  if (eventName === "app.session_started") return Radio;
  if (eventName === "app.page_active_heartbeat") return Timer;
  if (eventName === "app.page_viewed") return MousePointerClick;
  return Clock3;
}

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatSurface(value: string | null): string {
  if (!value) return "No surface";
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
