import { useRef, useState, type DragEvent, type ReactNode } from "react";
import { UploadCloud } from "lucide-react";

export type OsLibraryFileDropSurfaceProps = {
  children: ReactNode;
  onFiles: (files: File[]) => void;
};

function hasFilePayload(event: DragEvent<HTMLElement>): boolean {
  return Array.from(event.dataTransfer.types).includes("Files");
}

/** Native file-drop boundary that leaves @dnd-kit document moves untouched. */
export function OsLibraryFileDropSurface({
  children,
  onFiles,
}: OsLibraryFileDropSurfaceProps) {
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const dragDepthRef = useRef(0);

  const handleDragEnter = (event: DragEvent<HTMLElement>) => {
    if (!hasFilePayload(event)) return;
    event.preventDefault();
    dragDepthRef.current += 1;
    setIsDraggingFiles(true);
  };

  const handleDragLeave = () => {
    if (!isDraggingFiles) return;
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDraggingFiles(false);
  };

  const handleDrop = (event: DragEvent<HTMLElement>) => {
    if (!hasFilePayload(event)) return;
    event.preventDefault();
    dragDepthRef.current = 0;
    setIsDraggingFiles(false);
    const files = Array.from(event.dataTransfer.files);
    if (files.length > 0) onFiles(files);
  };

  return (
    <section
      onDragEnter={handleDragEnter}
      onDragOver={(event) => {
        if (!hasFilePayload(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="relative mt-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6"
    >
      {children}
      {isDraggingFiles && (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none absolute inset-2 z-30 flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-alloro-orange bg-alloro-surface/95 text-center shadow-lg backdrop-blur-sm"
        >
          <UploadCloud
            className="h-8 w-8 text-alloro-orange"
            strokeWidth={1.5}
          />
          <p className="mt-3 text-base font-semibold text-alloro-textDark">
            Drop files to import
          </p>
          <p className="mt-1 text-sm text-gray-500">
            Multiple Word, Excel, PDF, or Markdown files are supported.
          </p>
        </div>
      )}
    </section>
  );
}
