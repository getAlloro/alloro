/**
 * Daily agent configuration.
 *
 * Named constants for the daily (Proofline) run, kept out of logic per §4.2.
 */

/**
 * How many trailing days the daily run fetches in one call per metric set.
 *
 * WHY A WINDOW AT ALL: the Google Business Profile Performance API trails
 * several days for impression metrics. The daily agent used to fetch exactly
 * yesterday and the day before, so on most runs those dates were not in the
 * response yet, `datedValues` came back empty, and summing an empty array
 * produced a reported `0`. That is how a live practice's Get Found number —
 * the top funnel gate — read zero for months.
 *
 * WHY 7: it comfortably clears the ~3–4 day lag observed on production while
 * staying one cheap call per metric set. The window size is a cushion, NOT the
 * mechanism: the fix never subtracts a fixed offset to "skip the lag", because
 * that would silently break the day Google changes it. The mechanism is picking
 * the most-recent day that actually carries data, which is correct for any lag
 * shorter than this window — and reports "no recent data" honestly when the
 * whole window is empty, rather than calling it zero.
 */
export const DAILY_TRAILING_WINDOW_DAYS = 7;
