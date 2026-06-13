import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deletePmsFileManagerFile,
  fetchPmsFileDetail,
  fetchPmsFileManager,
  fetchPmsOriginalFileUrl,
  rerunPmsInsights,
  updatePmsFileManagerFile,
  type PmsFileDetailResponse,
  type PmsFileManagerResponse,
} from "../../api/pms";
import { QUERY_KEYS } from "../../lib/queryClient";

// Exported so upload flows (e.g. the manual-entry modal overlaying an open
// file-manager panel) can refresh the same surfaces a file edit/delete does.
export function useInvalidatePmsFileSurfaces(
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
    // agentData/tasks are intentionally NOT invalidated here: edit/delete no
    // longer trigger a rerun, so analysis output is unchanged until the user
    // explicitly reruns via "Get updated insights".
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
  const queryClient = useQueryClient();
  const invalidate = useInvalidatePmsFileSurfaces(orgId, locationId);
  const key = QUERY_KEYS.pmsFileManager(orgId, locationId);

  return useMutation({
    mutationFn: (jobId: number) => deletePmsFileManagerFile(jobId, locationId!),
    // Optimistically mark the file deleted and free its month slots so the
    // panel reflects the change instantly; roll back if the request fails.
    onMutate: async (jobId: number) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<PmsFileManagerResponse>(key);
      if (previous?.data) {
        queryClient.setQueryData<PmsFileManagerResponse>(key, {
          ...previous,
          data: {
            ...previous.data,
            files: previous.data.files.map((file) =>
              file.id === jobId
                ? { ...file, is_deleted: true, active_months: [] }
                : file
            ),
            monthSlots: previous.data.monthSlots.map((slot) =>
              slot.jobId === jobId
                ? { ...slot, status: "missing" as const, jobId: null, fileName: null }
                : slot
            ),
          },
        });
      }
      return { previous };
    },
    // Roll back when the request rejects (thrown error)...
    onError: (_error, _jobId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(key, context.previous);
      }
    },
    // ...or resolves with a failure shape (e.g. 409 while a run is active).
    onSuccess: (response, _jobId, context) => {
      if (!response.success && context?.previous) {
        queryClient.setQueryData(key, context.previous);
      }
    },
    onSettled: invalidate,
  });
}

export function useRerunPmsInsights(
  orgId: number | null,
  locationId: number | null
) {
  const invalidate = useInvalidatePmsFileSurfaces(orgId, locationId);
  return useMutation({
    mutationFn: () => rerunPmsInsights(locationId!),
    onSuccess: invalidate,
  });
}

export function usePmsOriginalFileDownload(locationId: number | null) {
  return useMutation({
    mutationFn: (jobId: number) => fetchPmsOriginalFileUrl(jobId, locationId!),
  });
}
