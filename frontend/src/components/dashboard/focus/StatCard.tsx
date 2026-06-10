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

const CARD_BG = "#FDFDFD";
const CARD_BORDER = "#E8E4DD";
const INK = "#1F1B16";
const MUTED = "#8E8579";

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
      className={`group flex w-full flex-col items-start text-left transition-colors ${
        clickable ? "cursor-pointer hover:border-[#D8D2C8]" : "cursor-default"
      }`}
      style={{
        background: CARD_BG,
        border: `1px solid ${CARD_BORDER}`,
        borderRadius: 14,
        padding: "18px 18px 16px",
      }}
    >
      <div className="flex w-full items-center justify-between">
        <span
          className="inline-block rounded-full"
          style={{ width: 7, height: 7, background: TONE_COLOR[dotTone] }}
        />
        {clickable && (
          <ArrowUpRight
            size={15}
            strokeWidth={2}
            className="text-[#A8A192] transition-colors group-hover:text-[#1F1B16]"
          />
        )}
      </div>

      <span
        className="mt-3 font-bold uppercase"
        style={{ fontSize: 11.5, letterSpacing: "0.08em", color: INK }}
      >
        {label}
      </span>

      <span className="mt-1 leading-tight" style={{ fontSize: 14 }}>
        <span style={{ color: INK, fontWeight: 600 }}>{value}</span>
        {trailing ? (
          <span
            style={{
              color: trailingTone ? TONE_COLOR[trailingTone] : MUTED,
              fontWeight: trailingTone ? 600 : 400,
            }}
          >
            {" · "}
            {trailing}
          </span>
        ) : null}
      </span>
    </button>
  );
}

export default StatCard;
