import { useState, useRef, useEffect } from "react";
import {
  AlertCircle,
  Send,
  Loader2,
  Paperclip,
  X,
  Image,
  Upload,
} from "lucide-react";
import { AnimatePresence } from "framer-motion";
import MediaBrowser from "./MediaBrowser";
import ColorPicker from "./ColorPicker";
import type { MediaApi, MediaItem } from "./MediaBrowser";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  isError?: boolean;
}

interface ChatPanelProps {
  messages: ChatMessage[];
  onSend: (instruction: string, attachedMedia?: MediaItem[]) => void;
  isLoading: boolean;
  disabled: boolean;
  mediaApi?: MediaApi;
  primaryColor?: string | null;
  accentColor?: string | null;
  /** Friendly name of the selected element (e.g. "Paragraph", "Image"), or
   *  null when nothing is selected — the AI edit has nothing to target. */
  selectionLabel?: string | null;
}

type MediaUploadResponse = {
  success?: boolean;
  data?: MediaItem[];
  error?: string;
  message?: string;
  failed?: Array<{ filename: string; message: string }>;
};

const MAX_MEDIA_FILE_SIZE_MB = 500;
const MAX_MEDIA_FILE_SIZE_BYTES = MAX_MEDIA_FILE_SIZE_MB * 1024 * 1024;
const MAX_MEDIA_FILE_SIZE_LABEL = `${MAX_MEDIA_FILE_SIZE_MB} MB`;

const getMediaUploadErrorMessage = (
  data: MediaUploadResponse | null,
): string => {
  if (data?.message) return data.message;
  if (data?.failed?.length) {
    return data.failed.map((failure) => failure.message).join(", ");
  }
  if (data?.error === "FILE_TOO_LARGE") {
    return `Each media file must be ${MAX_MEDIA_FILE_SIZE_LABEL} or smaller.`;
  }
  if (data?.error === "QUOTA_EXCEEDED") {
    return "Storage quota exceeded for this project.";
  }
  if (data?.error) return data.error;
  return "Upload failed";
};

export default function ChatPanel({
  messages,
  onSend,
  isLoading,
  disabled,
  mediaApi,
  primaryColor,
  accentColor,
  selectionLabel,
}: ChatPanelProps) {
  const [input, setInput] = useState("");
  const [uploading, setUploading] = useState(false);
  const [attachedMedia, setAttachedMedia] = useState<MediaItem[]>([]);
  const [attachedColor, setAttachedColor] = useState<string | null>(null);
  const [showMediaLibrary, setShowMediaLibrary] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // The AI edit targets the selected element — with nothing selected (or while
  // previewing a version) every entry point is gated so the user can't fire an
  // instruction that has nowhere to land.
  const hasSelection = Boolean(selectionLabel);
  const blocked = disabled || !hasSelection;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, isLoading]);

  useEffect(() => {
    if (!blocked && !isLoading) {
      inputRef.current?.focus();
    }
  }, [blocked, isLoading]);

  const handleSubmit = () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading || blocked) return;
    const finalInstruction = attachedColor
      ? `${trimmed}\n\nUse color: ${attachedColor}`
      : trimmed;
    onSend(
      finalInstruction,
      attachedMedia.length > 0 ? attachedMedia : undefined,
    );
    setInput("");
    setAttachedMedia([]);
    setAttachedColor(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const uploadFile = async (file: File) => {
    if (!mediaApi) return;

    if (file.size > MAX_MEDIA_FILE_SIZE_BYTES) {
      setUploadError(
        `${file.name}: file is larger than ${MAX_MEDIA_FILE_SIZE_LABEL}.`,
      );
      return;
    }

    try {
      setUploading(true);
      setUploadError(null);

      const data = await mediaApi.upload(file);

      if (
        !data?.success ||
        !data.data ||
        data.data.length === 0
      ) {
        throw new Error(getMediaUploadErrorMessage(data));
      }

      const uploadedMedia = data.data[0];

      // Add to attached media (invisible to user input)
      setAttachedMedia((prev) => [...prev, uploadedMedia]);

      // Auto-focus input
      setTimeout(() => inputRef.current?.focus(), 100);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    await uploadFile(file);

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (blocked || isLoading || !mediaApi) return;
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (blocked || isLoading || !mediaApi) return;

    const files = Array.from(e.dataTransfer.files);
    const validFiles = files.filter((file) =>
      [
        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/webp",
        "video/mp4",
        "application/pdf",
      ].includes(file.type),
    );

    if (validFiles.length === 0) {
      setUploadError("Please drop a JPG, PNG, WebP, MP4, or PDF file.");
      return;
    }

    // Upload files one by one
    for (const file of validFiles) {
      await uploadFile(file);
    }
  };

  const removeAttachedMedia = (mediaId: string) => {
    setAttachedMedia((prev) => prev.filter((m) => m.id !== mediaId));
  };

  const attachMediaFromLibrary = (media: MediaItem) => {
    setAttachedMedia((prev) => {
      if (prev.find((m) => m.id === media.id)) return prev;
      return [...prev, media];
    });
    setShowMediaLibrary(false);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  return (
    <div
      className="flex flex-col flex-1 min-h-0 relative"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag & Drop Overlay */}
      {isDragging && (
        <div className="absolute inset-0 bg-alloro-orange/10 border-2 border-dashed border-alloro-orange rounded-lg z-50 flex items-center justify-center pointer-events-none">
          <div className="bg-white rounded-xl shadow-lg px-6 py-4 flex flex-col items-center gap-2">
            <Upload className="w-8 h-8 text-alloro-orange" />
            <p className="text-sm font-medium text-gray-900">
              Drop to attach media
            </p>
            <p className="text-xs text-gray-500">
              Supports JPG, PNG, WebP, MP4, PDF
            </p>
          </div>
        </div>
      )}

      {/* Selected-element pill — pinned above the conversation so it's always
          clear which element the next AI edit will target. */}
      {hasSelection && (
        <div className="shrink-0 px-4 pt-3">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-300 bg-gray-100 px-2.5 py-1 text-[11px] font-semibold text-gray-700">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--ec-cobalt)]" />
            Editing: {selectionLabel}
          </span>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-4">
            {!hasSelection
              ? "Select an element and tell me what to change."
              : disabled
                ? "Editing is paused while previewing a version."
                : `Tell Alloro what to change about this ${selectionLabel}.`}
          </p>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
                msg.role === "user"
                  ? "bg-alloro-orange text-white"
                  : msg.isError
                    ? "bg-red-50 text-red-600 border border-red-200"
                    : "bg-gray-100 text-gray-700"
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-xl px-3 py-2 flex items-center gap-2">
              <Loader2 className="w-3 h-3 text-alloro-orange animate-spin" />
              <span className="text-xs text-gray-500">Editing...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-4 pb-4 pt-2 border-t border-gray-200">
        {/* Color Picker — shows when user types "color" */}
        <AnimatePresence>
          {input.toLowerCase().includes("color") &&
            (primaryColor || accentColor) && (
              <ColorPicker
                primaryColor={primaryColor || null}
                accentColor={accentColor || null}
                onSelect={(colorStr) => setAttachedColor(colorStr)}
              />
            )}
        </AnimatePresence>

        {/* Media Library */}
        {showMediaLibrary && mediaApi && (
          <div className="mb-2">
            <MediaBrowser
              mediaApi={mediaApi}
              onSelect={attachMediaFromLibrary}
              onClose={() => setShowMediaLibrary(false)}
            />
          </div>
        )}

        {uploadError && (
          <div className="mb-2 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 flex-1">{uploadError}</span>
            <button
              type="button"
              onClick={() => setUploadError(null)}
              aria-label="Dismiss upload error"
              className="text-red-500 hover:text-red-700"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Color attachment chip */}
        {attachedColor && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            <div className="inline-flex items-center gap-1.5 px-2 py-1 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-700">
              <span
                className="w-3.5 h-3.5 rounded-sm border border-gray-300 shrink-0"
                style={{ backgroundColor: attachedColor }}
              />
              <span className="font-medium">{attachedColor}</span>
              <button
                onClick={() => setAttachedColor(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>
        )}

        {attachedMedia.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {attachedMedia.map((media, index) => (
              <div
                key={media.id}
                className="inline-flex items-center gap-1.5 px-2 py-1 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700"
              >
                <Image className="w-3 h-3 shrink-0" />
                <span className="truncate max-w-[120px]">
                  Image {index + 1}: {media.display_name}
                </span>
                <button
                  onClick={() => removeAttachedMedia(media.id)}
                  className="text-blue-600 hover:text-blue-800"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2">
          {/* Upload & Browse buttons */}
          {mediaApi && (
            <>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={blocked || isLoading || uploading}
                className="p-2 rounded-xl bg-gray-100 border border-gray-200 text-gray-600 hover:bg-gray-200 hover:text-alloro-orange transition-colors disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
                title="Upload media"
              >
                {uploading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Paperclip className="w-3.5 h-3.5" />
                )}
              </button>
              <button
                onClick={() => setShowMediaLibrary(!showMediaLibrary)}
                disabled={blocked || isLoading}
                className={`p-2 rounded-xl border transition-colors disabled:opacity-30 disabled:cursor-not-allowed shrink-0 ${
                  showMediaLibrary
                    ? "bg-alloro-orange text-white border-alloro-orange"
                    : "bg-gray-100 border-gray-200 text-gray-600 hover:bg-gray-200 hover:text-alloro-orange"
                }`}
                title="Browse media library"
              >
                <Image className="w-3.5 h-3.5" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/webp,video/mp4,application/pdf"
                onChange={handleFileUpload}
                className="hidden"
              />
            </>
          )}

          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              !hasSelection
                ? "Select an element first…"
                : disabled
                  ? "Editing paused…"
                  : "Describe your edit…"
            }
            disabled={blocked || isLoading}
            rows={1}
            className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs text-gray-900 placeholder:text-gray-400 resize-none focus:outline-none focus:border-alloro-orange focus:ring-1 focus:ring-alloro-orange/20 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ minHeight: "36px", maxHeight: "120px" }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = "auto";
              target.style.height = Math.min(target.scrollHeight, 120) + "px";
            }}
          />

          <button
            onClick={handleSubmit}
            disabled={!input.trim() || isLoading || blocked}
            className="p-2 rounded-xl bg-alloro-orange text-white hover:bg-alloro-orange/90 transition-colors disabled:opacity-30 disabled:cursor-not-allowed shrink-0 shadow-sm shadow-alloro-orange/20"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
