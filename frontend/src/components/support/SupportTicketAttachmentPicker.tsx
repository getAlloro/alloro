import { motion } from "framer-motion";
import { ImageIcon, Paperclip, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  SUPPORT_HANDOFF_PREVIEW_HEIGHT,
  SUPPORT_HANDOFF_PREVIEW_WIDTH,
  SupportScreenshotHandoffPreview,
  type SupportScreenshotHandoffMetrics,
} from "./SupportScreenshotHandoffPreview";

export type SupportTicketAttachmentPickerProps = {
  files: File[];
  animatedFileNames?: string[];
  isDisabled?: boolean;
  onFilesChange: (files: File[]) => void;
};

const MAX_FILES = 5;
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const ACCEPTED_TYPES =
  "image/png,image/jpeg,image/webp,image/gif,application/pdf,text/plain";

export function SupportTicketAttachmentPicker({
  files,
  animatedFileNames = [],
  isDisabled = false,
  onFilesChange,
}: SupportTicketAttachmentPickerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const handoffFile = files.find(
    (file) =>
      animatedFileNames.includes(file.name) && file.type.startsWith("image/"),
  );
  const [handoffMetrics, setHandoffMetrics] =
    useState<SupportScreenshotHandoffMetrics | null>(null);

  useEffect(() => {
    if (!handoffFile) {
      setHandoffMetrics(null);
      return;
    }

    const updateMetrics = () => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const sourceX = window.innerWidth / 2 - SUPPORT_HANDOFF_PREVIEW_WIDTH / 2;
      const sourceY =
        window.innerHeight / 2 - SUPPORT_HANDOFF_PREVIEW_HEIGHT / 2;
      setHandoffMetrics({
        sourceX,
        sourceY,
        targetX: rect.left + 18 - sourceX,
        targetY: rect.top + 66 - sourceY,
      });
    };

    const frameId = window.requestAnimationFrame(updateMetrics);
    window.addEventListener("resize", updateMetrics);
    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", updateMetrics);
    };
  }, [handoffFile]);

  const handleAddFiles = (selectedFiles: FileList | null) => {
    if (!selectedFiles) return;
    const nextFiles = [...files, ...Array.from(selectedFiles)]
      .filter((file) => file.size <= MAX_FILE_SIZE_BYTES)
      .slice(0, MAX_FILES);
    onFilesChange(nextFiles);
  };

  const handleRemoveFile = (name: string) => {
    onFilesChange(files.filter((file) => file.name !== name));
  };

  return (
    <div
      ref={containerRef}
      className="space-y-2 rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-3.5"
    >
      {handoffFile && handoffMetrics && (
        <SupportScreenshotHandoffPreview
          key={`${handoffFile.name}-${handoffFile.size}`}
          file={handoffFile}
          metrics={handoffMetrics}
        />
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
            Screenshots or files
          </p>
          <p className="mt-1 text-[12px] font-medium leading-relaxed text-slate-500">
            Add up to 5 images, PDFs, or text files, 10MB each.
          </p>
        </div>
        <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-[11px] font-bold uppercase tracking-[0.12em] text-alloro-navy transition hover:border-alloro-orange/50 focus-within:ring-4 focus-within:ring-alloro-orange/15">
          <Paperclip className="h-4 w-4 text-alloro-orange" />
          Add file
          <input
            type="file"
            multiple
            accept={ACCEPTED_TYPES}
            disabled={isDisabled || files.length >= MAX_FILES}
            onChange={(event) => handleAddFiles(event.target.files)}
            className="sr-only"
          />
        </label>
      </div>

      {files.length > 0 && (
        <div className="space-y-1.5">
          {files.map((file) => {
            const shouldAnimate = animatedFileNames.includes(file.name);
            return (
              <motion.div
                key={`${file.name}-${file.size}`}
                initial={
                  shouldAnimate ? { opacity: 0, y: -8, scale: 0.92 } : false
                }
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{
                  delay: shouldAnimate ? 0.88 : 0,
                  duration: 0.28,
                  ease: "easeOut",
                }}
                className={`flex items-center justify-between gap-3 rounded-lg border bg-white px-3 py-2 ${
                  shouldAnimate
                    ? "border-alloro-orange/30 shadow-[0_10px_24px_rgba(214,104,83,0.16)] ring-2 ring-alloro-orange/15"
                    : "border-slate-200"
                }`}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <AttachmentThumb file={file} />
                  <span className="min-w-0">
                    <span className="block truncate text-[12px] font-semibold text-alloro-navy">
                      {file.name}
                    </span>
                    <span className="mt-0.5 block text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
                      {formatFileSize(file.size)}
                    </span>
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveFile(file.name)}
                  disabled={isDisabled}
                  aria-label={`Remove ${file.name}`}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-alloro-navy focus:outline-none focus:ring-4 focus:ring-alloro-orange/15 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <X className="h-4 w-4" />
                </button>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AttachmentThumb({ file }: { file: File }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const isImage = file.type.startsWith("image/");

  useEffect(() => {
    if (!isImage) return;

    const nextUrl = URL.createObjectURL(file);
    setPreviewUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [file, isImage]);

  if (previewUrl) {
    return (
      <img
        src={previewUrl}
        alt=""
        className="h-10 w-14 shrink-0 rounded-lg border border-slate-200 object-cover"
      />
    );
  }

  return (
    <span className="flex h-10 w-14 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-400">
      <ImageIcon className="h-4 w-4" />
    </span>
  );
}

function formatFileSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
