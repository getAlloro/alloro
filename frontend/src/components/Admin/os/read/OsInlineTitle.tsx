import { useEffect, useRef, useState } from "react";

/**
 * Inline-editable Spectral document title (P3 T3): click to edit, Enter/blur
 * saves through the rename mutation the parent owns, Escape cancels.
 */
export function OsInlineTitle({
  title,
  onRename,
  isSaving = false,
}: {
  title: string;
  onRename: (title: string) => void;
  isSaving?: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isEditing) setDraft(title);
  }, [title, isEditing]);

  useEffect(() => {
    if (isEditing) inputRef.current?.focus();
  }, [isEditing]);

  const commit = () => {
    setIsEditing(false);
    const next = draft.trim();
    if (next && next !== title) onRename(next);
    else setDraft(title);
  };

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit();
          if (event.key === "Escape") {
            setDraft(title);
            setIsEditing(false);
          }
        }}
        aria-label="Document title"
        className="w-full rounded-lg border border-line-medium bg-alloro-surface px-2 py-1 font-display text-2xl font-semibold text-alloro-textDark outline-none focus:border-alloro-orange"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setIsEditing(true)}
      disabled={isSaving}
      title="Click to rename"
      className="-mx-2 max-w-full rounded-lg px-2 py-1 text-left transition-colors duration-150 hover:bg-accent-soft/50 disabled:opacity-60"
    >
      <h1 className="break-words font-display text-2xl font-semibold tracking-tight text-alloro-textDark">
        {title || "Untitled"}
      </h1>
    </button>
  );
}
