import { Loader2 } from "lucide-react";
import {
  type CuratedCompetitor,
  type PracticeLocationRef,
} from "../../../api/practiceRanking";
import { CompetitorMap } from "./CompetitorMap";

export function DiscoveringStage({
  competitors,
  practiceLocation,
  radiusMeters,
}: {
  competitors: CuratedCompetitor[];
  practiceLocation: PracticeLocationRef | null;
  radiusMeters: number;
}) {
  return (
    <section className="bg-white rounded-3xl border border-black/5 shadow-premium overflow-hidden">
      <div className="px-8 py-8 border-b border-black/5 text-left">
        <div className="px-2 py-0.5 inline-flex items-center gap-2 bg-alloro-orange/10 rounded-md text-alloro-orange text-[10px] font-black uppercase tracking-widest mb-3">
          <Loader2 className="w-3 h-3 animate-spin" />
          Step 1 of 3
        </div>
        <h2 className="font-display text-2xl md:text-3xl font-medium text-alloro-navy tracking-tight mb-2">
          Discovering competitors near you
        </h2>
        <p className="text-base text-slate-500 font-medium leading-relaxed">
          We're scanning your area for the practices that show up next to you in
          Google. You'll get to choose which ones count.
        </p>
      </div>

      <CompetitorMap
        competitors={competitors}
        practiceLocation={practiceLocation}
        radiusMeters={radiusMeters}
        height={480}
        showLoadingFallback
      />

      <div className="px-8 py-6 bg-white border-t border-black/5">
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500 font-medium">
            {competitors.length === 0
              ? "Searching Google Places…"
              : `Found ${competitors.length} practices nearby`}
          </span>
          <span className="text-alloro-textDark/40 text-xs font-bold uppercase tracking-widest">
            {competitors.length === 0 ? "" : "Locking in your list"}
          </span>
        </div>
      </div>
    </section>
  );
}
