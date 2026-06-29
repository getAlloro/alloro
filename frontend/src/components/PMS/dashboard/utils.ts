import type { PmsDashboardMonth } from "./types";

export const formatCurrency = (value: number | null | undefined): string => {
  if (value === null || value === undefined) return "N/A";
  return `$${Math.round(value).toLocaleString("en-US")}`;
};

export const formatCompactCurrency = (value: number): string => {
  if (Math.abs(value) >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (Math.abs(value) >= 1000) return `$${(value / 1000).toFixed(1)}K`;
  return formatCurrency(value);
};

export const formatUpdatedDate = (date: Date | null): string => {
  if (!date || Number.isNaN(date.getTime())) return "No sync yet";
  return `Updated ${date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })}`;
};

export const getLatestMonth = (
  months: PmsDashboardMonth[],
): PmsDashboardMonth | null => months[months.length - 1] ?? null;

export const getPreviousMonth = (
  months: PmsDashboardMonth[],
): PmsDashboardMonth | null => months[months.length - 2] ?? null;

export const getPercentChange = (
  current: number,
  previous: number | null | undefined,
): number | null => {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 100);
};

export const getTrendText = (change: number | null): string => {
  if (change === null) return "No prior month";
  if (change === 0) return "Flat";
  return `${change > 0 ? "+" : ""}${change}%`;
};

export const getLastMonths = (
  months: PmsDashboardMonth[],
  count: number,
): PmsDashboardMonth[] => months.slice(Math.max(months.length - count, 0));

export const PMS_DATA_TREND_GRAPH = {
  width: 520,
  height: 178,
  padX: 26,
  padY: 18,
} as const;

export type PmsDataTrendValueKey = "productionTotal" | "totalReferrals";

export type PmsDataTrendValueMonth = Record<
  PmsDataTrendValueKey,
  number | null
>;

export function getDataTrendGraphX(index: number, count: number) {
  const { width, padX } = PMS_DATA_TREND_GRAPH;
  return count <= 1
    ? width / 2
    : padX + (index / (count - 1)) * (width - 2 * padX);
}

export function getDataTrendGraphY(value: number | null, max: number) {
  const { height, padY } = PMS_DATA_TREND_GRAPH;
  return (
    padY + (1 - (value ?? 0) / Math.max(max * 1.15, 1)) * (height - 2 * padY)
  );
}

export function getMaxNullableValue(values: Array<number | null>) {
  return Math.max(
    ...values.filter((value): value is number => value !== null),
    0,
  );
}

export function buildDataTrendGraphSegments<T extends PmsDataTrendValueMonth>(
  months: T[],
  key: PmsDataTrendValueKey,
  max: number,
) {
  const segments: string[] = [];
  let current: string[] = [];

  months.forEach((month, index) => {
    const value = month[key];
    if (value !== null && value > 0) {
      current.push(
        `${getDataTrendGraphX(index, months.length)},${getDataTrendGraphY(value, max)}`,
      );
    } else if (current.length > 0) {
      segments.push(current.join(" "));
      current = [];
    }
  });

  if (current.length > 0) segments.push(current.join(" "));
  return segments;
}

export function formatDataTrendProduction(
  value: number | null,
  moneyLower = "production",
) {
  return value === null
    ? `no ${moneyLower} saved`
    : `${formatCurrency(value)} ${moneyLower}`;
}

export function formatDataTrendReferrals(
  value: number | null,
  countPlural = "referrals",
) {
  return value === null
    ? `no ${countPlural} saved`
    : `${value.toLocaleString("en-US")} ${countPlural}`;
}
