/**
 * Memorable-stage candidate card (Inversion Chapter 6).
 *
 * A PURE function (no DB access — mirrors funnelMath.ts): it takes the reads the
 * assembler already resolved and returns at most ONE card, via a priority ladder
 * ordered by "what Alloro can actually execute":
 *   (A) reply-gap  → PRIMARY. In-lane, done-for-you: Alloro drafts the reply and,
 *       on the owner's approval, posts it via the built + wired GBP reply rail.
 *       Ends in an attributed action, not homework. That is why it leads.
 *   (B) velocity-drop → SECONDARY. Caught-insight ONLY, by design: soliciting
 *       reviews / messaging patients is out-of-lane, so this rung is the owner's
 *       glance at a drop they could not see, never an action Alloro logs.
 *   (C) yield → nothing specific and honest to say → return null so a leakier
 *       stage can win cross-stage selection (Ch7). Never invent a problem.
 *
 * Honesty (Value #6 / receipt rule) is baked in:
 *   - The reply count comes from the oauth-scoped replyable list, not the diluted
 *     replyRatePct (which includes un-replyable scraped rows).
 *   - The done-for-you variant is claimed ONLY when the reply-draft path is wired
 *     for the org; otherwise the honest manual framing is used.
 *   - The velocity rung fires only on a material, date-reliable drop; it never
 *     fabricates a drop, a projection, or a percentage-as-promise.
 *   - `attribution_running_total` is null unless a real logged count of
 *     Alloro-posted replies exists; never an aspirational total.
 */

export interface MemorableCardInput {
  /** New reviews in the current report month (from readReviews). */
  currentNewThisMonth: number | null;
  /** New reviews in the prior month (from a second readReviews on the prev key). */
  priorNewThisMonth: number | null;
  /**
   * Whether `newThisMonth` is trustworthy for this location — i.e. stored rows
   * carry reliable `review_created_at`. The velocity rung MUST NOT fire when
   * this is false (Dave verifies date coverage per practice before enabling).
   */
  velocityDatesReliable: boolean;
  /** Count of recent oauth reviews with no reply (findReplyableForLocation length). */
  unrepliedCount: number;
  /**
   * True when Alloro's reply-draft path is wired for this org, so the card may
   * honestly offer the done-for-you variant. False → manual framing only.
   */
  replyDraftPathWired: boolean;
  /**
   * Real count of replies Alloro has posted for this org (a logged total), or
   * null when no log exists yet. NEVER a projection.
   */
  repliedByAlloroCount: number | null;
}

export interface MemorableCard {
  rung: "reply_gap" | "velocity_drop";
  stage: "memorable";
  /** "built" = an in-lane done-for-you action; "read-only" = a caught insight. */
  execution_state: "built" | "read-only";
  generic: false;
  headline: string;
  action: string;
  caught_number: number;
  /** Running count of Alloro-posted replies, when a real log exists; else null. */
  attribution_running_total: number | null;
}

export function buildMemorableCard(
  input: MemorableCardInput,
): MemorableCard | null {
  // (A) reply-gap rung — PRIMARY (in-lane, done-for-you).
  if (input.unrepliedCount > 0) {
    const n = input.unrepliedCount;
    const newest = Math.min(3, n);
    const action = input.replyDraftPathWired
      ? `Alloro can draft replies to the ${newest} newest and, on your approval, post them for you.`
      : `Reply to the ${newest} newest this week.`;
    return {
      rung: "reply_gap",
      stage: "memorable",
      execution_state: input.replyDraftPathWired ? "built" : "read-only",
      generic: false,
      headline:
        n === 1
          ? "1 of your recent Google reviews has no reply."
          : `${n} of your recent Google reviews have no reply.`,
      action,
      caught_number: n,
      attribution_running_total: input.repliedByAlloroCount,
    };
  }

  // (B) velocity-drop rung — SECONDARY (caught-insight only). Fires only on a
  // material, date-reliable month-over-month drop.
  const prior = input.priorNewThisMonth;
  const current = input.currentNewThisMonth;
  if (
    input.velocityDatesReliable &&
    prior != null &&
    current != null &&
    prior >= 3 &&
    current < prior
  ) {
    return {
      rung: "velocity_drop",
      stage: "memorable",
      execution_state: "read-only",
      generic: false,
      headline: `Your new Google reviews slowed to ${current} last month, down from ${prior} the month before.`,
      action: "Ask a few patients this week to leave one.",
      caught_number: current,
      attribution_running_total: null,
    };
  }

  // (C) yield rung — nothing specific and honest to say.
  return null;
}
