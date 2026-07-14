import { useCallback, useEffect, useState } from "react";
import type {
  OsImportResult,
  OsImportSkipped,
  OsImportStub,
} from "../../../../api/admin-os";
import { useImportOsFiles } from "../../../../hooks/queries/useAdminOsImports";

export type UseOsImportBatchOptions = {
  isOpen: boolean;
  folderId: string | null;
};

/** Batch upload state for the explicit Import modal's picker/dropzone. */
export function useOsImportBatch({
  isOpen,
  folderId,
}: UseOsImportBatchOptions) {
  const { mutate: startImport, isPending } = useImportOsFiles();
  const [category, setCategory] = useState<string | null>(null);
  const [started, setStarted] = useState<OsImportStub[]>([]);
  const [skipped, setSkipped] = useState<OsImportSkipped[]>([]);
  const recordResult = useCallback((result: OsImportResult) => {
    setStarted((previous) => [...result.documents, ...previous]);
    setSkipped(result.skipped);
  }, []);
  const submitFiles = useCallback(
    (files: File[], batchCategory: string | null): boolean => {
      if (isPending || files.length === 0) return false;
      startImport(
        { files, category: batchCategory, folderId },
        { onSuccess: recordResult },
      );
      return true;
    },
    [folderId, isPending, recordResult, startImport],
  );
  useEffect(() => {
    if (!isOpen) return;
    setCategory(null);
    setStarted([]);
    setSkipped([]);
  }, [isOpen]);
  return { category, setCategory, started, skipped, isPending, submitFiles };
}
