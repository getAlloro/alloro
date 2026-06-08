import type {
  MissionControlTelemetryData,
  MissionControlTelemetryOrganizationRow,
  MissionControlTelemetryUserRow,
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
          onSelectOrganization={onSelectOrganization}
        />
        <TelemetryUserDrilldown
          organization={selectedOrganization}
          users={users}
          isLoading={isUsersLoading}
          onSelectUser={onSelectUser}
        />
      </div>
    </>
  );
}
