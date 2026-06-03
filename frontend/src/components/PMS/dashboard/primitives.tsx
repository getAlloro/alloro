import type { ReactNode } from "react";

/**
 * PMS dashboard card primitives.
 *
 * Token base ported from the Local Rankings redesign (RankingMeaningCard /
 * LocalRankingCard CardShell+Eyebrow). The Referrals Hub renders LIGHT
 * (.pm-light overrides --color-pm-bg-primary -> #F7F5F3), so the cream /
 * line-soft system applies cleanly on the light surface.
 *
 * Detail-card token recipe (matches the Rankings analog exactly):
 *   rounded-[14px] border border-line-soft bg-white shadow-premium
 * Accessible eyebrow color: text-[color:var(--color-pm-text-secondary)] (#7A746D)
 * — this REPLACES every text-slate-400 eyebrow across the dashboard.
 *
 * Spec: plans/05292026-no-ticket-referrals-hub-owner-readable-redesign/spec.md (T2)
 */

const PADDING_CLASS: Record<"sm" | "md" | "lg", string> = {
  sm: "p-4",
  md: "p-6",
  lg: "p-7",
};

export type PmsEyebrowProps = {
  children: ReactNode;
  className?: string;
};

/**
 * PmsEyebrow — accessible micro-label. Drop-in replacement for the old
 * text-slate-400 eyebrows. Uses the light-surface secondary ink token so the
 * label reads cleanly against cream/white instead of failing contrast.
 */
export function PmsEyebrow({ children, className = "" }: PmsEyebrowProps) {
  return (
    <span
      className={`text-[10px] font-bold uppercase tracking-[0.16em] text-[color:var(--color-pm-text-secondary)] ${className}`}
    >
      {children}
    </span>
  );
}

export type PmsCardShellProps = {
  children: ReactNode;
  className?: string;
  eyebrow?: ReactNode;
  title?: ReactNode;
  action?: ReactNode;
  highlighted?: boolean;
  padding?: "sm" | "md" | "lg";
};

/**
 * PmsCardShell — the canonical white detail-card surface for the Referrals Hub.
 *
 * Base tokens match the Rankings detail cards verbatim:
 *   rounded-[14px] border border-line-soft bg-white shadow-premium
 *
 * `highlighted` mirrors the empty-state wizard ring treatment
 * (border-2 border-alloro-orange ring-8 ring-alloro-orange/30).
 *
 * If `eyebrow`/`title`/`action` are provided, a header row renders with the
 * eyebrow + title on the left and the action on the right. Otherwise the shell
 * is fully generic and just wraps `children`.
 */
export function PmsCardShell({
  children,
  className = "",
  eyebrow,
  title,
  action,
  highlighted = false,
  padding = "md",
}: PmsCardShellProps) {
  const hasHeader = eyebrow != null || title != null || action != null;

  const borderClass = highlighted
    ? "border-2 border-alloro-orange ring-8 ring-alloro-orange/30"
    : "border border-line-soft";

  return (
    <section
      className={`rounded-[14px] bg-white shadow-premium ${borderClass} ${PADDING_CLASS[padding]} ${className}`}
    >
      {hasHeader && (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            {eyebrow != null &&
              (typeof eyebrow === "string" ? (
                <PmsEyebrow>{eyebrow}</PmsEyebrow>
              ) : (
                eyebrow
              ))}
            {title != null &&
              (typeof title === "string" ? (
                <h3 className="font-display text-[17px] font-medium leading-tight tracking-tight text-alloro-navy">
                  {title}
                </h3>
              ) : (
                title
              ))}
          </div>
          {action != null && <div className="shrink-0">{action}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
