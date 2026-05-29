import { Info } from "lucide-react";

/**
 * InfoTip — small (i) icon with an animated, hover/focus-activated tooltip.
 * Pure CSS transition (no framer-motion). Tooltip pops below the icon, fades
 * + slides in. Accessible via keyboard focus.
 */
export function InfoTip({
  content,
  align = "center",
  placement = "bottom",
  ariaLabel = "More info",
}: {
  content: string;
  // `left` anchors the tooltip to the icon's left edge (extends rightward) so
  // it doesn't clip when the icon sits flush-left in a row grid.
  align?: "center" | "left";
  // `top` flips the tooltip above the icon — needed when the InfoTip sits in
  // the last row of an `overflow-hidden` container that would clip a
  // bottom-flowing tooltip.
  placement?: "top" | "bottom";
  // Accessible label for the trigger; override when a more descriptive label
  // than the generic default fits the context (e.g. "About Alloro Engage").
  ariaLabel?: string;
}) {
  const tooltipPos =
    align === "left" ? "left-0" : "left-1/2 -translate-x-1/2";
  const arrowPos =
    align === "left" ? "left-3" : "left-1/2 -translate-x-1/2";
  const placementCls =
    placement === "top"
      ? "bottom-full mb-2 translate-y-1 group-hover/tip:translate-y-0 group-focus/tip:translate-y-0"
      : "top-full mt-2 -translate-y-1 group-hover/tip:translate-y-0 group-focus/tip:translate-y-0";
  const arrowEdgeCls =
    placement === "top"
      ? "top-full border-t-alloro-navy"
      : "bottom-full border-b-alloro-navy";
  return (
    <span
      className="relative inline-flex group/tip cursor-help shrink-0 outline-none"
      tabIndex={0}
      role="button"
      aria-label={ariaLabel}
    >
      <Info
        size={13}
        className="text-alloro-navy/35 hover:text-alloro-navy group-focus/tip:text-alloro-navy transition-colors"
      />
      <span
        role="tooltip"
        className={`pointer-events-none absolute z-50 ${placementCls} ${tooltipPos} w-64 bg-alloro-navy text-white text-[11px] font-medium leading-relaxed rounded-lg px-3 py-2 shadow-lg opacity-0 invisible group-hover/tip:opacity-100 group-hover/tip:visible group-focus/tip:opacity-100 group-focus/tip:visible transition-[opacity,transform,visibility] duration-150 ease-out`}
      >
        <span
          className={`absolute ${arrowEdgeCls} ${arrowPos} w-0 h-0 border-[5px] border-transparent`}
        />
        {content}
      </span>
    </span>
  );
}
