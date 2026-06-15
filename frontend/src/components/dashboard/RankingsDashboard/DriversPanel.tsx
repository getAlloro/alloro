import { SectionTitle } from "../shared/SectionTitle";
import { InfoTip } from "../shared/InfoTip";
import type { RankingResult } from "../rankingsDashboard.types";
import { DriversColumn } from "./DriversColumn";

/* ─────────────────────────────────────────────────────────────
   DriversPanel — split <details> accordion (T5)
   ───────────────────────────────────────────────────────────── */
export function DriversPanel({
  result,
  embedded = false,
}: {
  result: RankingResult;
  embedded?: boolean;
}) {
  const drivers = result.llmAnalysis?.drivers ?? [];
  if (drivers.length === 0) return null;
  const positives = drivers.filter((d) => d.direction === "positive");
  const negatives = drivers.filter((d) => d.direction !== "positive");

  return (
    <section
      data-wizard-target="rankings-factors"
      className={`bg-white border border-line-soft rounded-[14px] overflow-hidden ${
        embedded ? "" : "shadow-premium"
      }`}
    >
      {!embedded && (
        <header className="px-6 lg:px-7 py-4 flex items-center justify-between border-b border-line-soft gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{ background: "#11151C" }}
            />
            <SectionTitle>Score details</SectionTitle>
            <InfoTip content="The visibility signals helping or hurting your local search estimate. Green is working for you; red needs attention. Click a factor for the specific insight." />
          </div>
          <span className="font-mono-display text-[10px] tracking-widest text-alloro-navy/40 uppercase shrink-0">
            {drivers.length} factors
          </span>
        </header>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2">
        <DriversColumn title="Working for you" tone="positive" drivers={positives} />
        <div className="border-t md:border-t-0 md:border-l border-line-soft">
          <DriversColumn title="Holding you back" tone="negative" drivers={negatives} />
        </div>
      </div>
    </section>
  );
}
