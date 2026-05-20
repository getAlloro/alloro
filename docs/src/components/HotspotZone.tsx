import { useState, useRef, useEffect, type ReactNode } from "react";
import { AnimatePresence } from "framer-motion";
import { clsx } from "clsx";
import type { Hotspot } from "../types/docs";
import { HotspotTooltip } from "./HotspotTooltip";

interface HotspotZoneProps {
  id: string;
  hotspot?: Hotspot;
  isActive: boolean;
  onHotspotClick?: (hotspot: Hotspot) => void;
  children: ReactNode;
}

export function HotspotZone({
  id: _id,
  hotspot,
  isActive,
  onHotspotClick,
  children,
}: HotspotZoneProps) {
  const [isHovered, setIsHovered] = useState(false);
  const showTooltip = (isActive || isHovered) && hotspot;
  const zoneRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<"bottom" | "top">("bottom");

  useEffect(() => {
    if (!showTooltip || !zoneRef.current) return;
    const zone = zoneRef.current;
    // Find the nearest scroll container (DesktopViewport's overflow-y-auto)
    const scrollContainer = zone.closest(".overflow-y-auto");
    if (!scrollContainer) return;
    const zoneRect = zone.getBoundingClientRect();
    const containerRect = scrollContainer.getBoundingClientRect();
    const spaceBelow = containerRect.bottom - zoneRect.bottom;
    setPlacement(spaceBelow < 160 ? "top" : "bottom");
  }, [showTooltip]);

  return (
    <div
      ref={zoneRef}
      className={clsx(
        "relative rounded-lg border-2 transition-all duration-200 cursor-pointer",
        isActive
          ? "border-alloro-orange bg-alloro-orange/5"
          : isHovered
            ? "border-alloro-orange/50 bg-alloro-orange/5"
            : "border-transparent hover:border-alloro-orange/30"
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => hotspot && onHotspotClick?.(hotspot)}
    >
      {children}

      {/* Step badge */}
      {hotspot?.step != null && (
        <div className="absolute -top-2 -left-2 w-5 h-5 rounded-full bg-alloro-orange text-white text-[10px] font-bold flex items-center justify-center shadow-md pointer-events-none z-10">
          {hotspot.step}
        </div>
      )}

      {/* Tooltip */}
      <AnimatePresence>
        {showTooltip && <HotspotTooltip hotspot={hotspot} placement={placement} />}
      </AnimatePresence>
    </div>
  );
}
