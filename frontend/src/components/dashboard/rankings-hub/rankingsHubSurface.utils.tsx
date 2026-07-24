import type { ReactNode } from "react";

import { TONE_COLOR } from "../focus/statusRules";
import { hasDatableMovement, type RankDelta } from "./rankingPeriod";

/**
 * rankingsHubSurface.utils — the rank-over-time movement line, kept out of the
 * hub's page container so it can be tested without rendering the whole surface
 * (§13.2, §20.1).
 */

/**
 * The date the movement is measured from, formatted in **UTC**.
 *
 * `observedAt` is a UTC instant and `periodStart` classifies points in UTC on
 * purpose — "using local time here would classify points near a
 * month/quarter/year boundary differently per viewer timezone". A local-time
 * label breaks that: 2026-07-01T02:00Z renders as "Jun 30" for any viewer
 * behind UTC-2, so a Month tab in July would be dated to June. The number would
 * be right and its date would contradict the frame it is shown under.
 *
 * Empty string when the timestamp is missing or unreadable — never a guess.
 */
export function formatSince(iso: string | null): string {
  if (!iso) return "";
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return "";
  return new Date(ts).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  });
}

/** Told to the owner when the latest run did not place the practice at all. */
const POSITION_UNKNOWN_COPY =
  "Current position unknown — not in the top 20 on the latest check";

/** Told to the owner when we genuinely do not hold enough runs yet. */
const THIN_HISTORY_COPY = "Not enough ranking history yet";

/**
 * Render the rank-over-time movement line for the selected period. Honest by
 * construction: without two datable points it says which of the two reasons
 * applies, and any movement is dated from the real earliest point used.
 */
export function renderPeriodMovement(delta: RankDelta): ReactNode {
  if (!hasDatableMovement(delta)) {
    return (
      <span className="text-ink-muted">
        {delta.noMovementReason === "current-position-unknown"
          ? POSITION_UNKNOWN_COPY
          : THIN_HISTORY_COPY}
      </span>
    );
  }
  // hasDatableMovement is a type predicate, so `improvement` is a number here —
  // the invariant is compiler-enforced rather than asserted with `as number`.
  const { improvement } = delta;
  const magnitude = Math.abs(improvement);
  const spots = magnitude === 1 ? "spot" : "spots";
  const since = formatSince(delta.startObservedAt);
  if (improvement > 0) {
    return (
      <span style={{ color: TONE_COLOR.positive }}>
        Up {magnitude} {spots} since {since}
      </span>
    );
  }
  if (improvement < 0) {
    return (
      <span className="text-alloro-navy/70">
        Down {magnitude} {spots} since {since}
      </span>
    );
  }
  return <span className="text-ink-muted">No change since {since}</span>;
}
