import { useQuery } from "@tanstack/react-query";
import {
  adminGetMissionControlTelemetry,
  adminGetMissionControlTelemetryOrganizationDetail,
  adminGetMissionControlTelemetryUserDetail,
  adminGetMissionControlTelemetryUsers,
  type MissionControlTelemetryData,
  type MissionControlTelemetryOrganizationDetailData,
  type MissionControlTelemetryRange,
  type MissionControlTelemetryUserDetailData,
  type MissionControlTelemetryUsersData,
} from "../../api/admin-mission-control";
import { QUERY_KEYS } from "../../lib/queryClient";

export function useAdminMissionControlTelemetry(
  range: MissionControlTelemetryRange,
  includePilot: boolean,
  includeAdmin: boolean,
) {
  return useQuery<MissionControlTelemetryData>({
    queryKey: QUERY_KEYS.adminMissionControlTelemetry(
      range,
      includePilot,
      includeAdmin,
    ),
    queryFn: () =>
      adminGetMissionControlTelemetry(range, includePilot, includeAdmin),
    staleTime: 60_000,
  });
}

export function useAdminMissionControlTelemetryUsers(
  organizationId: number | null,
  range: MissionControlTelemetryRange,
  includePilot: boolean,
  includeAdmin: boolean,
) {
  return useQuery<MissionControlTelemetryUsersData>({
    queryKey: QUERY_KEYS.adminMissionControlTelemetryUsers(
      organizationId,
      range,
      includePilot,
      includeAdmin,
    ),
    queryFn: () =>
      adminGetMissionControlTelemetryUsers(
        organizationId as number,
        range,
        includePilot,
        includeAdmin,
      ),
    enabled: Number.isInteger(organizationId) && Number(organizationId) > 0,
    staleTime: 60_000,
  });
}

export function useAdminMissionControlTelemetryOrganizationDetail(
  organizationId: number | null,
  range: MissionControlTelemetryRange,
  includePilot: boolean,
  includeAdmin: boolean,
) {
  return useQuery<MissionControlTelemetryOrganizationDetailData>({
    queryKey: QUERY_KEYS.adminMissionControlTelemetryOrganizationDetail(
      organizationId,
      range,
      includePilot,
      includeAdmin,
    ),
    queryFn: () =>
      adminGetMissionControlTelemetryOrganizationDetail(
        organizationId as number,
        range,
        includePilot,
        includeAdmin,
      ),
    enabled: Number.isInteger(organizationId) && Number(organizationId) > 0,
    staleTime: 60_000,
  });
}

export function useAdminMissionControlTelemetryUserDetail(
  organizationId: number | null,
  userId: number | null,
  range: MissionControlTelemetryRange,
  includePilot: boolean,
  includeAdmin: boolean,
) {
  return useQuery<MissionControlTelemetryUserDetailData>({
    queryKey: QUERY_KEYS.adminMissionControlTelemetryUserDetail(
      organizationId,
      userId,
      range,
      includePilot,
      includeAdmin,
    ),
    queryFn: () =>
      adminGetMissionControlTelemetryUserDetail(
        organizationId as number,
        userId as number,
        range,
        includePilot,
        includeAdmin,
      ),
    enabled:
      Number.isInteger(organizationId) &&
      Number(organizationId) > 0 &&
      Number.isInteger(userId) &&
      Number(userId) > 0,
    staleTime: 60_000,
  });
}
