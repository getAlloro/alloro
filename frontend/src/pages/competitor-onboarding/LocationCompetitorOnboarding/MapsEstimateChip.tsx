import { type CuratedCompetitor } from "../../../api/practiceRanking";

export function MapsEstimateChip({ competitor }: { competitor: CuratedCompetitor }) {
  const hasEstimate =
    typeof competitor.discoveryPosition === "number" &&
    competitor.discoveryPosition > 0;
  const wasSampled =
    competitor.discoverySource === "places_text" &&
    Boolean(competitor.discoveryCheckedAt);
  const label = hasEstimate
    ? `#${competitor.discoveryPosition}`
    : wasSampled
      ? "not in top 20"
      : "not measured";
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[9px] font-black uppercase tracking-widest bg-slate-50 text-slate-600 border-slate-100"
      title={
        hasEstimate
          ? "Estimated from the sampled discovery search that found this competitor. Actual Google Maps results can vary by location, device, and personalization."
          : wasSampled
            ? "We sampled Google Maps for the selected radius, but this competitor did not appear in the top 20 results."
            : "No sampled Maps position has been measured for this competitor yet."
      }
    >
      Maps estimate {label}
    </span>
  );
}
