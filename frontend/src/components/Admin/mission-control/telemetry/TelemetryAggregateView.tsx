import {
  telemetryRangeGranularity,
  type MissionControlTelemetryData,
  type MissionControlTelemetryOrganizationRow,
  type MissionControlTelemetryUserRow,
} from "../../../../api/admin-mission-control";
import { TelemetryOrganizationTable } from "./TelemetryOrganizationTable";
import { TelemetrySummaryCards } from "./TelemetrySummaryCards";
import { TelemetrySurfaceList } from "./TelemetrySurfaceList";
import { TelemetryTrendChart } from "./TelemetryTrendChart";
import { TelemetryUserDrilldown } from "./TelemetryUserDrilldown";

export type TelemetryAggregateViewProps = {
  data: MissionControlTelemetryData;
  organizations: MissionControlTelemetryOrganizationRow[];
  selectedOrganization: MissionControlTelemetryOrganizationRow | null;
  selectedOrganizationId: number | null;
  users: MissionControlTelemetryUserRow[];
  isUsersLoading: boolean;
  onSelectOrganization: (organizationId: number) => void;
  onSelectUser: (userId: number) => void;
};

export function TelemetryAggregateView({
  data,
  organizations,
  selectedOrganization,
  selectedOrganizationId,
  users,
  isUsersLoading,
  onSelectOrganization,
  onSelectUser,
}: TelemetryAggregateViewProps) {
  return (
    <>
      <TelemetrySummaryCards summary={data.summary} />

      {/* Two independent columns (items-start) — the chart card keeps its
          content height and Organization Usage stacks directly under it,
          instead of the grid stretching the chart to match the tall
          Surfaces & Pages rail. */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_420px] xl:items-start">
        <div className="min-w-0 space-y-5">
          <TelemetryTrendChart
            data={data.dailyUsage}
            variant="aggregate"
            granularity={telemetryRangeGranularity(data.range)}
          />
          <TelemetryOrganizationTable
            organizations={organizations}
            selectedOrganizationId={selectedOrganizationId}
            onSelectOrganization={onSelectOrganization}
          />
        </div>
        <div className="min-w-0 space-y-5">
          <TelemetrySurfaceList
            surfaces={data.surfaceUsage}
            pages={data.pageUsage}
          />
          <TelemetryUserDrilldown
            organization={selectedOrganization}
            users={users}
            isLoading={isUsersLoading}
            onSelectUser={onSelectUser}
          />
        </div>
      </div>
    </>
  );
}
