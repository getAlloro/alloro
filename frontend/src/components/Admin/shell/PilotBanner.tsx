import { useState } from "react";
import { X } from "lucide-react";
import { isPilotSession } from "../../../api";

export function PilotBanner() {
  const [isDismissed, setIsDismissed] = useState(false);
  const isPilotMode = isPilotSession();

  if (!isPilotMode || isDismissed) return null;

  return (
    <div className="fixed left-3 top-3 z-[9999] inline-flex items-center gap-2 rounded-full bg-amber-500 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.16em] text-black shadow-[0_10px_24px_rgba(0,0,0,0.20)]">
      <span>PILOT MODE</span>
      <button
        type="button"
        aria-label="Dismiss pilot mode indicator"
        onClick={() => setIsDismissed(true)}
        className="flex h-5 w-5 items-center justify-center rounded-full bg-black/15 text-black transition hover:bg-black/25 focus:outline-none focus:ring-2 focus:ring-black/30"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
