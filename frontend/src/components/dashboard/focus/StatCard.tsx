import { ArrowUpRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { TONE_COLOR, type StatusTone } from "./statusRules";

/**
 * StatCard — compact metric tile for the simplified Practice Hub.
 *
 * Presentational only: the parent (StatCardRow) computes value/trailing/tone
 * from real or wizard-demo data and passes plain strings down.
 *
 * Layout mirrors the redesign mockup: colored health dot (top-left) + arrow
 * link affordance (top-right), then an uppercase label, then
 * "value · trailing".
 *
 * Spec: plans/06092026-practice-hub-simplification/spec.html (T3)
 */

// Card + text colors come from the shared tokens (consistency pass);
// only the status TONE_COLOR stays a JS constant (dot/trailing tints).

export interface StatCardProps {
  /** Uppercase eyebrow, e.g. "Referrals". */
  label: string;
  /** Primary value, e.g. "181" or "#1". */
  value: string;
  /** Text rendered after "·", e.g. "healthy" or "5.0★". */
  trailing?: string | null;
  /**
   * Tone for the trailing text. A StatusTone tints it (status words like
   * "healthy"/"post due"); `null` renders it muted (plain metrics like
   * "5.0★"/"this mo").
   */
  trailingTone?: StatusTone | null;
  /** Dot color tone. */
  dotTone: StatusTone;
  /**
   * Small line under the value — usually the card's timeframe window
   * (e.g. "April 2026", "all-time"). Every card states its window (#1/#23).
   */
  sub?: string | null;
  /**
   * Optional tone for the sub line. `null` (default) renders it muted —
   * correct for timeframe windows. A StatusTone tints it, for when the sub
   * is a status nudge rather than a date (e.g. Local rank's "Google Post
   * Due" moved below the value).
   */
  subTone?: StatusTone | null;
  /** Route to navigate to on click. Omit to render a non-clickable card. */
  href?: string;
  /** Optional onboarding-wizard spotlight target id. */
  wizardTarget?: string;
}

export function StatCard({
  label,
  value,
  trailing,
  trailingTone = null,
  dotTone,
  sub,
  subTone = null,
  href,
  wizardTarget,
}: StatCardProps) {
  const navigate = useNavigate();
  const clickable = !!href;

  return (
    <button
      type="button"
      data-wizard-target={wizardTarget}
      onClick={clickable ? () => navigate(href as string) : undefined}
      tabIndex={clickable ? 0 : -1}
      aria-disabled={!clickable}
      className={`group flex w-full flex-col items-start rounded-[14px] border border-line-soft bg-white px-[18px] pb-4 pt-[18px] text-left shadow-premium transition-colors ${
        clickable ? "cursor-pointer hover:border-line-medium" : "cursor-default"
      }`}
    >
      <div className="flex w-full items-center justify-between">
        <span
          className="inline-block h-[7px] w-[7px] rounded-full"
          style={{ background: TONE_COLOR[dotTone] }}
        />
        {clickable && (
          <ArrowUpRight
            size={15}
            strokeWidth={2}
            className="text-ink-muted transition-colors group-hover:text-alloro-navy"
          />
        )}
      </div>

      <span className="mt-3 text-[11.5px] font-bold uppercase tracking-[0.08em] text-alloro-navy">
        {label}
      </span>

      <span className="mt-1 text-sm leading-tight">
        <span className="font-semibold text-alloro-navy tabular-nums">{value}</span>
        {trailing ? (
          <span
            className={trailingTone ? "font-semibold" : "font-normal text-ink-muted"}
            style={trailingTone ? { color: TONE_COLOR[trailingTone] } : undefined}
          >
            {" · "}
            {trailing}
          </span>
        ) : null}
      </span>

      {sub ? (
        <span
          className={`mt-1 text-[11px] ${subTone ? "font-semibold" : "font-medium text-ink-muted"}`}
          style={subTone ? { color: TONE_COLOR[subTone] } : undefined}
        >
          {sub}
        </span>
      ) : null}
    </button>
  );
}

export default StatCard;
