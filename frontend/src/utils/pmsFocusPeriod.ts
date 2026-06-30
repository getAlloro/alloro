import type { PmsKeyDataMonth } from "../api/pms";

export type PmsFocusPeriod = {
  state: "live" | "stale" | "empty";
  hasPmsData: boolean;
  isStale: boolean;
  focusMonthKey: string | null;
  focusMonthLabel: string;
  periodLabel: string;
  uploadMonthLabel: string;
  nudgeTitle: string;
  nudgeBody: string;
};

export type PmsFocusPeriodCopy = {
  dataNameLower: string;
  insightsSubject: string;
  moneyLower: string;
};

const DEFAULT_FOCUS_COPY: PmsFocusPeriodCopy = {
  dataNameLower: "PMS data",
  insightsSubject: "referral",
  moneyLower: "production",
};

const MONTH_PATTERN = /^(\d{4})-(\d{2})/;

function monthKeyFromDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    "0",
  )}`;
}

function parseMonthKey(monthKey: string): Date {
  const match = MONTH_PATTERN.exec(monthKey);
  if (!match) return new Date();
  return new Date(Number(match[1]), Number(match[2]) - 1, 1);
}

function formatMonthYear(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function formatShortMonthDay(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function periodLabelFor(date: Date): string {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return `${formatShortMonthDay(start)} – ${formatShortMonthDay(end)}`;
}

function latestMonthKey(months: PmsKeyDataMonth[] | undefined): string | null {
  const keys = (months ?? [])
    .map((month) => MONTH_PATTERN.exec(month.month)?.[0] ?? null)
    .filter((month): month is string => month !== null)
    .sort();

  return keys[keys.length - 1] ?? null;
}

function nextMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1);
}

function buildNudge(
  latestMonthKeyValue: string | null,
  currentDate: Date,
  copy: PmsFocusPeriodCopy,
): Pick<
  PmsFocusPeriod,
  "uploadMonthLabel" | "nudgeTitle" | "nudgeBody"
> {
  const uploadDate = latestMonthKeyValue
    ? nextMonth(parseMonthKey(latestMonthKeyValue))
    : currentDate;
  const uploadMonthLabel = formatMonthYear(uploadDate);
  return {
    uploadMonthLabel,
    nudgeTitle: `${uploadMonthLabel} ${copy.dataNameLower} ready?`,
    nudgeBody:
      `Upload ${uploadMonthLabel} ${copy.dataNameLower} to refresh the focus card with the newest ${copy.insightsSubject} and ${copy.moneyLower} insights.`,
  };
}

export function derivePmsFocusPeriod(
  months: PmsKeyDataMonth[] | undefined,
  currentDate = new Date(),
  copy: PmsFocusPeriodCopy = DEFAULT_FOCUS_COPY,
): PmsFocusPeriod {
  const latestKey = latestMonthKey(months);
  const nudge = buildNudge(latestKey, currentDate, copy);

  if (!latestKey) {
    return {
      state: "empty",
      hasPmsData: false,
      isStale: false,
      focusMonthKey: null,
      focusMonthLabel: formatMonthYear(currentDate),
      periodLabel: periodLabelFor(currentDate),
      ...nudge,
    };
  }

  const focusDate = parseMonthKey(latestKey);
  const uploadTargetKey = monthKeyFromDate(nextMonth(focusDate));
  const isStale = uploadTargetKey < monthKeyFromDate(currentDate);

  return {
    state: isStale ? "stale" : "live",
    hasPmsData: true,
    isStale,
    focusMonthKey: latestKey,
    focusMonthLabel: formatMonthYear(focusDate),
    periodLabel: periodLabelFor(focusDate),
    ...nudge,
  };
}
