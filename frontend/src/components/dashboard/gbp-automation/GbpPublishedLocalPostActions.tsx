import { ExternalLink, Loader2, Save, Trash2, X } from "lucide-react";

export type GbpPublishedLocalPostActionsProps = {
  searchUrl: string | null;
  canSave: boolean;
  isBusy: boolean;
  isSaving: boolean;
  isDeleting: boolean;
  isConfirmingDelete: boolean;
  onSave: () => void;
  onStartDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
};

export function GbpPublishedLocalPostActions({
  searchUrl,
  canSave,
  isBusy,
  isSaving,
  isDeleting,
  isConfirmingDelete,
  onSave,
  onStartDelete,
  onCancelDelete,
  onConfirmDelete,
}: GbpPublishedLocalPostActionsProps) {
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      <button
        type="button"
        disabled={isBusy || isSaving || isDeleting || !canSave}
        onClick={onSave}
        className="inline-flex items-center gap-1.5 rounded-[9px] bg-alloro-navy px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white transition-colors hover:bg-alloro-navy/90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save size={12} />}
        {isSaving ? "Saving to Google" : "Save to Google"}
      </button>
      {searchUrl && (
        <a
          href={searchUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-[9px] border border-slate-200 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-600 transition-colors hover:bg-slate-50"
        >
          <ExternalLink size={12} />
          Open on Google
        </a>
      )}
      {isConfirmingDelete ? (
        <span className="inline-flex flex-wrap gap-2">
          <button
            type="button"
            disabled={isDeleting}
            onClick={onCancelDelete}
            className="inline-flex items-center gap-1.5 rounded-[9px] border border-slate-200 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <X size={12} />
            Cancel
          </button>
          <button
            type="button"
            disabled={isDeleting}
            onClick={onConfirmDelete}
            className="inline-flex items-center gap-1.5 rounded-[9px] bg-red-600 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isDeleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 size={12} />}
            {isDeleting ? "Deleting..." : "Delete from Google"}
          </button>
        </span>
      ) : (
        <button
          type="button"
          disabled={isBusy || isDeleting}
          onClick={onStartDelete}
          className="inline-flex items-center gap-1.5 rounded-[9px] border border-red-200 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Trash2 size={12} />
          Delete from Google
        </button>
      )}
    </div>
  );
}
