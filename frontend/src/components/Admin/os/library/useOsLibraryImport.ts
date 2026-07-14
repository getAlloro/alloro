import { useCallback, useState } from "react";
import { useImportOsFiles } from "../../../../hooks/queries/useAdminOsImports";

/** Keep picker imports modal-based while native Library drops start inline. */
export function useOsLibraryImport() {
  const [isImportOpen, setIsImportOpen] = useState(false);
  const { mutate: importFiles } = useImportOsFiles();

  const handleOpenImport = useCallback(() => {
    setIsImportOpen(true);
  }, []);

  const handleDroppedFiles = useCallback(
    (files: File[]) => {
      importFiles({ files, category: null, folderId: null });
    },
    [importFiles],
  );

  const handleCloseImport = useCallback(() => {
    setIsImportOpen(false);
  }, []);

  return {
    isImportOpen,
    handleOpenImport,
    handleDroppedFiles,
    handleCloseImport,
  };
}
