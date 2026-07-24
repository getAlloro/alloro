import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import type { RankDelta } from "./rankingPeriod";
import { formatSince, renderPeriodMovement } from "./rankingsHubSurface.utils";

const delta = (over: Partial<RankDelta> = {}): RankDelta => ({
  startRank: 8,
  latestRank: 5,
  improvement: 3,
  startObservedAt: "2026-07-02T00:00:00.000Z",
  latestObservedAt: "2026-07-12T00:00:00.000Z",
  noMovementReason: null,
  ...over,
});

/**
 * F2 — the "since {date}" label read a UTC timestamp on the viewer's local
 * clock, so it could name a date OUTSIDE the period it was labelling.
 *
 * rankingPeriod.periodStart is deliberately UTC ("using local time here would
 * classify points near a month/quarter/year boundary differently per viewer
 * timezone"). The label has to read on the same clock or the number and its
 * date disagree.
 */
describe("formatSince", () => {
  it("FALSIFIER: formats a UTC instant in UTC, not the viewer's timezone", () => {
    // 2026-07-01T02:00Z is Jun 30 in every timezone behind UTC-2. periodStart
    // ("MONTH") puts it INSIDE July, so a "Jun 30" label under a Month tab in
    // July contradicts the frame it is shown under.
    expect(formatSince("2026-07-01T02:00:00.000Z")).toBe("Jul 1");
  });

  it("returns an empty string for a missing or unreadable timestamp", () => {
    expect(formatSince(null)).toBe("");
    expect(formatSince("not-a-date")).toBe("");
  });
});

describe("renderPeriodMovement", () => {
  it("dates an improvement from the real earliest point, in UTC", () => {
    render(<>{renderPeriodMovement(delta({ startObservedAt: "2026-07-01T02:00:00.000Z" }))}</>);
    expect(screen.getByText("Up 3 spots since Jul 1")).toBeInTheDocument();
  });

  it("reads a lower position number as an improvement, never a decline", () => {
    render(<>{renderPeriodMovement(delta({ startRank: 8, latestRank: 5, improvement: 3 }))}</>);
    expect(screen.getByText(/^Up 3 spots/)).toBeInTheDocument();
  });

  it("singularises a one-spot move", () => {
    render(<>{renderPeriodMovement(delta({ improvement: 1 }))}</>);
    expect(screen.getByText(/Up 1 spot since/)).toBeInTheDocument();
  });

  it("reports a decline with the right sign", () => {
    render(<>{renderPeriodMovement(delta({ improvement: -2 }))}</>);
    expect(screen.getByText(/^Down 2 spots since/)).toBeInTheDocument();
  });

  it("FALSIFIER: says the position is unknown rather than claiming there is no history", () => {
    // Six months of data, latest run found no position. "Not enough ranking
    // history yet" is factually false here, and it buries the actual news.
    render(
      <>
        {renderPeriodMovement(
          delta({
            latestRank: null,
            improvement: null,
            noMovementReason: "current-position-unknown",
          }),
        )}
      </>,
    );
    expect(screen.getByText(/Current position unknown/)).toBeInTheDocument();
    expect(screen.queryByText(/Not enough ranking history/)).toBeNull();
  });

  it("still says 'not enough history' when the series really is thin", () => {
    render(
      <>
        {renderPeriodMovement(
          delta({
            startRank: null,
            latestRank: null,
            improvement: null,
            startObservedAt: null,
            latestObservedAt: null,
            noMovementReason: "thin-history",
          }),
        )}
      </>,
    );
    expect(screen.getByText("Not enough ranking history yet")).toBeInTheDocument();
  });

  it("reports a flat window as no change, dated", () => {
    render(<>{renderPeriodMovement(delta({ improvement: 0, startRank: 5 }))}</>);
    expect(screen.getByText(/^No change since Jul 2$/)).toBeInTheDocument();
  });
});
