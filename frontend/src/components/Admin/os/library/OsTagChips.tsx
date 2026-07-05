import { useState } from "react";
import { Plus, X } from "lucide-react";

/**
 * Editable tag chips (P3 T3): quiet gray chips with remove crosses and an
 * inline add input. The parent owns the PATCH meta mutation — every change
 * hands back the full next tag array.
 */

const OS_TAG_MAX_LENGTH = 60;

export function OsTagChips({
  tags,
  onChange,
  isSaving = false,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  isSaving?: boolean;
}) {
  const [isAdding, setIsAdding] = useState(false);
  const [draft, setDraft] = useState("");

  const addTag = () => {
    const tag = draft.trim().slice(0, OS_TAG_MAX_LENGTH);
    setDraft("");
    if (!tag) {
      setIsAdding(false);
      return;
    }
    if (!tags.includes(tag)) onChange([...tags, tag]);
    setIsAdding(false);
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600"
        >
          {tag}
          <button
            type="button"
            disabled={isSaving}
            onClick={() => onChange(tags.filter((existing) => existing !== tag))}
            aria-label={`Remove tag ${tag}`}
            className="text-gray-400 transition-colors duration-150 hover:text-gray-700 disabled:opacity-60"
          >
            <X className="h-3 w-3" strokeWidth={1.5} />
          </button>
        </span>
      ))}
      {isAdding ? (
        <input
          autoFocus
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={addTag}
          onKeyDown={(event) => {
            if (event.key === "Enter") addTag();
            if (event.key === "Escape") {
              setDraft("");
              setIsAdding(false);
            }
          }}
          placeholder="tag"
          aria-label="New tag"
          className="h-6 w-24 rounded-full border border-line-medium bg-alloro-surface px-2 text-[11px] text-gray-700 outline-none transition-colors duration-150 focus:border-alloro-orange"
        />
      ) : (
        <button
          type="button"
          disabled={isSaving}
          onClick={() => setIsAdding(true)}
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-line-medium px-2 py-0.5 text-[11px] font-medium text-gray-400 transition-colors duration-150 hover:text-gray-600 disabled:opacity-60"
        >
          <Plus className="h-3 w-3" strokeWidth={1.5} />
          Tag
        </button>
      )}
    </div>
  );
}
