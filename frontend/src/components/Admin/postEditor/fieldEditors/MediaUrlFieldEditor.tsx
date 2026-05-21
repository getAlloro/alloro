import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ImageIcon, Upload, Loader2, X, Plus, Link as LinkIcon } from "lucide-react";
import MediaBrowser from "../../../PageEditor/MediaBrowser";
import type { MediaItem } from "../../../PageEditor/MediaBrowser";
import { createAdminWebsiteMediaApi } from "../../../../api/websiteMedia";
import InlineEditRow from "../primitives/InlineEditRow";
import type { FieldEditorProps } from "../types";

// Derive a short filename-ish label from a URL. Fallback to the raw URL.
function deriveLabel(url: string): string {
  try {
    const u = new URL(url);
    const last = u.pathname.split("/").filter(Boolean).pop();
    return last || u.hostname;
  } catch {
    const parts = url.split("/").filter(Boolean);
    return parts[parts.length - 1] || url;
  }
}

export default function MediaUrlFieldEditor({
  field,
  value,
  onChange,
  projectId,
}: FieldEditorProps<string>) {
  const [showBrowser, setShowBrowser] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [uploading, setUploading] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mediaApi = useMemo(
    () => createAdminWebsiteMediaApi(projectId),
    [projectId],
  );

  // Collapse transient UI (browser / URL input) when value changes externally.
  useEffect(() => {
    if (value) {
      setShowUrlInput(false);
    }
  }, [value]);

  const handleUpload = useCallback(
    async (file: File) => {
      setUploading(true);
      try {
        const data = await mediaApi.upload(file);
        if (data.success && data.data?.[0]?.s3_url) {
          onChange(data.data[0].s3_url);
        }
      } catch (err) {
        console.error("Upload failed:", err);
      } finally {
        setUploading(false);
      }
    },
    [mediaApi, onChange]
  );

  const openBrowser = () => {
    setShowBrowser((s) => !s);
    setShowUrlInput(false);
  };

  const togglePasteUrl = () => {
    setShowUrlInput((s) => !s);
    setShowBrowser(false);
  };

  const clear = () => {
    onChange("");
    setShowBrowser(false);
    setShowUrlInput(false);
  };

  const hasValue = Boolean(value);

  const actionGroup = (
    <div className="flex items-center gap-1.5 flex-wrap">
      <button
        type="button"
        onClick={openBrowser}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-gray-100 hover:bg-gray-200 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1"
      >
        {hasValue ? (
          <>
            <ImageIcon className="w-3.5 h-3.5" />
            Replace
          </>
        ) : (
          <>
            <Plus className="w-3.5 h-3.5" />
            Add image
          </>
        )}
      </button>
      <label className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-gray-100 hover:bg-gray-200 rounded-md cursor-pointer transition-colors focus-within:ring-2 focus-within:ring-indigo-500 focus-within:ring-offset-1">
        {uploading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Upload className="w-3.5 h-3.5" />
        )}
        Upload
        <input
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleUpload(file);
            e.target.value = "";
          }}
        />
      </label>
      <button
        type="button"
        onClick={togglePasteUrl}
        className="inline-flex items-center gap-1 px-2 py-1 text-[11px] text-gray-500 hover:text-gray-700 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1"
      >
        <LinkIcon className="w-3 h-3" />
        Paste URL
      </button>
    </div>
  );

  return (
    <InlineEditRow
      field={field}
      rightSlot={
        hasValue ? (
          <button
            type="button"
            onClick={clear}
            aria-label="Remove image"
            className="p-1 rounded text-gray-400 hover:text-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1"
          >
            <X className="w-4 h-4" />
          </button>
        ) : null
      }
    >
      <div ref={containerRef} className="flex flex-col gap-2 min-w-0">
        {hasValue ? (
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-14 h-14 shrink-0 rounded-md border border-gray-200 bg-gray-50 p-1 flex items-center justify-center overflow-hidden">
              <img
                src={value}
                alt=""
                loading="lazy"
                className="max-w-full max-h-full object-contain"
              />
            </div>
            <div className="truncate text-sm text-gray-600 max-w-[160px]" title={value}>
              {deriveLabel(value)}
            </div>
            {actionGroup}
          </div>
        ) : (
          actionGroup
        )}

        {showUrlInput && (
          <input
            type="url"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="https://..."
            className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1"
          />
        )}

        {showBrowser && (
          <div>
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
      </div>
    </InlineEditRow>
  );
}
