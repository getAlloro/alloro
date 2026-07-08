import { ChevronDown, UserRound, X } from "lucide-react";
import type { OsDocumentOwner } from "../../../../api/admin-os";
import { useAdminOsUsers } from "../../../../hooks/queries/useAdminOsUsers";
import { useOsPopover } from "../../../../hooks/useOsPopover";
import { osOwnerLabel } from "../shared/osFormat";

/**
 * Owner picker (P3 T3, master spec D3): internal Alloro admin users from
 * useAdminOsUsers. The parent owns the PATCH meta mutation via onSelect.
 */
export function OsOwnerPicker({
  owner,
  onSelect,
  isSaving = false,
}: {
  owner: OsDocumentOwner | null;
  onSelect: (ownerId: number | null) => void;
  isSaving?: boolean;
}) {
  const { isOpen, setIsOpen, ref } = useOsPopover<HTMLDivElement>();
  const usersQuery = useAdminOsUsers();

  const pick = (ownerId: number | null) => {
    setIsOpen(false);
    if (ownerId !== (owner?.id ?? null)) onSelect(ownerId);
  };

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        disabled={isSaving}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className="inline-flex items-center gap-1.5 rounded-full border border-line-medium px-2.5 py-1 text-[11px] font-medium text-gray-600 transition-colors duration-150 hover:border-gray-300 disabled:opacity-60"
      >
        <UserRound className="h-3 w-3" strokeWidth={1.5} />
        {owner ? osOwnerLabel(owner) : "Assign owner"}
        <ChevronDown className="h-3 w-3" strokeWidth={1.5} />
      </button>

      {isOpen && (
        <div
          role="listbox"
          aria-label="Owners"
          className="absolute left-0 top-full z-30 mt-1.5 w-60 rounded-xl border border-line-medium bg-alloro-surface p-1 shadow-lg"
        >
          <div className="max-h-56 overflow-y-auto">
            {usersQuery.isLoading && (
              <p className="px-2.5 py-2 font-mono text-[11px] text-gray-400">
                Loading…
              </p>
            )}
            {usersQuery.data?.map((user) => (
              <button
                key={user.id}
                type="button"
                role="option"
                aria-selected={user.id === owner?.id}
                onClick={() => pick(user.id)}
                className={`block w-full rounded-lg px-2.5 py-1.5 text-left transition-colors duration-150 ${
                  user.id === owner?.id
                    ? "bg-accent-soft text-alloro-orange"
                    : "text-gray-700 hover:bg-gray-100/70"
                }`}
              >
                <span className="block text-[13px]">{user.name || user.email}</span>
                {user.name && (
                  <span className="block font-mono text-[10px] text-gray-400">
                    {user.email}
                  </span>
                )}
              </button>
            ))}
          </div>
          {owner && (
            <button
              type="button"
              onClick={() => pick(null)}
              className="mt-1 flex w-full items-center gap-1.5 rounded-lg border-t border-line-soft px-2.5 py-1.5 text-left text-[12px] text-gray-500 transition-colors duration-150 hover:bg-gray-100/70"
            >
              <X className="h-3 w-3" strokeWidth={1.5} />
              Remove owner
            </button>
          )}
        </div>
      )}
    </div>
  );
}
