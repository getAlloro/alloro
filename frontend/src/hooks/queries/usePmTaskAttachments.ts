import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-hot-toast";
import {
  deleteAttachment as deletePmTaskAttachment,
  getAttachmentDownloadUrl,
  listAttachments,
  uploadAttachment,
} from "../../api/pm";
import type { PmTaskUpload } from "../../components/pm/pmTaskFeed.utils";
import { getErrorMessage } from "../../lib/errorMessage";
import { QUERY_KEYS } from "../../lib/queryClient";
import type { PmTaskAttachment } from "../../types/pm";

export type PmTaskAttachmentsState = {
  attachments: PmTaskAttachment[];
  uploads: PmTaskUpload[];
  isLoading: boolean;
  error: string | null;
  uploadFiles: (files: FileList | File[]) => Promise<void>;
  remove: (attachment: PmTaskAttachment) => Promise<void>;
  download: (attachment: PmTaskAttachment) => Promise<void>;
  getPreviewUrl: (attachmentId: string) => Promise<string>;
};

const createUploadId = (filename: string): string =>
  `${Date.now()}-${filename}-${Math.random().toString(36).slice(2, 8)}`;

async function runUploads(
  taskId: string,
  files: FileList | File[],
  setUploads: Dispatch<SetStateAction<PmTaskUpload[]>>,
  addAttachment: (attachment: PmTaskAttachment) => void,
  isActive: () => boolean,
): Promise<void> {
  for (const file of Array.from(files)) {
    const id = createUploadId(file.name);
    setUploads((current) => [
      ...current,
      {
        id,
        filename: file.name,
        progress: 0,
        startedAt: new Date().toISOString(),
      },
    ]);
    try {
      const uploaded = await uploadAttachment(taskId, file, (progress) =>
        isActive()
          ? setUploads((current) =>
              current.map((item) =>
                item.id === id ? { ...item, progress } : item,
              ),
            )
          : undefined,
      );
      addAttachment(uploaded);
      if (isActive()) {
        setUploads((current) => current.filter((item) => item.id !== id));
      }
    } catch (error: unknown) {
      const message = getErrorMessage(error) || "Upload failed";
      if (isActive()) {
        setUploads((current) =>
          current.map((item) =>
            item.id === id ? { ...item, error: message } : item,
          ),
        );
      }
    }
  }
}

async function downloadPmTaskAttachment(
  taskId: string,
  attachment: PmTaskAttachment,
): Promise<void> {
  try {
    const { url } = await getAttachmentDownloadUrl(taskId, attachment.id, {
      forceDownload: true,
    });
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = attachment.filename;
    anchor.rel = "noopener noreferrer";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  } catch (error: unknown) {
    toast.error(getErrorMessage(error) || "Couldn't download the attachment");
  }
}

export function usePmTaskAttachments(
  taskId: string | null,
): PmTaskAttachmentsState {
  const queryClient = useQueryClient();
  const [uploads, setUploads] = useState<PmTaskUpload[]>([]);
  const activeTaskId = useRef(taskId);
  const query = useQuery({
    queryKey: QUERY_KEYS.pmTaskAttachments(taskId),
    queryFn: () => listAttachments(taskId as string),
    enabled: Boolean(taskId),
  });
  useEffect(() => {
    activeTaskId.current = taskId;
    setUploads([]);
  }, [taskId]);
  const removeMutation = useMutation({
    mutationFn: (attachment: PmTaskAttachment) =>
      deletePmTaskAttachment(taskId as string, attachment.id),
    onSuccess: (_, attachment) =>
      queryClient.setQueryData<PmTaskAttachment[]>(
        QUERY_KEYS.pmTaskAttachments(taskId),
        (current = []) => current.filter((item) => item.id !== attachment.id),
      ),
    onError: (error: unknown) =>
      toast.error(getErrorMessage(error) || "Couldn't delete the attachment"),
  });
  const uploadFiles = useCallback(
    async (files: FileList | File[]) => {
      if (!taskId) return;
      await runUploads(
        taskId,
        files,
        setUploads,
        (attachment) =>
          queryClient.setQueryData<PmTaskAttachment[]>(
            QUERY_KEYS.pmTaskAttachments(taskId),
            (current = []) => [attachment, ...current],
          ),
        () => activeTaskId.current === taskId,
      );
    },
    [queryClient, taskId],
  );
  const download = useCallback(
    async (attachment: PmTaskAttachment) => {
      if (taskId) await downloadPmTaskAttachment(taskId, attachment);
    },
    [taskId],
  );
  const getPreviewUrl = useCallback(
    async (attachmentId: string) => {
      if (!taskId) throw new Error("Task is unavailable");
      return (await getAttachmentDownloadUrl(taskId, attachmentId)).url;
    },
    [taskId],
  );
  return {
    attachments: query.data ?? [],
    uploads,
    isLoading: query.isLoading,
    error: query.error
      ? getErrorMessage(query.error) || "Couldn't load attachments"
      : null,
    uploadFiles,
    remove: async (attachment) => {
      await removeMutation.mutateAsync(attachment);
    },
    download,
    getPreviewUrl,
  };
}
