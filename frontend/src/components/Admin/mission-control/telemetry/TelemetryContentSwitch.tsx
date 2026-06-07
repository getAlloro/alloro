import type {
  MissionControlTelemetryData,
  MissionControlTelemetryOrganizationDetailData,
  MissionControlTelemetryOrganizationRow,
  MissionControlTelemetryUserDetailData,
  MissionControlTelemetryUserRow,
} from "../../../../api/admin-mission-control";
import { TelemetryAggregateView } from "./TelemetryAggregateView";
import { TelemetryErrorState } from "./TelemetryErrorState";
import { TelemetryOrganizationDetailView } from "./TelemetryOrganizationDetailView";
import { TelemetryUserDetailView } from "./TelemetryUserDetailView";

export type TelemetryContentSwitchProps = {
  detailOrganizationId: number | null;
  detailUserId: number | null;
  aggregateData: MissionControlTelemetryData | undefined;
  organizations: MissionControlTelemetryOrganizationRow[];
  selectedOrganization: MissionControlTelemetryOrganizationRow | null;
  selectedOrganizationId: number | null;
  users: MissionControlTelemetryUserRow[];
  isUsersLoading: boolean;
  organizationDetailData:
    | MissionControlTelemetryOrganizationDetailData
    | undefined;
  isOrganizationDetailError: boolean;
  organizationDetailErrorMessage: string | undefined;
  isOrganizationDetailLoading: boolean;
  userDetailData: MissionControlTelemetryUserDetailData | undefined;
  isUserDetailError: boolean;
  userDetailErrorMessage: string | undefined;
  isUserDetailLoading: boolean;
  onBackToOrganizations: () => void;
  onBackToOrganization: () => void;
  onSelectOrganization: (organizationId: number) => void;
  onSelectUser: (userId: number) => void;
};

export function TelemetryContentSwitch({
  detailOrganizationId,
  detailUserId,
  aggregateData,
  organizations,
  selectedOrganization,
  selectedOrganizationId,
  users,
  isUsersLoading,
  organizationDetailData,
  isOrganizationDetailError,
  organizationDetailErrorMessage,
  isOrganizationDetailLoading,
  userDetailData,
  isUserDetailError,
  userDetailErrorMessage,
  isUserDetailLoading,
  onBackToOrganizations,
  onBackToOrganization,
  onSelectOrganization,
  onSelectUser,
}: TelemetryContentSwitchProps) {
  if (detailOrganizationId && detailUserId) {
    return isUserDetailError ? (
      <TelemetryErrorState
        title="User telemetry did not load"
        message={
          userDetailErrorMessage ||
          "The user telemetry endpoint returned an error."
        }
        actionLabel="Back to organization"
        onAction={onBackToOrganization}
      />
    ) : (
      <TelemetryUserDetailView
        data={userDetailData}
        isLoading={isUserDetailLoading}
        onBack={onBackToOrganization}
        onBackToOverview={onBackToOrganizations}
      />
    );
  }

  if (detailOrganizationId) {
    return isOrganizationDetailError ? (
      <TelemetryErrorState
        title="Organization telemetry did not load"
        message={
          organizationDetailErrorMessage ||
          "The organization telemetry endpoint returned an error."
        }
        actionLabel="Back to organizations"
        onAction={onBackToOrganizations}
      />
    ) : (
      <TelemetryOrganizationDetailView
        data={organizationDetailData}
        isLoading={isOrganizationDetailLoading}
        onBack={onBackToOrganizations}
        onSelectUser={onSelectUser}
      />
    );
  }

  if (!aggregateData) return null;
  return (
    <TelemetryAggregateView
      data={aggregateData}
      organizations={organizations}
      selectedOrganization={selectedOrganization}
      selectedOrganizationId={selectedOrganizationId}
      users={users}
      isUsersLoading={isUsersLoading}
      onSelectOrganization={onSelectOrganization}
      onSelectUser={onSelectUser}
    />
  );
}
