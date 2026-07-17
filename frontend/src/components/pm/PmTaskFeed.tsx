import { useMemo, useRef, useState, type ReactNode } from "react";
import { Paperclip, Upload } from "lucide-react";
import type { PmTaskAttachment, PmTaskComment } from "../../types/pm";
import { buildPmTaskFeed, type PmTaskUpload } from "./pmTaskFeed.utils";

export type PmTaskFeedProps = {
  comments: PmTaskComment[];
  attachments: PmTaskAttachment[];
  uploads: PmTaskUpload[];
  isLoading: boolean;
  onFiles: (files: FileList | File[]) => Promise<void>;
  renderComment: (comment: PmTaskComment) => ReactNode;
  renderAttachment: (attachment: PmTaskAttachment) => ReactNode;
};

function PmTaskUploadRow({ upload }: { upload: PmTaskUpload }) {
  return (
    <article
      aria-label={`${upload.filename} ${upload.error ? "upload failed" : "uploading"}`}
      className="rounded-lg border border-pm-border bg-pm-bg-primary px-3 py-2.5"
    >
      <div className="flex items-center gap-2 text-xs">
        <Paperclip className="h-4 w-4 text-pm-text-muted" />
        <span className="min-w-0 flex-1 truncate font-medium text-pm-text-primary">
          {upload.filename}
        </span>
        <span
          className={upload.error ? "text-pm-danger" : "text-pm-text-muted"}
        >
          {upload.error ? "Failed" : `${Math.round(upload.progress * 100)}%`}
        </span>
      </div>
      <progress
        aria-label={`${upload.filename} upload progress`}
        className="mt-2 h-1 w-full accent-pm-accent"
        max={1}
        value={upload.progress}
      />
      {upload.error && (
        <p className="mt-1 text-[11px] text-pm-danger">{upload.error}</p>
      )}
    </article>
  );
}

export function PmTaskFeed({
  comments,
  attachments,
  uploads,
  isLoading,
  onFiles,
  renderComment,
  renderAttachment,
}: PmTaskFeedProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const feed = useMemo(
    () => buildPmTaskFeed(comments, attachments, uploads),
    [attachments, comments, uploads],
  );
  const handleFiles = (files: FileList | null) => {
    if (files?.length) void onFiles(files);
  };

  return (
    <div>
      {isLoading && feed.length === 0 ? (
        <p className="mb-3 text-[11px] text-pm-text-muted">
          Loading conversation…
        </p>
      ) : feed.length === 0 ? (
        <p className="mb-3 text-[12px] text-pm-text-muted">
          No comments or attachments yet. Start the conversation below.
        </p>
      ) : (
        <ol aria-label="Task conversation" className="mb-3 space-y-3">
          {feed.map((item) => (
            <li key={`${item.kind}-${item.id}`} data-feed-kind={item.kind}>
              {item.kind === "comment" && renderComment(item.comment)}
              {item.kind === "attachment" && renderAttachment(item.attachment)}
              {item.kind === "upload" && (
                <PmTaskUploadRow upload={item.upload} />
              )}
            </li>
          ))}
        </ol>
      )}

      <div
        aria-label="Attach files to task conversation"
        className={`rounded-lg border border-dashed px-3 py-3 text-xs transition-colors ${
          isDragOver
            ? "border-pm-accent bg-pm-bg-hover text-pm-text-primary"
            : "border-pm-border bg-pm-bg-primary text-pm-text-muted"
        }`}
        onDragEnter={(event) => {
          event.preventDefault();
          setIsDragOver(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node)) {
            setIsDragOver(false);
          }
        }}
        onDrop={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setIsDragOver(false);
          handleFiles(event.dataTransfer.files);
        }}
      >
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-1.5">
            <Upload className="h-4 w-4" />
            Drop files here to add them to this task
          </span>
          <button
            type="button"
            className="shrink-0 rounded-md border border-pm-border px-2.5 py-1.5 font-medium text-pm-text-primary hover:bg-pm-bg-hover"
            onClick={() => inputRef.current?.click()}
          >
            Choose files
          </button>
        </div>
        <input
          ref={inputRef}
          aria-label="Choose files to attach to this task"
          className="sr-only"
          multiple
          type="file"
          onChange={(event) => {
            handleFiles(event.target.files);
            event.target.value = "";
          }}
        />
      </div>
    </div>
  );
}
