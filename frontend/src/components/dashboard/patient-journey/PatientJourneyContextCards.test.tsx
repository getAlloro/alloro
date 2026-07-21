/**
 * Copy tests for the Patient-Journey context cards.
 *
 * These live beside the component on purpose. The strings asserted here are
 * user-facing, so they are pinned against the real rendered output rather than
 * a mirror of the copy kept elsewhere — a mirror drifts silently the moment the
 * component changes, which is exactly what happened to the backend copy mirror
 * this file replaces (plans/07202026-pr-merge-remediation, T5).
 *
 * All context values are synthetic (§20.4).
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PatientJourneyContextCards } from "./PatientJourneyContextCards";
import type {
  PatientJourneyContext,
  PatientJourneyRankContext,
  PatientJourneyReviewsContext,
} from "../../../types/patientJourney";

/** Reviews held in a digit-free unavailable state so rank assertions stay clean. */
const REVIEWS_UNAVAILABLE: PatientJourneyReviewsContext = {
  rating: null,
  count: null,
  newThisMonth: null,
  replyRatePct: null,
  available: false,
  card: null,
};

function renderCards(
  rank: PatientJourneyRankContext,
  reviews: PatientJourneyReviewsContext = REVIEWS_UNAVAILABLE,
) {
  const context: PatientJourneyContext = { rank, reviews };
  return render(<PatientJourneyContextCards context={context} />);
}

const RANK_STATES: {
  name: string;
  rank: PatientJourneyRankContext;
  stat: string;
  line: string;
}[] = [
  {
    name: "a measured Maps position",
    rank: { position: 3, available: true, notInTop20: false },
    stat: "#3 locally",
    line: "Your local search standing",
  },
  {
    name: "a confirmed placement below the local top 20",
    rank: { position: null, available: false, notInTop20: true },
    stat: "Not in the local top 20 yet",
    line: "Your local search standing",
  },
  {
    name: "an unmeasured rank",
    rank: { position: null, available: false, notInTop20: false },
    stat: "Rank not available yet",
    line: "Run a ranking to see where you stand",
  },
];

describe("PatientJourneyContextCards — rank copy", () => {
  for (const state of RANK_STATES) {
    it(`renders the honest stat and sub-line for ${state.name}`, () => {
      renderCards(state.rank);

      expect(screen.getByText(state.stat)).toBeInTheDocument();
      expect(screen.getByText(state.line)).toBeInTheDocument();
    });
  }

  it("tells a practice that already ranked below the top 20 to stop running rankings", () => {
    renderCards({ position: null, available: false, notInTop20: true });

    // A confirmed not_in_top_20 measurement is a result, not a missing run.
    expect(
      screen.queryByText("Run a ranking to see where you stand"),
    ).not.toBeInTheDocument();
  });

  it("never pairs the position with a competitor denominator in any state", () => {
    // The regression guard for the "#15 of 5 locally" defect: a SerpApi Maps
    // position rendered over Alloro's curated competitor count. The rank context
    // no longer carries a denominator, so no state can produce the fraction.
    for (const state of RANK_STATES) {
      const { unmount } = renderCards(state.rank);

      expect(document.body.textContent).not.toMatch(/ of \d+/);
      expect(document.body.textContent).not.toMatch(/#\d+ of/);

      unmount();
    }
  });

  it("never renders a '#N' number when no position was measured", () => {
    for (const state of RANK_STATES.filter((s) => s.rank.position === null)) {
      const { unmount } = renderCards(state.rank);

      expect(document.body.textContent).not.toMatch(/#\d/);

      unmount();
    }
  });
});

describe("PatientJourneyContextCards — reviews copy", () => {
  it("shows the rating alone, never the stored-row count", () => {
    // The stored count must not appear beside the rating: it would contradict
    // Google's all-time total, which lives on exactly one surface (GBP).
    renderCards(
      { position: 3, available: true, notInTop20: false },
      {
        rating: 4.8,
        count: 210,
        newThisMonth: 5,
        replyRatePct: 92,
        available: true,
        card: null,
      },
    );

    expect(screen.getByText("4.8★")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/210/);
    expect(screen.getByText("5 new reviews this month")).toBeInTheDocument();
    expect(screen.getByText("Replied to 92%")).toBeInTheDocument();
  });

  it("leads with the Memorable card's headline and action when present", () => {
    renderCards(
      { position: 3, available: true, notInTop20: false },
      {
        rating: 4.8,
        count: 210,
        newThisMonth: 5,
        replyRatePct: 92,
        available: true,
        card: {
          rung: "reply_gap",
          stage: "memorable",
          execution_state: "built",
          generic: false,
          headline: "34 reviews are still waiting on a reply.",
          action: "Reply to the 12 oldest this week.",
          caught_number: 34,
          attribution_running_total: null,
        },
      },
    );

    expect(
      screen.getByText("34 reviews are still waiting on a reply."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Reply to the 12 oldest this week."),
    ).toBeInTheDocument();
  });

  it("prompts a connection when no reviews are stored", () => {
    renderCards({ position: 3, available: true, notInTop20: false });

    expect(screen.getByText("Reviews not connected yet")).toBeInTheDocument();
    expect(
      screen.getByText("Connect your Google Business Profile to track reviews"),
    ).toBeInTheDocument();
  });
});
