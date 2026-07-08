import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, X } from "lucide-react";
import type { OsImportSkipped, OsImportStub } from "../../../../api/admin-os";
import { useImportOsFiles } from "../../../../hooks/queries/useAdminOsImports";
import { OsCategoryPill } from "../library/OsCategoryPill";
import { OsDropzone } from "./OsDropzone";
import { OsImportRow } from "./OsImportRow";

/**
 * Batch import modal (P6 T4, D13): a white bounded surface with a dropzone, an
 * optional batch-wide category, the per-file status list (polled until each
 * file settles), and a skipped-files notice. The library refresh is handled by
 * the mutation's invalidation; started rows appear here as they convert.
 */

/** The skipped-files notice (unsupported type / bad mime). */
function OsSkippedNotice({ skipped }: { skipped: OsImportSkipped[] }) {
  if (skipped.length === 0) return null;
  return (
    <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50/50 px-3 py-2.5">
      <p className="flex items-center gap-1.5 font-mono text-[11px] font-semibold text-amber-700">
        <AlertTriangle className="h-3 w-3" strokeWidth={1.5} />
        {skipped.length} file{skipped.length === 1 ? "" : "s"} skipped
      </p>
      <ul className="mt-1 space-y-0.5">
        {skipped.map((item) => (
          <li key={item.filename} className="text-[12px] text-gray-500">
            <span className="text-gray-700">{item.filename}</span> — {item.reason}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function OsImportModal({
  isOpen,
  onClose,
  folderId = null,
}: {
  isOpen: boolean;
  onClose: () => void;
  folderId?: string | null;
}) {
  const importFiles = useImportOsFiles();
  const [category, setCategory] = useState<string | null>(null);
  const [started, setStarted] = useState<OsImportStub[]>([]);
  const [skipped, setSkipped] = useState<OsImportSkipped[]>([]);

  // Reset the transient batch state each time the modal opens.
  useEffect(() => {
    if (isOpen) {
      setCategory(null);
      setStarted([]);
      setSkipped([]);
    }
  }, [isOpen]);

  const handleFiles = (files: File[]) => {
    if (importFiles.isPending) return;
    importFiles.mutate(
      { files, category, folderId },
      {
        onSuccess: (result) => {
          setStarted((prev) => [...result.documents, ...prev]);
          setSkipped(result.skipped);
        },
      },
    );
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <motion.div
            className="absolute inset-0 bg-black/40"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Import files"
            className="relative flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-line-medium bg-alloro-surface shadow-xl"
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          >
            <header className="flex items-center justify-between border-b border-line-soft px-5 py-4">
              <div>
                <h3 className="font-display text-lg text-alloro-textDark">
                  Import files
                </h3>
                <p className="mt-0.5 font-mono text-[11px] text-gray-400">
                  Word · Excel · PDF · Markdown → indexed documents
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="rounded-lg p-1.5 text-gray-400 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-600"
              >
                <X className="h-4 w-4" strokeWidth={1.5} />
              </button>
            </header>

            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[13px] font-medium text-gray-600">
                  Category for this batch
                </span>
                <OsCategoryPill category={category} onSelect={setCategory} />
              </div>

              <OsDropzone onFiles={handleFiles} disabled={importFiles.isPending} />

              <OsSkippedNotice skipped={skipped} />

              {started.length > 0 && (
                <div>
                  <p className="mb-1 font-mono text-[11px] uppercase tracking-wide text-gray-400">
                    Importing {started.length}
                  </p>
                  <ul>
                    {started.map((stub) => (
                      <OsImportRow key={stub.importId} stub={stub} active={isOpen} />
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <footer className="flex items-center justify-end border-t border-line-soft px-5 py-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-[9px] bg-alloro-orange px-3.5 py-2 text-sm font-semibold text-white transition-colors duration-150 hover:bg-alloro-orange/90"
              >
                Done
              </button>
            </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
