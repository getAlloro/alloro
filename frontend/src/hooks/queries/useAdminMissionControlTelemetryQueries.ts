import { useQuery } from "@tanstack/react-query";
import {
  adminGetMissionControlTelemetry,
  adminGetMissionControlTelemetryUsers,
  type MissionControlTelemetryData,
  type MissionControlTelemetryRange,
  type MissionControlTelemetryUsersData,
} from "../../api/admin-mission-control";
import { QUERY_KEYS } from "../../lib/queryClient";

export function useAdminMissionControlTelemetry(
  range: MissionControlTelemetryRange,
  includePilot: boolean,
) {
  return useQuery<MissionControlTelemetryData>({
    queryKey: QUERY_KEYS.adminMissionControlTelemetry(range, includePilot),
    queryFn: () => adminGetMissionControlTelemetry(range, includePilot),
    staleTime: 60_000,
  });
}

export function useAdminMissionControlTelemetryUsers(
  organizationId: number | null,
  range: MissionControlTelemetryRange,
  includePilot: boolean,
) {
  return useQuery<MissionControlTelemetryUsersData>({
    queryKey: QUERY_KEYS.adminMissionControlTelemetryUsers(
      organizationId,
      range,
      includePilot,
    ),
    queryFn: () =>
      adminGetMissionControlTelemetryUsers(organizationId as number, range, includePilot),
    enabled: Number.isInteger(organizationId) && Number(organizationId) > 0,
    staleTime: 60_000,
  });
}
