import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  adminGetMissionControl,
  adminGetMissionControlInsight,
  type MissionControlData,
} from "../../api/admin-mission-control";
import { adminStartPilotSession } from "../../api/admin-organizations";
import { QUERY_KEYS } from "../../lib/queryClient";

export function useAdminMissionControl() {
  const queryKey = QUERY_KEYS.adminMissionControl;

  return useQuery<MissionControlData>({
    queryKey,
    queryFn: () => adminGetMissionControl(true),
    refetchOnMount: "always",
    staleTime: 0,
    gcTime: 0,
  });
}

export function useRefreshAdminMissionControl() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: () => adminGetMissionControl(true),
    onSuccess: (data) => {
      qc.setQueryData(QUERY_KEYS.adminMissionControl, data);
    },
  });
}

export function useAdminMissionControlInsight() {
  return useMutation({
    mutationKey: QUERY_KEYS.adminMissionControlInsight,
    mutationFn: adminGetMissionControlInsight,
  });
}

export function useAdminMissionControlPilotSession() {
  return useMutation({
    mutationFn: (userId: number) => adminStartPilotSession(userId),
  });
}
