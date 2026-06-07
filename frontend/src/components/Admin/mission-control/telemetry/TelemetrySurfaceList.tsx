import { Layers3 } from "lucide-react";
import type {
  MissionControlTelemetryPageRow,
  MissionControlTelemetrySurfaceRow,
} from "../../../../api/admin-mission-control";

export type TelemetrySurfaceListProps = {
  surfaces: MissionControlTelemetrySurfaceRow[];
  pages: MissionControlTelemetryPageRow[];
};

export function TelemetrySurfaceList({
  surfaces,
  pages,
}: TelemetrySurfaceListProps) {
  const maxViews = Math.max(...surfaces.map((surface) => surface.pageViews), 1);

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-alloro-orange/10 text-alloro-orange">
          <Layers3 className="h-4.5 w-4.5" />
        </span>
        <div>
          <h2 className="text-base font-black text-alloro-navy">
            Surfaces & Pages
          </h2>
          <p className="mt-1 text-xs font-medium text-gray-500">
            Usage share across tracked app areas.
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {surfaces.slice(0, 8).map((surface) => (
          <div key={surface.surface}>
            <div className="flex items-center justify-between gap-3 text-xs">
              <div className="min-w-0">
                <span className="font-black text-alloro-navy">
                  {formatSurface(surface.surface)}
                </span>
                <p className="mt-0.5 truncate text-[11px] font-semibold text-gray-400">
                  {formatAccessContext(surface)}
                </p>
              </div>
              <span className="font-bold tabular-nums text-gray-500">
                {surface.pageViews} views · {surface.activeMinutes}m
              </span>
            </div>
            <div className="mt-2 h-2 rounded-full bg-gray-100">
              <div
                className="h-2 rounded-full bg-alloro-teal"
                style={{ width: `${Math.max((surface.pageViews / maxViews) * 100, 4)}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 border-t border-gray-100 pt-4">
        <p className="text-[11px] font-black uppercase tracking-wider text-gray-400">
          Top Pages
        </p>
        <div className="mt-3 space-y-2">
          {pages.slice(0, 6).map((page) => (
            <div
              key={buildPageKey(page)}
              className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 px-3 py-2.5"
            >
              <div className="min-w-0">
                <span className="block truncate text-xs font-bold text-alloro-navy">
                  {page.pageLabel || page.routeTemplate}
                </span>
                <span className="mt-0.5 block truncate text-[11px] font-semibold text-gray-400">
                  {formatAccessContext(page)}
                </span>
              </div>
              <span className="shrink-0 text-xs font-black tabular-nums text-gray-500">
                {page.pageViews} views
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function formatSurface(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatAccessContext(
  row: MissionControlTelemetryPageRow | MissionControlTelemetrySurfaceRow,
): string {
  const user = row.lastUserName || row.lastUserEmail || null;
  const org = row.lastOrganizationName || null;
  if (user && org) return `Last: ${user} · ${org}`;
  if (user) return `Last: ${user} · no org attached`;
  if (org) return `Last org: ${org}`;
  return `${row.activeUsers} users · ${row.activeOrganizations} orgs`;
}

function buildPageKey(page: MissionControlTelemetryPageRow): string {
  return [page.routeTemplate, page.pageLabel ?? "", page.surface ?? ""].join(
    "::",
  );
}
