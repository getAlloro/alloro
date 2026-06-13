import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import { TONE_COLOR, type StatusTone } from "./focus/statusRules";

/**
 * InsightCue — the one-line interpretive cue the owner asked to add back on
 * data-heavy surfaces (#24): trend up = "This is strong", trend down =
 * "Spend time here" (+ optionally one action). Client-derived from a trend
 * direction — no AI call. Keep it ONE line; this IS the clarity we sell, not
 * a paragraph.
 *
 * Spec: plans/06132026-dashboard-timeframe-foundation
 */

export type InsightTrend = "up" | "down" | "flat";

export type InsightCueProps = {
  trend: InsightTrend;
  /** Override the default cue text for the trend. */
  message?: string;
  /** Optional single action phrase, appended after an em-dash. */
  action?: string;
};

const TREND_META: Record<
  InsightTrend,
  { tone: StatusTone; icon: typeof TrendingUp; defaultMessage: string }
> = {
  up: { tone: "positive", icon: TrendingUp, defaultMessage: "This is strong." },
  down: { tone: "warn", icon: TrendingDown, defaultMessage: "Spend time here." },
  flat: { tone: "neutral", icon: Minus, defaultMessage: "Holding steady." },
};

export function InsightCue({ trend, message, action }: InsightCueProps) {
  const meta = TREND_META[trend];
  const Icon = meta.icon;
  return (
    <p className="flex items-center gap-2 text-[13px] font-medium leading-snug text-alloro-navy">
      <Icon
        size={15}
        aria-hidden
        className="shrink-0"
        style={{ color: TONE_COLOR[meta.tone] }}
      />
      <span>
        <span className="font-semibold">{message ?? meta.defaultMessage}</span>
        {action ? <span className="text-ink-muted"> — {action}</span> : null}
      </span>
    </p>
  );
}

export default InsightCue;
