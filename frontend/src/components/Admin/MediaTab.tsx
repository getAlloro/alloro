/**
 * MediaTab Component
 *
 * Displays project media library with upload, grid view, and management features
 * - Bulk upload (up to 20 files, 500MB each)
 * - Grid layout with thumbnails for images, icons for videos/PDFs
 * - Copy URL, edit metadata (display name, alt text), delete
 * - Storage quota display (5GB per project)
 * - Filter by type (all, image, video, PDF)
 * - Search by filename
 */

import React, { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Upload,
  Image as ImageIcon,
  Video,
  FileText,
  Copy,
  Trash2,
  Edit3,
  X,
  Loader2,
  Check,
  AlertCircle,
} from "lucide-react";
import { useConfirm } from "../ui/ConfirmModal";

// =====================================================================
// Types
// =====================================================================

interface MediaItem {
  id: string;
  project_id: string;
  filename: string;
  display_name: string;
  s3_key: string;
  s3_url: string;
  file_size: number;
  mime_type: string;
  alt_text: string | null;
  width: number | null;
  height: number | null;
  thumbnail_s3_key: string | null;
  thumbnail_s3_url: string | null;
  original_mime_type: string | null;
  compressed: boolean;
  created_at: string;
  updated_at: string;
  usedInPages?: number;
}

interface MediaResponse {
  success: boolean;
  data: MediaItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
  };
  quota: {
    used: number;
    limit: number;
    percentage: number;
  };
}

interface UploadResponse {
  success: boolean;
  data?: MediaItem[];
  error?: string;
  message?: string;
  failed?: Array<{ filename: string; message: string }>;
  quota?: {
    used: number;
    limit: number;
    percentage: number;
  };
}

const MAX_MEDIA_FILE_SIZE_MB = 500;
const MAX_MEDIA_FILE_SIZE_BYTES = MAX_MEDIA_FILE_SIZE_MB * 1024 * 1024;
const MAX_MEDIA_FILE_SIZE_LABEL = `${MAX_MEDIA_FILE_SIZE_MB} MB`;

const parseUploadResponse = (responseText: string): UploadResponse | null => {
  if (!responseText.trim()) return null;

  try {
    return JSON.parse(responseText) as UploadResponse;
  } catch {
    return null;
  }
};

const getUploadErrorMessage = (
  xhr: XMLHttpRequest,
  data: UploadResponse | null,
): string => {
  if (data?.message) return data.message;
  if (data?.error === "FILE_TOO_LARGE" || xhr.status === 413) {
    return `Each media file must be ${MAX_MEDIA_FILE_SIZE_LABEL} or smaller.`;
  }
  if (data?.error === "QUOTA_EXCEEDED" || xhr.status === 507) {
    return "Storage quota exceeded for this project.";
  }
  if (data?.error) return data.error;
  if (xhr.status >= 500) {
    return "Upload failed because the server returned an unexpected response.";
  }
  return "Upload failed";
};

// =====================================================================
// Main Component
// =====================================================================

export default function MediaTab({ projectId }: { projectId: string }) {
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [quota, setQuota] = useState({ used: 0, limit: 0, percentage: 0 });
  const [filter, setFilter] = useState<"all" | "image" | "video" | "pdf">("all");
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ display_name: "", alt_text: "" });
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadErrors, setUploadErrors] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const confirm = useConfirm();

  // =====================================================================
  // API Calls
  // =====================================================================

  const fetchMedia = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        type: filter,
        search,
        page: "1",
        limit: "50",
      });

      const response = await fetch(
        `/api/admin/websites/${projectId}/media?${params}`,
        { credentials: "include" }
      );

      if (!response.ok) throw new Error("Failed to fetch media");

      const data: MediaResponse = await response.json();
      setMedia(data.data);
      setQuota(data.quota);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load media");
    } finally {
      setLoading(false);
    }
  };

  const uploadFiles = async (files: File[]) => {
    const oversizedFiles = files.filter(
      (file) => file.size > MAX_MEDIA_FILE_SIZE_BYTES,
    );
    const uploadableFiles = files.filter(
      (file) => file.size <= MAX_MEDIA_FILE_SIZE_BYTES,
    );
    const initialUploadErrors = oversizedFiles.map(
      (file) =>
        `${file.name}: file is larger than ${MAX_MEDIA_FILE_SIZE_LABEL}.`,
    );

    setError(null);
    setUploadErrors(initialUploadErrors);
    if (uploadableFiles.length === 0) return;

    setUploading(true);
    setUploadProgress(0);

    const formData = new FormData();
    uploadableFiles.forEach((file) => formData.append("files", file));

    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) {
        setUploadProgress(Math.round((e.loaded / e.total) * 100));
      }
    });

    xhr.addEventListener("load", async () => {
      try {
        const data = parseUploadResponse(xhr.responseText);

        if (!data) {
          throw new Error(getUploadErrorMessage(xhr, data));
        }

        if (!data.success) {
          throw new Error(getUploadErrorMessage(xhr, data));
        }

        if (!data.data || data.data.length === 0) {
          throw new Error(data.message || "No media files were uploaded.");
        }

        if (data.failed && data.failed.length > 0) {
          setUploadErrors(
            initialUploadErrors.concat(
              data.failed.map((f) => `${f.filename}: ${f.message}`),
            ),
          );
        }

        if (data.quota) {
          setQuota(data.quota);
        }
        await fetchMedia();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setUploading(false);
        setUploadProgress(0);
      }
    });

    xhr.addEventListener("error", () => {
      setError("Upload failed - network error");
      setUploading(false);
      setUploadProgress(0);
    });

    xhr.open("POST", `/api/admin/websites/${projectId}/media`);
    xhr.withCredentials = true;
    xhr.send(formData);
  };

  const updateMedia = async (mediaId: string) => {
    try {
      const response = await fetch(
        `/api/admin/websites/${projectId}/media/${mediaId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(editForm),
          credentials: "include",
        }
      );

      if (!response.ok) throw new Error("Failed to update media");

      const data = await response.json();
      setMedia((prev) =>
        prev.map((item) => (item.id === mediaId ? data.data : item))
      );
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    }
  };

  const deleteMedia = async (mediaId: string) => {
    const ok = await confirm({ title: "Delete this media?", message: "This action cannot be undone.", confirmLabel: "Delete", variant: "danger" });
    if (!ok) return;

    try {
      const response = await fetch(
        `/api/admin/websites/${projectId}/media/${mediaId}?force=true`,
        {
          method: "DELETE",
          credentials: "include",
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || "Delete failed");
      }

      setMedia((prev) => prev.filter((item) => item.id !== mediaId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const copyUrl = (url: string, id: string) => {
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // =====================================================================
  // Handlers
  // =====================================================================

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) uploadFiles(files);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) uploadFiles(files);
  };

  const startEdit = (item: MediaItem) => {
    setEditingId(item.id);
    setEditForm({
      display_name: item.display_name,
      alt_text: item.alt_text || "",
    });
  };

  // =====================================================================
  // Effects
  // =====================================================================

  useEffect(() => {
    fetchMedia();
  }, [filter, search]);

  // =====================================================================
  // Render Helpers
  // =====================================================================

  const getMediaIcon = (mimeType: string) => {
    if (mimeType.startsWith("image/")) return <ImageIcon className="w-4 h-4" />;
    if (mimeType.startsWith("video/")) return <Video className="w-4 h-4" />;
    if (mimeType === "application/pdf") return <FileText className="w-4 h-4" />;
    return <FileText className="w-4 h-4" />;
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  // =====================================================================
  // Render
  // =====================================================================

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      {/* Header */}
      <div className="border-b border-gray-100 px-5 py-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-semibold text-gray-900">Media Library</h3>
            <span className="text-xs text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full font-medium">
              {media.length} {media.length === 1 ? "file" : "files"}
            </span>
          </div>

          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-2 rounded-lg bg-alloro-orange px-4 py-2 text-sm font-medium text-white transition hover:bg-orange-600 disabled:opacity-50"
          >
            {uploading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4" />
                Upload
              </>
            )}
          </button>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/jpeg,image/jpg,image/png,image/webp,video/mp4,application/pdf"
            onChange={handleFileSelect}
            className="hidden"
          />
        </div>

        {/* Upload Progress */}
        {uploading && (
          <div className="mb-4">
            <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
              <span className="flex items-center gap-1.5">
                <Loader2 className="w-3 h-3 animate-spin" />
                Uploading...
              </span>
              <span>{uploadProgress}%</span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-alloro-orange rounded-full transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Quota Bar */}
        <div className="mb-4">
          <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
            <span>Storage Used</span>
            <span>
              {formatBytes(quota.used)} / {formatBytes(quota.limit)} ({quota.percentage}%)
            </span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all ${
                quota.percentage > 90
                  ? "bg-red-500"
                  : quota.percentage > 70
                  ? "bg-yellow-500"
                  : "bg-alloro-orange"
              }`}
              style={{ width: `${quota.percentage}%` }}
            />
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2">
          {(["all", "image", "video", "pdf"] as const).map((type) => (
            <button
              key={type}
              onClick={() => setFilter(type)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition capitalize ${
                filter === type
                  ? "bg-alloro-orange text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {type}
            </button>
          ))}

          <input
            type="text"
            placeholder="Search files..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="ml-auto px-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-alloro-orange"
          />
        </div>
      </div>

      {/* Error Messages */}
      {error && (
        <div className="mx-5 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-sm text-red-700">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {uploadErrors.length > 0 && (
        <div className="mx-5 mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-700">
          <p className="font-medium mb-1">Some files failed to upload:</p>
          <ul className="list-disc list-inside">
            {uploadErrors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Media Grid */}
      <div
        className="p-5 min-h-[400px]"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : media.length === 0 ? (
          <div
            onClick={() => fileInputRef.current?.click()}
            className={`text-center py-20 text-gray-500 border-2 border-dashed rounded-xl cursor-pointer transition ${
              isDragging
                ? "border-alloro-orange bg-orange-50"
                : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
            }`}
          >
            <Upload className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p className="text-sm font-medium">
              {isDragging ? "Drop files here" : "No media uploaded yet"}
            </p>
            <p className="text-xs mt-1">
              {isDragging
                ? "Release to upload"
                : "Click to upload or drag and drop images, videos, or PDFs"}
            </p>
          </div>
        ) : (
          <>
            {isDragging && (
              <div className="mb-4 p-8 border-2 border-dashed border-alloro-orange bg-orange-50 rounded-xl text-center">
                <Upload className="w-8 h-8 mx-auto mb-2 text-alloro-orange" />
                <p className="text-sm font-medium text-alloro-orange">Drop files to upload</p>
              </div>
            )}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {media.map((item) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="group relative border border-gray-200 rounded-lg overflow-hidden hover:shadow-md transition"
              >
                {/* Preview */}
                <div className="aspect-square bg-gray-100 flex items-center justify-center overflow-hidden">
                  {item.thumbnail_s3_url || item.mime_type.startsWith("image/") ? (
                    <img
                      src={item.thumbnail_s3_url || item.s3_url}
                      alt={item.alt_text || item.display_name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="text-gray-400">
                      {getMediaIcon(item.mime_type)}
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="p-2 bg-white border-t border-gray-200">
                  {editingId === item.id ? (
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={editForm.display_name}
                        onChange={(e) =>
                          setEditForm({ ...editForm, display_name: e.target.value })
                        }
                        className="w-full px-2 py-1 text-xs border border-gray-300 rounded"
                        placeholder="Display name"
                      />
                      <input
                        type="text"
                        value={editForm.alt_text}
                        onChange={(e) =>
                          setEditForm({ ...editForm, alt_text: e.target.value })
                        }
                        className="w-full px-2 py-1 text-xs border border-gray-300 rounded"
                        placeholder="Alt text"
                      />
                      <div className="flex gap-1">
                        <button
                          onClick={() => updateMedia(item.id)}
                          className="flex-1 px-2 py-1 bg-alloro-orange text-white text-xs rounded hover:bg-orange-600"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="flex-1 px-2 py-1 bg-gray-200 text-gray-700 text-xs rounded hover:bg-gray-300"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="text-xs font-medium text-gray-900 truncate">
                        {item.display_name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {formatBytes(item.file_size)}
                      </p>
                    </>
                  )}
                </div>

                {/* Actions */}
                {editingId !== item.id && (
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition flex gap-1">
                    <button
                      onClick={() => copyUrl(item.s3_url, item.id)}
                      className="p-1.5 bg-white rounded-lg shadow-md hover:bg-gray-100"
                      title="Copy URL"
                    >
                      {copiedId === item.id ? (
                        <Check className="w-3 h-3 text-green-600" />
                      ) : (
                        <Copy className="w-3 h-3 text-gray-600" />
                      )}
                    </button>
                    <button
                      onClick={() => startEdit(item)}
                      className="p-1.5 bg-white rounded-lg shadow-md hover:bg-gray-100"
                      title="Edit"
                    >
                      <Edit3 className="w-3 h-3 text-gray-600" />
                    </button>
                    <button
                      onClick={() => deleteMedia(item.id)}
                      className="p-1.5 bg-white rounded-lg shadow-md hover:bg-red-50"
                      title="Delete"
                    >
                      <Trash2 className="w-3 h-3 text-red-600" />
                    </button>
                  </div>
                )}
              </motion.div>
            ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
