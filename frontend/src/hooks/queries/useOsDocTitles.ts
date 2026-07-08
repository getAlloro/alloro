import { useCallback } from "react";
import { useAdminOsDocuments } from "./useAdminOsDocuments";

/**
 * Resolve a document id → its title from the library list
 * (plans/07042026-alloro-os-admin-port P5 T4). Citation chips and context chips
 * carry only a document id from the backend; this maps it to a human title for
 * display. Returns undefined for an id not in the list (the chip falls back to
 * its heading path). Reuses the already-cached library list — no extra fetch.
 */
export function useOsDocTitles(): (documentId: string) => string | undefined {
  const { data } = useAdminOsDocuments();
  const documents = data?.documents;
  return useCallback(
    (documentId: string) =>
      documents?.find((doc) => doc.id === documentId)?.title,
    [documents],
  );
}
