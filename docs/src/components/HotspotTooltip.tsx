import { motion } from "framer-motion";
import type { Hotspot } from "../types/docs";

interface HotspotTooltipProps {
  hotspot: Hotspot;
  placement?: "bottom" | "top";
}

export function HotspotTooltip({ hotspot, placement = "bottom" }: HotspotTooltipProps) {
  const isTop = placement === "top";

  return (
    <motion.div
      initial={{ opacity: 0, y: isTop ? -4 : 4, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: isTop ? -4 : 4, scale: 0.95 }}
      transition={{ duration: 0.15 }}
      className={`absolute left-1/2 -translate-x-1/2 z-50 pointer-events-none ${
        isTop ? "bottom-full mb-2" : "top-full mt-2"
      }`}
    >
      <div className="bg-alloro-navy text-white px-4 py-3 rounded-xl shadow-xl min-w-[200px] max-w-[280px]">
        {/* Arrow */}
        <div
          className={`absolute left-1/2 -translate-x-1/2 w-3 h-3 bg-alloro-navy rotate-45 rounded-sm ${
            isTop ? "-bottom-1.5" : "-top-1.5"
          }`}
        />

        <div className="relative">
          <p className="text-xs font-semibold text-white/95 leading-relaxed">
            {hotspot.label}
          </p>
          {hotspot.description && (
            <p className="text-[11px] text-white/60 mt-1 leading-relaxed">
              {hotspot.description}
            </p>
          )}
        </div>
      </div>
    </motion.div>
  );
}
