import { useState, useMemo } from "react";
import { Loader2, X, ImageIcon, Upload } from "lucide-react";
import MediaBrowser from "../../../PageEditor/MediaBrowser";
import type { MediaItem } from "../../../PageEditor/MediaBrowser";
import { createAdminWebsiteMediaApi } from "../../../../api/websiteMedia";
import { logger } from "../../../../lib/logger";

/* ─── Media Picker Field ─── */
// TODO: extract to a shared file; still consumed by the Featured Image row.
// See plans/04232026-no-ticket-post-editor-custom-fields-redesign/spec.md.
export function MediaPickerField({
  projectId,
  value,
  onChange,
  label,
}: {
  projectId: string;
  value: string;
  onChange: (url: string) => void;
  label: string;
}) {
  const [showBrowser, setShowBrowser] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const mediaApi = useMemo(
    () => createAdminWebsiteMediaApi(projectId),
    [projectId],
  );

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const data = await mediaApi.upload(file);
      if (data.success && data.data?.[0]?.s3_url) {
        onChange(data.data[0].s3_url);
      }
    } catch (err) {
      logger.error("Upload failed:", err);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>

      {/* Preview */}
      {value && (
        <div className="relative mb-2 inline-block">
          <img
            src={value}
            alt="Preview"
            className="h-32 w-auto rounded-lg object-cover border"
          />
          <button
            type="button"
            onClick={() => onChange("")}
            className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-2 mb-2">
        <button
          type="button"
          onClick={() => { setShowBrowser(!showBrowser); setShowUrlInput(false); }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
        >
          <ImageIcon className="w-3.5 h-3.5" />
          Browse Library
        </button>
        <label className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer">
          {uploading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Upload className="w-3.5 h-3.5" />
          )}
          Upload
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleUpload(file);
              e.target.value = "";
            }}
          />
        </label>
        <button
          type="button"
          onClick={() => { setShowUrlInput(!showUrlInput); setShowBrowser(false); }}
          className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors"
        >
          Paste URL
        </button>
      </div>

      {/* Media browser */}
      {showBrowser && (
        <div className="mb-2">
          <MediaBrowser
            mediaApi={mediaApi}
            onSelect={(media: MediaItem) => {
              onChange(media.s3_url);
              setShowBrowser(false);
            }}
            onClose={() => setShowBrowser(false)}
            compact
          />
        </div>
      )}

      {/* Manual URL input */}
      {showUrlInput && (
        <input
          type="url"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
          placeholder="https://..."
        />
      )}
    </div>
  );
}
