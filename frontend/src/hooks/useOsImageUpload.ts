import { useCallback } from "react";
import { toast } from "react-hot-toast";
import { adminOsUploadAsset } from "../api/admin-os";

/**
 * Editor image upload (plans/07042026-alloro-os-admin-port P6 T4). Uploads an
 * image to the document's asset store (S3 via the backend) and returns the
 * asset-delivery URL to embed in the markdown, or null on failure (surfaced as
 * a toast, §16.3). Non-image files are ignored so paste/drop of arbitrary
 * content is a no-op. The returned callback is stable per documentId so the
 * editor's paste/drop handler can depend on it.
 */
export function useOsImageUpload(documentId: string) {
  return useCallback(
    async (file: File): Promise<string | null> => {
      if (!file.type.startsWith("image/")) return null;
      try {
        const { asset } = await adminOsUploadAsset(documentId, file);
        return asset.url;
      } catch {
        toast.error(`Couldn't upload ${file.name || "image"}`);
        return null;
      }
    },
    [documentId],
  );
}
