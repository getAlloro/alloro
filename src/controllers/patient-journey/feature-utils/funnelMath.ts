/**
 * Patient Journey — pure funnel math (T4).
 *
 * No DB access, no model calls — just the conversion %, opportunity selection,
 * period derivation, and headline text. Kept separate from the assembler so each
 * piece is independently testable and the service stays thin (§2.2/§13.2).
 */

import type {
  PatientJourneyStage,
  PatientJourneyStageKey,
  PatientJourneyConversion,
  PatientJourneyPeriod,
  BookableCard,
} from "./types";

/** Below this many monthly visitors the leak is an Awareness problem, not Bookable. */
const BOOKABLE_VISITS_FLOOR = 10;

/** Step labels for each adjacent stage transition. */
const STEP_LABELS: Record<string, string> = {
  "impressions>visits": "Google Visibility → Website Visitors",
  "visits>leads": "Website Visitors → Website Leads",
};

function stepLabel(
  fromKey: PatientJourneyStageKey,
  toKey: PatientJourneyStageKey,
): string {
  return STEP_LABELS[`${fromKey}>${toKey}`] ?? `${fromKey} → ${toKey}`;
}

/**
 * Per-step conversion percent for each adjacent pair of stages. A step is null
 * when either side is missing/unavailable or the source is zero (we never divide
 * by zero or imply a real 0% from absent data). `isLeak` is set on the single
 * smallest non-null ratio.
 */
export function buildConversions(stages: PatientJourneyStage[]): {
  conversions: PatientJourneyConversion[];
  leakStageKey: PatientJourneyStageKey | null;
} {
  const conversions: PatientJourneyConversion[] = [];
  for (let i = 0; i < stages.length - 1; i += 1) {
    const from = stages[i];
    const to = stages[i + 1];
    const pct =
      from.available &&
      to.available &&
      from.value !== null &&
      to.value !== null &&
      from.value > 0
        ? Number(((to.value / from.value) * 100).toFixed(1))
        : null;
    conversions.push({
      fromKey: from.key,
      toKey: to.key,
      pct,
      label: stepLabel(from.key, to.key),
      isLeak: false,
    });
  }

  let leakIndex = -1;
  let smallest = Number.POSITIVE_INFINITY;
  conversions.forEach((conversion, index) => {
    if (conversion.pct !== null && conversion.pct < smallest) {
      smallest = conversion.pct;
      leakIndex = index;
    }
  });

  if (leakIndex === -1) {
    return { conversions, leakStageKey: null };
  }
  conversions[leakIndex].isLeak = true;
  return { conversions, leakStageKey: conversions[leakIndex].toKey };
}

/**
 * Descriptive (never predictive) headline naming the largest opportunity. Falls
 * back to a neutral message when no step has enough data to pick a step.
 */
export function buildHeadline(
  stages: PatientJourneyStage[],
  conversions: PatientJourneyConversion[],
  leakStageKey: PatientJourneyStageKey | null,
): { text: string; leakStageKey: PatientJourneyStageKey | null } {
  if (!leakStageKey) {
    return {
      text: "Connect more of your data to see which growth gate needs attention.",
      leakStageKey: null,
    };
  }
  const leak = conversions.find((conversion) => conversion.isLeak);
  const fromStage = leak
    ? stages.find((stage) => stage.key === leak.fromKey)
    : undefined;
  const toStage = leak
    ? stages.find((stage) => stage.key === leak.toKey)
    : undefined;
  if (!leak || !fromStage || !toStage) {
    return {
      text: "Connect more of your data to see which growth gate needs attention.",
      leakStageKey: null,
    };
  }
  const pctText = leak.pct === null ? "" : ` Only ${leak.pct}% moved through.`;
  return {
    text: `Your largest opportunity is moving people from ${fromStage.label} to ${toStage.label}.${pctText}`,
    leakStageKey,
  };
}

/**
 * The Bookable-stage candidate card (Ch5a, FIX 5.3): the "one move" for the
 * visit→booking step. Pure, no DB — mirrors buildHeadline. Produced ONLY when
 * that step is real AND it is the leak; returns null (never generic filler) when
 * the leak is upstream or the data is absent, so Chapter 7's selector can pick a
 * leakier stage. Never claims phone-answer or response-time data (it doesn't
 * exist), and never blames booking for an Awareness/Findable shortfall.
 */
export function buildBookableCandidate(
  stages: PatientJourneyStage[],
  leakStageKey: PatientJourneyStageKey | null,
): BookableCard | null {
  if (leakStageKey !== "leads") return null;

  const visitsStage = stages.find((s) => s.key === "visits");
  const leadsStage = stages.find((s) => s.key === "leads");
  if (
    !visitsStage?.available ||
    visitsStage.value === null ||
    visitsStage.value < BOOKABLE_VISITS_FLOOR ||
    !leadsStage
  ) {
    return null;
  }

  const visits = visitsStage.value;
  const leads = leadsStage.value ?? 0;
  const hook =
    leads > 0
      ? `${visits} people reached your site last month and ${leads} asked to book. The visit-to-booking step is where you're losing the most.`
      : `${visits} people reached your site last month and none reached the booking step yet. The visit-to-booking step is where you're losing the most.`;

  return {
    stage: "bookable",
    generic: false,
    hook,
    action:
      'The highest-leverage move is making your booking form the first thing visitors see and sharpening the call-to-action from "Learn more" to "Book now."',
    caught_number: leads,
  };
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * Derive the reporting period from a first-of-month key (YYYY-MM-01). Returns a
 * human label plus the inclusive calendar-month window for stage reads.
 */
export function buildPeriod(reportMonth: string): PatientJourneyPeriod {
  const [yearStr, monthStr] = reportMonth.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12
  ) {
    return { label: reportMonth, startDate: reportMonth, endDate: reportMonth };
  }
  const startDate = `${yearStr}-${monthStr}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const endDate = `${yearStr}-${monthStr}-${String(lastDay).padStart(2, "0")}`;
  return {
    label: `${MONTH_NAMES[month - 1]} ${year}`,
    startDate,
    endDate,
  };
}

/** Whether a report month key (YYYY-MM-01) is the current UTC month. */
export function isCurrentUtcMonth(reportMonth: string): boolean {
  const now = new Date();
  const currentKey = `${now.getUTCFullYear()}-${String(
    now.getUTCMonth() + 1,
  ).padStart(2, "0")}-01`;
  return reportMonth === currentKey;
}

/** Half-open [start, end) calendar-month bounds for a report month, in UTC. */
export function monthBounds(reportMonth: string): { start: Date; end: Date } {
  const [yearStr, monthStr] = reportMonth.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12
  ) {
    const now = new Date();
    const start = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const end = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
    );
    return { start, end };
  }
  return {
    start: new Date(Date.UTC(year, month - 1, 1)),
    end: new Date(Date.UTC(year, month, 1)),
  };
}
