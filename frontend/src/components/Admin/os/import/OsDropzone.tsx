import { useRef, useState } from "react";
import { UploadCloud } from "lucide-react";

/**
 * File dropzone for the import modal (P6 T4, D13): a bounded dashed surface
 * that accent-washes on drag-over. Clicking or dropping hands the selected
 * files to the parent, which owns validation + the upload mutation.
 */

// Accepted upload extensions (the browser file picker filter). The backend
// re-checks the mime + extension allowlist (§5.2).
const OS_IMPORT_ACCEPT = ".docx,.xlsx,.xls,.pdf,.md,.markdown";

export function OsDropzone({
  onFiles,
  disabled = false,
}: {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const emit = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    onFiles(Array.from(list));
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Add files to import"
      aria-disabled={disabled}
      onClick={() => !disabled && inputRef.current?.click()}
      onKeyDown={(event) => {
        if (disabled) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          inputRef.current?.click();
        }
      }}
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setIsDragging(false);
        if (!disabled) emit(event.dataTransfer.files);
      }}
      className={[
        "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors duration-150",
        disabled ? "cursor-not-allowed opacity-60" : "",
        isDragging
          ? "border-alloro-orange bg-accent-soft"
          : "border-line-medium bg-alloro-bg hover:border-alloro-orange/60",
      ].join(" ")}
    >
      <UploadCloud
        className={`h-6 w-6 ${isDragging ? "text-alloro-orange" : "text-gray-400"}`}
        strokeWidth={1.5}
      />
      <p className="text-sm font-medium text-gray-700">
        Drop files here or <span className="text-alloro-orange">browse</span>
      </p>
      <p className="font-mono text-[11px] text-gray-400">
        Word, Excel, PDF, or Markdown
      </p>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={OS_IMPORT_ACCEPT}
        onChange={(event) => {
          emit(event.target.files);
          event.target.value = ""; // allow re-selecting the same file
        }}
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
      />
    </div>
  );
}
