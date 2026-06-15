import { SectionTitle } from "../shared/SectionTitle";
import { InfoTip } from "../shared/InfoTip";
import type { RankingResult } from "../rankingsDashboard.types";

/* ─────────────────────────────────────────────────────────────
   NextMoves — top recommendations right-rail (T7)
   ───────────────────────────────────────────────────────────── */
export function NextMoves({ result }: { result: RankingResult }) {
  const recs = result.llmAnalysis?.top_recommendations ?? [];
  if (recs.length === 0) return null;
  const accent = "#D66853";
  const visibleRecs = recs.slice(0, 3);

  return (
    <section className="rounded-[14px] border border-line-soft bg-white p-6 shadow-premium lg:p-7">
      <header className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{ background: accent }}
          />
          <SectionTitle>Best next actions</SectionTitle>
          <InfoTip content="Highest-impact actions to improve local visibility, ordered by priority. Click any move to see why it matters and how to do it." />
        </div>
        <span className="font-mono-display text-[10px] tracking-widest text-alloro-navy/40 uppercase shrink-0">
          {visibleRecs.length} actions
        </span>
      </header>
      <ol className="grid gap-4 lg:grid-cols-3">
        {visibleRecs.map((rec, i) => (
          <li key={i}>
            <article className="h-full rounded-[12px] border border-line-soft bg-white p-4 shadow-[0_12px_28px_rgba(17,21,28,0.07)] transition-transform duration-200 hover:-translate-y-0.5 hover:border-alloro-orange/25">
              <div className="mb-3 flex items-center gap-2">
                <div
                  className="flex h-7 w-7 items-center justify-center rounded-full border font-extrabold text-[12px] tabular-nums"
                  style={{
                    color: accent,
                    background: "rgba(214,104,83,0.08)",
                    borderColor: "rgba(214,104,83,0.22)",
                  }}
                >
                  {rec.priority}
                </div>
                <span className="font-mono-display text-[10px] font-bold uppercase tracking-[0.16em] text-alloro-navy/35">
                  Action
                </span>
              </div>
              <h4 className="text-[14.5px] font-bold leading-snug tracking-tight text-alloro-navy">
                {rec.title}
              </h4>
              {rec.description && (
                <p className="mt-3 text-[12.5px] font-medium leading-relaxed text-alloro-navy/65">
                  {rec.description}
                </p>
              )}
            </article>
          </li>
        ))}
      </ol>
    </section>
  );
}
