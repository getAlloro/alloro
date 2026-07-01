import { useEffect, useRef } from "react";
import { Loader2, Clock, CheckCircle2, XCircle } from "lucide-react";
import type { BulkSeoStatus } from "../../../api/websites";

type ItemStatus = BulkSeoStatus["item_statuses"][number];

const GROUPS: Array<{
  key: ItemStatus["status"];
  label: string;
  icon: typeof Loader2;
  iconClass: string;
}> = [
  { key: "processing", label: "Processing", icon: Loader2, iconClass: "text-alloro-orange animate-spin" },
  { key: "pending", label: "Pending", icon: Clock, iconClass: "text-gray-300" },
  { key: "done", label: "Done", icon: CheckCircle2, iconClass: "text-green-500" },
  { key: "failed", label: "Failed", icon: XCircle, iconClass: "text-red-500" },
];

/**
 * Live grouped breakdown of a bulk SEO generation run's per-item progress.
 * Anchored under its trigger; closes on outside click or Escape. Reused as-is
 * by both the pages list (PagesTab.tsx) and the posts bulk-SEO button
 * (PostTypeSeoButton.tsx) — same shape, don't fork it (spec §4.3).
 */
export default function BulkSeoProgressPopover({
  items,
  isOpen,
  onOpenChange,
}: {
  items: BulkSeoStatus["item_statuses"];
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onOpenChange(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [isOpen, onOpenChange]);

  if (!isOpen) return null;

  return (
    <div
      ref={popoverRef}
      className="absolute z-50 top-full right-0 mt-2 w-72 max-h-96 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg p-3"
      role="dialog"
      aria-label="Bulk SEO generation progress"
    >
      {items.length === 0 ? (
        <div className="flex items-center gap-2 text-xs text-gray-400 py-2 px-1">
          <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
          Starting…
        </div>
      ) : (
        <div className="space-y-3">
          {GROUPS.map((group) => {
            const groupItems = items.filter((item) => item.status === group.key);
            if (groupItems.length === 0) return null;
            const Icon = group.icon;
            return (
              <div key={group.key}>
                <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 block mb-1.5">
                  {group.label} ({groupItems.length})
                </span>
                <ul className="space-y-1">
                  {groupItems.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 px-2.5 py-1.5"
                    >
                      <Icon className={`w-3.5 h-3.5 shrink-0 ${group.iconClass}`} />
                      <span className="text-xs text-gray-700 truncate">{item.title}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
