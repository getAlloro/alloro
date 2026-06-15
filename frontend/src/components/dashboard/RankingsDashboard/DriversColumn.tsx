import { FACTOR_LABEL, normalizeFactorPct } from "../rankingsDashboard.utils";

export function DriversColumn({
  title,
  tone,
  drivers,
}: {
  title: string;
  tone: "positive" | "negative";
  drivers: Array<{
    factor: string;
    weight: string | number;
    direction: string;
    insight?: string;
  }>;
}) {
  const isPos = tone === "positive";
  return (
    <div>
      <div className="px-6 lg:px-7 pt-5 pb-3 flex items-center gap-2">
        <span
          className="inline-block w-2.5 h-2.5 rounded-full"
          style={{ background: isPos ? "#22c55e" : "#ef4444" }}
        />
        <span className="text-[12px] font-extrabold tracking-tight text-alloro-navy">
          {title}
        </span>
        <span className="ml-auto font-mono-display text-[10px] uppercase tracking-widest text-alloro-navy/35 tabular-nums">
          {drivers.length}
        </span>
      </div>
      {drivers.length === 0 ? (
        <p className="px-6 lg:px-7 pb-5 text-[12.5px] text-alloro-navy/40 italic">
          None identified.
        </p>
      ) : (
        <ul className="px-3 lg:px-4 pb-3">
          {drivers.map((d, i) => (
            <li key={i}>
              <details className="group rounded-xl px-3 lg:px-4 py-3 hover:bg-[rgba(17,21,28,0.025)] transition-colors">
                <summary className="flex items-center gap-3 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 10 10"
                    className="shrink-0 text-alloro-navy/35 transition-transform group-open:rotate-90"
                    aria-hidden
                  >
                    <path
                      d="M3 1l4 4-4 4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <span className="text-[13px] font-bold flex-1 truncate text-alloro-navy">
                    {FACTOR_LABEL[d.factor] ||
                      d.factor.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                  </span>
                  <span className="font-mono-display text-[10px] tracking-widest text-alloro-navy/40 tabular-nums shrink-0">
                    weight {Math.round(normalizeFactorPct(d.weight))}
                  </span>
                </summary>
                {d.insight && (
                  <p className="mt-2 ml-[22px] text-[12.5px] leading-relaxed text-alloro-navy/70 max-w-[58ch]">
                    {d.insight}
                  </p>
                )}
              </details>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
