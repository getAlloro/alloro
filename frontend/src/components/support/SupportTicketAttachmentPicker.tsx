import { Paperclip, X } from "lucide-react";

export type SupportTicketAttachmentPickerProps = {
  files: File[];
  isDisabled?: boolean;
  onFilesChange: (files: File[]) => void;
};

const MAX_FILES = 5;
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const ACCEPTED_TYPES = "image/png,image/jpeg,image/webp,image/gif,application/pdf";

export function SupportTicketAttachmentPicker({
  files,
  isDisabled = false,
  onFilesChange,
}: SupportTicketAttachmentPickerProps) {
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
    <div className="space-y-2 rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-3.5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
            Screenshots or files
          </p>
          <p className="mt-1 text-[12px] font-medium leading-relaxed text-slate-500">
            Add up to 5 images or PDFs, 10MB each.
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
          {files.map((file) => (
            <div
              key={`${file.name}-${file.size}`}
              className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2"
            >
              <span className="truncate text-[12px] font-semibold text-alloro-navy">
                {file.name}
              </span>
              <button
                type="button"
                onClick={() => handleRemoveFile(file.name)}
                disabled={isDisabled}
                aria-label={`Remove ${file.name}`}
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-alloro-navy focus:outline-none focus:ring-4 focus:ring-alloro-orange/15 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
