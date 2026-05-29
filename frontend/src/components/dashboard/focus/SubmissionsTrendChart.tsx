import { useMemo } from "react";
import type { TimeseriesPoint } from "../../../api/formSubmissionsTimeseries";
import {
  FocusTrendChart,
  type FocusTrendDatum,
} from "./FocusTrendChart";

type SubmissionsTrendChartProps = {
  points: TimeseriesPoint[];
};

const BRAND_ORANGE = "#D66853";

function monthLabel(month: string): string {
  const match = /^(\d{4})-(\d{2})/.exec(month);
  if (!match) return month;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
  return date.toLocaleDateString("en-US", { month: "short" });
}

function tooltipLabel(month: string): string {
  const match = /^(\d{4})-(\d{2})/.exec(month);
  if (!match) return month;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
  return date.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function pointTotal(point: TimeseriesPoint): number {
  return point.total ?? point.verified + point.flagged;
}

export function SubmissionsTrendChart({
  points,
}: SubmissionsTrendChartProps) {
  const data = useMemo<FocusTrendDatum[]>(
    () =>
      points.map((point) => ({
        key: point.month,
        label: monthLabel(point.month),
        tooltipLabel: tooltipLabel(point.month),
        value: pointTotal(point),
        detail: `${point.flagged} spam`,
      })),
    [points],
  );

  return (
    <FocusTrendChart
      data={data}
      color={BRAND_ORANGE}
      gradientId="submissions-total"
      ariaLabel="Monthly form submissions trend"
      emptyLabel="No monthly submission trend yet"
      valueLabel={(value) => `${value} total submissions`}
    />
  );
}

export default SubmissionsTrendChart;
