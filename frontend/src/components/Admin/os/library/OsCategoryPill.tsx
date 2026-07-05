import { useState } from "react";
import { ChevronDown, Tag, X } from "lucide-react";
import { useOsPopover } from "../../../../hooks/useOsPopover";
import {
  useAdminOsCategories,
  useCreateOsCategory,
} from "../../../../hooks/queries/useAdminOsDocuments";

/**
 * Editable category pill (P3 T2/T3): accent-washed pill opens a popover with
 * the merged category registry, a create row, and a clear action. The parent
 * owns the PATCH meta mutation via onSelect.
 */
export function OsCategoryPill({
  category,
  onSelect,
  isSaving = false,
}: {
  category: string | null;
  onSelect: (category: string | null) => void;
  isSaving?: boolean;
}) {
  const { isOpen, setIsOpen, ref } = useOsPopover<HTMLDivElement>();
  const categoriesQuery = useAdminOsCategories();
  const createCategory = useCreateOsCategory();
  const [newName, setNewName] = useState("");

  const pick = (next: string | null) => {
    setIsOpen(false);
    if (next !== category) onSelect(next);
  };

  const handleCreate = () => {
    const name = newName.trim();
    if (!name || createCategory.isPending) return;
    createCategory.mutate(name, {
      onSuccess: ({ category: created }) => {
        setNewName("");
        pick(created.name);
      },
    });
  };

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        disabled={isSaving}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors duration-150 disabled:opacity-60 ${
          category
            ? "bg-accent-soft text-alloro-orange hover:bg-accent-soft/70"
            : "border border-dashed border-line-medium text-gray-400 hover:text-gray-600"
        }`}
      >
        <Tag className="h-3 w-3" strokeWidth={1.5} />
        {category ?? "Add category"}
        <ChevronDown className="h-3 w-3" strokeWidth={1.5} />
      </button>

      {isOpen && (
        <div
          role="listbox"
          aria-label="Categories"
          className="absolute left-0 top-full z-30 mt-1.5 w-56 rounded-xl border border-line-medium bg-alloro-surface p-1 shadow-lg"
        >
          <div className="max-h-56 overflow-y-auto">
            {categoriesQuery.isLoading && (
              <p className="px-2.5 py-2 font-mono text-[11px] text-gray-400">
                Loading…
              </p>
            )}
            {categoriesQuery.data?.map((option) => (
              <button
                key={option.name}
                type="button"
                role="option"
                aria-selected={option.name === category}
                onClick={() => pick(option.name)}
                className={`block w-full rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors duration-150 ${
                  option.name === category
                    ? "bg-accent-soft text-alloro-orange"
                    : "text-gray-700 hover:bg-gray-100/70"
                }`}
              >
                {option.name}
              </button>
            ))}
            {categoriesQuery.data?.length === 0 && (
              <p className="px-2.5 py-2 text-[12px] text-gray-400">
                No categories yet.
              </p>
            )}
          </div>
          <div className="mt-1 border-t border-line-soft p-1">
            <input
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") handleCreate();
              }}
              placeholder="New category…"
              aria-label="New category name"
              className="w-full rounded-lg border border-line-medium bg-alloro-surface px-2.5 py-1.5 text-[12px] text-gray-800 outline-none transition-colors duration-150 focus:border-alloro-orange"
            />
          </div>
          {category && (
            <button
              type="button"
              onClick={() => pick(null)}
              className="mt-1 flex w-full items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-left text-[12px] text-gray-500 transition-colors duration-150 hover:bg-gray-100/70"
            >
              <X className="h-3 w-3" strokeWidth={1.5} />
              Remove category
            </button>
          )}
        </div>
      )}
    </div>
  );
}
