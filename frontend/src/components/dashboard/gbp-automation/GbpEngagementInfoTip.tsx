import { Info } from "lucide-react";

export function GbpEngagementInfoTip() {
  return (
    <span
      className="group/tip relative inline-flex shrink-0 cursor-help outline-none"
      tabIndex={0}
      role="button"
      aria-label="About Alloro Engage"
    >
      <Info
        size={13}
        className="text-alloro-navy/35 transition-colors hover:text-alloro-navy group-focus/tip:text-alloro-navy"
      />
      <span
        role="tooltip"
        className="invisible pointer-events-none absolute left-1/2 top-full z-50 mt-2 w-72 -translate-x-1/2 -translate-y-1 rounded-lg bg-alloro-navy px-3 py-2 text-[11px] font-medium leading-relaxed text-white opacity-0 shadow-lg transition-[opacity,transform,visibility] duration-150 ease-out group-hover/tip:visible group-hover/tip:translate-y-0 group-hover/tip:opacity-100 group-focus/tip:visible group-focus/tip:translate-y-0 group-focus/tip:opacity-100"
      >
        <span className="absolute bottom-full left-1/2 h-0 w-0 -translate-x-1/2 border-[5px] border-transparent border-b-alloro-navy" />
        Alloro Engage is where review replies and Google Business Profile posts
        are drafted, reviewed, and published before anything goes live on
        Google.
      </span>
    </span>
  );
}
