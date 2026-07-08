import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-hot-toast";
import {
  adminOsCreateFolder,
  adminOsDeleteFolder,
  adminOsGetFolderTree,
  adminOsUpdateFolder,
  type OsFolderTree,
} from "../../api/admin-os";
import { getErrorMessage } from "../../lib/errorMessage";
import { QUERY_KEYS } from "../../lib/queryClient";

/**
 * Folder tree + folder mutations (plans/07042026-alloro-os-admin-port P3 T1).
 * Tree nodes carry document_count, so document moves invalidate this key too
 * (see useAdminOsDocumentMutations).
 */

const OS_FOLDERS_STALE_TIME_MS = 15_000;

export function useAdminOsFolders() {
  return useQuery<OsFolderTree>({
    queryKey: QUERY_KEYS.adminOsFolders,
    queryFn: adminOsGetFolderTree,
    staleTime: OS_FOLDERS_STALE_TIME_MS,
  });
}

function useInvalidateOsFolders() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.adminOsFolders });
    void queryClient.invalidateQueries({
      queryKey: QUERY_KEYS.adminOsDocumentsAll,
    });
  };
}

export function useCreateOsFolder() {
  const invalidate = useInvalidateOsFolders();
  return useMutation({
    mutationFn: (input: { name: string; parent_id?: string | null }) =>
      adminOsCreateFolder(input),
    onSuccess: invalidate,
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error) || "Couldn't create the folder");
    },
  });
}

export function useUpdateOsFolder() {
  const invalidate = useInvalidateOsFolders();
  return useMutation({
    mutationFn: (variables: {
      folderId: string;
      patch: { name?: string; parent_id?: string | null };
    }) => adminOsUpdateFolder(variables.folderId, variables.patch),
    onSuccess: invalidate,
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error) || "Couldn't update the folder");
    },
  });
}

export function useDeleteOsFolder() {
  const invalidate = useInvalidateOsFolders();
  return useMutation({
    mutationFn: (folderId: string) => adminOsDeleteFolder(folderId),
    onSuccess: (result) => {
      invalidate();
      if (result.documents_moved_to_root > 0) {
        toast.success(
          `Folder deleted — ${result.documents_moved_to_root} document${
            result.documents_moved_to_root === 1 ? "" : "s"
          } moved to root`,
        );
      }
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error) || "Couldn't delete the folder");
    },
  });
}
