export type OsEditorLinkInputProps = {
  url: string;
  onUrlChange: (url: string) => void;
  onApply: () => void;
  onDismiss: () => void;
};

export function OsEditorLinkInput({
  url,
  onUrlChange,
  onApply,
  onDismiss,
}: OsEditorLinkInputProps) {
  return (
    <div className="flex items-center gap-2 border-t border-line-soft px-2 py-2">
      <input
        autoFocus
        value={url}
        onChange={(event) => onUrlChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") onApply();
          if (event.key === "Escape") onDismiss();
        }}
        placeholder="https://…"
        aria-label="Link URL"
        className="w-full max-w-sm rounded-lg border border-line-medium bg-alloro-surface px-2.5 py-1.5 text-sm text-gray-800 outline-none transition-colors duration-150 focus:border-alloro-orange focus:ring-2 focus:ring-alloro-orange/20"
      />
      <button
        type="button"
        onClick={onApply}
        className="rounded-[9px] bg-alloro-orange px-3 py-1.5 text-xs font-semibold text-white transition-colors duration-150 hover:bg-alloro-orange/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-alloro-orange/40"
      >
        Apply
      </button>
    </div>
  );
}
