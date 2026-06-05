import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Loader2, RefreshCw } from "lucide-react";
import type {
  MissionControlTelemetryOrganizationRow,
  MissionControlTelemetryRange,
} from "../../../../api/admin-mission-control";
import {
  useAdminMissionControlTelemetry,
  useAdminMissionControlTelemetryUsers,
} from "../../../../hooks/queries/useAdminMissionControlTelemetryQueries";
import { TelemetryOrganizationTable } from "./TelemetryOrganizationTable";
import { TelemetrySummaryCards } from "./TelemetrySummaryCards";
import { TelemetrySurfaceList } from "./TelemetrySurfaceList";
import { TelemetryTrendChart } from "./TelemetryTrendChart";
import { TelemetryUserDrilldown } from "./TelemetryUserDrilldown";

const RANGES: MissionControlTelemetryRange[] = ["7d", "30d", "90d"];

export function MissionControlTelemetryTab() {
  const [range, setRange] = useState<MissionControlTelemetryRange>("30d");
  const [includePilot, setIncludePilot] = useState(false);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState<
    number | null
  >(null);
  const telemetryQuery = useAdminMissionControlTelemetry(range, includePilot);
  const data = telemetryQuery.data;
  const organizations = useMemo(
    () => data?.organizationUsage ?? [],
    [data?.organizationUsage],
  );

  useEffect(() => {
    if (organizations.length === 0) {
      setSelectedOrganizationId(null);
      return;
    }
    const stillPresent = organizations.some(
      (organization) => organization.organizationId === selectedOrganizationId,
    );
    if (!stillPresent) {
      setSelectedOrganizationId(organizations[0].organizationId);
    }
  }, [organizations, selectedOrganizationId]);

  const usersQuery = useAdminMissionControlTelemetryUsers(
    selectedOrganizationId,
    range,
    includePilot,
  );
  const selectedOrganization =
    organizations.find(
      (organization) => organization.organizationId === selectedOrganizationId,
    ) ?? null;

  if (telemetryQuery.isLoading && !data) {
    return (
      <div className="flex min-h-[420px] items-center justify-center rounded-xl border border-gray-200 bg-white">
        <div className="flex items-center gap-3 text-sm font-bold text-alloro-navy">
          <Loader2 className="h-4 w-4 animate-spin text-alloro-orange" />
          Loading telemetry
        </div>
      </div>
    );
  }

  if (telemetryQuery.isError || !data) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
        <AlertCircle className="mx-auto h-8 w-8 text-red-600" />
        <h2 className="mt-3 text-lg font-black text-red-900">
          Telemetry did not load
        </h2>
        <p className="mt-2 text-sm font-medium text-red-700">
          {telemetryQuery.error?.message ||
            "The telemetry aggregate endpoint returned an error."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-base font-black text-alloro-navy">
            Product Telemetry
          </h2>
          <p className="mt-1 text-xs font-medium text-gray-500">
            First-party app usage by organization, user, page, and surface.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {RANGES.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setRange(option)}
              className={`rounded-lg px-3 py-2 text-[11px] font-black uppercase tracking-wider transition-all ${
                range === option
                  ? "bg-alloro-navy text-white"
                  : "bg-gray-50 text-gray-500 hover:bg-gray-100 hover:text-alloro-navy"
              }`}
            >
              {option}
            </button>
          ))}
          <label className="inline-flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-[11px] font-black uppercase tracking-wider text-gray-500">
            <input
              type="checkbox"
              checked={includePilot}
              onChange={(event) => setIncludePilot(event.target.checked)}
              className="h-3.5 w-3.5 rounded border-gray-300 text-alloro-teal focus:ring-alloro-teal"
            />
            Pilot
          </label>
          <button
            type="button"
            onClick={() => {
              void telemetryQuery.refetch();
              void usersQuery.refetch();
            }}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-[11px] font-black uppercase tracking-wider text-gray-500 transition-all hover:border-alloro-teal/40 hover:text-alloro-navy"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${
                telemetryQuery.isFetching ? "animate-spin" : ""
              }`}
            />
            Refresh
          </button>
        </div>
      </div>

      <TelemetrySummaryCards summary={data.summary} />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <TelemetryTrendChart data={data.dailyUsage} />
        <TelemetrySurfaceList
          surfaces={data.surfaceUsage}
          pages={data.pageUsage}
        />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <TelemetryOrganizationTable
          organizations={organizations}
          selectedOrganizationId={selectedOrganizationId}
          onSelectOrganization={setSelectedOrganizationId}
        />
        <TelemetryUserDrilldown
          organization={
            selectedOrganization as MissionControlTelemetryOrganizationRow | null
          }
          users={usersQuery.data?.users ?? []}
          isLoading={usersQuery.isLoading || usersQuery.isFetching}
        />
      </div>
    </div>
  );
}
