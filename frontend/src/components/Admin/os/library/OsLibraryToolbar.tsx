import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Upload } from "lucide-react";
import { useCreateOsDocument } from "../../../../hooks/queries/useAdminOsDocumentMutations";
import { OsModalShell } from "../shared/OsModalShell";

/**
 * Library toolbar (P3 T2): New document (title prompt → POST → straight into
 * the editor) and the Import button, disabled until the P6 imports build.
 */

function OsNewDocumentModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const [title, setTitle] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const createDocument = useCreateOsDocument();

  useEffect(() => {
    if (isOpen) {
      setTitle("");
      // Focus after the enter animation mounts the input.
      window.setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const handleCreate = () => {
    const trimmed = title.trim();
    if (!trimmed || createDocument.isPending) return;
    createDocument.mutate(
      { title: trimmed },
      {
        onSuccess: ({ document }) => {
          onClose();
          navigate(`/admin/os/doc/${document.id}/edit`);
        },
      },
    );
  };

  return (
    <OsModalShell isOpen={isOpen} onClose={onClose} label="New document">
      <h3 className="font-display text-lg text-alloro-textDark">
        New document
      </h3>
      <input
        ref={inputRef}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") handleCreate();
          if (event.key === "Escape") onClose();
        }}
        placeholder="Document title"
        aria-label="Document title"
        className="mt-4 w-full rounded-lg border border-line-medium bg-alloro-surface px-3 py-2 text-sm text-gray-800 outline-none transition-colors duration-150 focus:border-alloro-orange"
      />
      <div className="mt-5 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-[9px] border border-line-medium px-3.5 py-2 text-sm font-medium text-gray-600 transition-colors duration-150 hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleCreate}
          disabled={!title.trim() || createDocument.isPending}
          className="rounded-[9px] bg-alloro-orange px-3.5 py-2 text-sm font-semibold text-white transition-colors duration-150 hover:bg-alloro-orange/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {createDocument.isPending ? "Creating…" : "Create & edit"}
        </button>
      </div>
    </OsModalShell>
  );
}

export function OsLibraryToolbar() {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled
        title="File imports arrive in P6"
        className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-[9px] border border-line-medium bg-alloro-surface px-3 py-2 text-sm font-medium text-gray-400 opacity-60"
      >
        <Upload className="h-4 w-4" strokeWidth={1.5} />
        Import
      </button>
      <button
        type="button"
        onClick={() => setIsModalOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-[9px] bg-alloro-orange px-3.5 py-2 text-sm font-semibold text-white transition-colors duration-150 hover:bg-alloro-orange/90"
      >
        <Plus className="h-4 w-4" strokeWidth={2} />
        New document
      </button>
      <OsNewDocumentModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </div>
  );
}
