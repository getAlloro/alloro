import type { ReactNode } from "react";

/**
 * StatBox — the shared hub stat tile (eyebrow label, display value, muted
 * sub). One recipe across Local Rankings, Reviews & Posts, and any future
 * hub stat row: white card on linen, ink value, terracotta = attention.
 *
 * Spec: plans/06112026-design-consistency-pass (T4)
 */

export type StatBoxProps = {
  label: string;
  value: ReactNode;
  sub?: string;
  /** "warn" renders the value terracotta — reserved for needs-attention. */
  tone?: "ink" | "warn";
};

export function StatBox({ label, value, sub, tone = "ink" }: StatBoxProps) {
  return (
    <div className="rounded-[14px] border border-line-soft bg-white p-5 shadow-premium">
      <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-ink-muted">
        {label}
      </div>
      <div
        className={`mt-2 font-display text-2xl font-medium leading-none tracking-tight tabular-nums ${
          tone === "warn" ? "text-alloro-orange" : "text-alloro-navy"
        }`}
      >
        {value}
      </div>
      {sub && (
        <div className="mt-1.5 text-[12px] font-semibold text-ink-muted">{sub}</div>
      )}
    </div>
  );
}

export default StatBox;
