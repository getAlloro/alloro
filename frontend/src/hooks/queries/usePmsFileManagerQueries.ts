import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deletePmsFileManagerFile,
  fetchPmsFileDetail,
  fetchPmsFileManager,
  fetchPmsOriginalFileUrl,
  updatePmsFileManagerFile,
  type PmsFileDetailResponse,
  type PmsFileManagerResponse,
} from "../../api/pms";
import { QUERY_KEYS } from "../../lib/queryClient";

function useInvalidatePmsFileSurfaces(
  orgId: number | null,
  locationId: number | null
) {
  const queryClient = useQueryClient();

  return () => {
    void queryClient.invalidateQueries({
      queryKey: QUERY_KEYS.pmsFileManager(orgId, locationId),
    });
    void queryClient.invalidateQueries({
      queryKey: ["pms-file-detail", orgId, locationId],
    });
    void queryClient.invalidateQueries({
      queryKey: QUERY_KEYS.pmsFocusPeriod(orgId, locationId),
    });
    void queryClient.invalidateQueries({
      queryKey: QUERY_KEYS.agentData(orgId, locationId),
    });
    void queryClient.invalidateQueries({
      queryKey: QUERY_KEYS.tasks(orgId, locationId),
    });
  };
}

export function usePmsFileManager(
  orgId: number | null,
  locationId: number | null
) {
  return useQuery<PmsFileManagerResponse>({
    queryKey: QUERY_KEYS.pmsFileManager(orgId, locationId),
    queryFn: () => fetchPmsFileManager(locationId!),
    enabled: Boolean(orgId && locationId),
    staleTime: 15_000,
  });
}

export function usePmsFileDetail(
  orgId: number | null,
  locationId: number | null,
  jobId: number | null
) {
  return useQuery<PmsFileDetailResponse>({
    queryKey: QUERY_KEYS.pmsFileDetail(orgId, locationId, jobId),
    queryFn: () => fetchPmsFileDetail(jobId!, locationId!),
    enabled: Boolean(orgId && locationId && jobId),
    staleTime: 10_000,
  });
}

export function useUpdatePmsFile(
  orgId: number | null,
  locationId: number | null
) {
  const invalidate = useInvalidatePmsFileSurfaces(orgId, locationId);
  return useMutation({
    mutationFn: ({
      jobId,
      responseLog,
    }: {
      jobId: number;
      responseLog: Record<string, unknown>;
    }) => updatePmsFileManagerFile(jobId, locationId!, responseLog),
    onSuccess: invalidate,
  });
}

export function useDeletePmsFile(
  orgId: number | null,
  locationId: number | null
) {
  const invalidate = useInvalidatePmsFileSurfaces(orgId, locationId);
  return useMutation({
    mutationFn: (jobId: number) => deletePmsFileManagerFile(jobId, locationId!),
    onSuccess: invalidate,
  });
}

export function usePmsOriginalFileDownload(locationId: number | null) {
  return useMutation({
    mutationFn: (jobId: number) => fetchPmsOriginalFileUrl(jobId, locationId!),
  });
}
